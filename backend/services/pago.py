"""
Servicio de asientos contables de PAGO.

Genera asientos tipo PAGO cuando una factura se cancela (estado = PAGADA)
o cuando se emite una Nota Bancaria (NB01) que la paga.

Lógica contable estándar (Colombia):
    DÉBITO   Proveedores (220505)        valor_pagado   -> cancela la CxP
    CRÉDITO  Banco/Caja (default 111005) valor_pagado   -> salida real del dinero

La cuenta de banco puede tomarse de `CuentaBancaria` configurada para la empresa;
si no hay ninguna, se usa la cuenta default `111005` (Bancos moneda nacional).

El caller es responsable del commit/rollback.
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models_contabilidad import (
    AsientoContable,
    CuentaBancaria,
    LineaAsiento,
    PeriodoContable,
)


# Cuentas default (Decreto 2650)
CUENTA_PROVEEDORES_DEFAULT = "220505"   # Proveedores nacionales
CUENTA_BANCO_DEFAULT = "111005"         # Bancos moneda nacional


async def resolver_cuenta_banco_default(
    empresa_id: int,
    db: AsyncSession,
) -> str:
    """
    Devuelve el código PUC de la primera cuenta bancaria activa de la empresa.
    Fallback a `CUENTA_BANCO_DEFAULT` si no hay ninguna configurada.
    """
    result = await db.execute(
        select(CuentaBancaria.cuenta_puc_codigo)
        .where(
            CuentaBancaria.empresa_id == empresa_id,
            CuentaBancaria.activa == True,  # noqa: E712
        )
        .order_by(CuentaBancaria.id.asc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row or CUENTA_BANCO_DEFAULT


async def _get_or_create_periodo(
    empresa_id: int,
    anio: int,
    mes: int,
    db: AsyncSession,
) -> PeriodoContable:
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
    result = await db.execute(
        select(sqlfunc.max(AsientoContable.numero)).where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.periodo_id == periodo_id,
        )
    )
    return (result.scalar() or 0) + 1


async def crear_asiento_pago_factura(
    empresa_id: int,
    factura_id: int,
    fecha_pago: date,
    valor_pagado: Decimal,
    proveedor_nit: str,
    descripcion: str,
    user_id: Optional[int],
    db: AsyncSession,
    cuenta_banco_codigo: Optional[str] = None,
    cuenta_proveedor_codigo: str = CUENTA_PROVEEDORES_DEFAULT,
    pago_id: Optional[int] = None,
) -> AsientoContable:
    """
    Crea un asiento PAGO por la cancelación de una factura.

    Lógica contable:
        DÉBITO   Proveedores (220505)  valor_pagado
        CRÉDITO  Banco (111005 default) valor_pagado

    No hace commit — el caller decide. La construcción se envuelve en un
    SAVEPOINT (`begin_nested`) para garantizar atomicidad: si algún flush
    falla, el asiento completo (cabecera + ambas líneas) se revierte como
    unidad sin dejar cabecera huérfana.
    """
    if valor_pagado is None or Decimal(valor_pagado) <= 0:
        raise ValueError("El valor pagado debe ser mayor a cero")

    # 1. Cuenta de banco: explícita o primera configurada en CuentaBancaria
    if not cuenta_banco_codigo:
        cuenta_banco_codigo = await resolver_cuenta_banco_default(empresa_id, db)

    async with db.begin_nested():
        # 2. Periodo contable
        periodo = await _get_or_create_periodo(empresa_id, fecha_pago.year, fecha_pago.month, db)
        if periodo.estado == "CERRADO":
            raise ValueError(
                f"El periodo {periodo.anio}-{periodo.mes:02d} está CERRADO. "
                f"No se pueden registrar asientos."
            )

        # 3. Número secuencial
        numero = await _next_numero_asiento(empresa_id, periodo.id, db)

        # 4. Cabecera del asiento
        asiento = AsientoContable(
            empresa_id=empresa_id,
            periodo_id=periodo.id,
            numero=numero,
            fecha=fecha_pago,
            descripcion=descripcion,
            tipo="PAGO",
            estado="BORRADOR",
            factura_id=factura_id,
            pago_id=pago_id,
            created_by=user_id,
        )
        db.add(asiento)
        await db.flush()

        # 5. DÉBITO: Proveedores (cancela la CxP generada en la causación)
        db.add(LineaAsiento(
            asiento_id=asiento.id,
            cuenta_codigo=cuenta_proveedor_codigo,
            nit_tercero=proveedor_nit,
            debito=Decimal(valor_pagado),
            credito=Decimal("0"),
            detalle=descripcion,
        ))

        # 6. CRÉDITO: Banco (salida de dinero)
        db.add(LineaAsiento(
            asiento_id=asiento.id,
            cuenta_codigo=cuenta_banco_codigo,
            nit_tercero=proveedor_nit,
            debito=Decimal("0"),
            credito=Decimal(valor_pagado),
            detalle=descripcion,
        ))

        await db.flush()
    return asiento
