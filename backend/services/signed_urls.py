"""
Firmas HMAC para URLs cortas — usado para servir PDFs inline en el navegador
donde el `Authorization: Bearer` no se puede adjuntar.

Uso típico:

    # Al construir la URL en un endpoint autenticado:
    token = create_pdf_token(kind="contrato", resource_id=42, empresa_id=1)
    return {"url": f"/api/contratos/42/pdf?t={token}"}

    # En el endpoint público del PDF:
    payload = verify_pdf_token(t, kind="contrato", resource_id=42)
    if not payload or payload["empresa_id"] != current_empresa.id:
        raise HTTPException(403)

Seguridad:
- Firmado con HMAC-SHA256 usando la misma JWT_SECRET_KEY (rotarla invalida
  todas las firmas). No es reversible.
- Corto TTL (5 min default) — suficiente para que el navegador cargue.
- Reemplaza el bypass público sin verificación de tenant que había antes.
"""
from __future__ import annotations

import base64
import hmac
import hashlib
import json
import time
from typing import Optional

from core.config import settings


_DEFAULT_TTL_SECONDS = 5 * 60  # 5 minutos


def _sign(payload: dict) -> str:
    """Serializa el payload + firma HMAC-SHA256. Devuelve `<b64_payload>.<b64_sig>`."""
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    body_b64 = base64.urlsafe_b64encode(body).rstrip(b"=").decode("ascii")
    sig = hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        body_b64.encode("ascii"),
        hashlib.sha256,
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")
    return f"{body_b64}.{sig_b64}"


def _verify(token: str) -> Optional[dict]:
    """Verifica firma + expiración. Devuelve payload o None si inválido."""
    try:
        body_b64, sig_b64 = token.split(".", 1)
    except ValueError:
        return None

    expected_sig = hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        body_b64.encode("ascii"),
        hashlib.sha256,
    ).digest()
    expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).rstrip(b"=").decode("ascii")

    # Comparación constante-tiempo — evita timing oracles.
    if not hmac.compare_digest(sig_b64, expected_sig_b64):
        return None

    try:
        pad = "=" * (-len(body_b64) % 4)
        body = base64.urlsafe_b64decode((body_b64 + pad).encode("ascii"))
        payload = json.loads(body.decode("utf-8"))
    except Exception:
        return None

    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or exp < time.time():
        return None

    return payload


def create_pdf_token(kind: str, resource_id: int, empresa_id: int,
                     ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> str:
    """Firma un token corto para servir un PDF específico de una empresa.

    `kind` es un discriminante ('contrato'|'factura'|'nota-bancaria') para
    evitar que un token válido para un contrato se use para una factura con
    el mismo id — defensa en profundidad.
    """
    return _sign({
        "k": kind,
        "r": int(resource_id),
        "e": int(empresa_id),
        "exp": int(time.time()) + ttl_seconds,
    })


def verify_pdf_token(token: str, kind: str, resource_id: int) -> Optional[dict]:
    """Verifica el token y que sea del kind + resource_id esperado.

    Devuelve {"empresa_id": int} si válido, None si no.
    """
    payload = _verify(token)
    if not payload:
        return None
    if payload.get("k") != kind or int(payload.get("r") or 0) != int(resource_id):
        return None
    return {"empresa_id": int(payload.get("e") or 0)}
