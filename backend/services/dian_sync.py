"""
Orquestador Playwright para sincronizar el histórico DIAN de una empresa.

Diferencias vs el CLI dian_historico_runner:
  - Corre en background (asyncio.create_task) para no bloquear la request HTTP.
  - Reemplaza `input()` por asyncio.Queue: el usuario pega el magic link en la
    UI, el endpoint POST /dian/sync/{job_id}/magic-link lo empuja a la queue.
  - Persiste sesión Playwright encriptada por empresa (cookies + localStorage)
    para saltar el flujo cédula+magic_link cuando la sesión sigue vigente.
  - Escribe los documentos parseados a la tabla `documentos_dian` con dedup
    por CUFE (o prefijo+folio+nit_emisor cuando el CUFE está vacío).
  - Reporta progreso vía updates al registro `dian_sync_jobs`.

Requiere:
  - `playwright install chromium` en el entorno del backend.
  - En dev el browser se lanza con headless=False para sortear Cloudflare
    Turnstile visualmente. En prod headless=True + user-agent real como
    fallback (Turnstile puede o no dejar pasar; si no, degradamos a upload
    manual de CSV — feature futura).
"""
from __future__ import annotations

import asyncio
import calendar
import html
import json
import logging
import queue
import re
import sys
import threading
from datetime import date, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Optional

import pandas as pd
from sqlalchemy import select, insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import settings
from models_dian import DianSyncJob, DocumentoDian
from models_tenant import Empresa
from services.credentials_encryption import decrypt_str, encrypt_str
from services.dian_admin.documentos import descargar_grupo
from services.dian_admin.iva import preparar_y_separar, canonicalizar, transformar

logger = logging.getLogger(__name__)


# ============================================================================
# Coordinación magic link — dict global de queues por job_id
# ============================================================================

# Cada job en pending_magic_link tiene una queue asociada. Usamos queue.Queue
# (thread-safe) en vez de asyncio.Queue porque el endpoint HTTP y el worker
# del sync viven en threads distintos (uvicorn y el thread nuevo con
# ProactorEventLoop). asyncio.Queue.put_nowait() no es thread-safe.
_pending_links: dict[int, "queue.Queue[str]"] = {}

MAGIC_LINK_TIMEOUT_SECONDS = 15 * 60  # 15 minutos para pegar el link


def _submit_magic_link(job_id: int, link: str) -> bool:
    """Empuja el magic link a la queue del job. False si el job no espera."""
    q = _pending_links.get(job_id)
    if q is None:
        return False
    try:
        q.put_nowait(link)
        return True
    except queue.Full:
        return False


def submit_magic_link_for_job(job_id: int, link: str) -> bool:
    """Interfaz pública para el router. Devuelve False si el job no espera link."""
    return _submit_magic_link(job_id, link)


# Sentinel que se pone en la queue para que el worker se desbloquee y
# termine gracefully cuando el usuario cancela. Diferenciamos de un link
# real porque no empieza por http.
_CANCEL_SENTINEL = "__CANCEL__"


def cancel_pending_job(job_id: int) -> bool:
    """Cancela un job en estado pending_magic_link.

    Empuja el sentinel a la queue → el worker Playwright interpreta el pasted
    text que no empieza con 'http' como error y retorna False → el flujo del
    sync termina limpio y cierra el browser.

    Devuelve False si el job no tiene queue activa (probablemente ya terminó).
    """
    return _submit_magic_link(job_id, _CANCEL_SENTINEL)


def is_cancel_sentinel(value: str) -> bool:
    return value == _CANCEL_SENTINEL


# ============================================================================
# Runner en thread separado con ProactorEventLoop propio
# ============================================================================

# En Windows, Playwright requiere ProactorEventLoop porque necesita `subprocess`
# para lanzar Chromium. Uvicorn arranca con SelectorEventLoop y `--reload`
# a veces re-instala la policy en el worker → asyncio.create_task() en el loop
# de uvicorn muere con NotImplementedError.
#
# Solución: correr cada sync en un thread aparte, donde nosotros mismos
# creamos un event loop con la policy correcta. Aislamos el sync del loop de
# uvicorn y no dependemos del entorno externo.

def _run_sync_in_new_loop(job_id: int, session_maker,
                           password: Optional[str] = None) -> None:
    """Punto de entrada del thread — crea loop propio y espera.

    `password` viaja SOLO en memoria (parámetro del thread). Nunca se persiste
    en la BD. Al terminar la función, sale del scope y el GC la destruye.
    """
    if sys.platform == "win32":
        # ProactorEventLoop soporta subprocess (necesario para Playwright).
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        except Exception:  # pragma: no cover — algunas versiones ya lo tienen
            pass

    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        loop.run_until_complete(run_sync_job(job_id, session_maker, password))
    finally:
        try:
            loop.close()
        except Exception:  # pragma: no cover
            pass


