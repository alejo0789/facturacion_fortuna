# src/dian_admin/documentos.py
"""
Descarga el historial de documentos electrónicos del portal DIAN.

Flujo (post-login):
  1. Click tab "Histórico" → "Descarga de listados"
  2. Establecer rango de fechas (StartDate / EndDate vía JS + export-range visible)
  3. Seleccionar grupo: Emitidos (ventas) o Recibidos (compras)
  4. Click "Exportar Excel" → confirmar diálogo
  5. Esperar que el archivo aparezca en la tabla (exportación asíncrona)
  6. Descargar desde la columna "Acciones"
"""
from __future__ import annotations

import asyncio
import zipfile
from datetime import datetime
from pathlib import Path

import pandas as pd

# Playwright es opcional: el módulo debe cargar aunque no esté instalado
# (los endpoints de listado + IVA no requieren el scraper).
try:
    from playwright.async_api import Page, TimeoutError as PWTimeoutError
except ImportError:  # pragma: no cover
    Page = None  # type: ignore
    class PWTimeoutError(Exception):  # type: ignore
        pass


# ── Navegación ──────────────────────────────────────────────────────────────
# Navegar directo a la URL es más fiable que hacer clicks en el menú:
# después de la primera descarga el tab ya está activo y el click falla.
_URL_DESCARGA_LISTADOS  = "https://catalogo-vpfe.dian.gov.co/Document/Export"

# ── Formulario de exportación ────────────────────────────────────────────────
_SEL_EXPORT_RANGE   = "input[id='export-range']"         # campo visible del rango
_SEL_START_DATE     = "input[name='StartDate']"           # hidden — fecha inicio
_SEL_END_DATE       = "input[name='EndDate']"             # hidden — fecha fin
_SEL_GROUP_SELECT   = "select[name='GroupCode']"          # Todos / Emitidos / Recibidos

_SEL_BTN_EXPORTAR   = "button:has-text('Exportar Excel')"

# ── Confirmación ─────────────────────────────────────────────────────────────
_SEL_CONFIRMAR      = "#confirmModal-confirm-button"

# ── Tabla de resultados / descarga ───────────────────────────────────────────
# El portal muestra los exports en una tabla; la columna "Tipo" tiene el link
# al Excel (icono/texto). También se intenta la columna "Acciones".
_SELS_ACCION_DESCARGA = [
    "td a[href*='.xlsx']",          # columna Tipo — link directo al xlsx
    "td a[href*='.xls']",
    "td img[src*='excel'] + a",     # icono Excel seguido de link
    "td a[href*='DownloadExport']",
    "td a[href*='download']",
    "td a[href*='Download']",
    "a:has-text('Descargar')",
    "button:has-text('Descargar')",
    "[title*='Descargar']",
    "a[href*='Export']",
    "a[href*='export']",
]

# Grupos disponibles en el portal (valores del <select>)
GRUPOS = {
    "todos":    "0",   # Todos
    "ventas":   "1",   # Emitidos
    "compras":  "2",   # Recibidos
}


async def _debug(page: Page, nombre: str) -> None:
    ruta = Path("data/portal/debug")
    ruta.mkdir(parents=True, exist_ok=True)
    try:
        await page.screenshot(path=str(ruta / f"{nombre}.png"), full_page=True)
        print(f"  📷 {nombre}.png")
    except Exception:
        pass
    try:
        elementos = await page.evaluate("""() => {
            const info = [];
            document.querySelectorAll('button, input, a, select').forEach(el => {
                const tag = el.tagName.toLowerCase();
                const tipo = el.type || '';
                const texto = (el.innerText || el.value || el.placeholder || '').trim().slice(0, 50);
                const name = el.name || '';
                const id = el.id || '';
                const href = (el.href || '').slice(0, 70);
                if (texto || name || id) info.push({tag, tipo, texto, name, id, href});
            });
            return info;
        }""")
        print(f"  Elementos ({nombre}):")
        print(f"  {'TAG':<6} {'TYPE':<8} {'TEXTO':<35} {'NAME':<18} {'ID':<25} HREF")
        print(f"  {'─'*110}")
        for e in elementos[:40]:
            print(f"  {e['tag']:<6} {e['tipo']:<8} {e['texto']:<35} {e['name']:<18} {e['id']:<25} {e['href']}")
        if len(elementos) > 40:
            print(f"  ... y {len(elementos)-40} más")
    except Exception:
        pass


