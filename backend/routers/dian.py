"""
Router DIAN — Medios Magnéticos (Fase 4 del implementation_plan).

Expone los formatos exigidos por la Resolución anual de la DIAN:
  - Formato 1001: Pagos o abonos en cuenta y retenciones practicadas
  - Formato 1007: Ingresos recibidos en el año
  - Formato 1008: Cuentas por cobrar al final del año

Todos los endpoints devuelven:
  - JSON (para preview en el frontend)  → ?formato=json (default)
  - CSV plano compatible con el pre-validador de la DIAN → ?formato=csv

La fuente de datos son los asientos APROBADOS del año solicitado:
  - 1001: líneas de CUENTAS CRÉDITO 220505 (proveedores) agrupadas por NIT +
          retenciones practicadas (236540 retefuente, 236701 reteIVA,
          236805 reteICA) sobre la misma base.
  - 1007: líneas de CUENTAS CRÉDITO 41xx (ingresos) agrupadas por NIT.
  - 1008: saldos finales de la cuenta 1305 (clientes) al 31/12 por NIT.
"""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_empresa, require_role
from database import get_db
from models_contabilidad import (
    AsientoContable,
    CuentaPUC,
    LineaAsiento,
    PeriodoContable,
)

router = APIRouter(prefix="/dian", tags=["dian"])


# ==========================================================
# Schemas
# ==========================================================
class Formato1001Fila(BaseModel):
    tipo_documento: str = "31"  # 31 = NIT
    numero_identificacion: str
    nombre_tercero: Optional[str] = None
    concepto: str  # 5001 = compras de bienes
    valor_pago: Decimal
    iva_descontable: Decimal = Decimal("0")
    retefuente_practicada: Decimal = Decimal("0")
    reteiva_practicada: Decimal = Decimal("0")
    reteica_practicada: Decimal = Decimal("0")


class Formato1001Response(BaseModel):
    anio: int
    empresa_id: int
    empresa_nit: Optional[str] = None
    total_registros: int
    total_pagos: Decimal
    total_iva: Decimal
    total_retefuente: Decimal
    total_reteiva: Decimal
    total_reteica: Decimal
    filas: List[Formato1001Fila]


class Formato1007Fila(BaseModel):
    tipo_documento: str = "31"
    numero_identificacion: str
    nombre_tercero: Optional[str] = None
    concepto: str = "4001"
    valor_ingreso: Decimal
    valor_iva_generado: Decimal = Decimal("0")


class Formato1007Response(BaseModel):
    anio: int
    empresa_id: int
    total_registros: int
    total_ingresos: Decimal
    total_iva: Decimal
    filas: List[Formato1007Fila]


class Formato1008Fila(BaseModel):
    tipo_documento: str = "31"
    numero_identificacion: str
    saldo: Decimal


class Formato1008Response(BaseModel):
    anio: int
    empresa_id: int
    total_registros: int
    total_cuentas_cobrar: Decimal
    filas: List[Formato1008Fila]


# ==========================================================
# Cuentas PUC estándar usadas como filtro
# ==========================================================
CUENTA_PROVEEDORES = "220505"
CUENTA_IVA_DESCONTABLE = "240810"
CUENTA_RETEFUENTE = "236540"
CUENTA_RETEIVA = "236701"
CUENTA_RETEICA = "236805"
CUENTA_CLIENTES = "130505"


async def _lineas_aprobadas_del_anio(empresa_id: int, anio: int, db: AsyncSession):
    """Trae líneas de asientos APROBADOS del año solicitado."""
    stmt = (
        select(LineaAsiento, AsientoContable)
        .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
        .join(PeriodoContable, PeriodoContable.id == AsientoContable.periodo_id)
        .where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.estado == "APROBADO",
            PeriodoContable.anio == anio,
        )
    )
    return (await db.execute(stmt)).all()


