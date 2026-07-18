"""
Endpoints OAuth 2.0 para conectar buzones de correo a cada empresa (tenant).

Fase MVP: solo Gmail. Outlook se agregará después con el mismo patrón.

Flujo:
  1. GET /oauth/gmail/authorize
       → autenticado con JWT + X-Empresa-Id
       → genera state, lo guarda en cache, devuelve URL de Google
       → frontend abre esa URL en popup/nueva pestaña
  2. GET /oauth/gmail/callback?code=X&state=Y
       → SIN auth JWT (Google no puede enviar headers custom)
       → valida state contra el cache, matchea a la empresa
       → intercambia code por refresh_token, lo guarda encriptado
       → devuelve HTML que se cierra solo y notifica a la ventana padre
  3. POST /oauth/gmail/disconnect
       → autenticado
       → borra el refresh_token de la BD

El endpoint /callback no puede pedir JWT porque Google no manda headers.
Por eso guardamos `state → empresa_id` en cache temporal y lo miramos.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from core.dependencies import get_current_empresa, get_current_user
from models_tenant import Empresa
from services import google_oauth, microsoft_oauth


import logging

router = APIRouter()
logger = logging.getLogger(__name__)


# state → (empresa_id, user_id, expires_at). Se limpia perezosamente al validar
# y también en un sweep al inicio de cada nuevo authorize (para no crecer sin
# límite si un atacante inunda de peticiones).
# In-memory: si el backend reinicia, los OAuth flows en curso se pierden
# y el usuario tiene que reintentar. Aceptable para MVP.
_state_cache: Dict[str, tuple[int, int, datetime]] = {}
_STATE_TTL = timedelta(minutes=10)
_STATE_MAX_ENTRIES = 10_000  # hard cap contra abuso


def _sweep_expired_states() -> None:
    """Borra entries expiradas. O(n) sobre el cache — barato hasta ~10k."""
    now = datetime.utcnow()
    expired = [s for s, (_, _, exp) in _state_cache.items() if now > exp]
    for s in expired:
        _state_cache.pop(s, None)


def _remember_state(state: str, empresa_id: int, user_id: int) -> None:
    _sweep_expired_states()
    if len(_state_cache) >= _STATE_MAX_ENTRIES:
        # Hard cap: si alguien inunda, empezamos a rechazar. No es la ruta más
        # elegante pero previene OOM.
        raise HTTPException(
            status_code=503,
            detail="Demasiados OAuth flows en curso. Intenta en unos minutos.",
        )
    _state_cache[state] = (empresa_id, user_id, datetime.utcnow() + _STATE_TTL)


def _consume_state(state: str) -> Optional[tuple[int, int]]:
    """Devuelve (empresa_id, user_id) si state es válido y no expiró.

    Consumo one-shot: al llamar se saca del cache aunque haya expirado, para
    evitar que un state filtrado se pueda reutilizar.
    """
    entry = _state_cache.pop(state, None)
    if not entry:
        return None
    empresa_id, user_id, expires_at = entry
    if datetime.utcnow() > expires_at:
        return None
    return (empresa_id, user_id)


# --------- Gmail ---------

@router.get("/oauth/gmail/authorize")
async def gmail_authorize(
    current_user=Depends(get_current_user),
    empresa=Depends(get_current_empresa),
):
    """Devuelve la URL de Google a la que redirigir para iniciar el OAuth flow.

    El frontend abre esta URL en una ventana nueva (popup). El `state` firma
    el user_id además del empresa_id para auditoría (log del quién inició).
    """
    state = google_oauth.new_state_token()
    _remember_state(state, empresa.id, current_user.id)
    try:
        url = google_oauth.build_authorize_url(empresa, state)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"authorize_url": url, "state": state}


@router.get("/oauth/gmail/callback")
async def gmail_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Endpoint al que Google redirige tras el consent.

    Sin JWT (Google no manda headers). Autenticamos con el `state` opaco,
    que fue firmado one-shot cuando el user inició el flow autenticado.
    """
    if error:
        return _close_popup_html(success=False, message=f"Google devolvió error: {error}")

    if not code or not state:
        return _close_popup_html(success=False, message="Falta code o state en la respuesta de Google.")

    entry = _consume_state(state)
    if entry is None:
        return _close_popup_html(success=False, message="State inválido o expirado. Reintenta la conexión.")
    empresa_id, initiator_user_id = entry
    logger.info("OAuth Gmail callback empresa=%s iniciado_por_user=%s",
                empresa_id, initiator_user_id)

    result = await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    empresa = result.scalar_one_or_none()
    if not empresa:
        return _close_popup_html(success=False, message="Empresa no encontrada.")

    try:
        token_response = await google_oauth.exchange_code_for_tokens(empresa, code)
        userinfo = await google_oauth.fetch_userinfo(token_response["access_token"])
        await google_oauth.save_tokens_to_empresa(db, empresa, token_response, userinfo)
    except Exception as e:
        return _close_popup_html(success=False, message=f"Error guardando tokens: {e}")

    return _close_popup_html(
        success=True,
        message=f"Gmail conectado como {userinfo.get('email', 'desconocido')}",
    )


