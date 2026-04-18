"""
Seed inicial de contabilidad para una empresa recién creada.

Expone `seed_empresa_default(empresa_id, db)` que:
  - Clona el PUC colombiano base (Decreto 2650) — idempotente.
  - Crea configuraciones de impuesto por defecto (IVA, RETEFUENTE, RETEIVA, RETEICA)
    con sus tarifas típicas del régimen colombiano.

Idempotente: si el PUC o la configuración ya existen, no los duplica.
El caller es responsable del commit/rollback.
"""
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models_impuestos import ConfiguracionImpuesto, TarifaImpuesto
from populate_puc import clonar_puc


# ---------------------------------------------------------------------------
# Catálogo de configuraciones de impuesto por defecto
# ---------------------------------------------------------------------------
# Formato por tipo:
#   cuenta_puc: cuenta contable asociada
#   descripcion: texto visible en UI
#   tarifas: lista de (concepto, tarifa_pct, base_minima, es_default)
DEFAULT_CONFIGS: list[dict[str, Any]] = [
    {
        "tipo": "IVA",
        "cuenta_puc": "240810",  # IVA descontable
        "descripcion": "Impuesto al Valor Agregado",
        "tarifas": [
            ("General", Decimal("19.00"), Decimal("0"), True),
            ("Reducida", Decimal("5.00"), Decimal("0"), False),
            ("Exenta", Decimal("0.00"), Decimal("0"), False),
        ],
    },
    {
        "tipo": "RETEFUENTE",
        "cuenta_puc": "236540",  # Retención en la fuente por compras
        "descripcion": "Retención en la Fuente",
        "tarifas": [
            # Régimen colombiano — tarifas frecuentes por concepto.
            # Bases mínimas expresadas en pesos colombianos (aproximadas, UVT 2024).
            ("Compras generales", Decimal("2.50"), Decimal("1422000"), False),
            ("Servicios generales", Decimal("4.00"), Decimal("178000"), True),
            ("Honorarios", Decimal("11.00"), Decimal("0"), False),
            ("Servicios técnicos", Decimal("6.00"), Decimal("178000"), False),
            ("Arrendamiento bienes inmuebles", Decimal("3.50"), Decimal("1422000"), False),
            ("Transporte de carga", Decimal("1.00"), Decimal("178000"), False),
        ],
    },
    {
        "tipo": "RETEIVA",
        "cuenta_puc": "236701",  # ReteIVA por pagar
        "descripcion": "Retención de IVA",
        "tarifas": [
            ("General", Decimal("15.00"), Decimal("0"), True),
        ],
    },
    {
        "tipo": "RETEICA",
        "cuenta_puc": "236805",  # ReteICA por pagar
        "descripcion": "Retención de Industria y Comercio",
        "tarifas": [
            # Tarifa base — las tarifas de ICA varían por municipio y actividad;
            # esta se deja en 0 para que cada empresa la ajuste a su municipio.
            ("Por defecto", Decimal("0.00"), Decimal("0"), True),
        ],
    },
]


async def _seed_configuraciones_impuesto(
    empresa_id: int,
    db: AsyncSession,
) -> tuple[int, int]:
    """
    Crea las configuraciones de impuesto default si no existen.
    Retorna (configs_creadas, tarifas_creadas).
    """
    # Cargar tipos ya configurados para la empresa
    result = await db.execute(
        select(ConfiguracionImpuesto.tipo).where(
            ConfiguracionImpuesto.empresa_id == empresa_id
        )
    )
    tipos_existentes = {row[0] for row in result.all()}

    configs_creadas = 0
    tarifas_creadas = 0

    for cfg in DEFAULT_CONFIGS:
        if cfg["tipo"] in tipos_existentes:
            continue

        config = ConfiguracionImpuesto(
            empresa_id=empresa_id,
            tipo=cfg["tipo"],
            cuenta_puc=cfg["cuenta_puc"],
            descripcion=cfg["descripcion"],
            activo=True,
        )
        db.add(config)
        await db.flush()  # necesitamos config.id
        configs_creadas += 1

        for concepto, tarifa_pct, base_minima, es_default in cfg["tarifas"]:
            db.add(TarifaImpuesto(
                configuracion_id=config.id,
                concepto=concepto,
                tarifa_pct=tarifa_pct,
                base_minima=base_minima,
                es_default=es_default,
            ))
            tarifas_creadas += 1

    await db.flush()
    return configs_creadas, tarifas_creadas


async def seed_empresa_default(
    empresa_id: int,
    db: AsyncSession,
) -> dict[str, int]:
    """
    Siembra PUC + configuraciones de impuesto default para la empresa.

    Idempotente. No hace commit — el caller decide.

    Retorna:
        {
            "puc_cuentas_insertadas": int,
            "impuestos_configs_creadas": int,
            "impuestos_tarifas_creadas": int,
        }
    """
    puc_insertadas = await clonar_puc(empresa_id, db)
    configs_creadas, tarifas_creadas = await _seed_configuraciones_impuesto(empresa_id, db)

    return {
        "puc_cuentas_insertadas": puc_insertadas,
        "impuestos_configs_creadas": configs_creadas,
        "impuestos_tarifas_creadas": tarifas_creadas,
    }
