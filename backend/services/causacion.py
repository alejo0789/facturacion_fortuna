"""
Servicio de causación contable.

Genera automáticamente asientos contables tipo CAUSACION a partir de
facturas de proveedor, usando las cuentas PUC estándar colombianas:

  - 5135 / 511005  → Gasto principal (DÉBITO)
  - 240820         → IVA descontable (DÉBITO)
  - 236540         → Retefuente por pagar (CRÉDITO)
  - 2205           → Proveedores por pagar (CRÉDITO)

Estas cuentas son configurables por empresa vía ConfiguracionImpuesto.cuenta_puc.
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models_contabilidad import AsientoContable, LineaAsiento, PeriodoContable
from services.impuestos import calcular_impuestos


# Cuentas PUC default (Decreto 2649/2650 Colombia)
CUENTA_GASTO_DEFAULT = "511005"       # Honorarios
CUENTA_IVA_DESCONTABLE = "240810"     # IVA descontable
CUENTA_RETEFUENTE_PAGAR = "236540"    # Retefuente por pagar
CUENTA_PROVEEDORES = "220505"         # Nacionales


async def _get_or_create_periodo(
    empresa_id: int,
    anio: int,
    mes: int,
    db: AsyncSession,
) -> PeriodoContable:
    """Obtiene el periodo; si no existe lo crea ABIERTO."""
    result = await db.execute(
        select(PeriodoContable).where(
            PeriodoContable.empresa_id == empresa_id,
            PeriodoContable.anio == anio,
            PeriodoContable.mes == mes,
        )
    )
    periodo = result.scalar_one_or_none()
    if periodo:
        return periodo

    periodo = PeriodoContable(
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
        estado="ABIERTO",
    )
    db.add(periodo)
    await db.flush()
    return periodo


async def _next_numero_asiento(
    empresa_id: int,
    periodo_id: int,
    db: AsyncSession,
) -> int:
    """Siguiente número secuencial de asiento en el periodo."""
    result = await db.execute(
        select(sqlfunc.max(AsientoContable.numero)).where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.periodo_id == periodo_id,
        )
    )
    max_num = result.scalar() or 0
    return max_num + 1


async def crear_asiento_causacion_factura(
    empresa_id: int,
    factura_id: int,
    fecha_factura: date,
    proveedor_nit: str,
    valor_total: Decimal,
    tiene_iva: bool,
    aplica_retefuente: bool,
    descripcion: str,
    user_id: Optional[int],
    db: AsyncSession,
    cuenta_gasto: str = CUENTA_GASTO_DEFAULT,
    cuenta_iva: str = CUENTA_IVA_DESCONTABLE,
    cuenta_retefuente: str = CUENTA_RETEFUENTE_PAGAR,
    cuenta_proveedor: str = CUENTA_PROVEEDORES,
) -> AsientoContable:
    """
    Crea un asiento CAUSACION para la factura.

    Lógica contable (Colombia):
      DÉBITO   Gasto (valor_base)
      DÉBITO   IVA descontable (valor_iva)                         [si aplica]
      CRÉDITO  Retefuente por pagar (valor_retefuente)             [si aplica]
      CRÉDITO  Proveedores por pagar (valor_neto)

    Retorna el asiento creado (ya en db.flush() — no hace commit).
    El caller es responsable del commit/rollback.
    """
    # 1. Periodo contable
    periodo = await _get_or_create_periodo(empresa_id, fecha_factura.year, fecha_factura.month, db)
    if periodo.estado == "CERRADO":
        raise ValueError(
            f"El periodo {periodo.anio}-{periodo.mes:02d} está CERRADO. "
            f"No se pueden registrar asientos."
        )

    # 2. Cálculo de impuestos
    impuestos = await calcular_impuestos(
        empresa_id=empresa_id,
        valor_total=valor_total,
        tiene_iva=tiene_iva,
        aplica_retefuente=aplica_retefuente,
        proveedor_nit=proveedor_nit,
        db=db,
    )

    # 3. Siguiente número
    numero = await _next_numero_asiento(empresa_id, periodo.id, db)

    # 4. Crear asiento
    asiento = AsientoContable(
        empresa_id=empresa_id,
        periodo_id=periodo.id,
        numero=numero,
        fecha=fecha_factura,
        descripcion=descripcion,
        tipo="CAUSACION",
        estado="BORRADOR",
        factura_id=factura_id,
        created_by=user_id,
    )
    db.add(asiento)
    await db.flush()

    # 5. Líneas
    # DÉBITO: Gasto (valor base sin IVA)
    db.add(LineaAsiento(
        asiento_id=asiento.id,
        cuenta_codigo=cuenta_gasto,
        nit_tercero=proveedor_nit,
        debito=impuestos["valor_base"],
        credito=Decimal("0"),
        detalle=descripcion,
    ))

    # DÉBITO: IVA descontable
    if tiene_iva and impuestos["valor_iva"] > 0:
        db.add(LineaAsiento(
            asiento_id=asiento.id,
            cuenta_codigo=cuenta_iva,
            nit_tercero=proveedor_nit,
            debito=impuestos["valor_iva"],
            credito=Decimal("0"),
            base_impuesto=impuestos["valor_base"],
            detalle=f"IVA {impuestos['iva_rate']}% — {descripcion}",
        ))

    # CRÉDITO: Retefuente por pagar
    if aplica_retefuente and impuestos["valor_retefuente"] > 0:
        db.add(LineaAsiento(
            asiento_id=asiento.id,
            cuenta_codigo=cuenta_retefuente,
            nit_tercero=proveedor_nit,
            debito=Decimal("0"),
            credito=impuestos["valor_retefuente"],
            base_impuesto=impuestos["valor_base"],
            detalle=f"Retefuente {impuestos['retefuente_pct']}% — {descripcion}",
        ))

    # CRÉDITO: Proveedores por pagar (valor neto)
    db.add(LineaAsiento(
        asiento_id=asiento.id,
        cuenta_codigo=cuenta_proveedor,
        nit_tercero=proveedor_nit,
        debito=Decimal("0"),
        credito=impuestos["valor_neto"],
        detalle=descripcion,
    ))

    await db.flush()
    return asiento
