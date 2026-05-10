"""
Router de reportes contables formales.

Expone:
  GET /reportes/balance-general?fecha=&centro_costo=&formato=json|csv|pdf
  GET /reportes/estado-resultados?desde=&hasta=&centro_costo=&formato=json|csv|pdf
  GET /reportes/retenciones?anio=&formato=json|csv|pdf

Permisos: ADMIN, CONTADOR, AUDITOR (lectura), CONTABILIDAD.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_empresa, require_role
from database import get_db
from services.reportes_contables import (
    balance_general_data, balance_general_csv, balance_general_pdf,
    estado_resultados_data, estado_resultados_csv, estado_resultados_pdf,
    retenciones_data, retenciones_csv, retenciones_pdf,
)


router = APIRouter(prefix="/reportes-contables", tags=["reportes-contables"])


def _csv_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/balance-general")
async def balance_general(
    fecha: date = Query(..., description="Fecha de corte (YYYY-MM-DD)"),
    centro_costo: Optional[str] = Query(None, description="Filtrar por centro de costo (cod_oficina)"),
    formato: str = Query("json", regex="^(json|csv|pdf)$"),
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "AUDITOR", "CONTABILIDAD", "SOLO_LECTURA")),
    db: AsyncSession = Depends(get_db),
):
    data = await balance_general_data(
        empresa_id=empresa.id, fecha_corte=fecha, centro_costo=centro_costo, db=db,
    )
    if formato == "csv":
        return _csv_response(balance_general_csv(data), f"balance_general_{fecha}.csv")
    if formato == "pdf":
        return _pdf_response(balance_general_pdf(data), f"balance_general_{fecha}.pdf")
    return data


@router.get("/estado-resultados")
async def estado_resultados(
    desde: date = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    hasta: date = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    centro_costo: Optional[str] = Query(None),
    formato: str = Query("json", regex="^(json|csv|pdf)$"),
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "AUDITOR", "CONTABILIDAD", "SOLO_LECTURA")),
    db: AsyncSession = Depends(get_db),
):
    if hasta < desde:
        raise HTTPException(400, "fecha_hasta no puede ser anterior a fecha_desde")
    data = await estado_resultados_data(
        empresa_id=empresa.id,
        fecha_desde=desde, fecha_hasta=hasta,
        centro_costo=centro_costo, db=db,
    )
    if formato == "csv":
        return _csv_response(estado_resultados_csv(data), f"estado_resultados_{desde}_{hasta}.csv")
    if formato == "pdf":
        return _pdf_response(estado_resultados_pdf(data), f"estado_resultados_{desde}_{hasta}.pdf")
    return data


@router.get("/retenciones")
async def retenciones(
    anio: int = Query(..., ge=2000, le=2100),
    formato: str = Query("json", regex="^(json|csv|pdf)$"),
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "AUDITOR", "CONTABILIDAD", "SOLO_LECTURA")),
    db: AsyncSession = Depends(get_db),
):
    data = await retenciones_data(empresa_id=empresa.id, anio=anio, db=db)
    if formato == "csv":
        return _csv_response(retenciones_csv(data), f"retenciones_{anio}.csv")
    if formato == "pdf":
        return _pdf_response(retenciones_pdf(data), f"retenciones_{anio}.pdf")
    return data
