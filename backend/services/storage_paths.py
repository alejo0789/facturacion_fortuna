"""
Resolución centralizada de paths de storage por-empresa.

Antes: cada empresa tenía que setear `empresa.storage_path` a mano en el panel
Integraciones — si se olvidaba, el código caía a un UNC path hardcoded
(`LEGACY_INVOICE_PATH`) que solo funciona en Windows y desde la LAN de
La Fortuna. En Railway (Linux) eso fallaba silenciosamente y los uploads
se rompían.

Ahora: `resolve_storage_path(empresa)` hace lo obvio:

    Si `empresa.storage_path` está explícitamente seteado (override para
    tenants legacy o con SMB compartido) → úsalo tal cual.

    Si no → deriva automáticamente de `settings.STORAGE_PATH / <empresa.id>`.
    Cada tenant queda aislado en su propio subdirectorio sin intervención
    manual del admin.

En Railway, `STORAGE_PATH=/app/storage/facturas` y el Volume monta
`/app/storage`. Todo tenant automáticamente escribe en
`/app/storage/facturas/1`, `.../2`, etc. Nada que configurar por-empresa.

Mismo patrón para el path de temporales del buscador.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from urllib.parse import unquote

from core.config import settings

logger = logging.getLogger(__name__)


def local_path_from_file_url(url: str) -> str:
    """Convierte una url_factura almacenada al path local del filesystem.

    Maneja los flavors históricos que aparecen en la BD:
      - `file://C:/Users/...`        → drive letter Windows (`C:\\Users\\...`)
      - `file:///app/storage/...`    → POSIX absoluto (`/app/storage/...`)
      - `file://app/storage/...`     → POSIX absoluto legacy sin leading `/`
                                       (bug histórico de file_url_from_storage);
                                       se restaura la `/` cuando el runtime es
                                       POSIX.
      - `file://server/share/...`    → UNC de red Windows (`\\\\server\\share\\...`)
      - `\\\\server\\share\\...`     → UNC crudo, devolver tal cual.

    Cualquier otra cosa (http://, https://, url vacía) se devuelve tal cual —
    quien llame se encarga.
    """
    if not url:
        return url
    if url.startswith("\\\\"):
        return unquote(url)
    if not url.startswith("file://"):
        return url

    path_part = unquote(url[7:])

    if len(path_part) >= 2 and path_part[1] == ":":
        return path_part.replace("/", "\\")
    if path_part.startswith("/"):
        return path_part
    if os.name == "posix":
        return "/" + path_part
    return "\\\\" + path_part.replace("/", "\\")


# Legacy — solo se usa como último recurso si NADA está configurado. Se
# mantiene para no romper deploys existentes de La Fortuna que ya escriben
# a este share.
_LEGACY_INVOICE_PATH = r"\\192.168.2.20\Facturas\temp"
_LEGACY_TEMP_PATH = r"\\192.168.2.20\Facturas\temp_buscador"


def _default_base_storage() -> str:
    """Base path donde se agrupan los subdirectorios por-empresa."""
    return getattr(settings, "STORAGE_PATH", None) or "./storage/facturas"


def _default_base_temp() -> str:
    return getattr(settings, "TEMPORAL_FILES_PATH", None) or "./storage/temp"


def resolve_storage_path(empresa, *, ensure_exists: bool = True) -> str:
    """Path donde se guardan los PDFs de facturas de esta empresa.

    Precedencia:
      1. `empresa.storage_path` explícito (override — típico para tenants
         con SMB compartido o path especial).
      2. `settings.STORAGE_PATH / <empresa.id>` — el default multi-tenant.
      3. `_LEGACY_INVOICE_PATH` — último recurso con warning.

    Si `ensure_exists=True` (default), crea el directorio si no existe.
    """
    override = getattr(empresa, "storage_path", None)

    # Ignoramos el default hardcoded que traía el modelo antes ("./storage/facturas")
    # para forzar el path por-empresa auto-derivado. Si el admin quiere el
    # legacy path exacto, tiene que setear otro valor.
    if override and override.strip() and override.strip() != "./storage/facturas":
        path = override.strip()
    else:
        base = _default_base_storage()
        path = os.path.join(base, str(empresa.id))

    if not path or path == _LEGACY_INVOICE_PATH:
        logger.warning(
            "empresa %s cayó al legacy storage_path (%s) — "
            "configura STORAGE_PATH en el .env",
            getattr(empresa, "id", "?"), _LEGACY_INVOICE_PATH,
        )
        path = _LEGACY_INVOICE_PATH

    if ensure_exists and not path.startswith("\\\\"):
        # Solo intentamos crear si es un path local — UNC lo deja al admin.
        try:
            Path(path).mkdir(parents=True, exist_ok=True)
        except OSError as e:
            logger.warning("No se pudo crear %s: %s", path, e)

    return path


def resolve_temp_path(empresa, *, ensure_exists: bool = True) -> str:
    """Path para archivos temporales del buscador (adjuntos de correo, etc.)."""
    base = _default_base_temp()
    path = os.path.join(base, str(empresa.id)) if base else _LEGACY_TEMP_PATH

    if ensure_exists and not path.startswith("\\\\"):
        try:
            Path(path).mkdir(parents=True, exist_ok=True)
        except OSError as e:
            logger.warning("No se pudo crear %s: %s", path, e)

    return path
