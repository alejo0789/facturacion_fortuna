"""
Router de configuración de impuestos por empresa.
Incluye endpoint `/calcular` para simular el cálculo de impuestos.
"""
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.dependencies import get_current_empresa, require_role
from database import get_db
from models_impuestos import ConfiguracionImpuesto, RetencionProveedor, TarifaImpuesto
from schemas_contabilidad import (
    CalcularImpuestosRequest,
    CalcularImpuestosResponse,
    ConfiguracionImpuestoCreate,
    ConfiguracionImpuestoResponse,
    TarifaImpuestoCreate,
    TarifaImpuestoResponse,
)
from services.impuestos import calcular_impuestos


router = APIRouter(prefix="/impuestos", tags=["impuestos"])


VALID_TIPOS = {"IVA", "RETEFUENTE", "RETEIVA", "RETEICA"}


@router.get("/configuraciones", response_model=List[ConfiguracionImpuestoResponse])
async def listar_configuraciones(
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ConfiguracionImpuesto)
        .where(ConfiguracionImpuesto.empresa_id == empresa.id)
        .options(selectinload(ConfiguracionImpuesto.tarifas))
    )
    return result.scalars().all()


@router.post("/configuraciones", response_model=ConfiguracionImpuestoResponse)
async def crear_configuracion(
    data: ConfiguracionImpuestoCreate,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    if data.tipo.upper() not in VALID_TIPOS:
        raise HTTPException(400, f"Tipo inválido. Permitidos: {VALID_TIPOS}")

    result = await db.execute(
        select(ConfiguracionImpuesto).where(
            ConfiguracionImpuesto.empresa_id == empresa.id,
            ConfiguracionImpuesto.tipo == data.tipo.upper(),
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(409, f"Configuración {data.tipo} ya existe")

    config = ConfiguracionImpuesto(
        empresa_id=empresa.id,
        tipo=data.tipo.upper(),
        cuenta_puc=data.cuenta_puc,
        descripcion=data.descripcion,
        activo=True,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    # Cargar tarifas vacías
    result = await db.execute(
        select(ConfiguracionImpuesto)
        .where(ConfiguracionImpuesto.id == config.id)
        .options(selectinload(ConfiguracionImpuesto.tarifas))
    )
    return result.scalar_one()


@router.post("/configuraciones/{config_id}/tarifas", response_model=TarifaImpuestoResponse)
async def agregar_tarifa(
    config_id: int,
    data: TarifaImpuestoCreate,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ConfiguracionImpuesto).where(
            ConfiguracionImpuesto.id == config_id,
            ConfiguracionImpuesto.empresa_id == empresa.id,
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Configuración no encontrada")

    # Si es_default, desmarcar las demás default del mismo config
    if data.es_default:
        result = await db.execute(
            select(TarifaImpuesto).where(
                TarifaImpuesto.configuracion_id == config_id,
                TarifaImpuesto.es_default == True,  # noqa: E712
            )
        )
        for t in result.scalars().all():
            t.es_default = False

    tarifa = TarifaImpuesto(
        configuracion_id=config_id,
        concepto=data.concepto,
        tarifa_pct=data.tarifa_pct,
        base_minima=data.base_minima,
        es_default=data.es_default,
    )
    db.add(tarifa)
    await db.commit()
    await db.refresh(tarifa)
    return tarifa


@router.delete("/configuraciones/{config_id}/tarifas/{tarifa_id}")
async def eliminar_tarifa(
    config_id: int,
    tarifa_id: int,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TarifaImpuesto)
        .join(ConfiguracionImpuesto, ConfiguracionImpuesto.id == TarifaImpuesto.configuracion_id)
        .where(
            TarifaImpuesto.id == tarifa_id,
            TarifaImpuesto.configuracion_id == config_id,
            ConfiguracionImpuesto.empresa_id == empresa.id,
        )
    )
    tarifa = result.scalar_one_or_none()
    if not tarifa:
        raise HTTPException(404, "Tarifa no encontrada")
    await db.delete(tarifa)
    await db.commit()
    return {"message": "Tarifa eliminada"}


@router.post("/calcular", response_model=CalcularImpuestosResponse)
async def calcular(
    data: CalcularImpuestosRequest,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Simula el cálculo de impuestos para un valor bruto dado."""
    resultado = await calcular_impuestos(
        empresa_id=empresa.id,
        valor_total=data.valor_total,
        tiene_iva=data.tiene_iva,
        aplica_retefuente=data.aplica_retefuente,
        proveedor_nit=data.proveedor_nit,
        db=db,
        iva_rate_override=data.iva_rate_override,
        retefuente_rate_override=data.retefuente_rate_override,
    )
    return CalcularImpuestosResponse(**resultado)


# ==========================================================
# Tarifas — listado plano para dropdowns del frontend
# ==========================================================
@router.get("/tarifas")
async def listar_tarifas(
    tipo: str = Query(..., description="IVA | RETEFUENTE | RETEIVA | RETEICA"),
    q: Optional[str] = Query(None, description="Buscar por concepto (case-insensitive)"),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """
    Lista plana de tarifas de un tipo de impuesto, lista para alimentar un
    `<select>` o autocomplete en el frontend. Incluye base mínima en pesos
    pre-calculada.
    """
    stmt = (
        select(TarifaImpuesto, ConfiguracionImpuesto)
        .join(ConfiguracionImpuesto, ConfiguracionImpuesto.id == TarifaImpuesto.configuracion_id)
        .where(
            ConfiguracionImpuesto.empresa_id == empresa.id,
            ConfiguracionImpuesto.tipo == tipo.upper(),
            ConfiguracionImpuesto.activo == True,  # noqa: E712
        )
        .order_by(TarifaImpuesto.concepto)
    )
    if q:
        stmt = stmt.where(TarifaImpuesto.concepto.ilike(f"%{q}%"))
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": t.id,
            "concepto": t.concepto,
            "tarifa_pct": float(t.tarifa_pct),
            "base_minima": float(t.base_minima or 0),
            "es_default": t.es_default,
        }
        for (t, _ci) in rows
    ]


# ==========================================================
# Overrides por proveedor
# ==========================================================
@router.get("/proveedor/{nit}/retenciones")
async def listar_retenciones_proveedor(
    nit: str,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RetencionProveedor).where(
            RetencionProveedor.empresa_id == empresa.id,
            RetencionProveedor.proveedor_nit == nit,
        )
    )
    return [
        {
            "id": r.id,
            "proveedor_nit": r.proveedor_nit,
            "configuracion_impuesto_id": r.configuracion_impuesto_id,
            "tarifa_especial_pct": float(r.tarifa_especial_pct),
            "activa": r.activa,
        }
        for r in result.scalars().all()
    ]


@router.post("/proveedor/{nit}/retenciones")
async def crear_retencion_proveedor(
    nit: str,
    configuracion_impuesto_id: int,
    tarifa_especial_pct: Decimal,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    # Verificar config pertenece a empresa
    result = await db.execute(
        select(ConfiguracionImpuesto).where(
            ConfiguracionImpuesto.id == configuracion_impuesto_id,
            ConfiguracionImpuesto.empresa_id == empresa.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Configuración de impuesto no encontrada")

    retencion = RetencionProveedor(
        empresa_id=empresa.id,
        proveedor_nit=nit,
        configuracion_impuesto_id=configuracion_impuesto_id,
        tarifa_especial_pct=tarifa_especial_pct,
        activa=True,
    )
    db.add(retencion)
    await db.commit()
    await db.refresh(retencion)
    return {
        "id": retencion.id,
        "proveedor_nit": retencion.proveedor_nit,
        "tarifa_especial_pct": float(retencion.tarifa_especial_pct),
    }
