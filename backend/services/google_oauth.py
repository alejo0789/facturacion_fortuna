"""
Servicio de OAuth 2.0 con Google (Gmail).

Soporta 2 modos por empresa:

  - saas (default): usa las credenciales GOOGLE_OAUTH_CLIENT_ID/SECRET del
    backend (registradas 1 vez por el operador del SaaS en Google Cloud).
    Cada empresa autoriza con 1 click sin ver el Client Secret.

  - custom: la empresa registró su propia OAuth app en su Google Cloud y
    guardó Client ID + Secret en su registro de empresas (encriptado).

En ambos modos, el backend maneja el flow y guarda el refresh_token
encriptado. n8n nunca ve credenciales de OAuth; en cada búsqueda el
backend refresca el access_token y lo pasa en el payload del webhook.
"""
from __future__ import annotations

import secrets
from datetime import datetime
from typing import Optional
from urllib.parse import urlencode

import httpx

from core.config import settings
from services.credentials_encryption import decrypt_str, encrypt_str


GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"

# Scope mínimo para leer correos con adjuntos. openid + email para poder
# identificar qué cuenta autorizó (mostrar "Conectado como X" en UI).
GMAIL_SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def _client_id_secret_for(empresa) -> tuple[Optional[str], Optional[str]]:
    """Devuelve (client_id, client_secret) según el modo de la empresa.

    Modo saas → los del .env del backend.
    Modo custom → los guardados en la fila de empresa (client_secret desencriptado).
    """
    mode = getattr(empresa, "gmail_oauth_mode", None) or "saas"
    if mode == "custom":
        cid = getattr(empresa, "gmail_client_id", None)
        secret = decrypt_str(getattr(empresa, "gmail_client_secret_enc", None))
        return cid, secret
    return settings.GOOGLE_OAUTH_CLIENT_ID, settings.GOOGLE_OAUTH_CLIENT_SECRET


def build_authorize_url(empresa, state: str) -> str:
    """Construye la URL a la que redirigir al usuario para iniciar el OAuth.

    `state` es un token opaco que el callback debe validar para prevenir CSRF.
    """
    client_id, _ = _client_id_secret_for(empresa)
    if not client_id:
        raise RuntimeError(
            "GOOGLE_OAUTH_CLIENT_ID no está configurado en el .env del backend "
            "(modo saas) o gmail_client_id no está seteado en la empresa (modo custom)."
        )
    params = {
        "client_id": client_id,
        "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(GMAIL_SCOPES),
        # offline + prompt=consent → siempre devuelve refresh_token.
        # Sin esto, Google solo lo emite la primera vez que el usuario autoriza,
        # lo cual rompe cualquier reconexión.
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "include_granted_scopes": "true",
    }
    return f"{GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"


def new_state_token() -> str:
    """Genera un token aleatorio para el parámetro `state` del OAuth flow."""
    return secrets.token_urlsafe(32)


async def exchange_code_for_tokens(empresa, code: str) -> dict:
    """Intercambia el authorization code por access_token + refresh_token.

    Google devuelve algo como:
      {
        "access_token": "...",
        "expires_in": 3599,
        "refresh_token": "...",   # solo con access_type=offline & prompt=consent
        "scope": "...",
        "token_type": "Bearer",
        "id_token": "..."         # JWT con email del usuario que autorizó
      }
    """
    client_id, client_secret = _client_id_secret_for(empresa)
    if not client_id or not client_secret:
        raise RuntimeError("Credenciales OAuth Google incompletas para esta empresa.")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            GOOGLE_TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
    resp.raise_for_status()
    return resp.json()


async def fetch_userinfo(access_token: str) -> dict:
    """Consulta el email del usuario que autorizó, para display en la UI."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            GOOGLE_USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def refresh_access_token(empresa) -> Optional[str]:
    """Usa el refresh_token guardado para obtener un access_token fresco.

    Devuelve None si:
      - No hay refresh_token guardado.
      - La desencriptación falla (por rotación de FERNET_KEY sin migración).
      - Google rechaza el refresh (token revocado por el usuario, etc.).

    El caller debe manejar el None → notificar al frontend que se reconecte.
    """
    refresh_token = decrypt_str(getattr(empresa, "gmail_refresh_token_enc", None))
    if not refresh_token:
        return None

    client_id, client_secret = _client_id_secret_for(empresa)
    if not client_id or not client_secret:
        return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                GOOGLE_TOKEN_ENDPOINT,
                data={
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "refresh_token",
                },
            )
        resp.raise_for_status()
        return resp.json().get("access_token")
    except httpx.HTTPError:
        return None


async def save_tokens_to_empresa(
    db,
    empresa,
    token_response: dict,
    userinfo: dict,
) -> None:
    """Guarda refresh_token + email + timestamp en la fila de empresa."""
    refresh_token = token_response.get("refresh_token")
    if refresh_token:
        empresa.gmail_refresh_token_enc = encrypt_str(refresh_token)
    empresa.gmail_email = userinfo.get("email")
    empresa.gmail_connected_at = datetime.utcnow()
    await db.commit()


async def disconnect_gmail(db, empresa) -> None:
    """Borra los tokens de la fila de empresa. No revoca en Google (el usuario
    puede hacerlo en https://myaccount.google.com/permissions si lo desea)."""
    empresa.gmail_refresh_token_enc = None
    empresa.gmail_email = None
    empresa.gmail_connected_at = None
    await db.commit()


def resolve_gemini_api_key(empresa) -> Optional[str]:
    """Devuelve la API key de Gemini a usar para esta empresa.

    Precedencia: gemini_api_key_enc (override per-tenant) → GEMINI_API_KEY_GLOBAL.
    """
    per_tenant = decrypt_str(getattr(empresa, "gemini_api_key_enc", None))
    if per_tenant:
        return per_tenant
    return settings.GEMINI_API_KEY_GLOBAL
