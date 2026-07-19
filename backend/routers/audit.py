"""
Consulta del audit log (append-only) — solo ADMIN de la empresa activa.

Filtros disponibles:
  - date range (fecha_desde / fecha_hasta)
  - action (prefijo o exacto)
  - user_id
  - resource_type
  - result

Superadmin puede pedir eventos de cualquier empresa vía `?empresa_id=`.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from core.dependencies import get_current_empresa, get_current_user, require_role
from models_security import AuditLog
from models_tenant import Usuario
from schemas_audit import AuditLogEntry, AuditLogPage


router = APIRouter()


@router.get("/audit-log", response_model=AuditLogPage)
async def list_audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    action: Optional[str] = Query(None, description="Prefijo (ej. 'auth.') o acción exacta"),
    user_id: Optional[int] = None,
    resource_type: Optional[str] = None,
    result: Optional[str] = Query(None, pattern="^(success|failure|partial)$"),
    empresa_id_override: Optional[int] = Query(None, alias="empresa_id",
                                                description="Solo superadmin"),
    current_user=Depends(require_role("ADMIN")),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Lista eventos del audit log de la empresa activa.

    Solo ADMIN. Superadmin puede consultar otras empresas con ?empresa_id=.
    """
    # Determinar qué empresa filtrar
    filter_empresa_id = empresa.id
    if empresa_id_override is not None:
        if not current_user.es_superadmin:
            raise HTTPException(
                status_code=403,
                detail="Solo superadmin puede consultar otras empresas",
            )
        filter_empresa_id = empresa_id_override

    stmt = select(AuditLog).where(AuditLog.empresa_id == filter_empresa_id)
    count_stmt = select(func.count(AuditLog.id)).where(
        AuditLog.empresa_id == filter_empresa_id
    )

    if fecha_desde:
        dt = datetime.combine(fecha_desde, datetime.min.time()).replace(tzinfo=timezone.utc)
        stmt = stmt.where(AuditLog.ts >= dt)
        count_stmt = count_stmt.where(AuditLog.ts >= dt)
    if fecha_hasta:
        dt = datetime.combine(fecha_hasta, datetime.max.time()).replace(tzinfo=timezone.utc)
        stmt = stmt.where(AuditLog.ts <= dt)
        count_stmt = count_stmt.where(AuditLog.ts <= dt)
    if action:
        if action.endswith("*"):
            prefix = action[:-1]
            stmt = stmt.where(AuditLog.action.like(f"{prefix}%"))
            count_stmt = count_stmt.where(AuditLog.action.like(f"{prefix}%"))
        else:
            stmt = stmt.where(AuditLog.action == action)
            count_stmt = count_stmt.where(AuditLog.action == action)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
        count_stmt = count_stmt.where(AuditLog.user_id == user_id)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
        count_stmt = count_stmt.where(AuditLog.resource_type == resource_type)
    if result:
        stmt = stmt.where(AuditLog.result == result)
        count_stmt = count_stmt.where(AuditLog.result == result)

    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (stmt.order_by(AuditLog.ts.desc())
                .offset((page - 1) * page_size)
                .limit(page_size))
    entries = list((await db.execute(stmt)).scalars().all())

    # Enriquecer con emails de user (bulk, un query)
    user_ids = {e.user_id for e in entries if e.user_id}
    email_by_id: dict[int, str] = {}
    if user_ids:
        users = (await db.execute(
            select(Usuario.id, Usuario.email).where(Usuario.id.in_(user_ids))
        )).all()
        email_by_id = {uid: em for uid, em in users}

    items = [
        AuditLogEntry(
            id=e.id, ts=e.ts,
            empresa_id=e.empresa_id, user_id=e.user_id,
            user_email=email_by_id.get(e.user_id) if e.user_id else None,
            action=e.action, resource_type=e.resource_type, resource_id=e.resource_id,
            ip=e.ip, user_agent=e.user_agent, result=e.result,
            details=e.details,
        )
        for e in entries
    ]

    return AuditLogPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/audit-log/actions")
async def list_action_types(
    current_user=Depends(require_role("ADMIN")),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Devuelve las acciones únicas registradas en el audit log de la empresa.

    Útil para poblar un dropdown en la UI.
    """
    result = await db.execute(
        select(AuditLog.action, func.count(AuditLog.id))
        .where(AuditLog.empresa_id == empresa.id)
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
    )
    return [{"action": a, "count": c} for a, c in result.all()]
