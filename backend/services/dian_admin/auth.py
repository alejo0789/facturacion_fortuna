# src/dian_admin/auth.py
"""
Autenticación al portal DIAN vía cédula + magic link por email (Opción A).

Flujo:
  1. Navegar al login → click tab "Persona" → ingresar cédula → click "Entrar"
  2. DIAN envía email con link de acceso único
  3. Usuario pega el link en la terminal
  4. Módulo navega al link y verifica sesión activa

Requiere Chrome abierto con CDP (abrir_chrome_cdp.bat, puerto 9222) para
sortear el Cloudflare del portal.
"""
from __future__ import annotations

import asyncio
import html
import re

# Playwright opcional para permitir cargar el módulo sin instalarlo.
try:
    from playwright.async_api import Page, TimeoutError as PWTimeoutError
except ImportError:  # pragma: no cover
    Page = None  # type: ignore
    class PWTimeoutError(Exception):  # type: ignore
        pass

URL_LOGIN = "https://catalogo-vpfe.dian.gov.co/User/Login"
URL_PERSON_LOGIN = "https://catalogo-vpfe.dian.gov.co/User/PersonLogin"
URL_COMPANY_LOGIN = "https://catalogo-vpfe.dian.gov.co/User/CompanyLogin"

# El tab se llama "Persona" (singular) en el HTML del portal.
_SELS_PERSONA_TAB = [
    "a:has-text('Persona')",
    "li:has-text('Persona') a",
    "button:has-text('Persona')",
]

# Campo donde se ingresa la cédula (el portal usa name="PersonCode").
_SELS_CAMPO_CEDULA = [
    "input[name='PersonCode']",
    "input[id='PersonCode']",
    "input[name='Email']",
    "input[id='Email']",
    "input[placeholder*='identificación']",
    "input[placeholder*='contribuyente']",
    "input[type='text']",
]

# Botón de envío — el texto real del portal es "Entrar".
_SELS_SUBMIT = [
    "button:has-text('Entrar')",
    "button[type='submit']:not([id*='Modal']):not([id*='cancel'])",
    "input[type='submit']",
    "button:has-text('Ingresar')",
    "button:has-text('Enviar')",
    "button:has-text('Continuar')",
]

# Cadenas que indican sesión activa en el HTML post-login.
_MARCAS_SESION = [
    "cerrar sesion", "cerrar sesión", "logout", "salir", "bienvenido",
    "mi cuenta", "perfil", "documentos",
]


async def _esperar_cloudflare(page: Page, timeout_seg: int = 60) -> None:
    for _ in range(timeout_seg):
        try:
            contenido = (await page.content()).lower()
        except Exception:
            await asyncio.sleep(1)
            continue
        if "just a moment" not in contenido and "checking your browser" not in contenido:
            return
        await asyncio.sleep(1)


async def _esperar_turnstile(page: Page, timeout_seg: int = 60) -> bool:
    """Espera el token de Cloudflare Turnstile antes de enviar el formulario."""
    print("  Esperando token Cloudflare Turnstile...", end="", flush=True)
    for i in range(timeout_seg):
        try:
            token = await page.evaluate(
                "() => { const el = document.querySelector(\"input[name='cf-turnstile-response']\");"
                " return el ? el.value : null; }"
            )
            if token:
                print(f" OK ({i+1}s)")
                return True
            # Si no hay iframe de Turnstile, no hay captcha que esperar.
            if i == 5:
                tiene_iframe = await page.locator(
                    "iframe[src*='challenges.cloudflare.com'], iframe[src*='turnstile']"
                ).count()
                if tiene_iframe == 0:
                    print(" (sin captcha)")
                    return True
        except Exception:
            pass
        await asyncio.sleep(1)
    print(" TIMEOUT — intenta resolver el captcha manualmente en Chrome")
    return False


async def _debug_pagina(page: Page, etapa: str) -> None:
    """Guarda screenshot + tabla de elementos interactivos para diagnóstico."""
    from pathlib import Path
    ruta_base = Path("data/portal/debug")
    ruta_base.mkdir(parents=True, exist_ok=True)
    nombre = etapa.replace(" ", "_")
    try:
        await page.screenshot(path=str(ruta_base / f"{nombre}.png"), full_page=True)
        print(f"  📷 Screenshot → data/portal/debug/{nombre}.png")
    except Exception:
        pass
    try:
        elementos = await page.evaluate("""() => {
            const info = [];
            document.querySelectorAll('button, input, a, select').forEach(el => {
                const tag = el.tagName.toLowerCase();
                const tipo = el.type || '';
                const texto = (el.innerText || el.value || el.placeholder || '').trim().slice(0, 60);
                const name = el.name || '';
                const id = el.id || '';
                if (texto || name || id) {
                    info.push({tag, tipo, texto, name, id});
                }
            });
            return info;
        }""")
        print(f"\n  Elementos en '{etapa}':")
        print(f"  {'TAG':<8} {'TYPE':<10} {'TEXTO':<35} {'NAME':<20} {'ID'}")
        print(f"  {'─'*95}")
        for e in elementos[:40]:
            print(f"  {e['tag']:<8} {e['tipo']:<10} {e['texto']:<35} {e['name']:<20} {e['id']}")
        if len(elementos) > 40:
            print(f"  ... y {len(elementos) - 40} más")
    except Exception as ex:
        print(f"  (no se pudo listar elementos: {ex})")


