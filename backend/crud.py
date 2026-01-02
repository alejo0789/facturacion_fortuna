from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime
import models, schemas

# --- Proveedor CRUD ---
async def get_proveedor(db: AsyncSession, proveedor_id: int):
    result = await db.execute(select(models.Proveedor).filter(models.Proveedor.id == proveedor_id))
    return result.scalars().first()

async def get_proveedores(db: AsyncSession, skip: int = 0, limit: int = 100, search: Optional[str] = None):
    query = select(models.Proveedor)
    
    if search:
        query = query.filter(
            or_(
                models.Proveedor.nombre.ilike(f"%{search}%"),
                models.Proveedor.nit.ilike(f"%{search}%")
            )
        )
    
    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()

async def create_proveedor(db: AsyncSession, proveedor: schemas.ProveedorCreate):
    db_proveedor = models.Proveedor(**proveedor.model_dump())
    db.add(db_proveedor)
    await db.commit()
    await db.refresh(db_proveedor)
    return db_proveedor

async def get_proveedor_by_nit(db: AsyncSession, nit: str):
    result = await db.execute(select(models.Proveedor).filter(models.Proveedor.nit == nit))
    return result.scalars().first()

# --- Oficina CRUD ---
async def get_oficina(db: AsyncSession, oficina_id: int):
    result = await db.execute(select(models.Oficina).filter(models.Oficina.id == oficina_id))
    return result.scalars().first()

async def get_oficina_by_codigo(db: AsyncSession, cod_oficina: str):
    """Get oficina by cod_oficina"""
    result = await db.execute(
        select(models.Oficina).filter(models.Oficina.cod_oficina == cod_oficina)
    )
    return result.scalars().first()

async def get_oficinas(db: AsyncSession, skip: int = 0, limit: int = 100, search: Optional[str] = None):
    query = select(models.Oficina)
    
    if search:
        query = query.filter(
            or_(
                models.Oficina.cod_oficina.ilike(f"%{search}%"),
                models.Oficina.nombre.ilike(f"%{search}%"),
                models.Oficina.ciudad.ilike(f"%{search}%"),
                models.Oficina.zona.ilike(f"%{search}%"),
                models.Oficina.direccion.ilike(f"%{search}%")
            )
        )
    
    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()

async def create_oficina(db: AsyncSession, oficina: schemas.OficinaCreate):
    db_oficina = models.Oficina(**oficina.model_dump())
    db.add(db_oficina)
    await db.commit()
    await db.refresh(db_oficina)
    return db_oficina

# --- Contrato CRUD ---
async def get_contrato(db: AsyncSession, contrato_id: int):
    result = await db.execute(
        select(models.Contrato)
        .options(selectinload(models.Contrato.proveedor), selectinload(models.Contrato.oficina))
        .filter(models.Contrato.id == contrato_id)
    )
    return result.scalars().first()

async def get_contratos(db: AsyncSession, skip: int = 0, limit: int = 100, search: Optional[str] = None):
    query = (
        select(models.Contrato)
        .options(selectinload(models.Contrato.proveedor), selectinload(models.Contrato.oficina))
        .outerjoin(models.Proveedor)
        .outerjoin(models.Oficina)
    )
    
    if search:
        query = query.filter(
            or_(
                models.Proveedor.nombre.ilike(f"%{search}%"),
                models.Oficina.nombre.ilike(f"%{search}%"),
                models.Contrato.num_contrato.ilike(f"%{search}%"),
                models.Contrato.titular_nombre.ilike(f"%{search}%"),
                models.Contrato.tipo.ilike(f"%{search}%")
            )
        )
    
    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()

async def create_contrato(db: AsyncSession, contrato: schemas.ContratoCreate):
    db_contrato = models.Contrato(**contrato.model_dump())
    db.add(db_contrato)
    await db.commit()
    await db.refresh(db_contrato)
    # Return with relationships loaded
    return await get_contrato(db, db_contrato.id)

async def get_contratos_by_proveedor(db: AsyncSession, proveedor_id: int):
    """Get all contracts for a specific proveedor with oficina info loaded"""
    result = await db.execute(
        select(models.Contrato)
        .options(selectinload(models.Contrato.oficina))
        .filter(models.Contrato.proveedor_id == proveedor_id)
        .order_by(models.Contrato.estado.desc())  # ACTIVO first
    )
    return result.scalars().all()

