"""
Servicio de causación contable de FACTURA DE VENTA y NOTA CRÉDITO.

Complementa `services/causacion.py` (que cubre facturas de COMPRA / proveedor).

Lógica contable colombiana (Decreto 2649/2650):

  Venta normal:
      DÉBITO   Clientes (1305)               valor_total (lo que debe el cliente)
      CRÉDITO  Ingreso operacional (4xxx)    valor_base (lo que ganamos)
      CRÉDITO  IVA generado (240805)         valor_iva   (lo que le debemos a la DIAN)

  Nota crédito de venta (reverso, total o parcial):
      DÉBITO   Ingreso operacional           valor_base    (anulamos ingreso)
      DÉBITO   IVA generado                  valor_iva     (devolvemos IVA)
      CRÉDITO  Clientes                      valor_total   (le restamos lo que nos debía)

  Nota crédito de compra (devolución a proveedor):
      DÉBITO   Proveedores                   valor_total   (ya no le debemos)
      CRÉDITO  Gasto / Inventario            valor_base    (revertimos gasto)
      CRÉDITO  IVA descontable               valor_iva     (perdemos el descontable)
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models_contabilidad import AsientoContable, LineaAsiento, PeriodoContable
from services.impuestos import calcular_impuestos
from services.causacion import (
    _get_or_create_periodo,
    _next_numero_asiento,
    cuenta_gasto_para_concepto,
    CUENTA_GASTO_DEFAULT,
    CUENTA_IVA_DESCONTABLE,
    CUENTA_PROVEEDORES,
)


# Cuentas PUC default — venta
CUENTA_CLIENTES_DEFAULT = "130505"     # Clientes nacionales
CUENTA_INGRESO_DEFAULT = "413505"      # Ingresos operacionales — Comercio al por mayor
CUENTA_IVA_GENERADO = "240805"         # IVA generado por pagar


# Mapeo concepto DIAN → cuenta de ingreso (para Formato 1007)
CUENTA_INGRESO_POR_CONCEPTO = {
    "5101": "413505",  # Ingresos operacionales
    "5102": "421005",  # Rendimientos financieros
    "5103": "425035",  # Diversos — comisiones
}


def cuenta_ingreso_para_concepto(
    concepto_dian: Optional[str],
    default: str = CUENTA_INGRESO_DEFAULT,
) -> str:
    if not concepto_dian:
        return default
    codigo = concepto_dian.strip().split()[0]
    return CUENTA_INGRESO_POR_CONCEPTO.get(codigo, default)


# =========================================================================
# Causación de FACTURA DE VENTA
# =========================================================================
async def crear_asiento_causacion_venta(
    *,
    empresa_id: int,
    fecha_factura: date,
    cliente_nit: str,
    valor_total: Decimal,
    tiene_iva: bool,
    descripcion: str,
    user_id: Optional[int],
    db: AsyncSession,
    cuenta_cliente: str = CUENTA_CLIENTES_DEFAULT,
    cuenta_ingreso: Optional[str] = None,
    cuenta_iva: str = CUENTA_IVA_GENERADO,
    concepto_dian: Optional[str] = None,
    centro_costo: Optional[str] = None,
    factura_id: Optional[int] = None,
) -> AsientoContable:
    """
    Crea un asiento CAUSACION-VENTA por la emisión de una factura de venta.
    El cliente queda como CxC (clientes), separamos IVA generado.
    """
    if valor_total is None or Decimal(valor_total) <= 0:
        raise ValueError("El valor total debe ser mayor a cero")

    if cuenta_ingreso is None:
        cuenta_ingreso = cuenta_ingreso_para_concepto(concepto_dian)

    async with db.begin_nested():
        periodo = await _get_or_create_periodo(empresa_id, fecha_factura.year, fecha_factura.month, db)
        if periodo.estado == "CERRADO":
            raise ValueError(f"Periodo {periodo.anio}-{periodo.mes:02d} CERRADO")

        # En venta no hay retefuente que practiquemos nosotros (la practica el comprador
        # si es agente retenedor) — solo separamos base e IVA. Lo más limpio.
        impuestos = await calcular_impuestos(
            empresa_id=empresa_id,
            valor_total=valor_total,
            tiene_iva=tiene_iva,
            aplica_retefuente=False,
            proveedor_nit=cliente_nit,
            db=db,
            concepto_dian=concepto_dian,
        )

        numero = await _next_numero_asiento(empresa_id, periodo.id, db)
        asiento = AsientoContable(
            empresa_id=empresa_id,
            periodo_id=periodo.id,
            numero=numero,
            fecha=fecha_factura,
            descripcion=descripcion,
            tipo="VENTA",
            estado="BORRADOR",
            factura_id=factura_id,
            created_by=user_id,
        )
        db.add(asiento)
        await db.flush()

        def _l(cuenta, debito, credito, detalle, base=None):
            return LineaAsiento(
                asiento_id=asiento.id,
                cuenta_codigo=cuenta,
                nit_tercero=cliente_nit,
                centro_costo=centro_costo,
                concepto_dian=concepto_dian,
                debito=debito,
                credito=credito,
                base_impuesto=base,
                detalle=detalle,
            )

        # DÉBITO: Clientes (CxC) por el bruto
        db.add(_l(cuenta_cliente, valor_total, Decimal("0"), descripcion))

        # CRÉDITO: Ingreso por la base
        db.add(_l(cuenta_ingreso, Decimal("0"), impuestos["valor_base"], descripcion))

        # CRÉDITO: IVA generado
        if tiene_iva and impuestos["valor_iva"] > 0:
            db.add(_l(
                cuenta_iva, Decimal("0"), impuestos["valor_iva"],
                f"IVA {impuestos['iva_rate']}% generado — {descripcion}",
                base=impuestos["valor_base"],
            ))

        await db.flush()
    return asiento


# =========================================================================
# Nota crédito de VENTA (reverso del asiento de venta)
# =========================================================================
async def crear_asiento_nota_credito_venta(
    *,
    empresa_id: int,
    fecha: date,
    cliente_nit: str,
    valor_total: Decimal,
    tiene_iva: bool,
    descripcion: str,
    user_id: Optional[int],
    db: AsyncSession,
    cuenta_cliente: str = CUENTA_CLIENTES_DEFAULT,
    cuenta_ingreso: Optional[str] = None,
    cuenta_iva: str = CUENTA_IVA_GENERADO,
    concepto_dian: Optional[str] = None,
    centro_costo: Optional[str] = None,
    factura_id: Optional[int] = None,
) -> AsientoContable:
    """
    Reversa total o parcialmente una venta. Movimientos invertidos respecto a
    crear_asiento_causacion_venta (DR ingreso/IVA, CR clientes).

    Útil para: devolución de cliente, anulación de factura, descuento posventa.
    """
    if valor_total is None or Decimal(valor_total) <= 0:
        raise ValueError("El valor de la nota crédito debe ser mayor a cero")

    if cuenta_ingreso is None:
        cuenta_ingreso = cuenta_ingreso_para_concepto(concepto_dian)

    async with db.begin_nested():
        periodo = await _get_or_create_periodo(empresa_id, fecha.year, fecha.month, db)
        if periodo.estado == "CERRADO":
            raise ValueError(f"Periodo {periodo.anio}-{periodo.mes:02d} CERRADO")

        impuestos = await calcular_impuestos(
            empresa_id=empresa_id,
            valor_total=valor_total,
            tiene_iva=tiene_iva,
            aplica_retefuente=False,
            proveedor_nit=cliente_nit,
            db=db,
            concepto_dian=concepto_dian,
        )

        numero = await _next_numero_asiento(empresa_id, periodo.id, db)
        asiento = AsientoContable(
            empresa_id=empresa_id,
            periodo_id=periodo.id,
            numero=numero,
            fecha=fecha,
            descripcion=descripcion,
            tipo="NOTA_CREDITO_VENTA",
            estado="BORRADOR",
            factura_id=factura_id,
            created_by=user_id,
        )
        db.add(asiento)
        await db.flush()

        def _l(cuenta, debito, credito, detalle, base=None):
            return LineaAsiento(
                asiento_id=asiento.id,
                cuenta_codigo=cuenta,
                nit_tercero=cliente_nit,
                centro_costo=centro_costo,
                concepto_dian=concepto_dian,
                debito=debito,
                credito=credito,
                base_impuesto=base,
                detalle=detalle,
            )

        # DÉBITO: Ingreso (anula)
        db.add(_l(cuenta_ingreso, impuestos["valor_base"], Decimal("0"), f"NC {descripcion}"))

        # DÉBITO: IVA generado (devuelve IVA)
        if tiene_iva and impuestos["valor_iva"] > 0:
            db.add(_l(
                cuenta_iva, impuestos["valor_iva"], Decimal("0"),
                f"NC IVA {impuestos['iva_rate']}% — {descripcion}",
                base=impuestos["valor_base"],
            ))

        # CRÉDITO: Clientes (la cuenta por cobrar baja)
        db.add(_l(cuenta_cliente, Decimal("0"), valor_total, f"NC {descripcion}"))

        await db.flush()
    return asiento


# =========================================================================
# Nota crédito de COMPRA (devolución a proveedor)
# =========================================================================
async def crear_asiento_nota_credito_compra(
    *,
    empresa_id: int,
    fecha: date,
    proveedor_nit: str,
    valor_total: Decimal,
    tiene_iva: bool,
    descripcion: str,
    user_id: Optional[int],
    db: AsyncSession,
    cuenta_proveedor: str = CUENTA_PROVEEDORES,
    cuenta_gasto: str = CUENTA_GASTO_DEFAULT,
    cuenta_iva_descontable: str = CUENTA_IVA_DESCONTABLE,
    concepto_dian: Optional[str] = None,
    centro_costo: Optional[str] = None,
    factura_id: Optional[int] = None,
) -> AsientoContable:
    """
    Reversa total o parcialmente una causación de compra (devolución al
    proveedor). DR Proveedor, CR Gasto, CR IVA descontable.
    """
    if valor_total is None or Decimal(valor_total) <= 0:
        raise ValueError("El valor de la nota crédito debe ser mayor a cero")

    if cuenta_gasto == CUENTA_GASTO_DEFAULT and concepto_dian:
        cuenta_gasto = cuenta_gasto_para_concepto(concepto_dian, default=CUENTA_GASTO_DEFAULT)

    async with db.begin_nested():
        periodo = await _get_or_create_periodo(empresa_id, fecha.year, fecha.month, db)
        if periodo.estado == "CERRADO":
            raise ValueError(f"Periodo {periodo.anio}-{periodo.mes:02d} CERRADO")

        impuestos = await calcular_impuestos(
            empresa_id=empresa_id,
            valor_total=valor_total,
            tiene_iva=tiene_iva,
            aplica_retefuente=False,
            proveedor_nit=proveedor_nit,
            db=db,
            concepto_dian=concepto_dian,
        )

        numero = await _next_numero_asiento(empresa_id, periodo.id, db)
        asiento = AsientoContable(
            empresa_id=empresa_id,
            periodo_id=periodo.id,
            numero=numero,
            fecha=fecha,
            descripcion=descripcion,
            tipo="NOTA_CREDITO_COMPRA",
            estado="BORRADOR",
            factura_id=factura_id,
            created_by=user_id,
        )
        db.add(asiento)
        await db.flush()

        def _l(cuenta, debito, credito, detalle, base=None):
            return LineaAsiento(
                asiento_id=asiento.id,
                cuenta_codigo=cuenta,
                nit_tercero=proveedor_nit,
                centro_costo=centro_costo,
                concepto_dian=concepto_dian,
                debito=debito,
                credito=credito,
                base_impuesto=base,
                detalle=detalle,
            )

        # DÉBITO: Proveedor (le bajamos lo que le debíamos)
        db.add(_l(cuenta_proveedor, valor_total, Decimal("0"), f"NC {descripcion}"))

        # CRÉDITO: Gasto (revertimos gasto)
        db.add(_l(cuenta_gasto, Decimal("0"), impuestos["valor_base"], f"NC {descripcion}"))

        # CRÉDITO: IVA descontable (perdemos el descontable)
        if tiene_iva and impuestos["valor_iva"] > 0:
            db.add(_l(
                cuenta_iva_descontable, Decimal("0"), impuestos["valor_iva"],
                f"NC IVA descontable — {descripcion}",
                base=impuestos["valor_base"],
            ))

        await db.flush()
    return asiento