async def _build_1001(empresa_id: int, empresa_nit: Optional[str], anio: int, db: AsyncSession) -> Formato1001Response:
    filas_raw = await _lineas_aprobadas_del_anio(empresa_id, anio, db)

    # Agregar por NIT del tercero
    agregado: dict[str, dict] = {}

    for linea, asiento in filas_raw:
        nit = (linea.nit_tercero or "").strip()
        if not nit:
            continue
        # sólo consideramos cuentas relevantes del 1001
        codigo = linea.cuenta_codigo
        if codigo not in {
            CUENTA_PROVEEDORES, CUENTA_IVA_DESCONTABLE,
            CUENTA_RETEFUENTE, CUENTA_RETEIVA, CUENTA_RETEICA,
        }:
            continue

        agg = agregado.setdefault(nit, {
            "valor_pago": Decimal("0"),
            "iva_descontable": Decimal("0"),
            "retefuente": Decimal("0"),
            "reteiva": Decimal("0"),
            "reteica": Decimal("0"),
        })

        if codigo == CUENTA_PROVEEDORES:
            # La causación genera CR proveedor por el NETO. Sumamos el CR.
            agg["valor_pago"] += (linea.credito or Decimal("0"))
        elif codigo == CUENTA_IVA_DESCONTABLE:
            agg["iva_descontable"] += (linea.debito or Decimal("0"))
        elif codigo == CUENTA_RETEFUENTE:
            agg["retefuente"] += (linea.credito or Decimal("0"))
        elif codigo == CUENTA_RETEIVA:
            agg["reteiva"] += (linea.credito or Decimal("0"))
        elif codigo == CUENTA_RETEICA:
            agg["reteica"] += (linea.credito or Decimal("0"))

    filas: List[Formato1001Fila] = []
    for nit, a in agregado.items():
        if a["valor_pago"] == 0 and a["retefuente"] == 0:
            continue
        filas.append(Formato1001Fila(
            numero_identificacion=nit,
            concepto="5001",
            valor_pago=a["valor_pago"],
            iva_descontable=a["iva_descontable"],
            retefuente_practicada=a["retefuente"],
            reteiva_practicada=a["reteiva"],
            reteica_practicada=a["reteica"],
        ))
    filas.sort(key=lambda f: f.valor_pago, reverse=True)

    total_pagos = sum((f.valor_pago for f in filas), Decimal("0"))
    total_iva = sum((f.iva_descontable for f in filas), Decimal("0"))
    total_retefuente = sum((f.retefuente_practicada for f in filas), Decimal("0"))
    total_reteiva = sum((f.reteiva_practicada for f in filas), Decimal("0"))
    total_reteica = sum((f.reteica_practicada for f in filas), Decimal("0"))

    return Formato1001Response(
        anio=anio,
        empresa_id=empresa_id,
        empresa_nit=empresa_nit,
        total_registros=len(filas),
        total_pagos=total_pagos,
        total_iva=total_iva,
        total_retefuente=total_retefuente,
        total_reteiva=total_reteiva,
        total_reteica=total_reteica,
        filas=filas,
    )


def _to_csv_1001(res: Formato1001Response) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=",")
    w.writerow([
        "tipo_documento", "numero_identificacion", "concepto",
        "valor_pago", "iva_descontable", "retefuente", "reteiva", "reteica",
    ])
    for f in res.filas:
        w.writerow([
            f.tipo_documento, f.numero_identificacion, f.concepto,
            f.valor_pago, f.iva_descontable,
            f.retefuente_practicada, f.reteiva_practicada, f.reteica_practicada,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=formato_1001_{res.anio}.csv"},
    )


@router.get("/medios-magneticos/1001")
async def formato_1001(
    anio: int = Query(..., ge=2000, le=2100),
    formato: str = Query("json", pattern="^(json|csv)$"),
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "AUDITOR")),
    db: AsyncSession = Depends(get_db),
):
    """Formato 1001 DIAN: pagos/retenciones por tercero, agrupados por NIT."""
    res = await _build_1001(empresa.id, getattr(empresa, "nit", None), anio, db)
    if formato == "csv":
        return _to_csv_1001(res)
    return res


async def _build_1007(empresa_id: int, anio: int, db: AsyncSession) -> Formato1007Response:
    filas_raw = await _lineas_aprobadas_del_anio(empresa_id, anio, db)

    # Cuentas de ingreso: clase 4
    agregado: dict[str, dict] = {}
    for linea, asiento in filas_raw:
        if not linea.cuenta_codigo.startswith("4"):
            continue
        nit = (linea.nit_tercero or "").strip()
        if not nit:
            continue
        a = agregado.setdefault(nit, {"ingreso": Decimal("0"), "iva": Decimal("0")})
        a["ingreso"] += (linea.credito or Decimal("0"))

    # IVA generado (clase 2408 crédito)
    for linea, asiento in filas_raw:
        if not linea.cuenta_codigo.startswith("2408"):
            continue
        nit = (linea.nit_tercero or "").strip()
        if not nit:
            continue
        a = agregado.setdefault(nit, {"ingreso": Decimal("0"), "iva": Decimal("0")})
        a["iva"] += (linea.credito or Decimal("0"))

    filas = [
        Formato1007Fila(
            numero_identificacion=nit,
            valor_ingreso=a["ingreso"],
            valor_iva_generado=a["iva"],
        )
        for nit, a in agregado.items()
        if a["ingreso"] > 0
    ]
    filas.sort(key=lambda f: f.valor_ingreso, reverse=True)

    return Formato1007Response(
        anio=anio,
        empresa_id=empresa_id,
        total_registros=len(filas),
        total_ingresos=sum((f.valor_ingreso for f in filas), Decimal("0")),
        total_iva=sum((f.valor_iva_generado for f in filas), Decimal("0")),
        filas=filas,
    )