# --- Pago CRUD ---
async def create_pago(db: AsyncSession, pago: schemas.PagoCreate):
    db_pago = models.Pago(**pago.model_dump())
    db.add(db_pago)
    await db.commit()
    await db.refresh(db_pago)
    return db_pago

async def get_pagos_by_contrato(db: AsyncSession, contrato_id: int):
    result = await db.execute(select(models.Pago).filter(models.Pago.contrato_id == contrato_id))
    return result.scalars().all()

# --- UPDATE Functions ---
async def update_proveedor(db: AsyncSession, proveedor_id: int, data: schemas.ProveedorCreate):
    db_item = await get_proveedor(db, proveedor_id)
    if db_item:
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(db_item, key, value)
        await db.commit()
        await db.refresh(db_item)
    return db_item

async def update_oficina(db: AsyncSession, oficina_id: int, data: schemas.OficinaCreate):
    db_item = await get_oficina(db, oficina_id)
    if db_item:
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(db_item, key, value)
        await db.commit()
        await db.refresh(db_item)
    return db_item

async def update_contrato(db: AsyncSession, contrato_id: int, data: schemas.ContratoCreate):
    db_item = await get_contrato(db, contrato_id)
    if db_item:
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(db_item, key, value)
        await db.commit()
        # Return with relationships loaded
        return await get_contrato(db, contrato_id)
    return None

async def update_contrato_archivo(db: AsyncSession, contrato_id: int, archivo_path: Optional[str]):
    """Update only the archivo_contrato field of a contract"""
    db_item = await get_contrato(db, contrato_id)
    if db_item:
        db_item.archivo_contrato = archivo_path
        await db.commit()
        # Return with relationships loaded
        return await get_contrato(db, contrato_id)
    return None

# --- DELETE Functions ---
async def delete_proveedor(db: AsyncSession, proveedor_id: int):
    db_item = await get_proveedor(db, proveedor_id)
    if db_item:
        await db.delete(db_item)
        await db.commit()
    return db_item

async def delete_oficina(db: AsyncSession, oficina_id: int):
    db_item = await get_oficina(db, oficina_id)
    if db_item:
        await db.delete(db_item)
        await db.commit()
    return db_item

async def delete_contrato(db: AsyncSession, contrato_id: int):
    db_item = await get_contrato(db, contrato_id)
    if db_item:
        await db.delete(db_item)
        await db.commit()
    return db_item


# --- Factura CRUD ---
async def get_factura(db: AsyncSession, factura_id: int):
    """Get a single factura with all relationships loaded including oficinas_asignadas"""
    result = await db.execute(
        select(models.Factura)
        .options(
            selectinload(models.Factura.proveedor),
            selectinload(models.Factura.oficina),
            selectinload(models.Factura.contrato),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.oficina),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.contrato)
        )
        .filter(models.Factura.id == factura_id)
    )
    return result.scalars().first()

