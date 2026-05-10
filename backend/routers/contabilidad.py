"""
Router del módulo contable: PUC, periodos, asientos, libro mayor y balance.

Todas las rutas son multi-tenant — se exige header X-Empresa-Id (resuelto
por `get_current_empresa`) para scopear los datos al tenant activo.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func as sqlfunc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.dependencies import get_current_empresa, get_current_user, require_role
from database import get_db
from models_contabilidad import (
    AsientoContable,
    CuentaBancaria,
    CuentaPUC,
    LineaAsiento,
    PeriodoContable,
)
from schemas_contabilidad import (
    AsientoContableCreate,
    AsientoContableResponse,
    BalanceClase,
    BalanceResponse,
    CuentaBancariaCreate,
    CuentaBancariaResponse,
    CuentaBancariaUpdate,
    CuentaPUCCreate,
    CuentaPUCResponse,
    LibroMayorLinea,
    LibroMayorResponse,
    LineaAsientoResponse,
    PeriodoContableCreate,
    PeriodoContableResponse,
)


router = APIRouter(prefix="/contabilidad", tags=["contabilidad"])


# ==========================================================
# PUC
# ==========================================================
@router.get("/puc", response_model=List[CuentaPUCResponse])
async def listar_puc(
    nivel: Optional[str] = None,
    codigo: Optional[str] = None,
    nombre: Optional[str] = None,
    solo_movimiento: bool = False,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CuentaPUC).where(CuentaPUC.empresa_id == empresa.id, CuentaPUC.activa == True)  # noqa: E712

    if nivel:
        stmt = stmt.where(CuentaPUC.nivel == nivel.upper())
    if codigo:
        stmt = stmt.where(CuentaPUC.codigo.like(f"{codigo}%"))
    if nombre:
        stmt = stmt.where(CuentaPUC.nombre.ilike(f"%{nombre}%"))
    if solo_movimiento:
        stmt = stmt.where(CuentaPUC.permite_movimiento == True)  # noqa: E712

    stmt = stmt.order_by(CuentaPUC.codigo)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/puc", response_model=CuentaPUCResponse)
async def crear_cuenta_puc(
    data: CuentaPUCCreate,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    # Validar padre si se provee
    if data.padre_codigo:
        result = await db.execute(
            select(CuentaPUC).where(
                CuentaPUC.empresa_id == empresa.id,
                CuentaPUC.codigo == data.padre_codigo,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(400, f"Cuenta padre {data.padre_codigo} no existe")

    # Verificar duplicado
    result = await db.execute(
        select(CuentaPUC).where(
            CuentaPUC.empresa_id == empresa.id,
            CuentaPUC.codigo == data.codigo,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(409, f"La cuenta {data.codigo} ya existe")

    cuenta = CuentaPUC(
        empresa_id=empresa.id,
        codigo=data.codigo,
        nombre=data.nombre,
        naturaleza=data.naturaleza,
        nivel=data.nivel,
        padre_codigo=data.padre_codigo,
        permite_movimiento=data.permite_movimiento,
        requiere_tercero=data.requiere_tercero,
        activa=True,
    )
    db.add(cuenta)
    await db.commit()
    await db.refresh(cuenta)
    return cuenta


# ==========================================================
# Periodos
# ==========================================================
@router.get("/periodos", response_model=List[PeriodoContableResponse])
async def listar_periodos(
    anio: Optional[int] = None,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PeriodoContable).where(PeriodoContable.empresa_id == empresa.id)
    if anio:
        stmt = stmt.where(PeriodoContable.anio == anio)
    stmt = stmt.order_by(PeriodoContable.anio.desc(), PeriodoContable.mes.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/periodos", response_model=PeriodoContableResponse)
async def crear_periodo(
    data: PeriodoContableCreate,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PeriodoContable).where(
            PeriodoContable.empresa_id == empresa.id,
            PeriodoContable.anio == data.anio,
            PeriodoContable.mes == data.mes,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(409, f"Periodo {data.anio}-{data.mes:02d} ya existe")

    periodo = PeriodoContable(
        empresa_id=empresa.id, anio=data.anio, mes=data.mes, estado="ABIERTO"
    )
    db.add(periodo)
    await db.commit()
    await db.refresh(periodo)
    return periodo


@router.post("/periodos/{periodo_id}/cerrar", response_model=PeriodoContableResponse)
async def cerrar_periodo(
    periodo_id: int,
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN", "CONTADOR")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PeriodoContable).where(
            PeriodoContable.id == periodo_id,
            PeriodoContable.empresa_id == empresa.id,
        )
    )
    periodo = result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(404, "Periodo no encontrado")

    if periodo.estado == "CERRADO":
        raise HTTPException(400, "El periodo ya está cerrado")

    # Verificar que no haya asientos en BORRADOR
    result = await db.execute(
        select(sqlfunc.count(AsientoContable.id)).where(
            AsientoContable.periodo_id == periodo_id,
            AsientoContable.estado == "BORRADOR",
        )
    )
    borradores = result.scalar() or 0
    if borradores > 0:
        raise HTTPException(
            400, f"No se puede cerrar: hay {borradores} asientos en BORRADOR"
        )

    periodo.estado = "CERRADO"
    periodo.cerrado_por = current_user.id if hasattr(current_user, "id") else None
    periodo.cerrado_en = datetime.utcnow()
    await db.commit()
    await db.refresh(periodo)
    return periodo


# ==========================================================
# Asientos
# ==========================================================
async def _enrich_asiento(asiento: AsientoContable) -> AsientoContableResponse:
    """Calcula totales y arma la respuesta."""
    total_db = sum((l.debito for l in asiento.lineas), Decimal("0"))
    total_cr = sum((l.credito for l in asiento.lineas), Decimal("0"))

    return AsientoContableResponse(
        id=asiento.id,
        empresa_id=asiento.empresa_id,
        periodo_id=asiento.periodo_id,
        numero=asiento.numero,
        fecha=asiento.fecha,
        descripcion=asiento.descripcion,
        tipo=asiento.tipo,
        estado=asiento.estado,
        factura_id=asiento.factura_id,
        pago_id=asiento.pago_id,
        total_debito=total_db,
        total_credito=total_cr,
        lineas=[
            LineaAsientoResponse.model_validate(l, from_attributes=True)
            for l in asiento.lineas
        ],
    )


@router.get("/asientos", response_model=List[AsientoContableResponse])
async def listar_asientos(
    anio: Optional[int] = None,
    mes: Optional[int] = None,
    tipo: Optional[str] = None,
    estado: Optional[str] = None,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(AsientoContable)
        .where(AsientoContable.empresa_id == empresa.id)
        .options(selectinload(AsientoContable.lineas))
        .order_by(AsientoContable.fecha.desc(), AsientoContable.numero.desc())
    )

    if anio or mes:
        # Join con periodo
        stmt = stmt.join(PeriodoContable, PeriodoContable.id == AsientoContable.periodo_id)
        if anio:
            stmt = stmt.where(PeriodoContable.anio == anio)
        if mes:
            stmt = stmt.where(PeriodoContable.mes == mes)

    if tipo:
        stmt = stmt.where(AsientoContable.tipo == tipo.upper())
    if estado:
        stmt = stmt.where(AsientoContable.estado == estado.upper())

    result = await db.execute(stmt)
    asientos = result.scalars().all()
    return [await _enrich_asiento(a) for a in asientos]


@router.get("/asientos/{asiento_id}", response_model=AsientoContableResponse)
async def obtener_asiento(
    asiento_id: int,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AsientoContable)
        .where(AsientoContable.id == asiento_id, AsientoContable.empresa_id == empresa.id)
        .options(selectinload(AsientoContable.lineas))
    )
    asiento = result.scalar_one_or_none()
    if not asiento:
        raise HTTPException(404, "Asiento no encontrado")
    return await _enrich_asiento(asiento)


@router.post("/asientos", response_model=AsientoContableResponse)
async def crear_asiento_manual(
    data: AsientoContableCreate,
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    """Crea un asiento manual. La validación DB==CR ya la hizo el schema."""
    # Obtener o crear periodo
    result = await db.execute(
        select(PeriodoContable).where(
            PeriodoContable.empresa_id == empresa.id,
            PeriodoContable.anio == data.fecha.year,
            PeriodoContable.mes == data.fecha.month,
        )
    )
    periodo = result.scalar_one_or_none()
    if not periodo:
        periodo = PeriodoContable(
            empresa_id=empresa.id,
            anio=data.fecha.year,
            mes=data.fecha.month,
            estado="ABIERTO",
        )
        db.add(periodo)
        await db.flush()

    if periodo.estado == "CERRADO":
        raise HTTPException(
            400, f"El periodo {periodo.anio}-{periodo.mes:02d} está CERRADO"
        )

    # Validar que las cuentas existan y permitan movimiento
    codigos = {l.cuenta_codigo for l in data.lineas}
    result = await db.execute(
        select(CuentaPUC).where(
            CuentaPUC.empresa_id == empresa.id,
            CuentaPUC.codigo.in_(codigos),
        )
    )
    cuentas = {c.codigo: c for c in result.scalars().all()}

    for linea in data.lineas:
        c = cuentas.get(linea.cuenta_codigo)
        if not c:
            raise HTTPException(400, f"Cuenta {linea.cuenta_codigo} no existe en el PUC")
        if not c.permite_movimiento:
            raise HTTPException(
                400,
                f"Cuenta {linea.cuenta_codigo} ({c.nombre}) no permite movimientos "
                f"(nivel {c.nivel})",
            )
        if c.requiere_tercero and not linea.nit_tercero:
            raise HTTPException(
                400,
                f"Cuenta {linea.cuenta_codigo} requiere NIT del tercero",
            )

    # Siguiente número
    result = await db.execute(
        select(sqlfunc.max(AsientoContable.numero)).where(
            AsientoContable.empresa_id == empresa.id,
            AsientoContable.periodo_id == periodo.id,
        )
    )
    numero = (result.scalar() or 0) + 1

    user_id = current_user.id if hasattr(current_user, "id") and current_user.id else None
    asiento = AsientoContable(
        empresa_id=empresa.id,
        periodo_id=periodo.id,
        numero=numero,
        fecha=data.fecha,
        descripcion=data.descripcion,
        tipo=data.tipo,
        estado="BORRADOR",
        factura_id=data.factura_id,
        pago_id=data.pago_id,
        created_by=user_id,
    )
    db.add(asiento)
    await db.flush()

    for linea in data.lineas:
        db.add(LineaAsiento(
            asiento_id=asiento.id,
            cuenta_codigo=linea.cuenta_codigo,
            nit_tercero=linea.nit_tercero,
            centro_costo=linea.centro_costo,
            debito=linea.debito,
            credito=linea.credito,
            base_impuesto=linea.base_impuesto,
            detalle=linea.detalle,
        ))

    await db.commit()

    # Reload con lineas
    result = await db.execute(
        select(AsientoContable)
        .where(AsientoContable.id == asiento.id)
        .options(selectinload(AsientoContable.lineas))
    )
    asiento = result.scalar_one()
    return await _enrich_asiento(asiento)


@router.post("/asientos/{asiento_id}/aprobar", response_model=AsientoContableResponse)
async def aprobar_asiento(
    asiento_id: int,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AsientoContable)
        .where(AsientoContable.id == asiento_id, AsientoContable.empresa_id == empresa.id)
        .options(selectinload(AsientoContable.lineas))
    )
    asiento = result.scalar_one_or_none()
    if not asiento:
        raise HTTPException(404, "Asiento no encontrado")

    if asiento.estado != "BORRADOR":
        raise HTTPException(400, f"El asiento está en estado {asiento.estado}")

    # Revalidar partida doble
    total_db = sum((l.debito for l in asiento.lineas), Decimal("0"))
    total_cr = sum((l.credito for l in asiento.lineas), Decimal("0"))
    if total_db != total_cr:
        raise HTTPException(400, f"Asiento descuadrado: DB={total_db}, CR={total_cr}")

    asiento.estado = "APROBADO"
    await db.commit()
    await db.refresh(asiento)
    return await _enrich_asiento(asiento)


@router.post("/asientos/{asiento_id}/anular", response_model=AsientoContableResponse)
async def anular_asiento(
    asiento_id: int,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AsientoContable)
        .where(AsientoContable.id == asiento_id, AsientoContable.empresa_id == empresa.id)
        .options(selectinload(AsientoContable.lineas))
    )
    asiento = result.scalar_one_or_none()
    if not asiento:
        raise HTTPException(404, "Asiento no encontrado")

    if asiento.estado == "ANULADO":
        raise HTTPException(400, "El asiento ya está anulado")

    asiento.estado = "ANULADO"
    await db.commit()
    await db.refresh(asiento)
    return await _enrich_asiento(asiento)


# ==========================================================
# Causación de VENTA + Notas crédito (compra/venta)
# ==========================================================
from pydantic import BaseModel as _BaseModel

class _VentaIn(_BaseModel):
    fecha: date
    cliente_nit: str
    valor_total: Decimal
    tiene_iva: bool = True
    descripcion: str
    concepto_dian: Optional[str] = None
    centro_costo: Optional[str] = None
    factura_id: Optional[int] = None
    cuenta_cliente: Optional[str] = None
    cuenta_ingreso: Optional[str] = None
    cuenta_iva: Optional[str] = None


class _NotaCreditoIn(_BaseModel):
    fecha: date
    nit_tercero: str
    valor_total: Decimal
    tiene_iva: bool = True
    descripcion: str
    concepto_dian: Optional[str] = None
    centro_costo: Optional[str] = None
    factura_id: Optional[int] = None


@router.get("/exportar/manager-erp")
async def exportar_manager_erp(
    anio: int = Query(...),
    mes: int = Query(..., ge=1, le=13),
    tipos: Optional[str] = Query(None, description="Tipos separados por coma (ej: 'CAUSACION,PAGO,VENTA')"),
    incluir_borradores: bool = False,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    """
    Exporta los asientos del periodo en formato CSV compatible con ManagerERP
    (delimitador ;, columnas DOC_TIPO; DOC_NUMERO; FECHA; CUENTA_PUC; NIT;
    CENTRO_COSTO; DESCRIPCION; DEBITO; CREDITO; BASE; CONCEPTO_DIAN).

    Útil para que el contador suba el archivo plano al ERP usado por la firma.
    """
    from services.manager_erp import exportar_lote_asientos_csv
    from fastapi.responses import Response

    stmt = (
        select(AsientoContable)
        .options(selectinload(AsientoContable.lineas))
        .join(PeriodoContable, PeriodoContable.id == AsientoContable.periodo_id)
        .where(
            AsientoContable.empresa_id == empresa.id,
            PeriodoContable.anio == anio,
            PeriodoContable.mes == mes,
        )
        .order_by(AsientoContable.numero)
    )
    if not incluir_borradores:
        stmt = stmt.where(AsientoContable.estado == "APROBADO")
    else:
        stmt = stmt.where(AsientoContable.estado != "ANULADO")
    if tipos:
        tipo_list = [t.strip().upper() for t in tipos.split(",") if t.strip()]
        stmt = stmt.where(AsientoContable.tipo.in_(tipo_list))

    asientos = (await db.execute(stmt)).scalars().all()
    csv_bytes = exportar_lote_asientos_csv(asientos)
    fname = f"manager_erp_{anio}_{mes:02d}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/cierre-anual", response_model=AsientoContableResponse)
async def cierre_anual(
    anio: int = Query(..., ge=2000, le=2100),
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN", "CONTADOR")),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancela las cuentas de resultado (4-5-6) del año y traslada utilidad/
    pérdida a 360505/361505. Crea asiento tipo CIERRE en BORRADOR.
    """
    from services.cierre import crear_asiento_cierre_anual
    user_id = current_user.id if hasattr(current_user, "id") else None
    try:
        asiento = await crear_asiento_cierre_anual(
            empresa_id=empresa.id, anio=anio, user_id=user_id, db=db,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    await db.commit()
    asiento_full = (await db.execute(
        select(AsientoContable)
        .where(AsientoContable.id == asiento.id)
        .options(selectinload(AsientoContable.lineas))
    )).scalar_one()
    return await _enrich_asiento(asiento_full)


@router.post("/apertura-anual", response_model=AsientoContableResponse)
async def apertura_anual(
    anio: int = Query(..., ge=2000, le=2100, description="Año a abrir"),
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN", "CONTADOR")),
    db: AsyncSession = Depends(get_db),
):
    """
    Reabre los saldos de A/P/Patrimonio al 31-Dic del año anterior.
    Crea asiento tipo APERTURA en BORRADOR con fecha 1-Ene-anio.
    """
    from services.cierre import crear_asiento_apertura_anual
    user_id = current_user.id if hasattr(current_user, "id") else None
    try:
        asiento = await crear_asiento_apertura_anual(
            empresa_id=empresa.id, anio_nuevo=anio, user_id=user_id, db=db,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    await db.commit()
    asiento_full = (await db.execute(
        select(AsientoContable)
        .where(AsientoContable.id == asiento.id)
        .options(selectinload(AsientoContable.lineas))
    )).scalar_one()
    return await _enrich_asiento(asiento_full)


@router.post("/ventas/causar", response_model=AsientoContableResponse)
async def causar_venta(
    data: _VentaIn,
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    """Crea asiento VENTA: DR Clientes / CR Ingreso + IVA generado."""
    from services.venta import (
        crear_asiento_causacion_venta,
        CUENTA_CLIENTES_DEFAULT,
        CUENTA_IVA_GENERADO,
    )
    user_id = current_user.id if hasattr(current_user, "id") else None
    asiento = await crear_asiento_causacion_venta(
        empresa_id=empresa.id,
        fecha_factura=data.fecha,
        cliente_nit=data.cliente_nit,
        valor_total=data.valor_total,
        tiene_iva=data.tiene_iva,
        descripcion=data.descripcion,
        user_id=user_id,
        db=db,
        cuenta_cliente=data.cuenta_cliente or CUENTA_CLIENTES_DEFAULT,
        cuenta_ingreso=data.cuenta_ingreso,
        cuenta_iva=data.cuenta_iva or CUENTA_IVA_GENERADO,
        concepto_dian=data.concepto_dian,
        centro_costo=data.centro_costo,
        factura_id=data.factura_id,
    )
    await db.commit()
    asiento_full = (await db.execute(
        select(AsientoContable)
        .where(AsientoContable.id == asiento.id)
        .options(selectinload(AsientoContable.lineas))
    )).scalar_one()
    return await _enrich_asiento(asiento_full)


@router.post("/notas-credito/venta", response_model=AsientoContableResponse)
async def nota_credito_venta(
    data: _NotaCreditoIn,
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    """Reversa una venta. DR Ingreso/IVA / CR Clientes."""
    from services.venta import crear_asiento_nota_credito_venta
    user_id = current_user.id if hasattr(current_user, "id") else None
    asiento = await crear_asiento_nota_credito_venta(
        empresa_id=empresa.id,
        fecha=data.fecha,
        cliente_nit=data.nit_tercero,
        valor_total=data.valor_total,
        tiene_iva=data.tiene_iva,
        descripcion=data.descripcion,
        user_id=user_id,
        db=db,
        concepto_dian=data.concepto_dian,
        centro_costo=data.centro_costo,
        factura_id=data.factura_id,
    )
    await db.commit()
    asiento_full = (await db.execute(
        select(AsientoContable)
        .where(AsientoContable.id == asiento.id)
        .options(selectinload(AsientoContable.lineas))
    )).scalar_one()
    return await _enrich_asiento(asiento_full)


@router.post("/notas-credito/compra", response_model=AsientoContableResponse)
async def nota_credito_compra(
    data: _NotaCreditoIn,
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    """Devolución a proveedor. DR Proveedor / CR Gasto + IVA descontable."""
    from services.venta import crear_asiento_nota_credito_compra
    user_id = current_user.id if hasattr(current_user, "id") else None
    asiento = await crear_asiento_nota_credito_compra(
        empresa_id=empresa.id,
        fecha=data.fecha,
        proveedor_nit=data.nit_tercero,
        valor_total=data.valor_total,
        tiene_iva=data.tiene_iva,
        descripcion=data.descripcion,
        user_id=user_id,
        db=db,
        concepto_dian=data.concepto_dian,
        centro_costo=data.centro_costo,
        factura_id=data.factura_id,
    )
    await db.commit()
    asiento_full = (await db.execute(
        select(AsientoContable)
        .where(AsientoContable.id == asiento.id)
        .options(selectinload(AsientoContable.lineas))
    )).scalar_one()
    return await _enrich_asiento(asiento_full)


# ==========================================================
# Libro Mayor
# ==========================================================
@router.get("/libro-mayor/{cuenta_codigo}", response_model=LibroMayorResponse)
async def libro_mayor(
    cuenta_codigo: str,
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    incluir_borradores: bool = False,
    centro_costo: Optional[str] = Query(None, description="Filtrar por centro de costo (cod_oficina)"),
    nit_tercero: Optional[str] = Query(None, description="Filtrar por NIT del tercero"),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    # Cuenta
    result = await db.execute(
        select(CuentaPUC).where(
            CuentaPUC.empresa_id == empresa.id,
            CuentaPUC.codigo == cuenta_codigo,
        )
    )
    cuenta = result.scalar_one_or_none()
    if not cuenta:
        raise HTTPException(404, "Cuenta no encontrada")

    # Movimientos
    stmt = (
        select(LineaAsiento, AsientoContable)
        .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
        .where(
            AsientoContable.empresa_id == empresa.id,
            LineaAsiento.cuenta_codigo == cuenta_codigo,
        )
    )

    if not incluir_borradores:
        stmt = stmt.where(AsientoContable.estado == "APROBADO")
    else:
        stmt = stmt.where(AsientoContable.estado != "ANULADO")

    if centro_costo:
        stmt = stmt.where(LineaAsiento.centro_costo == centro_costo)
    if nit_tercero:
        stmt = stmt.where(LineaAsiento.nit_tercero == nit_tercero)

    if fecha_desde:
        stmt = stmt.where(AsientoContable.fecha >= fecha_desde)
    if fecha_hasta:
        stmt = stmt.where(AsientoContable.fecha <= fecha_hasta)

    stmt = stmt.order_by(AsientoContable.fecha, AsientoContable.numero)

    result = await db.execute(stmt)
    rows = result.all()

    saldo = Decimal("0")
    total_db = Decimal("0")
    total_cr = Decimal("0")
    movimientos: List[LibroMayorLinea] = []

    signo = 1 if cuenta.naturaleza == "DEBITO" else -1

    for linea, asiento in rows:
        db_val = Decimal(linea.debito or 0)
        cr_val = Decimal(linea.credito or 0)
        total_db += db_val
        total_cr += cr_val
        # Saldo según naturaleza
        saldo += signo * (db_val - cr_val)

        movimientos.append(LibroMayorLinea(
            fecha=asiento.fecha,
            asiento_numero=asiento.numero,
            descripcion=linea.detalle or asiento.descripcion,
            debito=db_val,
            credito=cr_val,
            saldo=saldo,
        ))

    return LibroMayorResponse(
        cuenta_codigo=cuenta.codigo,
        cuenta_nombre=cuenta.nombre,
        saldo_inicial=Decimal("0"),
        total_debito=total_db,
        total_credito=total_cr,
        saldo_final=saldo,
        movimientos=movimientos,
    )


# ==========================================================
# Balance de comprobación
# ==========================================================
@router.get("/balance", response_model=BalanceResponse)
async def balance_comprobacion(
    anio: int = Query(...),
    mes: int = Query(..., ge=1, le=13),
    incluir_borradores: bool = False,
    centro_costo: Optional[str] = Query(None, description="Filtrar por centro de costo (cod_oficina)"),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Balance de comprobación por clase (1-6) al periodo indicado (acumulado YTD).

    Agrupamos por cuenta_codigo en la BD y hacemos el rollup por clase en
    Python — evita el problema de PostgreSQL con expresiones `substr()`
    parametrizadas de forma diferente en SELECT y GROUP BY.

    Si se pasa `centro_costo`, sólo se contabilizan líneas con ese centro de
    costo (oficina). Útil para balances por sede.
    """
    stmt = (
        select(
            LineaAsiento.cuenta_codigo,
            sqlfunc.sum(LineaAsiento.debito).label("total_db"),
            sqlfunc.sum(LineaAsiento.credito).label("total_cr"),
        )
        .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
        .join(PeriodoContable, PeriodoContable.id == AsientoContable.periodo_id)
        .where(
            AsientoContable.empresa_id == empresa.id,
            or_(
                PeriodoContable.anio < anio,
                and_(PeriodoContable.anio == anio, PeriodoContable.mes <= mes),
            ),
        )
        .group_by(LineaAsiento.cuenta_codigo)
    )

    if not incluir_borradores:
        stmt = stmt.where(AsientoContable.estado == "APROBADO")
    else:
        stmt = stmt.where(AsientoContable.estado != "ANULADO")

    if centro_costo:
        stmt = stmt.where(LineaAsiento.centro_costo == centro_costo)

    result = await db.execute(stmt)
    rows = result.all()

    clases_map = {
        "1": ("Activo", "DEBITO"),
        "2": ("Pasivo", "CREDITO"),
        "3": ("Patrimonio", "CREDITO"),
        "4": ("Ingresos", "CREDITO"),
        "5": ("Gastos", "DEBITO"),
        "6": ("Costos", "DEBITO"),
    }

    # Rollup en Python por primer carácter del código de cuenta
    acumulado: dict = {
        c: {"db": Decimal("0"), "cr": Decimal("0")} for c in clases_map
    }
    for cuenta_codigo, total_db, total_cr in rows:
        clase_cod = (cuenta_codigo or "")[:1]
        if clase_cod not in acumulado:
            continue
        acumulado[clase_cod]["db"] += Decimal(total_db or 0)
        acumulado[clase_cod]["cr"] += Decimal(total_cr or 0)

    totales = {c: Decimal("0") for c in clases_map}
    clases_resp: List[BalanceClase] = []
    for clase_cod, (nombre, naturaleza) in clases_map.items():
        total_db = acumulado[clase_cod]["db"]
        total_cr = acumulado[clase_cod]["cr"]
        if total_db == 0 and total_cr == 0:
            continue
        saldo = (total_db - total_cr) if naturaleza == "DEBITO" else (total_cr - total_db)
        totales[clase_cod] = saldo
        clases_resp.append(BalanceClase(
            codigo=clase_cod,
            nombre=nombre,
            total_debito=total_db,
            total_credito=total_cr,
            saldo=saldo,
        ))

    utilidad = totales["4"] - totales["5"] - totales["6"]

    return BalanceResponse(
        anio=anio,
        mes=mes,
        clases=sorted(clases_resp, key=lambda c: c.codigo),
        total_activos=totales["1"],
        total_pasivos=totales["2"],
        total_patrimonio=totales["3"],
        total_ingresos=totales["4"],
        total_gastos=totales["5"],
        total_costos=totales["6"],
        utilidad_neta=utilidad,
    )


# ==========================================================
# Cuentas bancarias de la empresa
# ==========================================================
@router.get("/cuentas-bancarias", response_model=List[CuentaBancariaResponse])
async def listar_cuentas_bancarias(
    solo_activas: bool = True,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CuentaBancaria).where(CuentaBancaria.empresa_id == empresa.id)
    if solo_activas:
        stmt = stmt.where(CuentaBancaria.activa == True)  # noqa: E712
    stmt = stmt.order_by(CuentaBancaria.id.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return rows


@router.post("/cuentas-bancarias", response_model=CuentaBancariaResponse)
async def crear_cuenta_bancaria(
    data: CuentaBancariaCreate,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    # Validar que la cuenta PUC exista y permita movimiento
    result = await db.execute(
        select(CuentaPUC).where(
            CuentaPUC.empresa_id == empresa.id,
            CuentaPUC.codigo == data.cuenta_puc_codigo,
        )
    )
    cuenta_puc = result.scalar_one_or_none()
    if not cuenta_puc:
        raise HTTPException(
            status_code=400,
            detail=f"La cuenta PUC {data.cuenta_puc_codigo} no existe para esta empresa",
        )
    if not cuenta_puc.permite_movimiento:
        raise HTTPException(
            status_code=400,
            detail=f"La cuenta PUC {data.cuenta_puc_codigo} no permite movimientos",
        )

    cta = CuentaBancaria(
        empresa_id=empresa.id,
        banco=data.banco,
        numero_cuenta=data.numero_cuenta,
        tipo_cuenta=data.tipo_cuenta,
        cuenta_puc_codigo=data.cuenta_puc_codigo,
        activa=data.activa,
    )
    db.add(cta)
    await db.commit()
    await db.refresh(cta)
    return cta


@router.put("/cuentas-bancarias/{cuenta_id}", response_model=CuentaBancariaResponse)
async def actualizar_cuenta_bancaria(
    cuenta_id: int,
    data: CuentaBancariaUpdate,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CuentaBancaria).where(
            CuentaBancaria.id == cuenta_id,
            CuentaBancaria.empresa_id == empresa.id,
        )
    )
    cta = result.scalar_one_or_none()
    if not cta:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada")

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cta, k, v)

    await db.commit()
    await db.refresh(cta)
    return cta


@router.delete("/cuentas-bancarias/{cuenta_id}")
async def eliminar_cuenta_bancaria(
    cuenta_id: int,
    empresa=Depends(get_current_empresa),
    _=Depends(require_role("ADMIN", "CONTADOR", "CONTABILIDAD")),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete — marca la cuenta como inactiva."""
    result = await db.execute(
        select(CuentaBancaria).where(
            CuentaBancaria.id == cuenta_id,
            CuentaBancaria.empresa_id == empresa.id,
        )
    )
    cta = result.scalar_one_or_none()
    if not cta:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada")

    cta.activa = False
    await db.commit()
    return {"ok": True, "cuenta_id": cuenta_id}
