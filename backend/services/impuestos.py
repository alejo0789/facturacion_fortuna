"""
Servicio de cálculo de impuestos colombianos.

Reemplaza los hardcodes de 1.19 (IVA) y tarifas fijas de retefuente,
consultando la configuración por empresa (ConfiguracionImpuesto + TarifaImpuesto)
con fallback a valores por defecto del régimen colombiano estándar.
"""
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models_impuestos import ConfiguracionImpuesto, TarifaImpuesto, RetencionProveedor


# Valores por defecto (Régimen colombiano estándar)
DEFAULT_IVA_PCT = Decimal("19.00")
DEFAULT_RETEFUENTE_PCT = Decimal("4.00")
DEFAULT_RETEIVA_PCT = Decimal("15.00")
DEFAULT_RETEICA_PCT = Decimal("0.00")


async def get_tarifa_default(
    empresa_id: int,
    tipo: str,
    db: AsyncSession,
    fallback: Decimal,
) -> Decimal:
    """Obtiene la tarifa default de un tipo de impuesto para la empresa."""
    result = await db.execute(
        select(ConfiguracionImpuesto).where(
            ConfiguracionImpuesto.empresa_id == empresa_id,
            ConfiguracionImpuesto.tipo == tipo,
            ConfiguracionImpuesto.activo == True,  # noqa: E712
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        return fallback

    result = await db.execute(
        select(TarifaImpuesto).where(
            TarifaImpuesto.configuracion_id == config.id,
            TarifaImpuesto.es_default == True,  # noqa: E712
        )
    )
    tarifa = result.scalar_one_or_none()
    return tarifa.tarifa_pct if tarifa else fallback


async def get_iva_rate(empresa_id: int, db: AsyncSession) -> Decimal:
    """Tarifa IVA default de la empresa (19% por defecto)."""
    return await get_tarifa_default(empresa_id, "IVA", db, DEFAULT_IVA_PCT)


async def get_retefuente_rate(
    empresa_id: int,
    proveedor_nit: Optional[str],
    db: AsyncSession,
) -> Decimal:
    """
    Tarifa retefuente.
    Primero revisa override por proveedor (RetencionProveedor),
    luego la tarifa default de la empresa, luego fallback al 4%.
    """
    # Override por proveedor
    if proveedor_nit:
        result = await db.execute(
            select(RetencionProveedor).where(
                RetencionProveedor.empresa_id == empresa_id,
                RetencionProveedor.proveedor_nit == proveedor_nit,
                RetencionProveedor.activa == True,  # noqa: E712
            )
        )
        override = result.scalar_one_or_none()
        if override:
            return override.tarifa_especial_pct

    return await get_tarifa_default(empresa_id, "RETEFUENTE", db, DEFAULT_RETEFUENTE_PCT)


async def get_reteiva_rate(empresa_id: int, db: AsyncSession) -> Decimal:
    """Tarifa ReteIVA configurada por la empresa (15% en Régimen Ordinario)."""
    return await get_tarifa_default(empresa_id, "RETEIVA", db, DEFAULT_RETEIVA_PCT)


async def get_reteica_rate(empresa_id: int, db: AsyncSession) -> Decimal:
    """
    Tarifa ReteICA. Default 0% (no aplica) — el contador la activa por
    municipio cuando la empresa actúa como agente retenedor.
    Se calcula en POR MIL: tarifa_pct=0.414 → 4.14 por mil → 0.414%.
    """
    return await get_tarifa_default(empresa_id, "RETEICA", db, DEFAULT_RETEICA_PCT)


async def calcular_impuestos(
    empresa_id: int,
    valor_total: Decimal,
    tiene_iva: bool,
    aplica_retefuente: bool,
    proveedor_nit: Optional[str],
    db: AsyncSession,
    iva_rate_override: Optional[Decimal] = None,
    retefuente_rate_override: Optional[Decimal] = None,
    aplica_reteiva: bool = False,
    aplica_reteica: bool = False,
    reteiva_rate_override: Optional[Decimal] = None,
    reteica_rate_override: Optional[Decimal] = None,
) -> dict:
    """
    Calcula IVA, retefuente, ReteIVA, ReteICA y valor neto a pagar desde un
    monto bruto. Implementa el Régimen Ordinario colombiano.

    Convención: `valor_total` es el valor BRUTO (con IVA incluido si tiene_iva=True).
      - valor_base    = valor_total / (1 + iva_rate/100) cuando tiene IVA
      - valor_iva     = valor_total - valor_base
      - valor_retefuente = valor_base * retefuente_pct / 100
      - valor_reteiva    = valor_iva  * reteiva_pct    / 100   (sobre el IVA, no la base)
      - valor_reteica    = valor_base * reteica_pct    / 100   (en porcentaje, ej. 0.414%)
      - valor_neto       = valor_total - retefuente - reteiva - reteica
    """
    iva_rate = iva_rate_override if iva_rate_override is not None else await get_iva_rate(empresa_id, db)

    if tiene_iva:
        iva_divisor = Decimal("1") + (iva_rate / Decimal("100"))
        valor_base = (valor_total / iva_divisor).quantize(Decimal("0.01"))
        valor_iva = (valor_total - valor_base).quantize(Decimal("0.01"))
    else:
        valor_base = valor_total
        valor_iva = Decimal("0.00")

    if aplica_retefuente:
        retefuente_pct = (
            retefuente_rate_override
            if retefuente_rate_override is not None
            else await get_retefuente_rate(empresa_id, proveedor_nit, db)
        )
        valor_retefuente = (valor_base * retefuente_pct / Decimal("100")).quantize(Decimal("0.01"))
    else:
        retefuente_pct = Decimal("0.00")
        valor_retefuente = Decimal("0.00")

    # ReteIVA — se calcula sobre el IVA generado, no sobre la base
    if aplica_reteiva and tiene_iva:
        reteiva_pct = (
            reteiva_rate_override
            if reteiva_rate_override is not None
            else await get_reteiva_rate(empresa_id, db)
        )
        valor_reteiva = (valor_iva * reteiva_pct / Decimal("100")).quantize(Decimal("0.01"))
    else:
        reteiva_pct = Decimal("0.00")
        valor_reteiva = Decimal("0.00")

    # ReteICA — se calcula sobre la base, en porcentaje
    if aplica_reteica:
        reteica_pct = (
            reteica_rate_override
            if reteica_rate_override is not None
            else await get_reteica_rate(empresa_id, db)
        )
        valor_reteica = (valor_base * reteica_pct / Decimal("100")).quantize(Decimal("0.01"))
    else:
        reteica_pct = Decimal("0.00")
        valor_reteica = Decimal("0.00")

    valor_neto = (valor_total - valor_retefuente - valor_reteiva - valor_reteica).quantize(Decimal("0.01"))

    return {
        "valor_total": valor_total,
        "valor_base": valor_base,
        "iva_rate": iva_rate,
        "valor_iva": valor_iva,
        "retefuente_pct": retefuente_pct,
        "valor_retefuente": valor_retefuente,
        "reteiva_pct": reteiva_pct,
        "valor_reteiva": valor_reteiva,
        "reteica_pct": reteica_pct,
        "valor_reteica": valor_reteica,
        "valor_neto": valor_neto,
    }