def _extraer_url(texto: str) -> str:
    """
    Extrae la URL de acceso DIAN de:
    - Una URL directa: https://catalogo-vpfe.dian.gov.co/User/AuthToken?...
    - Un tag HTML copiado del correo: <a href="https://..." ...>
    Desescapa &amp; → & automáticamente.
    """
    texto = texto.strip()
    # Si contiene un tag <a href="...">, extraer solo el href
    m = re.search(r'href=["\']([^"\']+)["\']', texto, re.IGNORECASE)
    if m:
        return html.unescape(m.group(1))
    # URL directa — puede tener &amp; si fue copiada de HTML
    if texto.startswith("http"):
        return html.unescape(texto)
    return texto


async def iniciar_sesion_cedula(page: Page, cedula: str) -> bool:
    """
    Inicia sesión en el portal DIAN con una cédula de ciudadanía.

    Pausa en consola para que el usuario pegue el link de acceso recibido
    en su correo. Devuelve True si la sesión quedó activa.

    Args:
        page:   Página de Playwright ya conectada vía CDP.
        cedula: Número de cédula (solo dígitos, sin puntos).
    """
    cedula = str(cedula).strip()
    print(f"\n  Navegando a {URL_LOGIN} ...")
    try:
        await page.goto(URL_LOGIN, wait_until="domcontentloaded", timeout=60_000)
    except PWTimeoutError:
        print("  ✗ Timeout navegando al login — verifica que Chrome esté abierto con CDP")
        return False

    await _esperar_cloudflare(page)
    await asyncio.sleep(1)

    # --- Tab "Persona" ---
    clickeado = False
    for sel in _SELS_PERSONA_TAB:
        try:
            cnt = await page.locator(sel).count()
            if cnt > 0:
                await page.locator(sel).first.click(timeout=5_000)
                clickeado = True
                await asyncio.sleep(1)
                break
        except Exception:
            continue

    if not clickeado:
        print("  ✗ Tab 'Persona' no encontrado — comprueba la página en Chrome")
        await _debug_pagina(page, "01_login_sin_persona_tab")

    # --- Cédula ---
    ingresado = False
    for sel in _SELS_CAMPO_CEDULA:
        try:
            cnt = await page.locator(sel).count()
            if cnt > 0:
                campo = page.locator(sel).first
                await campo.clear(timeout=3_000)
                await campo.fill(cedula, timeout=3_000)
                ingresado = True
                break
        except Exception:
            continue

    if not ingresado:
        print("  ✗ No se encontró el campo para la cédula")
        await _debug_pagina(page, "02_error_campo")
        return False

    await asyncio.sleep(0.5)

    # --- Turnstile + Entrar ---
    await _esperar_turnstile(page, timeout_seg=60)

    enviado = False
    for sel in _SELS_SUBMIT:
        try:
            cnt = await page.locator(sel).count()
            if cnt > 0:
                await page.locator(sel).first.click(timeout=10_000)
                enviado = True
                break
        except Exception:
            continue

    if not enviado:
        print("  ✗ No se pudo hacer click en el botón de envío")
        await _debug_pagina(page, "03_error_submit")
        return False

    await asyncio.sleep(2)

    # --- Magic link del correo ---
    print("\n" + "─" * 55)
    print("  📧  DIAN envió un correo con tu link de acceso.")
    print("      Pega la URL directa o el tag  <a href=\"...\">")
    print("─" * 55)
    texto_raw = input("  Link: ").strip()
    link = _extraer_url(texto_raw)

    if not link.startswith("http"):
        print(f"  ✗ No se reconoció una URL válida en el texto pegado.")
        return False

    try:
        await page.goto(link, wait_until="domcontentloaded", timeout=60_000)
    except PWTimeoutError:
        print("  ✗ Timeout cargando el link de acceso")
        return False

    await _esperar_cloudflare(page)
    await asyncio.sleep(2)

    try:
        contenido = (await page.content()).lower()
    except Exception:
        contenido = ""

    if any(marca in contenido for marca in _MARCAS_SESION):
        print("  ✓ Sesión iniciada")
        return True

    print("  ⚠️  No se pudo confirmar la sesión automáticamente")
    await _debug_pagina(page, "04_post_login")
    confirmar = input("  ¿La sesión quedó activa en Chrome? (s/n): ").strip().lower()
    return confirmar in ("s", "si", "sí", "y", "yes")