def spawn_sync_job(job_id: int, session_maker,
                    password: Optional[str] = None) -> None:
    """Arranca el sync en un thread demonio con su propio loop.

    Args:
      job_id, session_maker: identifican el trabajo y cómo abrir sesiones DB.
      password: contraseña DIAN opcional (solo para métodos 'administrador'
        y 'usuario_autorizado' cuando no hay sesión válida). Vive únicamente
        en la memoria del thread; nunca llega a la BD.
    """
    t = threading.Thread(
        target=_run_sync_in_new_loop,
        args=(job_id, session_maker, password),
        daemon=True,
        name=f"dian-sync-{job_id}",
    )
    t.start()


# ============================================================================
# Utilidades — parseo del link, session storage
# ============================================================================

def _extract_url_from_pasted_text(texto: str) -> str:
    """Copia del helper del CLI: acepta URL directa o tag <a href=...>."""
    texto = texto.strip()
    m = re.search(r'href=["\']([^"\']+)["\']', texto, re.IGNORECASE)
    if m:
        return html.unescape(m.group(1))
    if texto.startswith("http"):
        return html.unescape(texto)
    return texto


async def _save_session(context, empresa: Empresa, db: AsyncSession) -> None:
    """Persiste cookies + localStorage de la sesión Playwright, encriptados."""
    try:
        state = await context.storage_state()
        empresa.dian_sesion_estado_enc = encrypt_str(json.dumps(state))
        await db.commit()
    except Exception as e:
        logger.warning("No se pudo persistir sesión DIAN: %s", e)


async def _restore_session(empresa: Empresa) -> Optional[dict]:
    """Recupera el storage_state guardado. None si no hay o no se puede desencriptar."""
    enc = getattr(empresa, "dian_sesion_estado_enc", None)
    if not enc:
        return None
    raw = decrypt_str(enc)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


# ============================================================================
# Portal DIAN — URLs y selectores por método
# ============================================================================

# URLs oficiales del portal catalogo-vpfe.dian.gov.co
URL_ADMIN_LOGIN = "https://catalogo-vpfe.dian.gov.co/User/Login"           # Administrador
URL_COMPANY_LOGIN = "https://catalogo-vpfe.dian.gov.co/User/CompanyLogin"  # Empresa (rep_legal / usuario_autorizado)
URL_PERSON_LOGIN = "https://catalogo-vpfe.dian.gov.co/User/PersonLogin"    # Persona natural
URL_DOCUMENTOS = "https://catalogo-vpfe.dian.gov.co/Document/Export"       # Página post-login

# Alias legacy — mantiene retrocompatibilidad con código que aún referencia URL_LOGIN.
URL_LOGIN = URL_ADMIN_LOGIN

# Mapping de tipo_id UI → label del <select> del portal DIAN
_TIPOS_ID_LABEL = {
    "CC": "Cédula de ciudadanía",
    "CE": "Cédula de extranjería",
    "PP": "Pasaporte",
    "TI": "Tarjeta de identidad",
    "NIT": "NIT",
}

# --- Selectores comunes ------------------------------------------------------

_SELS_PERSONA_TAB = [
    "a:has-text('Persona')",
    "li:has-text('Persona') a",
    "button:has-text('Persona')",
]
_SELS_ADMIN_TAB = [
    "a:has-text('Administrador')",
    "li:has-text('Administrador') a",
    "button:has-text('Administrador')",
]
_SELS_EMPRESA_TAB = [
    "a:has-text('Empresa')",
    "li:has-text('Empresa') a",
    "button:has-text('Empresa')",
]

# Cards para elegir sub-método dentro de /User/CompanyLogin
_SELS_CARD_REP_LEGAL = [
    "a:has-text('Representante legal')",
    "div:has-text('Representante legal')",
    "text=/Representante\\s+legal/i",
]
_SELS_CARD_USUARIO_AUTORIZADO = [
    "a:has-text('Usuario Autorizado')",
    "div:has-text('Usuario Autorizado')",
    "text=/Usuario\\s+Autorizado/i",
]