def _formato_dian(fecha_iso: str, fin_del_dia: bool = False) -> str:
    """Convierte YYYY-MM-DD al formato que usa el portal: M/D/YYYY H:MM:SS AM."""
    dt = datetime.strptime(fecha_iso, "%Y-%m-%d")
    hora = "11:59:59 PM" if fin_del_dia else "12:00:00 AM"
    return f"{dt.month}/{dt.day}/{dt.year} {hora}"


async def _set_fechas(page: Page, fecha_desde: str, fecha_hasta: str) -> bool:
    start_val   = _formato_dian(fecha_desde, fin_del_dia=False)
    end_val     = _formato_dian(fecha_hasta, fin_del_dia=True)
    range_label = f"{fecha_desde} - {fecha_hasta}"
    try:
        await page.evaluate(f"""() => {{
            var s = document.querySelector("input[name='StartDate']");
            var e = document.querySelector("input[name='EndDate']");
            var r = document.querySelector("input[id='export-range']");
            if (s) s.value = '{start_val}';
            if (e) e.value = '{end_val}';
            if (r) {{
                r.value = '{range_label}';
                r.dispatchEvent(new Event('change', {{bubbles: true}}));
                r.dispatchEvent(new Event('input',  {{bubbles: true}}));
            }}
        }}""")
        return True
    except Exception as e:
        print(f"  ✗ Error estableciendo fechas: {str(e)[:80]}")
        return False


async def _set_grupo(page: Page, grupo: str) -> None:
    valor = GRUPOS.get(grupo.lower(), "0")
    try:
        cnt = await page.locator(_SEL_GROUP_SELECT).count()
        if cnt > 0:
            await page.locator(_SEL_GROUP_SELECT).select_option(value=valor, timeout=5_000)
        # Si no encuentra el select simplemente continúa con el filtro actual
    except Exception:
        pass
    await asyncio.sleep(0.5)


async def _click_exportar(page: Page) -> bool:
    try:
        cnt = await page.locator(_SEL_BTN_EXPORTAR).count()
        if cnt == 0:
            print(f"  ✗ Botón 'Exportar Excel' no encontrado")
            return False
        await page.locator(_SEL_BTN_EXPORTAR).first.click(timeout=10_000)
        return True
    except Exception as e:
        print(f"  ✗ Error al exportar: {str(e)[:80]}")
        return False


async def _confirmar_dialogo(page: Page) -> None:
    await asyncio.sleep(1.5)
    try:
        cnt = await page.locator(_SEL_CONFIRMAR).count()
        if cnt > 0 and await page.locator(_SEL_CONFIRMAR).is_visible():
            await page.locator(_SEL_CONFIRMAR).click(timeout=5_000)
    except Exception:
        pass


async def _href_primer_link(page: Page) -> str:
    """Devuelve el href del primer link de descarga visible en la tabla, o '' si no hay ninguno."""
    for sel in _SELS_ACCION_DESCARGA:
        try:
            loc = page.locator(sel)
            if await loc.count() > 0:
                return await loc.first.get_attribute("href") or ""
        except Exception:
            continue
    return ""


async def _esperar_y_descargar(
    page: Page,
    destino: Path,
    timeout_seg: int = 180,
    href_anterior: str = "",
) -> bool:
    """
    Espera que la exportación asíncrona complete y descarga el archivo.
    href_anterior: ignora links con ese href (del export anterior en el historial).
    """
    print(f"  Generando", end="", flush=True)

    for i in range(timeout_seg):
        for sel in _SELS_ACCION_DESCARGA:
            try:
                loc = page.locator(sel)
                cnt = await loc.count()
                if cnt == 0:
                    continue
                href = await loc.first.get_attribute("href") or ""
                if href_anterior and href and href == href_anterior:
                    break
                print(f" ✓ ({i+1}s)")
                try:
                    async with page.expect_download(timeout=60_000) as dl_info:
                        await loc.first.click(timeout=10_000)
                    descarga = await dl_info.value
                    await descarga.save_as(destino)
                    return True
                except Exception:
                    if href:
                        base = "https://catalogo-vpfe.dian.gov.co"
                        url = href if href.startswith("http") else base + href
                        r = await page.context.request.get(url)
                        if r.ok:
                            body = await r.body()
                            if len(body) > 100:
                                destino.write_bytes(body)
                                return True
            except Exception:
                continue

        await asyncio.sleep(1)
        if (i + 1) % 10 == 0:
            print(f".", end="", flush=True)

    print(f"\n  ✗ Timeout ({timeout_seg}s) esperando el archivo")
    await _debug(page, "timeout_espera_descarga")
    return False


