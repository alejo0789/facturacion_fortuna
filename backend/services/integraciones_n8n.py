"""
Helpers de integración n8n — arquitectura "workflow compartido + credenciales dinámicas".

Arquitectura (decisión 1A):
    Un solo workflow en una instancia n8n operada por el SaaS atiende a
    TODOS los tenants. Cada cliente crea sus propias credenciales (OpenAI,
    Outlook/Gmail, etc.) en esa instancia n8n y pega los IDs en su panel
    /app/integraciones. El backend inyecta esos IDs en el payload y el
    workflow los usa como `credentialId` dinámico (n8n soporta expresión
    en credentials.id desde v1.x).

Precedencia para resolver la URL del webhook (de mayor a menor prioridad):
    1. `empresas.n8n_webhook_url` — override para tenants que prefieren
       self-hosted n8n. Raro pero soportado.
    2. `settings.N8N_PROCESS_WEBHOOK_URL` — URL del workflow compartido del
       SaaS. Default para 99% de los tenants.
    3. `os.getenv("N8N_UPLOAD_WEBHOOK")` — compatibilidad con setup legacy.
    4. `LEGACY_WEBHOOK_URL` — fallback duro para "La Fortuna" sin config.

El api_key, en cambio, SIEMPRE es por-empresa (`empresas.api_key`). Esa es
la identidad del tenant que el workflow usa para responder al backend
correcto y para que el backend valide quién hizo la solicitud.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import httpx

try:
    from core.config import settings
except ImportError:  # pragma: no cover - defensa para tests aislados
    settings = None  # type: ignore[assignment]


# ── Constantes legacy (fallback de "La Fortuna" — último recurso) ──────────
LEGACY_INVOICE_PATH = r"\\192.168.2.20\Facturas\temp"
LEGACY_WEBHOOK_URL = (
    "https://saman.lafortuna.com.co/n8n/webhook/"
    "d15fc127-671d-4b24-8221-bac74a6f4648"
)


@dataclass
class N8nUploadConfig:
    """Configuración resuelta para disparar el webhook de upload de PDF."""

    webhook_url: str
    api_key: str
    storage_path: str
    openai_credential_id: Optional[str]
    empresa_id: int
    is_self_hosted: bool  # True si el tenant usa su propio n8n en vez del SaaS


def get_shared_process_url() -> Optional[str]:
    """URL del workflow compartido del SaaS para procesar factura (PDF)."""
    if settings is not None:
        url = getattr(settings, "N8N_PROCESS_WEBHOOK_URL", None)
        if url:
            return url
    return os.getenv("N8N_PROCESS_WEBHOOK_URL") or os.getenv("N8N_UPLOAD_WEBHOOK")


def get_shared_search_url() -> Optional[str]:
    """URL del workflow compartido del SaaS para buscar correos (fase 2)."""
    if settings is not None:
        url = getattr(settings, "N8N_SEARCH_WEBHOOK_URL", None)
        if url:
            return url
    return os.getenv("N8N_SEARCH_WEBHOOK_URL") or os.getenv("N8N_SEARCH_WEBHOOK")


def get_shared_process_email_url() -> Optional[str]:
    """URL del workflow compartido para procesar adjunto seleccionado (fase 2)."""
    if settings is not None:
        url = getattr(settings, "N8N_PROCESS_EMAIL_WEBHOOK_URL", None)
        if url:
            return url
    return os.getenv("N8N_PROCESS_EMAIL_WEBHOOK_URL") or os.getenv("N8N_PROCESS_WEBHOOK")


def get_upload_config(empresa) -> N8nUploadConfig:
    """Resuelve la config de upload n8n para la empresa activa.

    Precedencia: override empresa → SaaS-shared → env legacy → constante legacy.
    """
    empresa_override = getattr(empresa, "n8n_webhook_url", None)
    shared = get_shared_process_url()

    webhook_url = empresa_override or shared or LEGACY_WEBHOOK_URL
    is_self_hosted = bool(empresa_override) and (
        not shared or empresa_override != shared
    )

    return N8nUploadConfig(
        webhook_url=webhook_url,
        api_key=getattr(empresa, "api_key", "") or os.getenv("API_KEY", ""),
        storage_path=(getattr(empresa, "storage_path", None) or LEGACY_INVOICE_PATH),
        openai_credential_id=getattr(empresa, "n8n_credential_openai_id", None),
        empresa_id=empresa.id,
        is_self_hosted=is_self_hosted,
    )


def build_upload_payload(
    *,
    cfg: N8nUploadConfig,
    file_path: str,
    file_url: str,
    safe_filename: str,
    original_filename: str,
    uploaded_at_iso: str,
    extras: Optional[dict] = None,
) -> dict:
    """Construye el body del POST al webhook compartido de procesar factura.

    Incluye `apiKey`, `empresaId` y `openai_credential_id` para que el
    workflow seleccione la credencial OpenAI del tenant correcto.
    """
    payload = {
        "event": "invoice_uploaded",
        "file_path": file_path,
        "file_url": file_url,
        "filename": safe_filename,
        "original_filename": original_filename,
        "uploaded_at": uploaded_at_iso,
        # Multi-tenant: estos campos los lee el workflow compartido para
        # autenticarse de vuelta al backend y escoger la credencial OpenAI
        # correcta vía `credentialId` dinámico.
        "apiKey": cfg.api_key,
        "empresaId": cfg.empresa_id,
        "openai_credential_id": cfg.openai_credential_id,
    }
    if extras:
        payload.update(extras)
    return payload


async def call_upload_webhook(
    cfg: N8nUploadConfig,
    payload: dict,
    *,
    timeout: float = 120.0,
) -> httpx.Response:
    """Dispara el webhook compartido con headers de auth.

    Envía `X-API-Key` + `X-Empresa-Id` además del payload con `apiKey`. Algunos
    workflows leen del header, otros del body; ambos quedan disponibles.
    """
    headers = {"Content-Type": "application/json"}
    if cfg.api_key:
        headers["X-API-Key"] = cfg.api_key
    headers["X-Empresa-Id"] = str(cfg.empresa_id)

    async with httpx.AsyncClient(timeout=timeout) as client:
        return await client.post(cfg.webhook_url, json=payload, headers=headers)


def file_url_from_storage(storage_path: str, safe_filename: str) -> str:
    """URL legible para la factura. Soporta UNC y paths locales."""
    if storage_path.startswith("\\\\"):
        normalized = storage_path.lstrip("\\").replace("\\", "/")
        return f"file://{normalized}/{safe_filename}"
    return f"file://{storage_path.replace(os.sep, '/').lstrip('/')}/{safe_filename}"