async def get_facturas(db: AsyncSession, skip: int = 0, limit: int = 100, 
                       search: Optional[str] = None, estado: Optional[str] = None,
                       proveedor_id: Optional[int] = None, solo_pendientes: bool = False,
                       fecha_desde: Optional[str] = None, fecha_hasta: Optional[str] = None,
                       oficina_id: Optional[int] = None):
    """Get facturas with optional filters including date range and oficina"""
    query = (
        select(models.Factura)
        .options(
            selectinload(models.Factura.proveedor),
            selectinload(models.Factura.oficina),
            selectinload(models.Factura.contrato),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.oficina),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.contrato)
        )
        .outerjoin(models.Proveedor)
        .outerjoin(models.Oficina)
    )
    
    if search:
        query = query.filter(
            or_(
                models.Proveedor.nombre.ilike(f"%{search}%"),
                models.Proveedor.nit.ilike(f"%{search}%"),
                models.Oficina.nombre.ilike(f"%{search}%"),
                models.Factura.numero_factura.ilike(f"%{search}%"),
                models.Factura.cufe.ilike(f"%{search}%")
            )
        )
    
    if estado:
        query = query.filter(models.Factura.estado == estado)
    
    if proveedor_id:
        query = query.filter(models.Factura.proveedor_id == proveedor_id)
    
    if solo_pendientes:
        query = query.filter(models.Factura.contrato_id.is_(None))
    
    # Date filters - filter by created_at (when invoice was received)
    if fecha_desde:
        fecha_desde_dt = datetime.strptime(fecha_desde, '%Y-%m-%d')
        query = query.filter(models.Factura.created_at >= fecha_desde_dt)
    
    if fecha_hasta:
        # Add 1 day to include all invoices from that day
        fecha_hasta_dt = datetime.strptime(fecha_hasta, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
        query = query.filter(models.Factura.created_at <= fecha_hasta_dt)
    
    # Oficina filter - check both legacy oficina_id and new oficinas_asignadas
    if oficina_id:
        query = query.outerjoin(models.FacturaOficina, models.Factura.id == models.FacturaOficina.factura_id)
        query = query.filter(
            or_(
                models.Factura.oficina_id == oficina_id,
                models.FacturaOficina.oficina_id == oficina_id
            )
        ).distinct()
    
    query = query.order_by(models.Factura.id.desc())
    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()

async def create_factura(db: AsyncSession, factura: schemas.FacturaCreate):
    """Create a new factura"""
    db_factura = models.Factura(**factura.model_dump())
    db.add(db_factura)
    await db.commit()
    await db.refresh(db_factura)
    return await get_factura(db, db_factura.id)

async def update_factura(db: AsyncSession, factura_id: int, data: schemas.FacturaCreate):
    """Update factura data"""
    db_item = await get_factura(db, factura_id)
    if db_item:
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(db_item, key, value)
        await db.commit()
        return await get_factura(db, factura_id)
    return None

async def delete_factura(db: AsyncSession, factura_id: int):
    """Delete a factura"""
    db_item = await get_factura(db, factura_id)
    if db_item:
        await db.delete(db_item)
        await db.commit()
    return db_item

async def find_contrato_by_proveedor_oficina(db: AsyncSession, proveedor_id: int, oficina_id: int):
    """
    Find the contract that matches a proveedor and oficina.
    This is used to auto-detect the contrato when an oficina is assigned to a factura.
    Prioritizes ACTIVO contracts.
    """
    result = await db.execute(
        select(models.Contrato)
        .filter(
            models.Contrato.proveedor_id == proveedor_id,
            models.Contrato.oficina_id == oficina_id
        )
        .order_by(
            # Prioritize active contracts
            models.Contrato.estado.desc()  # ACTIVO comes after CANCELADO alphabetically, so desc
        )
    )
    return result.scalars().first()

async def asignar_oficina_a_factura(db: AsyncSession, factura_id: int, oficina_id: int):
    """
    Assign oficina to factura and auto-detect the contrato.
    Updates the estado to ASIGNADA.
    """
    db_factura = await get_factura(db, factura_id)
    if not db_factura:
        return None
    
    # Update oficina
    db_factura.oficina_id = oficina_id
    
    # Try to find matching contrato
    contrato = await find_contrato_by_proveedor_oficina(
        db, db_factura.proveedor_id, oficina_id
    )
    
    if contrato:
        db_factura.contrato_id = contrato.id
    
    # Update estado
    db_factura.estado = 'ASIGNADA'
    
    await db.commit()
    return await get_factura(db, factura_id)


# --- FacturaOficina CRUD (multiple oficinas per factura) ---

async def get_factura_oficinas(db: AsyncSession, factura_id: int):
    """Get all oficinas assigned to a factura"""
    result = await db.execute(
        select(models.FacturaOficina)
        .options(
            selectinload(models.FacturaOficina.oficina),
            selectinload(models.FacturaOficina.contrato)
        )
        .filter(models.FacturaOficina.factura_id == factura_id)
    )
    return result.scalars().all()

async def add_oficina_to_factura(db: AsyncSession, factura_id: int, oficina_id: int, 
                                  valor: float, observaciones: Optional[str] = None):
    """
    Add an oficina to a factura with a specific value.
    Auto-detects the contrato based on proveedor + oficina.
    """
    # Get the factura to get proveedor_id
    factura = await get_factura(db, factura_id)
    if not factura:
        return None
    
    # Find contrato for this proveedor + oficina combination
    contrato = await find_contrato_by_proveedor_oficina(db, factura.proveedor_id, oficina_id)
    contrato_id = contrato.id if contrato else None
    
    # Create the assignment
    db_item = models.FacturaOficina(
        factura_id=factura_id,
        oficina_id=oficina_id,
        contrato_id=contrato_id,
        valor=valor,
        observaciones=observaciones
    )
    db.add(db_item)
    
    # Update factura estado to ASIGNADA if it has at least one oficina
    factura.estado = 'ASIGNADA'
    
    await db.commit()
    await db.refresh(db_item)
    
    # Return with relationships loaded
    result = await db.execute(
        select(models.FacturaOficina)
        .options(
            selectinload(models.FacturaOficina.oficina),
            selectinload(models.FacturaOficina.contrato)
        )
        .filter(models.FacturaOficina.id == db_item.id)
    )
    return result.scalars().first()

async def update_factura_oficina(db: AsyncSession, factura_oficina_id: int, 
                                  valor: float, estado: Optional[str] = None,
                                  observaciones: Optional[str] = None):
    """Update a factura-oficina assignment"""
    result = await db.execute(
        select(models.FacturaOficina).filter(models.FacturaOficina.id == factura_oficina_id)
    )
    db_item = result.scalars().first()
    if not db_item:
        return None
    
    db_item.valor = valor
    if estado:
        db_item.estado = estado
    if observaciones is not None:
        db_item.observaciones = observaciones
    
    await db.commit()
    return db_item

async def remove_oficina_from_factura(db: AsyncSession, factura_oficina_id: int):
    """Remove an oficina assignment from a factura"""
    result = await db.execute(
        select(models.FacturaOficina).filter(models.FacturaOficina.id == factura_oficina_id)
    )
    db_item = result.scalars().first()
    if db_item:
        factura_id = db_item.factura_id
        await db.delete(db_item)
        await db.commit()
        
        # Check if factura has any remaining oficinas
        remaining = await get_factura_oficinas(db, factura_id)
        if len(remaining) == 0:
            # No more oficinas, update factura estado to PENDIENTE
            factura = await get_factura(db, factura_id)
            if factura:
                factura.estado = 'PENDIENTE'
                await db.commit()
        
        return True
    return False

async def asignar_multiples_oficinas(db: AsyncSession, factura_id: int, oficinas_data: list):
    """
    Assign multiple oficinas to a factura at once.
    First removes existing assignments, then adds new ones.
    oficinas_data: list of dicts with oficina_id, valor, observaciones
    """
    factura = await get_factura(db, factura_id)
    if not factura:
        return None
    
    # Remove existing assignments
    existing = await get_factura_oficinas(db, factura_id)
    for item in existing:
        await db.delete(item)
    
    # Add new assignments
    for data in oficinas_data:
        # Find contrato
        contrato = await find_contrato_by_proveedor_oficina(
            db, factura.proveedor_id, data['oficina_id']
        )
        
        db_item = models.FacturaOficina(
            factura_id=factura_id,
            oficina_id=data['oficina_id'],
            contrato_id=contrato.id if contrato else None,
            valor=data['valor'],
            observaciones=data.get('observaciones')
        )
        db.add(db_item)
    
    # Update factura estado
    if len(oficinas_data) > 0:
        factura.estado = 'ASIGNADA'
    else:
        factura.estado = 'PENDIENTE'
    
    await db.commit()
    return await get_factura(db, factura_id)


async def get_contratos_pendientes_por_llegar(db: AsyncSession, year: int, month: int):
    """
    Find active contracts that do not have an associated invoice for the given month/year.
    Assumes monthly billing.
    """
    from sqlalchemy import extract, and_
    
    # 1. Get IDs of contracts that ALREADY have an invoice for this period
    # We check through FacturaOficina links to Factura
    invoiced_contracts_query = (
        select(models.FacturaOficina.contrato_id)
        .join(models.Factura, models.Factura.id == models.FacturaOficina.factura_id)
        .filter(
            and_(
                extract('year', models.Factura.fecha_factura) == year,
                extract('month', models.Factura.fecha_factura) == month,
                models.FacturaOficina.contrato_id.isnot(None)
            )
        )
    )
    
    result_invoiced = await db.execute(invoiced_contracts_query)
    invoiced_ids = {row[0] for row in result_invoiced.all()}
    
    # 2. Get all active contracts that are NOT in the invoiced list
    query = (
        select(models.Contrato)
        .options(
            selectinload(models.Contrato.proveedor),
            selectinload(models.Contrato.oficina)
        )
        .filter(
            and_(
                models.Contrato.estado == 'ACTIVO',
                models.Contrato.proveedor_id.isnot(None),
                models.Contrato.oficina_id.isnot(None),
                models.Contrato.id.notin_(list(invoiced_ids)) if invoiced_ids else True
            )
        )
    )
    
    result = await db.execute(query)
    return result.scalars().all()
