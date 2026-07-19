"""
Análisis básico de contenido para detectar malware simple en PDFs.

**Alcance real**: heurística inline. NO es un antivirus. Detecta:
  - PDFs con /JavaScript o /JS action (comúnmente usado en malicious PDF).
  - PDFs con /Launch action (ejecuta comandos externos).
  - PDFs con /OpenAction potencialmente peligrosa.
  - PDFs con /EmbeddedFile (podría contener un ejecutable).

Cuando `settings.AV_SCAN_ENABLED = False`, este módulo NO corre.
Cuando `True`, se llama desde `services/upload_validation.py`.

Para producción real, reemplazar `_heuristic_pdf_scan` por:
  - ClamAV vía clamd (server local, subproceso o socket).
  - VirusTotal Public API (rate-limited).
  - Cloud Storage con AV como Google Cloud Storage w/ Threat Detection.

El interfaz `scan_bytes(kind, contents) -> ScanResult` permanece igual —
solo cambia la implementación interna.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import HTTPException

from core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ScanResult:
    clean: bool
    reason: str | None = None


# Marcadores PDF que casi siempre indican comportamiento sospechoso en
# facturas contables (donde el PDF debería ser puro texto/imagen).
_SUSPICIOUS_PDF_TOKENS = [
    (b"/JavaScript", "PDF contiene código JavaScript embebido"),
    (b"/JS ", "PDF contiene acción JavaScript"),
    (b"/JS(", "PDF contiene acción JavaScript"),
    (b"/Launch", "PDF contiene una acción /Launch (ejecuta comandos)"),
    (b"/EmbeddedFile", "PDF contiene un archivo embebido"),
    (b"/RichMedia", "PDF contiene contenido rich media (Flash/multimedia)"),
    (b"/SubmitForm", "PDF envía formulario a URL externa"),
]


def _heuristic_pdf_scan(contents: bytes) -> ScanResult:
    """Scan por tokens conocidos como abusados en PDFs maliciosos.

    Falso positivo aceptable: si un PDF legítimo trae JavaScript (raro para
    facturas), el usuario recibe 415 y puede quitarlo o desactivar el flag.
    """
    lower_head = contents[:200_000]  # primeros 200KB — suficiente para PDFs de factura
    for token, reason in _SUSPICIOUS_PDF_TOKENS:
        if token in lower_head:
            return ScanResult(clean=False, reason=reason)
    return ScanResult(clean=True)


def scan_bytes(kind: str, contents: bytes) -> ScanResult:
    """Interfaz pública. Devuelve resultado del scan.

    Args:
      kind: 'pdf'|'jpeg'|'png' (según lo que devolvió `validate_upload`).
      contents: bytes del archivo.
    """
    if kind == "pdf":
        return _heuristic_pdf_scan(contents)
    # JPEG/PNG por ahora no se scanean; magic bytes ya validaron el header.
    return ScanResult(clean=True)


def maybe_scan_or_reject(kind: str, contents: bytes) -> None:
    """Convenience: si AV_SCAN_ENABLED, scanea y lanza HTTP 415 si falla.

    Si el flag está apagado, no hace nada — silencioso.
    """
    if not getattr(settings, "AV_SCAN_ENABLED", False):
        return
    result = scan_bytes(kind, contents)
    if not result.clean:
        logger.warning("Upload rechazado por AV heurístico: %s", result.reason)
        raise HTTPException(
            status_code=415,
            detail=f"Archivo rechazado por análisis de seguridad: {result.reason}",
        )
