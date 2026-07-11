"""
Servicio de OAuth 2.0 con Microsoft Identity Platform (Outlook / Graph).

Copia estructural de google_oauth.py con las particularidades del stack MS:
  - Endpoint por tenant: /{tenant}/oauth2/v2.0/authorize|token con tenant =
    'common' (accept both personal + org) por default.
  - Scope Mail.Read + offline_access + User.Read para poder leer el correo
    del usuario que autorizó.
  - userinfo se hace a Graph /me (los tokens de MS no traen id_token con email
    por default con el scope common, así que consultamos Graph).
"""
from __future__ import annotations

import secrets
from datetime import datetime
from typing import Optional
from urllib.parse import urlencode

import httpx

from core.config import settings
from services.credentials_encryption import decrypt_str, encrypt_str


GRAPH_ME_ENDPOINT = "https://graph.microsoft.com/v1.0/me"

OUTLOOK_SCOPES = [
    "openid",
    "offline_access",
    "User.Read",
    "Mail.Read",
]


def _authorize_endpoint(tenant: str) -> str:
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"


def _token_endpoint(tenant: str) -> str:
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"


def _client_id_secret_tenant_for(empresa) -> tuple[Optional[str], Optional[str], str]:
    """Devuelve (client_id, client_secret, tenant_id) según el modo de la empresa."""
    mode = getattr(empresa, "outlook_oauth_mode", None) or "saas"
    if mode == "custom":
        cid = getattr(empresa, "outlook_client_id", None)
        secret = decrypt_str(getattr(empresa, "outlook_client_secret_enc", None))
        tenant = getattr(empresa, "outlook_tenant_id", None) or "common"
        return cid, secret, tenant
    return (
        settings.MICROSOFT_OAUTH_CLIENT_ID,
        settings.MICROSOFT_OAUTH_CLIENT_SECRET,
        settings.MICROSOFT_OAUTH_TENANT_ID,
    )


def build_authorize_url(empresa, state: str) -> str:
    """Construye la URL a la que redirigir al usuario para iniciar el OAuth."""
    client_id, _, tenant = _client_id_secret_tenant_for(empresa)
    if not client_id:
        raise RuntimeError(
            "MICROSOFT_OAUTH_CLIENT_ID no está configurado en el .env del backend "
            "(modo saas) o outlook_client_id no está seteado en la empresa (modo custom)."
        )
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": settings.MICROSOFT_OAUTH_REDIRECT_URI,
        "response_mode": "query",
        "scope": " ".join(OUTLOOK_SCOPES),
        "state": state,
        # prompt=consent → asegura que el refresh_token se emita en cada
        # reconexión. Sin esto, si el usuario ya había autorizado la app,
        # MS a veces omite el refresh_token silenciosamente.
        "prompt": "consent",
    }
    return f"{_authorize_endpoint(tenant)}?{urlencode(params)}"


def new_state_token() -> str:
    return secrets.token_urlsafe(32)


async def exchange_code_for_tokens(empresa, code: str) -> dict:
    """Intercambia el authorization code por access_token + refresh_token."""
    client_id, client_secret, tenant = _client_id_secret_tenant_for(empresa)
    if not client_id or not client_secret:
        raise RuntimeError("Credenciales OAuth Microsoft incompletas para esta empresa.")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            _token_endpoint(tenant),
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": settings.MICROSOFT_OAUTH_REDIRECT_URI,
                "grant_type": "authorization_code",
                "scope": " ".join(OUTLOOK_SCOPES),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    resp.raise_for_status()
    return resp.json()


async def fetch_userinfo(access_token: str) -> dict:
    """Consulta el usuario que autorizó via Graph /me. Devuelve al menos
    'userPrincipalName' o 'mail' para mostrar en la UI.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            GRAPH_ME_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def refresh_access_token(empresa) -> Optional[str]:
    """Usa el refresh_token guardado para obtener un access_token fresco."""
    refresh_token = decrypt_str(getattr(empresa, "outlook_refresh_token_enc", None))
    if not refresh_token:
        return None

    client_id, client_secret, tenant = _client_id_secret_tenant_for(empresa)
    if not client_id or not client_secret:
        return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                _token_endpoint(tenant),
                data={
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "refresh_token",
                    "scope": " ".join(OUTLOOK_SCOPES),
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        resp.raise_for_status()
        payload = resp.json()
        # Microsoft a veces emite un refresh_token NUEVO en el refresh.
        # Lo guardamos silenciosamente si viene (rotación de tokens).
        new_refresh = payload.get("refresh_token")
        if new_refresh and new_refresh != refresh_token:
            empresa.outlook_refresh_token_enc = encrypt_str(new_refresh)
        return payload.get("access_token")
    except httpx.HTTPError:
        return None


async def save_tokens_to_empresa(
    db,
    empresa,
    token_response: dict,
    userinfo: dict,
) -> None:
    refresh_token = token_response.get("refresh_token")
    if refresh_token:
        empresa.outlook_refresh_token_enc = encrypt_str(refresh_token)
    # Preferimos mail; caemos a userPrincipalName si mail viene null (personal).
    empresa.outlook_email = userinfo.get("mail") or userinfo.get("userPrincipalName")
    empresa.outlook_connected_at = datetime.utcnow()
    await db.commit()


async def disconnect_outlook(db, empresa) -> None:
    empresa.outlook_refresh_token_enc = None
    empresa.outlook_email = None
    empresa.outlook_connected_at = None
    await db.commit()