# Campos de formulario
_SELS_CAMPO_CEDULA = [
    "input[name='PersonCode']",
    "input[id='PersonCode']",
    "input[placeholder*='identificación']",
    "input[placeholder*='contribuyente']",
]
_SELS_CAMPO_EMAIL = [
    "input[name='Email']",
    "input[id='Email']",
    "input[type='email']",
    "input[placeholder*='correo']",
]
_SELS_CAMPO_PASSWORD = [
    "input[name='Password']",
    "input[id='Password']",
    "input[type='password']",
    "input[placeholder*='ontraseña']",
]
_SELS_CAMPO_NIT_REP = [
    "input[name='AdminCode']",
    "input[name='RepLegalCode']",
    "input[placeholder*='identificación del representante']",
    "input[placeholder*='representante']",
]
_SELS_CAMPO_NIT_EMPRESA = [
    "input[name='CompanyCode']",
    "input[name='CompanyNit']",
    "input[placeholder*='Nit de la empresa']",
    "input[placeholder*='empresa']",
]
_SELS_CAMPO_DOC_USUARIO = [
    "input[name='UserCode']",
    "input[name='AuthUserCode']",
    "input[placeholder*='Documento Usuario Autorizado']",
    "input[placeholder*='Usuario Autorizado']",
]
_SELS_SELECT_TIPO_ID = [
    "select[name='IdType']",
    "select[name='DocumentType']",
    "select[name='IdTypeCode']",
    "select",
]

_SELS_SUBMIT = [
    "button:has-text('Entrar')",
    "button[type='submit']:not([id*='Modal']):not([id*='cancel'])",
    "input[type='submit']",
    "button:has-text('Ingresar')",
]
_MARCAS_SESION = [
    "cerrar sesion", "cerrar sesión", "logout", "salir",
    "bienvenido", "mi cuenta", "perfil", "documentos",
]
_MARCAS_ERROR_CREDENCIAL = [
    "credenciales inválidas", "credenciales invalidas",
    "usuario o contraseña incorrect", "no coinciden",
    "cuenta bloqueada", "intentos fallidos",
]


async def _wait_cloudflare(page, timeout_s: int = 60) -> None:
    for _ in range(timeout_s):
        try:
            contenido = (await page.content()).lower()
        except Exception:
            await asyncio.sleep(1)
            continue
        if "just a moment" not in contenido and "checking your browser" not in contenido:
            return
        await asyncio.sleep(1)


async def _wait_turnstile(page, timeout_s: int = 60) -> bool:
    for i in range(timeout_s):
        try:
            token = await page.evaluate(
                "() => { const el = document.querySelector(\"input[name='cf-turnstile-response']\");"
                " return el ? el.value : null; }"
            )
            if token:
                return True
            if i == 5:
                tiene_iframe = await page.locator(
                    "iframe[src*='challenges.cloudflare.com'], iframe[src*='turnstile']"
                ).count()
                if tiene_iframe == 0:
                    return True
        except Exception:
            pass
        await asyncio.sleep(1)
    return False


async def _click_first(page, selectors: list[str], timeout_ms: int = 5_000) -> bool:
    for sel in selectors:
        try:
            if await page.locator(sel).count() > 0:
                await page.locator(sel).first.click(timeout=timeout_ms)
                return True
        except Exception:
            continue
    return False


async def _fill_first(page, selectors: list[str], value: str, timeout_ms: int = 3_000) -> bool:
    for sel in selectors:
        try:
            if await page.locator(sel).count() > 0:
                campo = page.locator(sel).first
                try:
                    await campo.clear(timeout=timeout_ms)
                except Exception:
                    pass
                await campo.fill(value, timeout=timeout_ms)
                return True
        except Exception:
            continue
    return False


async def _select_tipo_id(page, tipo_id: str) -> bool:
    """Intenta seleccionar el tipo de identificación en el <select> del portal.

    Primer intento: por `value` (algunos portales usan códigos numéricos, otros
    las siglas). Segundo: por `label` (texto visible al usuario). Si nada
    matchea, deja el default y sigue.
    """
    label = _TIPOS_ID_LABEL.get(tipo_id, tipo_id)
    for sel in _SELS_SELECT_TIPO_ID:
        try:
            loc = page.locator(sel)
            if await loc.count() == 0:
                continue
            try:
                await loc.first.select_option(value=tipo_id, timeout=2_000)
                return True
            except Exception:
                pass
            try:
                await loc.first.select_option(label=label, timeout=2_000)
                return True
            except Exception:
                continue
        except Exception:
            continue
    return False


