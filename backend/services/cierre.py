"""
Servicio de cierre y apertura contable.

Implementa los asientos automáticos del fin/inicio de ejercicio fiscal en
Colombia (Decreto 2649/2650):

  CIERRE — al cerrar el último periodo del año (diciembre):
    - Cancelar saldos de Ingresos (clase 4) → DB Ingreso / CR Ganancias y pérdidas (590505)
    - Cancelar saldos de Gastos (clase 5)   → CR Gasto / DB Ganancias y pérdidas
    - Cancelar saldos de Costos (clase 6)   → CR Costo / DB Ganancias y pérdidas
    - Trasladar utilidad/pérdida del ejercicio:
        utilidad neta CR → CR 360505 Utilidad del ejercicio   (si ingresos > gastos)
        pérdida neta DR  → DB 361505 Pérdida del ejercicio    (si gastos > ingresos)

  APERTURA — al abrir el primer periodo del año siguiente (enero):
    - Reabrir saldos de Activos (1xxxx) y Pasivos (2xxxx) y Patrimonio (3xxxx)
      del balance al 31-Dic del año anterior.
    - Las cuentas de resultado (4-5-6) NO se reabren — quedan en cero.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from models_contabilidad import (
    AsientoContable,
    LineaAsiento,
    PeriodoContable,
)
from services.causacion import _next_numero_asiento, _get_or_create_periodo


# Cuentas PUC del cierre/apertura (Decreto 2650)
CUENTA_GANANCIAS_PERDIDAS = "590505"   # Ganancias y pérdidas (cuenta puente)
CUENTA_UTILIDAD_EJERCICIO = "360505"   # Utilidad del ejercicio
CUENTA_PERDIDA_EJERCICIO = "361505"    # Pérdida del ejercicio


async def _saldos_por_clase(
    *,
    empresa_id: int,
    anio: int,
    clase: str,
    db: AsyncSession,
) -> list[tuple[str, Decimal, Decimal]]:
    """
    Devuelve [(cuenta_codigo, total_debito, total_credito)] de las cuentas
    hijas APROBADAS del año en una clase determinada (ej. '4', '5', '6', '1'…).
    """
    result = await db.execute(
        select(
            LineaAsiento.cuenta_codigo,
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.debito), 0).label("db"),
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.credito), 0).label("cr"),
        )
        .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
        .where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.estado == "APROBADO",
            sqlfunc.extract("year", AsientoContable.fecha) <= anio,  # acumulado al cierre
            LineaAsiento.cuenta_codigo.like(f"{clase}%"),
        )
        .group_by(LineaAsiento.cuenta_codigo)
    )
    return [(r[0], Decimal(r[1]), Decimal(r[2])) for r in result.all()]


async def crear_asiento_cierre_anual(
    *,
    empresa_id: int,
    anio: int,
    user_id: Optional[int],
    db: AsyncSession,
) -> AsientoContable:
    """
    Crea un asiento tipo CIERRE con fecha 31-Dic-anio que:
      - Cancela todas las cuentas de Ingresos (4xxx), Gastos (5xxx), Costos (6xxx).
      - Lleva el saldo neto a 360505 (utilidad) o 361505 (pérdida).

    Idempotente por (empresa_id, anio): si ya existe un asiento CIERRE
    APROBADO para ese año, lanza ValueError.
    """
    fecha_cierre = date(anio, 12, 31)

    # 0. Verificar que no exista ya un cierre APROBADO para este año
    existing = await db.execute(
        select(AsientoContable)
        .where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.tipo == "CIERRE",
            AsientoContable.estado != "ANULADO",
            sqlfunc.extract("year", AsientoContable.fecha) == anio,
        )
        .limit(1)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Ya existe asiento CIERRE para el año {anio}")

    async with db.begin_nested():
        periodo = await _get_or_create_periodo(empresa_id, anio, 12, db)
        # No bloqueamos por CERRADO — el cierre puede crearse aún en periodo
        # cerrado (es la última operación contable del año).

        # 1. Sumar saldos por clase de resultado
        ingresos = await _saldos_por_clase(empresa_id=empresa_id, anio=anio, clase="4", db=db)
        gastos = await _saldos_por_clase(empresa_id=empresa_id, anio=anio, clase="5", db=db)
        costos = await _saldos_por_clase(empresa_id=empresa_id, anio=anio, clase="6", db=db)

        total_ingresos = sum((cr - db_) for _, db_, cr in ingresos)  # CR neto
        total_gastos = sum((db_ - cr) for _, db_, cr in gastos)      # DB neto
        total_costos = sum((db_ - cr) for _, db_, cr in costos)      # DB neto
        utilidad_neta = total_ingresos - total_gastos - total_costos

        if not ingresos and not gastos and not costos:
            raise ValueError(f"No hay movimientos de resultado en {anio} para cerrar")

        numero = await _next_numero_asiento(empresa_id, periodo.id, db)
        asiento = AsientoContable(
            empresa_id=empresa_id,
            periodo_id=periodo.id,
            numero=numero,
            fecha=fecha_cierre,
            descripcion=f"Asiento de cierre del ejercicio {anio}",
            tipo="CIERRE",
            estado="BORRADOR",
            created_by=user_id,
        )
        db.add(asiento)
        await db.flush()

        def _l(cuenta, debito, credito, detalle):
            return LineaAsiento(
                asiento_id=asiento.id,
                cuenta_codigo=cuenta,
                debito=debito,
                credito=credito,
                detalle=detalle,
            )

        # 2. Cancelar ingresos (saldo CR → DR Ingreso, CR Ganancias y pérdidas)
        for cuenta, db_acum, cr_acum in ingresos:
            saldo = cr_acum - db_acum
            if saldo > 0:
                db.add(_l(cuenta, saldo, Decimal("0"), f"Cierre {anio}: cancelar ingreso"))

        # 3. Cancelar gastos (saldo DR → CR Gasto, DR Ganancias y pérdidas)
        for cuenta, db_acum, cr_acum in gastos:
            saldo = db_acum - cr_acum
            if saldo > 0:
                db.add(_l(cuenta, Decimal("0"), saldo, f"Cierre {anio}: cancelar gasto"))

        # 4. Cancelar costos
        for cuenta, db_acum, cr_acum in costos:
            saldo = db_acum - cr_acum
            if saldo > 0:
                db.add(_l(cuenta, Decimal("0"), saldo, f"Cierre {anio}: cancelar costo"))

        # 5. Asentar utilidad o pérdida en 360505 / 361505
        if utilidad_neta > 0:
            db.add(_l(
                CUENTA_GANANCIAS_PERDIDAS,
                total_gastos + total_costos, Decimal("0"),
                f"Cierre {anio}: ganancias y pérdidas",
            ))
            db.add(_l(
                CUENTA_GANANCIAS_PERDIDAS,
                Decimal("0"), total_ingresos,
                f"Cierre {anio}: ganancias y pérdidas",
            ))
            db.add(_l(
                CUENTA_UTILIDAD_EJERCICIO,
                Decimal("0"), utilidad_neta,
                f"Utilidad del ejercicio {anio}",
            ))
            # 590505 termina balanceada porque su DR = gastos+costos y CR = ingresos
            # y el residual va al patrimonio.
            db.add(_l(
                CUENTA_GANANCIAS_PERDIDAS,
                utilidad_neta, Decimal("0"),
                f"Traslado utilidad {anio} a patrimonio",
            ))
        elif utilidad_neta < 0:
            perdida = -utilidad_neta
            db.add(_l(
                CUENTA_GANANCIAS_PERDIDAS,
                total_gastos + total_costos, Decimal("0"),
                f"Cierre {anio}: ganancias y pérdidas",
            ))
            db.add(_l(
                CUENTA_GANANCIAS_PERDIDAS,
                Decimal("0"), total_ingresos,
                f"Cierre {anio}: ganancias y pérdidas",
            ))
            db.add(_l(
                CUENTA_PERDIDA_EJERCICIO,
                perdida, Decimal("0"),
                f"Pérdida del ejercicio {anio}",
            ))
            db.add(_l(
                CUENTA_GANANCIAS_PERDIDAS,
                Decimal("0"), perdida,
                f"Traslado pérdida {anio} a patrimonio",
            ))

        await db.flush()
    return asiento


async def crear_asiento_apertura_anual(
    *,
    empresa_id: int,
    anio_nuevo: int,
    user_id: Optional[int],
    db: AsyncSession,
) -> AsientoContable:
    """
    Crea un asiento APERTURA con fecha 1-Ene-anio_nuevo que reabre los saldos
    finales de Activo (1), Pasivo (2) y Patrimonio (3) al 31-Dic del año anterior.

    Las cuentas de resultado (4, 5, 6) NO se reabren.

    Idempotente por (empresa_id, anio_nuevo).
    """
    anio_anterior = anio_nuevo - 1
    fecha_apertura = date(anio_nuevo, 1, 1)

    existing = await db.execute(
        select(AsientoContable)
        .where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.tipo == "APERTURA",
            AsientoContable.estado != "ANULADO",
            sqlfunc.extract("year", AsientoContable.fecha) == anio_nuevo,
            sqlfunc.extract("month", AsientoContable.fecha) == 1,
        )
        .limit(1)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Ya existe asiento APERTURA para el año {anio_nuevo}")

    async with db.begin_nested():
        periodo = await _get_or_create_periodo(empresa_id, anio_nuevo, 1, db)

        # Sumar saldos por cuenta de A/P/Patrimonio al cierre del año anterior
        # (incluyendo el asiento de cierre si ya se aplicó).
        result = await db.execute(
            select(
                LineaAsiento.cuenta_codigo,
                sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.debito), 0).label("db"),
                sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.credito), 0).label("cr"),
            )
            .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
            .where(
                AsientoContable.empresa_id == empresa_id,
                AsientoContable.estado == "APROBADO",
                sqlfunc.extract("year", AsientoContable.fecha) <= anio_anterior,
                LineaAsiento.cuenta_codigo.regexp_match("^[123]"),
            )
            .group_by(LineaAsiento.cuenta_codigo)
        )
        rows = result.all()
        if not rows:
            raise ValueError(f"No hay saldos al {anio_anterior} para reabrir")

        numero = await _next_numero_asiento(empresa_id, periodo.id, db)
        asiento = AsientoContable(
            empresa_id=empresa_id,
            periodo_id=periodo.id,
            numero=numero,
            fecha=fecha_apertura,
            descripcion=f"Asiento de apertura del ejercicio {anio_nuevo}",
            tipo="APERTURA",
            estado="BORRADOR",
            created_by=user_id,
        )
        db.add(asiento)
        await db.flush()

        for cuenta, db_acum, cr_acum in rows:
            saldo = Decimal(db_acum) - Decimal(cr_acum)
            if saldo == 0:
                continue
            db.add(LineaAsiento(
                asiento_id=asiento.id,
                cuenta_codigo=cuenta,
                debito=saldo if saldo > 0 else Decimal("0"),
                credito=-saldo if saldo < 0 else Decimal("0"),
                detalle=f"Apertura {anio_nuevo}: saldo {anio_anterior}",
            ))

        await db.flush()
    return asiento
