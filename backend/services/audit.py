"""
Audit log — traza estructurada de acciones sensibles.

Uso típico:

    from services.audit import log_action

    await log_action(
        db, request,
        action="auth.login",
        user_id=user.id,
        result="success",
        details={"empresas_accesibles": len(empresas)},
    )

Convenciones para `action`:

  auth.login, auth.login_failed, auth.logout, auth.register
  auth.password_change
  empresa.create, empresa.update, empresa.api_key_rotated
  usuario.invite, usuario.role_change, usuario.deactivate
  oauth.gmail.connect, oauth.gmail.disconnect
  oauth.outlook.connect, oauth.outlook.disconnect
  dian.config_update, dian.sync_start, dian.sync_cancel
  export.medios_magneticos, export.balance

Todo es append-only. No hay endpoints de DELETE — la traza es la traza.
"""
from __future__ import annotations

import logging
from typing import Optional, Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from models_security import AuditLog

logger = logging.getLogger(__name__)


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    from core.config import settings
    real_ip = request.client.host if request.client else None
    trusted = settings.trusted_proxies_list
    if trusted and real_ip in trusted:
        fwd = request.headers.get("X-Forwarded-For")
        if fwd:
            return fwd.split(",")[0].strip()
    return real_ip


def _user_agent(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    ua = request.headers.get("User-Agent")
    if ua and len(ua) > 500:
        ua = ua[:500]
    return ua


async def log_action(
    db: AsyncSession,
    request: Optional[Request],
    *,
    action: str,
    user_id: Optional[int] = None,
    empresa_id: Optional[int] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str | int] = None,
    result: str = "success",
    details: Optional[dict[str, Any]] = None,
) -> None:
    """Registra 1 entrada en `audit_log`.

    Nunca falla — si la BD está caída, loguea a stderr y sigue. La ausencia
    de un audit event NO debe romper la request del usuario.
    """
    try:
        entry = AuditLog(
            action=action,
            user_id=user_id,
            empresa_id=empresa_id,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            ip=_client_ip(request),
            user_agent=_user_agent(request),
            result=result,
            details=details,
        )
        db.add(entry)
        await db.flush()
    except Exception:
        logger.exception("audit log entry failed for action=%s user=%s", action, user_id)