async def _await_magic_link_and_follow(page, magic_link_queue: "queue.Queue[str]",
                                        update_msg) -> bool:
    """Espera el magic link del usuario, sigue la URL y confirma sesión activa."""
    from playwright.async_api import TimeoutError as PWTimeoutError

    update_msg("Revisa tu correo: DIAN envió un link de acceso. Pégalo en la UI.")
    loop = asyncio.get_event_loop()
    try:
        pasted = await loop.run_in_executor(
            None,
            lambda: magic_link_queue.get(timeout=MAGIC_LINK_TIMEOUT_SECONDS),
        )
    except queue.Empty:
        update_msg(f"No se recibió el magic link en {MAGIC_LINK_TIMEOUT_SECONDS//60} minutos.")
        return False

    if is_cancel_sentinel(pasted):
        update_msg("Cancelado por el usuario.")
        return False

    link = _extract_url_from_pasted_text(pasted)
    if not link.startswith("http"):
        update_msg("El texto pegado no contiene una URL válida.")
        return False

    update_msg("Autenticando con el magic link...")
    try:
        await page.goto(link, wait_until="domcontentloaded", timeout=60_000)
    except PWTimeoutError:
        update_msg("Timeout cargando el magic link.")
        return False

    await _wait_cloudflare(page)
    await asyncio.sleep(2)

    contenido = ""
    try:
        contenido = (await page.content()).lower()
    except Exception:
        pass

    if any(marca in contenido for marca in _MARCAS_SESION):
        return True

    update_msg("El link no dejó una sesión activa. Solicita uno nuevo y reintenta.")
    return False


async def _confirmar_sesion_post_submit(page, update_msg) -> bool:
    """Espera post-submit, verifica que la sesión quedó activa. Si detecta
    error de credenciales explícito, lo reporta con mensaje específico."""
    await asyncio.sleep(3)
    await _wait_cloudflare(page)
    contenido = ""
    try:
        contenido = (await page.content()).lower()
    except Exception:
        pass

    if any(marca in contenido for marca in _MARCAS_SESION):
        return True

    # Detección de errores comunes del portal
    for marca in _MARCAS_ERROR_CREDENCIAL:
        if marca in contenido:
            update_msg("Credenciales rechazadas por el portal DIAN. Verifica correo/contraseña.")
            return False

    update_msg("No se pudo confirmar sesión tras el login. Revisa el navegador manualmente.")
    return False


# ---------------------------------------------------------------------------
# Método 1: Persona (cédula + magic link)  — comportamiento previo
# ---------------------------------------------------------------------------

async def _login_persona(page, tipo_id: str, cedula: str,
                          magic_link_queue: "queue.Queue[str]",
                          update_msg) -> bool:
    from playwright.async_api import TimeoutError as PWTimeoutError

    update_msg("Navegando al portal DIAN (Persona)...")
    try:
        await page.goto(URL_PERSON_LOGIN, wait_until="domcontentloaded", timeout=60_000)
    except PWTimeoutError:
        update_msg("Timeout navegando al portal (verifica conectividad).")
        return False

    await _wait_cloudflare(page)
    await asyncio.sleep(1)

    # Por si el usuario cae en /User/Login: click en "Persona".
    await _click_first(page, _SELS_PERSONA_TAB)
    await asyncio.sleep(0.5)

    # Tipo de identificación
    await _select_tipo_id(page, tipo_id or "CC")
    await asyncio.sleep(0.3)

    if not await _fill_first(page, _SELS_CAMPO_CEDULA, cedula):
        update_msg("No se encontró el campo para la cédula.")
        return False

    await asyncio.sleep(0.5)
    update_msg("Esperando Cloudflare Turnstile...")
    await _wait_turnstile(page, timeout_s=60)

    if not await _click_first(page, _SELS_SUBMIT, timeout_ms=10_000):
        update_msg("No se pudo enviar el formulario de login.")
        return False

    await asyncio.sleep(2)
    return await _await_magic_link_and_follow(page, magic_link_queue, update_msg)


# ---------------------------------------------------------------------------
# Método 2: Administrador (correo + contraseña)  — sin magic link
# ---------------------------------------------------------------------------

async def _login_administrador(page, email: str, password: str, update_msg) -> bool:
    from playwright.async_api import TimeoutError as PWTimeoutError

    if not password:
        update_msg("Este método requiere contraseña. Reintenta ingresándola.")
        return False

    update_msg("Navegando al portal DIAN (Administrador)...")
    try:
        await page.goto(URL_ADMIN_LOGIN, wait_until="domcontentloaded", timeout=60_000)
    except PWTimeoutError:
        update_msg("Timeout navegando al portal (verifica conectividad).")
        return False

    await _wait_cloudflare(page)
    await asyncio.sleep(1)

    # Tab Administrador (default en /User/Login pero por seguridad)
    await _click_first(page, _SELS_ADMIN_TAB)
    await asyncio.sleep(0.5)

    if not await _fill_first(page, _SELS_CAMPO_EMAIL, email):
        update_msg("No se encontró el campo de correo.")
        return False
    if not await _fill_first(page, _SELS_CAMPO_PASSWORD, password):
        update_msg("No se encontró el campo de contraseña.")
        return False

    await asyncio.sleep(0.5)
    update_msg("Esperando Cloudflare Turnstile...")
    await _wait_turnstile(page, timeout_s=60)

    if not await _click_first(page, _SELS_SUBMIT, timeout_ms=10_000):
        update_msg("No se pudo enviar el formulario de login.")
        return False

    return await _confirmar_sesion_post_submit(page, update_msg)