@router.post("/oauth/gmail/disconnect")
async def gmail_disconnect(
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Borra los tokens Gmail de la empresa. No revoca en Google."""
    await google_oauth.disconnect_gmail(db, empresa)
    return {"status": "disconnected"}


@router.get("/oauth/gmail/status")
async def gmail_status(empresa=Depends(get_current_empresa)):
    """Estado de la conexión Gmail para mostrar en /app/integraciones."""
    return {
        "connected": bool(empresa.gmail_refresh_token_enc),
        "email": empresa.gmail_email,
        "connected_at": empresa.gmail_connected_at.isoformat() if empresa.gmail_connected_at else None,
        "mode": empresa.gmail_oauth_mode or "saas",
        "has_custom_client": bool(empresa.gmail_client_id),
        "gemini_configured": bool(empresa.gemini_api_key_enc)
            or bool(getattr(google_oauth.settings, "GEMINI_API_KEY_GLOBAL", None)),
    }


# --------- Outlook ---------

@router.get("/oauth/outlook/authorize")
async def outlook_authorize(
    current_user=Depends(get_current_user),
    empresa=Depends(get_current_empresa),
):
    state = microsoft_oauth.new_state_token()
    _remember_state(state, empresa.id, current_user.id)
    try:
        url = microsoft_oauth.build_authorize_url(empresa, state)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"authorize_url": url, "state": state}


@router.get("/oauth/outlook/callback")
async def outlook_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if error:
        return _close_popup_html(
            success=False,
            message=f"Microsoft devolvió error: {error} - {error_description or ''}",
            provider="outlook",
        )

    if not code or not state:
        return _close_popup_html(
            success=False,
            message="Falta code o state en la respuesta de Microsoft.",
            provider="outlook",
        )

    entry = _consume_state(state)
    if entry is None:
        return _close_popup_html(
            success=False,
            message="State inválido o expirado. Reintenta la conexión.",
            provider="outlook",
        )
    empresa_id, initiator_user_id = entry
    logger.info("OAuth Outlook callback empresa=%s iniciado_por_user=%s",
                empresa_id, initiator_user_id)

    result = await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    empresa = result.scalar_one_or_none()
    if not empresa:
        return _close_popup_html(success=False, message="Empresa no encontrada.", provider="outlook")

    try:
        token_response = await microsoft_oauth.exchange_code_for_tokens(empresa, code)
        userinfo = await microsoft_oauth.fetch_userinfo(token_response["access_token"])
        await microsoft_oauth.save_tokens_to_empresa(db, empresa, token_response, userinfo)
    except Exception as e:
        return _close_popup_html(
            success=False,
            message=f"Error guardando tokens: {e}",
            provider="outlook",
        )

    email = userinfo.get("mail") or userinfo.get("userPrincipalName") or "desconocido"
    return _close_popup_html(
        success=True,
        message=f"Outlook conectado como {email}",
        provider="outlook",
    )


@router.post("/oauth/outlook/disconnect")
async def outlook_disconnect(
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    await microsoft_oauth.disconnect_outlook(db, empresa)
    return {"status": "disconnected"}


@router.get("/oauth/outlook/status")
async def outlook_status(empresa=Depends(get_current_empresa)):
    return {
        "connected": bool(empresa.outlook_refresh_token_enc),
        "email": empresa.outlook_email,
        "connected_at": empresa.outlook_connected_at.isoformat() if empresa.outlook_connected_at else None,
        "mode": empresa.outlook_oauth_mode or "saas",
        "has_custom_client": bool(empresa.outlook_client_id),
    }


class OutlookCustomModeIn(BaseModel):
    mode: str  # 'saas' | 'custom'
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    tenant_id: Optional[str] = None


@router.put("/oauth/outlook/config")
async def update_outlook_config(
    payload: OutlookCustomModeIn,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    from services.credentials_encryption import encrypt_str

    if payload.mode not in ("saas", "custom"):
        raise HTTPException(status_code=400, detail="mode debe ser 'saas' o 'custom'")

    if payload.mode == "custom":
        if not payload.client_id or not payload.client_secret:
            raise HTTPException(
                status_code=400,
                detail="En modo custom se requieren client_id y client_secret",
            )
        empresa.outlook_client_id = payload.client_id
        empresa.outlook_client_secret_enc = encrypt_str(payload.client_secret)
        empresa.outlook_tenant_id = payload.tenant_id or "common"
    else:
        empresa.outlook_client_id = None
        empresa.outlook_client_secret_enc = None
        empresa.outlook_tenant_id = "common"

    if empresa.outlook_oauth_mode != payload.mode:
        empresa.outlook_refresh_token_enc = None
        empresa.outlook_email = None
        empresa.outlook_connected_at = None

    empresa.outlook_oauth_mode = payload.mode
    await db.commit()
    return {"status": "updated", "mode": payload.mode}


class GmailCustomModeIn(BaseModel):
    mode: str  # 'saas' | 'custom'
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


@router.put("/oauth/gmail/config")
async def update_gmail_config(
    payload: GmailCustomModeIn,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Cambia el modo OAuth de la empresa (saas ↔ custom) y guarda el
    Client ID/Secret cuando el modo es custom.

    Cambiar de modo desconecta la sesión anterior (borra refresh_token) para
    forzar reautorización con las nuevas credenciales.
    """
    from services.credentials_encryption import encrypt_str

    if payload.mode not in ("saas", "custom"):
        raise HTTPException(status_code=400, detail="mode debe ser 'saas' o 'custom'")

    if payload.mode == "custom":
        if not payload.client_id or not payload.client_secret:
            raise HTTPException(
                status_code=400,
                detail="En modo custom se requieren client_id y client_secret",
            )
        empresa.gmail_client_id = payload.client_id
        empresa.gmail_client_secret_enc = encrypt_str(payload.client_secret)
    else:
        # saas → limpiar cualquier custom previo para evitar confusión.
        empresa.gmail_client_id = None
        empresa.gmail_client_secret_enc = None

    # Cambio de modo → cortar la sesión anterior.
    if empresa.gmail_oauth_mode != payload.mode:
        empresa.gmail_refresh_token_enc = None
        empresa.gmail_email = None
        empresa.gmail_connected_at = None

    empresa.gmail_oauth_mode = payload.mode
    await db.commit()
    return {"status": "updated", "mode": payload.mode}


class GeminiKeyIn(BaseModel):
    api_key: Optional[str] = None  # None → borrar override, usar global


@router.put("/oauth/gemini/api-key")
async def update_gemini_key(
    payload: GeminiKeyIn,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza la Gemini API key per-tenant. None/vacío → usa la global del SaaS."""
    from services.credentials_encryption import encrypt_str

    empresa.gemini_api_key_enc = encrypt_str(payload.api_key) if payload.api_key else None
    await db.commit()
    return {"status": "updated", "has_override": bool(empresa.gemini_api_key_enc)}


# --------- HTML helper para cerrar el popup del OAuth ---------

def _close_popup_html(success: bool, message: str, provider: str = "gmail") -> HTMLResponse:
    """HTML mínimo que se muestra al usuario en el popup y lo cierra.

    Notifica a la ventana padre (opener) via postMessage con el tipo
    '{provider}_oauth_complete' para que el frontend refresque el estado.
    """
    color = "#0f766e" if success else "#b91c1c"
    icon = "✓" if success else "✗"
    payload_flag = "true" if success else "false"
    provider_label = "Outlook" if provider == "outlook" else "Gmail"
    msg_type = f"{provider}_oauth_complete"
    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Autorización {provider_label}</title>
<style>
  body {{ font-family: system-ui, -apple-system, sans-serif; padding: 3rem; text-align: center; color: #1f2937; }}
  .icon {{ font-size: 4rem; color: {color}; }}
  .msg {{ margin-top: 1rem; font-size: 1.1rem; }}
  .hint {{ margin-top: 2rem; color: #6b7280; font-size: 0.9rem; }}
</style></head>
<body>
  <div class="icon">{icon}</div>
  <div class="msg">{message}</div>
  <div class="hint">Esta ventana se cerrará automáticamente…</div>
  <script>
    try {{
      if (window.opener) {{
        window.opener.postMessage({{ type: {msg_type!r}, success: {payload_flag}, message: {message!r} }}, '*');
      }}
    }} catch (e) {{}}
    setTimeout(() => {{ try {{ window.close(); }} catch (e) {{}} }}, 1500);
  </script>
</body></html>"""
    return HTMLResponse(html)