def _leer_excel(ruta: Path, etiqueta: str = "") -> pd.DataFrame | None:
    """
    Lee el Excel descargado. Si el portal envolvió el XLSX en un ZIP,
    extrae automáticamente el primer archivo .xlsx del interior.
    """
    # Detectar si el archivo es un ZIP del portal (no OOXML real).
    # Un xlsx real tiene [Content_Types].xml; el ZIP del portal contiene
    # un único archivo .xlsx adentro.
    es_zip_portal = False
    if zipfile.is_zipfile(ruta):
        with zipfile.ZipFile(ruta) as zf:
            nombres = zf.namelist()
            es_ooxml = any("[Content_Types]" in n for n in nombres)
            es_zip_portal = not es_ooxml

    if es_zip_portal:
        xlsx_tmp = ruta.parent / f"_tmp_{etiqueta}.xlsx"
        try:
            with zipfile.ZipFile(ruta) as zf:
                inner = [n for n in zf.namelist() if n.lower().endswith(".xlsx")]
                if not inner:
                    print(f"  ✗ ZIP sin .xlsx interior. Archivos: {zf.namelist()}")
                    return None
                xlsx_tmp.write_bytes(zf.read(inner[0]))
            df = pd.read_excel(xlsx_tmp, dtype=str, engine="openpyxl")
            df.columns = df.columns.str.strip()
            df = df.fillna("")
            xlsx_tmp.replace(ruta)
            return df
        except Exception as e:
            xlsx_tmp.unlink(missing_ok=True)
            print(f"  ✗ Error extrayendo ZIP: {str(e)[:80]}")
            return None

    try:
        df = pd.read_excel(ruta, dtype=str, engine="openpyxl")
        df.columns = df.columns.str.strip()
        df = df.fillna("")
        return df
    except Exception as e:
        print(f"  ✗ Error leyendo Excel: {str(e)[:80]}")
        return None


async def descargar_grupo(
    page: Page,
    fecha_desde: str,
    fecha_hasta: str,
    carpeta_salida: Path,
    grupo: str = "todos",
) -> pd.DataFrame | None:
    """
    Descarga un grupo (ventas/compras/todos) del portal DIAN para el período dado.

    Args:
        page:           Página con sesión DIAN activa.
        fecha_desde:    Fecha inicio YYYY-MM-DD.
        fecha_hasta:    Fecha fin YYYY-MM-DD.
        carpeta_salida: Carpeta donde guardar el Excel descargado.
        grupo:          "ventas" (Emitidos), "compras" (Recibidos) o "todos".

    Returns:
        DataFrame con el contenido del Excel, o None si falló.
    """
    carpeta_salida.mkdir(parents=True, exist_ok=True)

    # ── Paso 1: Navegar a Descarga de listados ────────────────────────────
    # goto() en lugar de clicks en el menú: tras la primera descarga el tab
    # ya está activo y el click falla. Si el goto falla porque el portal
    # redirigió post-login a esta misma URL, verificamos la URL actual.
    try:
        await page.goto(_URL_DESCARGA_LISTADOS, wait_until="domcontentloaded",
                        timeout=20_000)
        await asyncio.sleep(1.5)
    except Exception as e:
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=10_000)
        except Exception:
            pass
        if "Document/Export" in page.url:
            await asyncio.sleep(1.5)
        else:
            print(f"  ✗ No se pudo navegar al portal: {str(e)[:80]}")
            await _debug(page, f"{grupo}_paso1_error")
            return None

    # ── Paso 2: Fechas + grupo ────────────────────────────────────────────
    ok = await _set_fechas(page, fecha_desde, fecha_hasta)
    if not ok:
        await _debug(page, f"{grupo}_fechas_error")

    await _set_grupo(page, grupo)
    await asyncio.sleep(1)

    # ── Paso 3: Exportar (capturar href anterior para no reutilizarlo) ────
    href_antes = await _href_primer_link(page)

    ok = await _click_exportar(page)
    if not ok:
        await _debug(page, f"{grupo}_exportar_error")
        return None

    await _confirmar_dialogo(page)
    await asyncio.sleep(2)

    # ── Paso 4: Esperar y descargar ────────────────────────────────────────
    destino = carpeta_salida / f"historico_{grupo}_{fecha_desde}_{fecha_hasta}.xlsx"
    ok = await _esperar_y_descargar(page, destino, timeout_seg=180,
                                    href_anterior=href_antes)
    if not ok:
        return None

    # ── Leer Excel (con extracción de ZIP si el portal envuelve el archivo) ──
    return _leer_excel(destino, grupo)