# ---------------------------------------------------------------------------
# Método 3: Empresa · Representante Legal (magic link al correo)
# ---------------------------------------------------------------------------

async def _login_rep_legal(page, tipo_id: str, cedula_rep: str,
                            nit_empresa: str,
                            magic_link_queue: "queue.Queue[str]",
                            update_msg) -> bool:
    from playwright.async_api import TimeoutError as PWTimeoutError

    update_msg("Navegando al portal DIAN (Empresa · Representante Legal)...")
    try:
        await page.goto(URL_COMPANY_LOGIN, wait_until="domcontentloaded", timeout=60_000)
    except PWTimeoutError:
        update_msg("Timeout navegando al portal (verifica conectividad).")
        return False

    await _wait_cloudflare(page)
    await asyncio.sleep(1)

    # Asegurar que estamos en el tab Empresa
    await _click_first(page, _SELS_EMPRESA_TAB)
    await asyncio.sleep(0.5)

    # Click en card "Representante legal"
    await _click_first(page, _SELS_CARD_REP_LEGAL, timeout_ms=8_000)
    await asyncio.sleep(1.5)

    await _select_tipo_id(page, tipo_id or "CC")
    await asyncio.sleep(0.3)

    if not await _fill_first(page, _SELS_CAMPO_NIT_REP, cedula_rep):
        update_msg("No se encontró el campo NIT Representante Legal.")
        return False
    if not await _fill_first(page, _SELS_CAMPO_NIT_EMPRESA, nit_empresa):
        update_msg("No se encontró el campo NIT Empresa.")
        return False

    await asyncio.sleep(0.5)
    update_msg("Esperando Cloudflare Turnstile...")
    await _wait_turnstile(page, timeout_s=60)

    if not await _click_first(page, _SELS_SUBMIT, timeout_ms=10_000):
        update_msg("No se pudo enviar el formulario de login.")
        return False

    await asyncio.sleep(2)
    return await _await_magic_link_and_follow(page, magic_link_queue, update_msg)


# ---------------------------------------------------------------------------
# Método 4: Empresa · Usuario Autorizado (NIT + cédula + password) — sin magic link
# ---------------------------------------------------------------------------

async def _login_usuario_autorizado(page, nit_empresa: str, tipo_id: str,
                                     doc_usuario: str, password: str,
                                     update_msg) -> bool:
    from playwright.async_api import TimeoutError as PWTimeoutError

    if not password:
        update_msg("Este método requiere contraseña. Reintenta ingresándola.")
        return False

    update_msg("Navegando al portal DIAN (Empresa · Usuario Autorizado)...")
    try:
        await page.goto(URL_COMPANY_LOGIN, wait_until="domcontentloaded", timeout=60_000)
    except PWTimeoutError:
        update_msg("Timeout navegando al portal (verifica conectividad).")
        return False

    await _wait_cloudflare(page)
    await asyncio.sleep(1)

    await _click_first(page, _SELS_EMPRESA_TAB)
    await asyncio.sleep(0.5)

    await _click_first(page, _SELS_CARD_USUARIO_AUTORIZADO, timeout_ms=8_000)
    await asyncio.sleep(1.5)

    if not await _fill_first(page, _SELS_CAMPO_NIT_EMPRESA, nit_empresa):
        update_msg("No se encontró el campo NIT Empresa.")
        return False

    await _select_tipo_id(page, tipo_id or "CC")
    await asyncio.sleep(0.3)

    # Este método reutiliza selectores tanto del "doc usuario" específico como
    # del "NIT Representante Legal" (a veces el portal usa el mismo input).
    combined = _SELS_CAMPO_DOC_USUARIO + _SELS_CAMPO_NIT_REP
    if not await _fill_first(page, combined, doc_usuario):
        update_msg("No se encontró el campo Documento del Usuario Autorizado.")
        return False

    if not await _fill_first(page, _SELS_CAMPO_PASSWORD, password):
        update_msg("No se encontró el campo de contraseña.")
        return False

    await asyncio.sleep(0.5)
    update_msg("Esperando Cloudflare Turnstile...")
    await _wait_turnstile(page, timeout_s=60)

    if not await _click_first(page, _SELS_SUBMIT, timeout_ms=10_000):
        update_msg("No se pudo enviar el formulario de login.")
        return False

    return await _confirmar_sesion_post_submit(page, update_msg)


