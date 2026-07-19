"""
Validación de archivos subidos por magic bytes (no por Content-Type header,
que es trivial de spoofear).

Hoy soportamos PDF, JPEG y PNG — los tipos que efectivamente aceptamos como
facturas y contratos. Extender según se necesite.

Uso típico en un endpoint de upload:

    from services.upload_validation import validate_upload

    contents = await file.read()
    validate_upload(contents, filename=file.filename, allowed={"pdf"})
"""
from __future__ import annotations

from fastapi import HTTPException

# Tamaño máximo por default: 20MB. Ajustar por endpoint si hace falta.
DEFAULT_MAX_SIZE_BYTES = 20 * 1024 * 1024


def _looks_like_pdf(head: bytes) -> bool:
    return head.startswith(b"%PDF-")


def _looks_like_jpeg(head: bytes) -> bool:
    return head[:3] == b"\xff\xd8\xff"


def _looks_like_png(head: bytes) -> bool:
    return head[:8] == b"\x89PNG\r\n\x1a\n"


_CHECKERS = {
    "pdf": _looks_like_pdf,
    "jpeg": _looks_like_jpeg,
    "jpg": _looks_like_jpeg,
    "png": _looks_like_png,
}


def _detect_kind(head: bytes) -> str | None:
    if _looks_like_pdf(head):
        return "pdf"
    if _looks_like_jpeg(head):
        return "jpeg"
    if _looks_like_png(head):
        return "png"
    return None


def validate_upload(
    contents: bytes,
    filename: str,
    allowed: set[str],
    *,
    max_size_bytes: int = DEFAULT_MAX_SIZE_BYTES,
) -> str:
    """Valida un blob de bytes acabado de subir.

    Args:
      contents:      bytes completos del archivo.
      filename:      nombre reportado por el cliente (solo para logging;
                     no se confía).
      allowed:       set de tipos aceptados, ej {"pdf"} o {"pdf", "jpeg", "png"}.
      max_size_bytes: cap de tamaño.

    Returns:
      El tipo detectado ("pdf" / "jpeg" / "png").

    Raises:
      HTTPException(413) si excede el tamaño.
      HTTPException(415) si el magic byte no es de un tipo permitido.
    """
    if len(contents) > max_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Archivo demasiado grande (máximo {max_size_bytes // (1024*1024)}MB).",
        )
    if len(contents) < 8:
        raise HTTPException(status_code=415, detail="Archivo vacío o incompleto.")

    detected = _detect_kind(contents[:16])
    if detected is None:
        raise HTTPException(
            status_code=415,
            detail=f"Formato no reconocido. Solo se aceptan: {', '.join(sorted(allowed))}.",
        )
    normalized_allowed = {a.lower() for a in allowed}
    if detected == "jpeg" and "jpg" in normalized_allowed:
        normalized_allowed.add("jpeg")
    if detected not in normalized_allowed:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Tipo {detected} no permitido en este endpoint. "
                f"Aceptados: {', '.join(sorted(allowed))}."
            ),
        )

    # Análisis heurístico de contenido — no-op si AV_SCAN_ENABLED=False.
    from services.av_scan import maybe_scan_or_reject
    maybe_scan_or_reject(detected, contents)

    return detected
