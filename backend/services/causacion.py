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
CUENTA_RETEIVA_PAGAR = "236701"       # IVA retenido (ReteIVA por pagar)
CUENTA_RETEICA_PAGAR = "236805"       # ICA retenido (ReteICA por pagar)
CUENTA_PROVEEDORES = "220505"         # Nacionales

# Mapeo concepto DIAN → cuenta de gasto sugerida (Decreto 2650).
# Si el caller no pasa cuenta_gasto explícita y sí pasa concepto_dian,
# usamos esta tabla para que el asiento aterrice en la cuenta correcta.
CUENTA_GASTO_POR_CONCEPTO = {
    "5001": "511005",  # Honorarios          → 5110 Honorarios
    "5002": "513505",  # Servicios           → 5135 Servicios
    "5003": "143505",  # Compras (inventario)→ 1435 Mercancías no fabricadas (compra)
    "5004": "512015",  # Arrendamientos      → 5120 Arrendamientos
    "5005": "513540",  # Transporte          → 5135 Servicios — Transporte
    "5006": "513550",  # Comisiones          → 5135 Servicios — Comisiones
    "5007": "421005",  # Rendimientos fin.   → 4210 Financieros (es ingreso financiero)
}


def cuenta_gasto_para_concepto(concepto_dian: Optional[str], default: str = CUENTA_GASTO_DEFAULT) -> str:
    """Devuelve la cuenta PUC de gasto adecuada al concepto DIAN, o el default."""
    if not concepto_dian:
        return default
    # El concepto puede venir como "5001" o "5001 Honorarios" — extraer el código
    codigo = concepto_dian.strip().split()[0]
    return CUENTA_GASTO_POR_CONCEPTO.get(codigo, default)


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
    aplica_reteiva: bool = False,
    aplica_reteica: bool = False,
    cuenta_reteiva: str = CUENTA_RETEIVA_PAGAR,
    cuenta_reteica: str = CUENTA_RETEICA_PAGAR,
    concepto_dian: Optional[str] = None,
    centro_costo: Optional[str] = None,
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

    La construcción del asiento se envuelve en un SAVEPOINT (`begin_nested`):
    si algún flush falla en mitad (p.ej. violación de constraint en una línea)
    se revierte TODO el asiento como unidad atómica, sin dejar cabecera huérfana
    ni afectar cambios previos del caller en la misma sesión.
    """
    # Si no se pasó cuenta_gasto explícita, mapear desde concepto DIAN
    if cuenta_gasto == CUENTA_GASTO_DEFAULT and concepto_dian:
        cuenta_gasto = cuenta_gasto_para_concepto(concepto_dian, default=CUENTA_GASTO_DEFAULT)

    async with db.begin_nested():
        # 1. Periodo contable
        periodo = await _get_or_create_periodo(empresa_id, fecha_factura.year, fecha_factura.month, db)
        if periodo.estado == "CERRADO":
            raise ValueError(
                f"El periodo {periodo.anio}-{periodo.mes:02d} está CERRADO. "
                f"No se pueden registrar asientos."
            )

        # 2. Cálculo de impuestos (incluye ReteIVA, ReteICA y tarifa por concepto DIAN)
        impuestos = await calcular_impuestos(
            empresa_id=empresa_id,
            valor_total=valor_total,
            tiene_iva=tiene_iva,
            aplica_retefuente=aplica_retefuente,
            proveedor_nit=proveedor_nit,
            db=db,
            aplica_reteiva=aplica_reteiva,
            aplica_reteica=aplica_reteica,
            concepto_dian=concepto_dian,
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

        # Helper para no repetir centro_costo + concepto en cada línea
        def _linea(cuenta, debito, credito, detalle, base_imp=None):
            return LineaAsiento(
                asiento_id=asiento.id,
                cuenta_codigo=cuenta,
                nit_tercero=proveedor_nit,
                centro_costo=centro_costo,
                concepto_dian=concepto_dian,
                debito=debito,
                credito=credito,
                base_impuesto=base_imp,
                detalle=detalle,
            )

        # 5. Líneas
        # DÉBITO: Gasto (valor base sin IVA)
        db.add(_linea(cuenta_gasto, impuestos["valor_base"], Decimal("0"), descripcion))

        # DÉBITO: IVA descontable
        if tiene_iva and impuestos["valor_iva"] > 0:
            db.add(_linea(
                cuenta_iva, impuestos["valor_iva"], Decimal("0"),
                f"IVA {impuestos['iva_rate']}% — {descripcion}",
                base_imp=impuestos["valor_base"],
            ))

        # CRÉDITO: Retefuente por pagar
        if aplica_retefuente and impuestos["valor_retefuente"] > 0:
            db.add(_linea(
                cuenta_retefuente, Decimal("0"), impuestos["valor_retefuente"],
                f"Retefuente {impuestos['retefuente_pct']}% — {descripcion}",
                base_imp=impuestos["valor_base"],
            ))

        # CRÉDITO: ReteIVA por pagar (sobre el IVA generado)
        if aplica_reteiva and impuestos["valor_reteiva"] > 0:
            db.add(_linea(
                cuenta_reteiva, Decimal("0"), impuestos["valor_reteiva"],
                f"ReteIVA {impuestos['reteiva_pct']}% sobre IVA — {descripcion}",
                base_imp=impuestos["valor_iva"],
            ))

        # CRÉDITO: ReteICA por pagar (tarifa municipal sobre la base)
        if aplica_reteica and impuestos["valor_reteica"] > 0:
            db.add(_linea(
                cuenta_reteica, Decimal("0"), impuestos["valor_reteica"],
                f"ReteICA {impuestos['reteica_pct']}% — {descripcion}",
                base_imp=impuestos["valor_base"],
            ))

        # CRÉDITO: Proveedores por pagar (valor neto)
        db.add(_linea(cuenta_proveedor, Decimal("0"), impuestos["valor_neto"], descripcion))

        await db.flush()
    return asiento