# ---------------------------------------------------------------------------
# Dispatcher — elige el flujo según empresa.dian_metodo_auth
# ---------------------------------------------------------------------------

async def _dispatch_login(page, empresa: Empresa, password: Optional[str],
                           magic_link_queue: "queue.Queue[str]",
                           update_msg) -> bool:
    metodo = (empresa.dian_metodo_auth or "persona").strip()
    tipo_id = empresa.dian_tipo_id or "CC"

    if metodo == "persona":
        cedula = decrypt_str(empresa.dian_cedula_representante_enc) or ""
        if not cedula:
            update_msg("Cédula no configurada. Configúrala en Sincronizar → Configuración.")
            return False
        return await _login_persona(page, tipo_id, cedula, magic_link_queue, update_msg)

    if metodo == "administrador":
        email = decrypt_str(empresa.dian_email_enc) or ""
        if not email:
            update_msg("Correo del Administrador no configurado.")
            return False
        return await _login_administrador(page, email, password or "", update_msg)

    if metodo == "rep_legal":
        cedula = decrypt_str(empresa.dian_cedula_representante_enc) or ""
        nit_emp = decrypt_str(empresa.dian_nit_empresa_dian_enc) or ""
        if not cedula or not nit_emp:
            update_msg("Faltan datos para Rep. Legal (cédula del rep y NIT empresa).")
            return False
        return await _login_rep_legal(page, tipo_id, cedula, nit_emp, magic_link_queue, update_msg)

    if metodo == "usuario_autorizado":
        nit_emp = decrypt_str(empresa.dian_nit_empresa_dian_enc) or ""
        doc = decrypt_str(empresa.dian_doc_usuario_enc) or ""
        if not nit_emp or not doc:
            update_msg("Faltan datos para Usuario Autorizado (NIT empresa y documento).")
            return False
        return await _login_usuario_autorizado(page, nit_emp, tipo_id, doc,
                                                password or "", update_msg)

    update_msg(f"Método de autenticación desconocido: {metodo}")
    return False


# Compat: nombre viejo por si algo lo referencia externamente.
_do_login_with_magic_link = _login_persona


# ============================================================================
# Descarga mes a mes (idempotente) y guardado en BD
# ============================================================================

async def _download_range_by_months(page, empresa_id: int, fecha_desde: date,
                                     fecha_hasta: date, tmpdir: Path,
                                     update_msg) -> pd.DataFrame:
    """Descarga mes a mes en `tmpdir` y concatena en un DataFrame único."""
    dfs: list[pd.DataFrame] = []
    y_ini, m_ini = fecha_desde.year, fecha_desde.month
    y_fin, m_fin = fecha_hasta.year, fecha_hasta.month
    total_meses = (y_fin - y_ini) * 12 + (m_fin - m_ini) + 1
    idx = 0

    y, m = y_ini, m_ini
    while (y, m) <= (y_fin, m_fin):
        idx += 1
        ultimo = calendar.monthrange(y, m)[1]
        desde = date(y, m, 1)
        hasta = date(y, m, ultimo)
        # Recortar al rango efectivo
        desde_e = max(desde, fecha_desde)
        hasta_e = min(hasta, fecha_hasta)

        update_msg(f"Descargando {desde_e.isoformat()} → {hasta_e.isoformat()} ({idx}/{total_meses})")
        try:
            df = await descargar_grupo(
                page,
                desde_e.isoformat(),
                hasta_e.isoformat(),
                tmpdir,
                grupo="todos",
            )
        except Exception as e:
            update_msg(f"Error descargando {desde_e.isoformat()}: {e}")
            df = None

        if df is not None and not df.empty:
            dfs.append(df)

        # Avanzar mes
        if m == 12:
            y += 1
            m = 1
        else:
            m += 1

    if not dfs:
        return pd.DataFrame()

    df_total = pd.concat(dfs, ignore_index=True)
    # Dedup por CUFE si viene la columna del portal
    col_cufe = next((c for c in df_total.columns if "CUFE" in c.upper()), None)
    if col_cufe:
        df_total = df_total.drop_duplicates(subset=[col_cufe])
    return df_total