def _to_csv_1007(res: Formato1007Response) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["tipo_documento", "numero_identificacion", "concepto", "valor_ingreso", "iva_generado"])
    for f in res.filas:
        w.writerow([f.tipo_documento, f.numero_identificacion, f.concepto, f.valor_ingreso, f.valor_iva_generado])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=formato_1007_{res.anio}.csv"},
    )


@router.get("/medios-magneticos/1007")
async def formato_1007(
    anio: int = Query(..., ge=2000, le=2100),
    formato: str = Query("json", pattern="^(json|csv)$"),
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "AUDITOR")),
    db: AsyncSession = Depends(get_db),
):
    """Ingresos recibidos en el año, agrupados por NIT (clase 4)."""
    res = await _build_1007(empresa.id, anio, db)
    if formato == "csv":
        return _to_csv_1007(res)
    return res


async def _build_1008(empresa_id: int, anio: int, db: AsyncSession) -> Formato1008Response:
    stmt = (
        select(
            LineaAsiento.nit_tercero,
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.debito), 0).label("db"),
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.credito), 0).label("cr"),
        )
        .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
        .join(PeriodoContable, PeriodoContable.id == AsientoContable.periodo_id)
        .where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.estado == "APROBADO",
            PeriodoContable.anio <= anio,
            LineaAsiento.cuenta_codigo.like("1305%"),
            LineaAsiento.nit_tercero.isnot(None),
        )
        .group_by(LineaAsiento.nit_tercero)
    )
    rows = (await db.execute(stmt)).all()

    filas = []
    for nit, db_total, cr_total in rows:
        saldo = Decimal(db_total) - Decimal(cr_total)
        if saldo <= 0:
            continue
        filas.append(Formato1008Fila(numero_identificacion=nit, saldo=saldo))
    filas.sort(key=lambda f: f.saldo, reverse=True)

    return Formato1008Response(
        anio=anio,
        empresa_id=empresa_id,
        total_registros=len(filas),
        total_cuentas_cobrar=sum((f.saldo for f in filas), Decimal("0")),
        filas=filas,
    )


def _to_csv_1008(res: Formato1008Response) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["tipo_documento", "numero_identificacion", "saldo"])
    for f in res.filas:
        w.writerow([f.tipo_documento, f.numero_identificacion, f.saldo])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=formato_1008_{res.anio}.csv"},
    )


@router.get("/medios-magneticos/1008")
async def formato_1008(
    anio: int = Query(..., ge=2000, le=2100),
    formato: str = Query("json", pattern="^(json|csv)$"),
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "AUDITOR")),
    db: AsyncSession = Depends(get_db),
):
    """Cuentas por cobrar al cierre del año (cuenta 1305), por NIT."""
    res = await _build_1008(empresa.id, anio, db)
    if formato == "csv":
        return _to_csv_1008(res)
    return res


# ==========================================================
# Resumen DIAN (todos los formatos de un vistazo)
# ==========================================================
class ResumenDIANResponse(BaseModel):
    anio: int
    empresa_id: int
    f1001_registros: int
    f1001_total_pagos: Decimal
    f1007_registros: int
    f1007_total_ingresos: Decimal
    f1008_registros: int
    f1008_total_cxc: Decimal


@router.get("/medios-magneticos/resumen", response_model=ResumenDIANResponse)
async def resumen_dian(
    anio: int = Query(..., ge=2000, le=2100),
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "AUDITOR")),
    db: AsyncSession = Depends(get_db),
):
    """Devuelve los totales de cada formato para un dashboard rápido."""
    f1001 = await _build_1001(empresa.id, getattr(empresa, "nit", None), anio, db)
    f1007 = await _build_1007(empresa.id, anio, db)
    f1008 = await _build_1008(empresa.id, anio, db)

    return ResumenDIANResponse(
        anio=anio,
        empresa_id=empresa.id,
        f1001_registros=f1001.total_registros,
        f1001_total_pagos=f1001.total_pagos,
        f1007_registros=f1007.total_registros,
        f1007_total_ingresos=f1007.total_ingresos,
        f1008_registros=f1008.total_registros,
        f1008_total_cxc=f1008.total_cuentas_cobrar,
    )