async def _upsert_documentos(db: AsyncSession, empresa_id: int, job_id: int,
                              df_raw: pd.DataFrame) -> tuple[int, int]:
    """Inserta/actualiza documentos_dian con dedup por CUFE.

    Devuelve (nuevos, actualizados).
    """
    if df_raw is None or df_raw.empty:
        return 0, 0

    # Canonicalizar columnas → snake_case y ajustar NC → negativo
    df = canonicalizar(df_raw)
    df = transformar(df)

    nuevos = 0
    actualizados = 0

    def _to_date(v) -> Optional[date]:
        if not v or pd.isna(v):
            return None
        try:
            # Portal DIAN: formatos '15-05-2026 14:30:00' o '15/05/2026'.
            s = str(v)[:10]
            return pd.to_datetime(s, dayfirst=True, errors="coerce").date()
        except Exception:
            return None

    for _, row in df.iterrows():
        cufe = str(row.get("cufe", "") or "").strip() or None
        prefijo = str(row.get("prefijo", "") or "").strip() or None
        folio = str(row.get("folio", "") or "").strip() or None
        nit_emi = str(row.get("nit_emisor", "") or "").strip() or None

        # Dedup por CUFE cuando existe, sino por (nit_emisor, prefijo, folio).
        stmt = select(DocumentoDian).where(DocumentoDian.empresa_id == empresa_id)
        if cufe:
            stmt = stmt.where(DocumentoDian.cufe == cufe)
        else:
            stmt = (stmt.where(DocumentoDian.nit_emisor == nit_emi)
                        .where(DocumentoDian.prefijo == prefijo)
                        .where(DocumentoDian.folio == folio))
        result = await db.execute(stmt)
        existente = result.scalar_one_or_none()

        payload = {
            "empresa_id": empresa_id,
            "cufe": cufe,
            "prefijo": prefijo,
            "folio": folio,
            "tipo_documento": str(row.get("tipo_documento", "") or "").strip() or "Desconocido",
            "grupo": str(row.get("grupo", "") or "").strip() or None,
            "fecha_emision": _to_date(row.get("fecha_emision")),
            "fecha_recepcion": _to_date(row.get("fecha_recepcion")),
            "nit_emisor": nit_emi,
            "nombre_emisor": str(row.get("nombre_emisor", "") or "")[:500] or None,
            "nit_receptor": str(row.get("nit_receptor", "") or "").strip() or None,
            "nombre_receptor": str(row.get("nombre_receptor", "") or "")[:500] or None,
            "valor": float(row.get("valor", 0) or 0),
            "iva": float(row.get("iva", 0) or 0),
            "rete_iva": float(row.get("rete_iva", 0) or 0),
            "rete_renta": float(row.get("rete_renta", 0) or 0),
            "rete_ica": float(row.get("rete_ica", 0) or 0),
            "valor_ajustado": float(row.get("valor_ajustado", 0) or 0),
            "iva_ajustado": float(row.get("iva_ajustado", 0) or 0),
            "valor_bruto": float(row.get("valor_bruto", 0) or 0),
            "estado": str(row.get("estado", "") or "").strip() or None,
            "sync_job_id": job_id,
        }

        if existente:
            for k, v in payload.items():
                setattr(existente, k, v)
            actualizados += 1
        else:
            db.add(DocumentoDian(**payload))
            nuevos += 1

    await db.commit()
    return nuevos, actualizados


# ============================================================================
# Entry point: run_sync_job — llamado como asyncio.create_task por el router
# ============================================================================

async def run_sync_job(job_id: int, session_maker: async_sessionmaker,
                        password: Optional[str] = None) -> None:
    """Corre el sync completo en background.

    Args:
      job_id: id del registro `dian_sync_jobs` ya creado por el endpoint.
      session_maker: fábrica de sesiones async DB (SessionLocal).
      password: contraseña DIAN en memoria si el método la requiere.
        Nunca se persiste; se pasa al login del portal y luego se descarta.

    El router previamente creó el registro `dian_sync_jobs`. Este método
    elige entre pending_magic_link | in_progress según el método de auth.
    """
    from playwright.async_api import async_playwright

    async with session_maker() as db:
        # Cargar job + empresa
        result = await db.execute(select(DianSyncJob).where(DianSyncJob.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            logger.error("Job DIAN %s no encontrado", job_id)
            return
        result = await db.execute(select(Empresa).where(Empresa.id == job.empresa_id))
        empresa = result.scalar_one_or_none()
        if not empresa:
            job.estado = "failed"
            job.mensaje = "Empresa no encontrada"
            await db.commit()
            return

        metodo = (empresa.dian_metodo_auth or "persona").strip()
        # Métodos que usan magic link: persona, rep_legal
        usa_magic_link = metodo in ("persona", "rep_legal")
        # Métodos que exigen password (in-memory): administrador, usuario_autorizado
        exige_password = metodo in ("administrador", "usuario_autorizado")

        if exige_password and not password:
            job.estado = "failed"
            job.mensaje = (
                f"El método '{metodo}' requiere la contraseña del portal DIAN. "
                f"Reintenta enviándola desde el frontend."
            )
            await db.commit()
            return

        def _upd(msg: str) -> None:
            logger.info("[DIAN sync %s] %s", job_id, msg)
            job.mensaje = msg[:1000]

        magic_link_q: "queue.Queue[str]" = _pending_links.setdefault(
            job_id, queue.Queue(maxsize=1)
        )

        try:
            async with async_playwright() as pw:
                # En dev, headless=False para sortear Cloudflare/Turnstile con UI.
                # En prod (Linux headless), se puede hacer switch por env var.
                headless = bool(getattr(settings, "DIAN_HEADLESS", False))
                browser = await pw.chromium.launch(
                    headless=headless,
                    args=[
                        "--disable-blink-features=AutomationControlled",
                        "--no-first-run",
                    ],
                )

                # Restaurar sesión si existe
                storage_state = await _restore_session(empresa)
                context = await browser.new_context(
                    accept_downloads=True,
                    storage_state=storage_state,
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/125.0.0.0 Safari/537.36"
                    ),
                )
                page = await context.new_page()

                # Intentar sesión existente antes de disparar el flujo de login
                logged_in = False
                if storage_state:
                    _upd("Probando sesión existente...")
                    try:
                        await page.goto(URL_DOCUMENTOS,
                                        wait_until="domcontentloaded", timeout=30_000)
                        await asyncio.sleep(2)
                        html_c = (await page.content()).lower()
                        if any(m in html_c for m in _MARCAS_SESION):
                            logged_in = True
                            _upd("Sesión existente sigue activa.")
                    except Exception:
                        pass

                if not logged_in:
                    # Estado UI: espera magic link o simplemente en progreso.
                    job.estado = "pending_magic_link" if usa_magic_link else "in_progress"
                    await db.commit()

                    logged_in = await _dispatch_login(
                        page, empresa, password, magic_link_q, _upd,
                    )

                if not logged_in:
                    job.estado = "failed"
                    _upd("Login DIAN fallido — reintenta más tarde.")
                    await db.commit()
                    await browser.close()
                    return

                job.estado = "in_progress"
                job.magic_link_recibido_en = datetime.utcnow()
                await db.commit()

                await _save_session(context, empresa, db)

                # Descargar rango mes a mes
                with TemporaryDirectory(prefix=f"dian_sync_{job_id}_") as tmp:
                    df_raw = await _download_range_by_months(
                        page, empresa.id, job.fecha_desde, job.fecha_hasta,
                        Path(tmp), _upd,
                    )

                await browser.close()

                if df_raw is None or df_raw.empty:
                    job.estado = "completed"
                    job.documentos_nuevos = 0
                    job.documentos_actualizados = 0
                    job.documentos_totales = 0
                    job.completado_en = datetime.utcnow()
                    _upd("Sin documentos en el rango consultado.")
                    await db.commit()
                    return

                _upd(f"Descargados {len(df_raw)} documentos. Guardando en BD...")
                nuevos, actualizados = await _upsert_documentos(db, empresa.id, job.id, df_raw)

                job.estado = "completed"
                job.documentos_nuevos = nuevos
                job.documentos_actualizados = actualizados
                job.documentos_totales = nuevos + actualizados
                job.completado_en = datetime.utcnow()
                _upd(f"Sync completado. {nuevos} nuevos, {actualizados} actualizados.")

                empresa.dian_ultima_sync = datetime.utcnow()
                await db.commit()

        except Exception as e:
            # Log completo (traceback) va al server log. En BD solo un mensaje
            # corto, tipado, sin traceback ni paths internos ni argumentos
            # (podrían contener passwords si el error viene del login).
            logger.exception("Sync DIAN %s crashed", job_id)
            try:
                # Sanitiza: quita cualquier `password=...` que aparezca por accidente
                # en la representación de la excepción.
                import re as _re
                msg_raw = f"{type(e).__name__}: {str(e)}"
                msg_clean = _re.sub(
                    r"(password|contraseña|passw)[\s=:]*[^\s,)]+",
                    r"\1=[REDACTED]",
                    msg_raw,
                    flags=_re.IGNORECASE,
                )
                # Mensaje amigable para el usuario final
                job.estado = "failed"
                job.mensaje = (
                    "Error durante el sync. Detalle técnico en el log del servidor. "
                    f"Tipo: {type(e).__name__}. "
                    f"Info: {msg_clean[:200]}"
                )[:500]
                await db.commit()
            except Exception:
                pass
        finally:
            _pending_links.pop(job_id, None)
