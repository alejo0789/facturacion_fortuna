from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, update, func, delete as sqlalchemy_delete
from typing import List, Optional
from datetime import datetime
import models, schemas

# --- Proveedor CRUD ---
async def get_proveedor(db: AsyncSession, proveedor_id: int):
    result = await db.execute(select(models.Proveedor).filter(models.Proveedor.id == proveedor_id))
    return result.scalars().first()

async def get_proveedores(db: AsyncSession, skip: int = 0, limit: int = 100,
                          search: Optional[str] = None, categoria_id: Optional[int] = None,
                          allowed_categoria_ids: Optional[List[int]] = None):
    query = (
        select(models.Proveedor)
        .options(
            selectinload(models.Proveedor.categorias_autorizadas)
            .selectinload(models.ProveedorCategoria.categoria)
        )
    )

    if search:
        query = query.filter(
            or_(
                models.Proveedor.nombre.ilike(f"%{search}%"),
                models.Proveedor.nit.ilike(f"%{search}%"),
                models.Proveedor.nombre_comercial.ilike(f"%{search}%")
            )
        )

    if categoria_id:
        query = query.filter(
            models.Proveedor.categorias_autorizadas.any(
                models.ProveedorCategoria.categoria_id == categoria_id
            )
        )

    if allowed_categoria_ids is not None:
        if len(allowed_categoria_ids) > 0:
            query = query.filter(
                models.Proveedor.categorias_autorizadas.any(
                    models.ProveedorCategoria.categoria_id.in_(allowed_categoria_ids)
                )
            )
        else:
            return []

    result = await db.execute(query.offset(skip).limit(limit))
    proveedores = result.scalars().unique().all()

    # Build flat ProveedorCategoriaInfo list from the loaded relationship
    for p in proveedores:
        for pc in p.categorias_autorizadas:
            # Attach flat fields needed by ProveedorCategoriaInfo schema
            pc.categoria_nombre = pc.categoria.nombre if pc.categoria else ''
            pc.categoria_color = pc.categoria.color if pc.categoria else '#6366f1'

    return proveedores

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
        .options(
            selectinload(models.Contrato.proveedor),
            selectinload(models.Contrato.oficina),
            selectinload(models.Contrato.categoria)
        )
        .filter(models.Contrato.id == contrato_id)
    )
    return result.scalars().first()

async def get_contratos(db: AsyncSession, skip: int = 0, limit: int = 100, 
                        search: Optional[str] = None, categoria_id: Optional[int] = None,
                        allowed_categoria_ids: Optional[List[int]] = None):
    query = (
        select(models.Contrato)
        .options(
            selectinload(models.Contrato.proveedor),
            selectinload(models.Contrato.oficina),
            selectinload(models.Contrato.categoria)
        )
        .outerjoin(models.Proveedor)
        .outerjoin(models.Oficina)
    )
    
    if search:
        query = query.filter(
            or_(
                models.Proveedor.nombre.ilike(f"%{search}%"),
                models.Proveedor.nombre_comercial.ilike(f"%{search}%"),
                models.Proveedor.nit.ilike(f"%{search}%"),
                models.Oficina.nombre.ilike(f"%{search}%"),
                models.Oficina.cod_oficina.ilike(f"%{search}%"),
                models.Contrato.num_contrato.ilike(f"%{search}%"),
                models.Contrato.titular_nombre.ilike(f"%{search}%"),
                models.Contrato.tipo.ilike(f"%{search}%"),
                models.Contrato.tipo_plan.ilike(f"%{search}%")
            )
        )
    
    if categoria_id:
        query = query.filter(models.Contrato.categoria_id == categoria_id)

    if allowed_categoria_ids is not None:
        if len(allowed_categoria_ids) > 0:
            query = query.filter(models.Contrato.categoria_id.in_(allowed_categoria_ids))
        else:
            return []
    
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
        .options(
            selectinload(models.Contrato.oficina),
            selectinload(models.Contrato.categoria)
        )
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
    # 1. Get contract with all relations to capture the snapshot
    result = await db.execute(
        select(models.Contrato)
        .options(selectinload(models.Contrato.proveedor), selectinload(models.Contrato.oficina))
        .filter(models.Contrato.id == contrato_id)
    )
    db_item = result.scalars().first()
    
    if not db_item:
        return None
        
    # 2. Create info strings
    prov_nombre = db_item.proveedor.nombre if db_item.proveedor else "N/A"
    ofic_nombre = db_item.oficina.nombre if db_item.oficina else "N/A"
    num_cont = db_item.num_contrato or "S/N"
    
    audit_snapshot = f"Contrato #{num_cont} - {prov_nombre} ({ofic_nombre})"
    
    # 3. Create Audit Record
    db_audit = models.ContratoAuditoria(
        original_id=db_item.id,
        num_contrato=num_cont,
        proveedor_nit=db_item.proveedor.nit if db_item.proveedor else None,
        proveedor_nombre=prov_nombre,
        oficina_cod=db_item.oficina.cod_oficina if db_item.oficina else None,
        oficina_nombre=ofic_nombre,
        valor_mensual=db_item.valor_mensual,
        detalles_completos=str({
            "linea": db_item.linea,
            "tipo": db_item.tipo,
            "ref_pago": db_item.ref_pago,
            "observaciones": db_item.observaciones
        })
    )
    db.add(db_audit)
    
    # 4. Update linked Facturas (legacy)
    await db.execute(
        update(models.Factura)
        .where(models.Factura.contrato_id == contrato_id)
        .values(
            contrato_id=None,
            info_contrato_audit=audit_snapshot
        )
    )
    
    # 5. Update linked FacturaOficinas (new system)
    await db.execute(
        update(models.FacturaOficina)
        .where(models.FacturaOficina.contrato_id == contrato_id)
        .values(
            contrato_id=None,
            info_contrato_audit=audit_snapshot
        )
    )
    
    # 6. Delete Pagos associated
    await db.execute(
        sqlalchemy_delete(models.Pago)
        .where(models.Pago.contrato_id == contrato_id)
    )
        
    # 7. Final deletion
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
            selectinload(models.Factura.categoria),
            selectinload(models.Factura.oficina),
            selectinload(models.Factura.contrato).selectinload(models.Contrato.proveedor),
            selectinload(models.Factura.contrato).selectinload(models.Contrato.oficina),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.oficina),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.contrato).selectinload(models.Contrato.proveedor),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.contrato).selectinload(models.Contrato.oficina)
        )
        .filter(models.Factura.id == factura_id)
    )
    return result.scalars().first()

async def get_facturas(db: AsyncSession, skip: int = 0, limit: int = 100, 
                       search: Optional[str] = None, estado: Optional[str] = None,
                       proveedor_id: Optional[int] = None, solo_pendientes: bool = False,
                       fecha_desde: Optional[str] = None, fecha_hasta: Optional[str] = None,
                       oficina_id: Optional[int] = None, categoria_id: Optional[int] = None,
                       allowed_categoria_ids: Optional[List[int]] = None, usar_fecha_estado: bool = False):
    """Get facturas with optional filters including date range, oficina, and category.
    usar_fecha_estado=True: date range filters by COALESCE(status_updated_at, created_at)
    usar_fecha_estado=False (default): date range filters by created_at (reception date)
    """
    query = (
        select(models.Factura)
        .options(
            selectinload(models.Factura.proveedor),
            selectinload(models.Factura.categoria),
            selectinload(models.Factura.oficina),
            selectinload(models.Factura.contrato).selectinload(models.Contrato.proveedor),
            selectinload(models.Factura.contrato).selectinload(models.Contrato.oficina),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.oficina),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.contrato).selectinload(models.Contrato.proveedor),
            selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.contrato).selectinload(models.Contrato.oficina)
        )
        .outerjoin(models.Proveedor)
        .outerjoin(models.Oficina)
    )
    
    if search:
        query = query.filter(
            or_(
                models.Proveedor.nombre.ilike(f"%{search}%"),
                models.Proveedor.nombre_comercial.ilike(f"%{search}%"),
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
    
    # Category filter - specific category
    if categoria_id:
        query = query.filter(models.Factura.categoria_id == categoria_id)
    
    # Role-based category restriction - only show facturas from allowed categories or UNASSIGNED
    if allowed_categoria_ids is not None:
        if len(allowed_categoria_ids) > 0:
            query = query.filter(
                or_(
                    models.Factura.categoria_id.in_(allowed_categoria_ids),
                    models.Factura.categoria_id.is_(None)
                )
            )
        else:
            # User has no categories assigned, only show unassigned invoices
            query = query.filter(models.Factura.categoria_id.is_(None))

    # Date filters
    if fecha_desde or fecha_hasta:
        from sqlalchemy import func
        if usar_fecha_estado:
            # Filter by when the status changed (COALESCE: status_updated_at, fallback created_at)
            fecha_col = func.coalesce(models.Factura.status_updated_at, models.Factura.created_at)
        else:
            # Filter by when the invoice was received
            fecha_col = models.Factura.created_at

        if fecha_desde:
            fecha_desde_dt = datetime.strptime(fecha_desde, '%Y-%m-%d')
            query = query.filter(fecha_col >= fecha_desde_dt)

        if fecha_hasta:
            fecha_hasta_dt = datetime.strptime(fecha_hasta, '%Y-%m-%d').replace(hour=23, minute=59, second=59, microsecond=999999)
            query = query.filter(fecha_col <= fecha_hasta_dt)
    
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


async def get_facturas_status_counts(db: AsyncSession, allowed_categoria_ids: Optional[List[int]] = None, categoria_id: Optional[int] = None):
    """Get counts of facturas by status efficiently"""
    query = select(models.Factura.estado, func.count(models.Factura.id))
    
    if categoria_id:
        query = query.filter(models.Factura.categoria_id == categoria_id)
        
    if allowed_categoria_ids is not None:
        if len(allowed_categoria_ids) > 0:
            query = query.filter(models.Factura.categoria_id.in_(allowed_categoria_ids))
        else:
            return {s: 0 for s in ['PENDIENTE', 'ASIGNADA', 'EN_TRAMITE', 'PAGADA']}

    result = await db.execute(query.group_by(models.Factura.estado))
    # result is list of tuples (estado, count)
    counts = {row[0]: row[1] for row in result.all()}
    
    return {
        'PENDIENTE': counts.get('PENDIENTE', 0),
        'ASIGNADA': counts.get('ASIGNADA', 0),
        'EN_TRAMITE': counts.get('EN_TRAMITE', 0),
        'PAGADA': counts.get('PAGADA', 0)
    }

async def get_facturas_status_counts_mes(db: AsyncSession, year: int, month: int, allowed_categoria_ids: Optional[List[int]] = None, categoria_id: Optional[int] = None):
    """Get counts of facturas by status for a specific month, filtered by status_updated_at.
    Uses COALESCE(status_updated_at, created_at) so invoices that never changed state
    are counted by their creation date.
    Example: a factura from January paid in February appears in February's PAGADA count."""
    from sqlalchemy import extract, and_
    fecha_ref = func.coalesce(models.Factura.status_updated_at, models.Factura.created_at)
    
    query = select(models.Factura.estado, func.count(models.Factura.id)).filter(
        and_(
            extract('year', fecha_ref) == year,
            extract('month', fecha_ref) == month,
        )
    )

    if categoria_id:
        query = query.filter(models.Factura.categoria_id == categoria_id)

    if allowed_categoria_ids is not None:
        if len(allowed_categoria_ids) > 0:
            query = query.filter(models.Factura.categoria_id.in_(allowed_categoria_ids))
        else:
            return {s: 0 for s in ['PENDIENTE', 'ASIGNADA', 'EN_TRAMITE', 'PAGADA']}

    result = await db.execute(query.group_by(models.Factura.estado))
    counts = {row[0]: row[1] for row in result.all()}
    return {
        'PENDIENTE': counts.get('PENDIENTE', 0),
        'ASIGNADA': counts.get('ASIGNADA', 0),
        'EN_TRAMITE': counts.get('EN_TRAMITE', 0),
        'PAGADA': counts.get('PAGADA', 0)
    }

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
        update_data = data.model_dump(exclude_unset=True)
        
        # Check if estado is being modified
        if 'estado' in update_data and update_data['estado'] != db_item.estado:
            db_item.status_updated_at = datetime.now()
            
        for key, value in update_data.items():
            setattr(db_item, key, value)
        await db.commit()
        return await get_factura(db, factura_id)
    return None

async def delete_factura(db: AsyncSession, factura_id: int):
    """Delete a factura"""
    db_item = await get_factura(db, factura_id)
    if db_item:
        # First, decouple any feedback linked to this invoice to allow deletion
        # while keeping the feedback in the knowledge base.
        await db.execute(
            update(models.ProveedorFeedback)
            .where(models.ProveedorFeedback.factura_id == factura_id)
            .values(factura_id=None)
        )
        
        # Also decouple from uploads if any
        await db.execute(
            update(models.FacturaUpload)
            .where(models.FacturaUpload.factura_id == factura_id)
            .values(factura_id=None)
        )
        
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

async def asignar_oficina_a_factura(db: AsyncSession, factura_id: int, 
                                     oficina_id: int, contrato_id: Optional[int] = None):
    """
    Simpler assignment for legacy one-to-one relationship.
    Auto-updates status to ASIGNADA if currently PENDIENTE.
    """
    db_factura = await get_factura(db, factura_id)
    if not db_factura:
        return None
    
    # Update oficina
    db_factura.oficina_id = oficina_id
    
    if contrato_id:
        # Use provided contract
        db_factura.contrato_id = contrato_id
    else:
        # Try to find matching contrato automatically
        contrato = await find_contrato_by_proveedor_oficina(
            db, db_factura.proveedor_id, oficina_id
        )
        if contrato:
            db_factura.contrato_id = contrato.id
        else:
            db_factura.contrato_id = None
    
    # Update estado only if currently PENDIENTE
    if db_factura.estado == 'PENDIENTE':
        db_factura.estado = 'ASIGNADA'
        db_factura.status_updated_at = datetime.now()
    
    await db.commit()
    return await get_factura(db, factura_id)


# --- FacturaOficina CRUD (multiple oficinas per factura) ---

async def get_factura_oficinas(db: AsyncSession, factura_id: int):
    """Get all oficinas assigned to a factura"""
    result = await db.execute(
        select(models.FacturaOficina)
        .options(
            selectinload(models.FacturaOficina.oficina),
            selectinload(models.FacturaOficina.contrato).selectinload(models.Contrato.proveedor),
            selectinload(models.FacturaOficina.contrato).selectinload(models.Contrato.oficina)
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
    
    # Check duplicate assignment
    existing = await db.execute(
        select(models.FacturaOficina)
        .filter(
            models.FacturaOficina.factura_id == factura_id,
            models.FacturaOficina.oficina_id == oficina_id
        )
    )
    if existing.scalars().first():
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
    if factura.estado == 'PENDIENTE':
        factura.estado = 'ASIGNADA'
        factura.status_updated_at = datetime.now()
    
    await db.commit()
    await db.refresh(db_item)
    
    # Return with relationships loaded
    result = await db.execute(
        select(models.FacturaOficina)
        .options(
            selectinload(models.FacturaOficina.oficina),
            selectinload(models.FacturaOficina.contrato).selectinload(models.Contrato.proveedor),
            selectinload(models.FacturaOficina.contrato).selectinload(models.Contrato.oficina)
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
    
    # Prepare new assignments
    new_assignments = []
    for data in oficinas_data:
        # Determine contrato_id: use provided one or auto-detect based on oficina
        contrato_id = data.get('contrato_id')
        
        if not contrato_id:
            contrato = await find_contrato_by_proveedor_oficina(
                db, factura.proveedor_id, data['oficina_id']
            )
            contrato_id = contrato.id if contrato else None
        
        db_item = models.FacturaOficina(
            factura_id=factura_id,
            oficina_id=data['oficina_id'],
            contrato_id=contrato_id,
            valor=data['valor'],
            observaciones=data.get('observaciones')
        )
        new_assignments.append(db_item)

    # Bulk add
    if new_assignments:
        db.add_all(new_assignments)
    
    # Update factura estado
    if len(new_assignments) > 0:
        # Only update to ASIGNADA if it was PENDIENTE (don't override EN_TRAMITE or PAGADA)
        # However, assigning offices usually implies it is now ASIGNADA.
        # Let's keep the existing logic that sets it to ASIGNADA, but maybe respect if it's PAGADA?
        # User request says "se demora mucho en asignar los estados y no me deja asignar en tramite"
        # So we should probably NOT force ASIGNADA if the user wants EN_TRAMITE.
        # Ideally, this function shouldn't inadvertently change the status if not needed.
        # But traditionally, assigning offices makes it "ASIGNADA". 
        # Let's check if the current status is NOT PAGADA or EN_TRAMITE before changing? 
        # OR just update it if it's currently PENDIENTE.
        
        if factura.estado == 'PENDIENTE':
            factura.estado = 'ASIGNADA'
            factura.status_updated_at = datetime.now()
    else:
        # If removing all offices, maybe go back to PENDIENTE?
        if factura.estado == 'ASIGNADA':
            factura.estado = 'PENDIENTE'
            factura.status_updated_at = datetime.now()
    
    await db.commit()
    return await get_factura(db, factura_id)


async def get_contratos_pendientes_por_llegar(db: AsyncSession, year: int, month: int, allowed_categoria_ids: Optional[List[int]] = None, categoria_id: Optional[int] = None):
    """
    Find active contracts that do not have an associated invoice for the given month/year.
    Assumes monthly billing.
    """
    from sqlalchemy import extract, and_
    
    # 1. Get IDs of contracts that ALREADY have an invoice for this period
    # We check multiple dates to be flexible:
    # - fecha_factura (date on paper)
    # - created_at (when it arrived in system)
    # - status_updated_at (when it was processed/paid) - using COALESCE with created_at
    
    from sqlalchemy import or_
    
    # Direct links query
    direct_query = (
        select(models.Factura.contrato_id)
        .filter(
            and_(
                or_(
                    and_(extract('year', models.Factura.fecha_factura) == year, extract('month', models.Factura.fecha_factura) == month),
                    and_(extract('year', models.Factura.created_at) == year, extract('month', models.Factura.created_at) == month),
                    and_(extract('year', func.coalesce(models.Factura.status_updated_at, models.Factura.created_at)) == year, extract('month', func.coalesce(models.Factura.status_updated_at, models.Factura.created_at)) == month)
                ),
                models.Factura.contrato_id.isnot(None)
            )
        )
    )
    
    # Multi-office links query
    multi_office_query = (
        select(models.FacturaOficina.contrato_id)
        .join(models.Factura, models.Factura.id == models.FacturaOficina.factura_id)
        .filter(
            and_(
                or_(
                    and_(extract('year', models.Factura.fecha_factura) == year, extract('month', models.Factura.fecha_factura) == month),
                    and_(extract('year', models.Factura.created_at) == year, extract('month', models.Factura.created_at) == month),
                    and_(extract('year', func.coalesce(models.Factura.status_updated_at, models.Factura.created_at)) == year, extract('month', func.coalesce(models.Factura.status_updated_at, models.Factura.created_at)) == month)
                ),
                models.FacturaOficina.contrato_id.isnot(None)
            )
        )
    )
    
    result_direct = await db.execute(direct_query)
    result_multi = await db.execute(multi_office_query)
    
    invoiced_ids = {row[0] for row in result_direct.all()}
    invoiced_ids.update({row[0] for row in result_multi.all()})
    
    # 2. Get all active contracts that are NOT in the invoiced list
    query = (
        select(models.Contrato)
        .options(
            selectinload(models.Contrato.proveedor),
            selectinload(models.Contrato.oficina),
            selectinload(models.Contrato.categoria)
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

    if categoria_id:
        query = query.filter(models.Contrato.categoria_id == categoria_id)

    if allowed_categoria_ids is not None:
        if len(allowed_categoria_ids) > 0:
            query = query.filter(models.Contrato.categoria_id.in_(allowed_categoria_ids))
        else:
            return []
    
    result = await db.execute(query)
    return result.scalars().all()


# --- ProveedorFeedback CRUD (Knowledge Base for Agent) ---

async def create_proveedor_feedback(db: AsyncSession, feedback: schemas.ProveedorFeedbackCreate):
    """Create a new feedback entry for a provider"""
    db_item = models.ProveedorFeedback(**feedback.model_dump())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    
    # Return with proveedor loaded
    result = await db.execute(
        select(models.ProveedorFeedback)
        .options(selectinload(models.ProveedorFeedback.proveedor))
        .filter(models.ProveedorFeedback.id == db_item.id)
    )
    return result.scalars().first()


async def get_feedback_by_proveedor_nit(db: AsyncSession, nit: str, limit: int = 50):
    """Get all feedback for a provider by NIT (for N8N agent)"""
    result = await db.execute(
        select(models.ProveedorFeedback)
        .join(models.Proveedor)
        .options(selectinload(models.ProveedorFeedback.proveedor))
        .filter(models.Proveedor.nit == nit)
        .order_by(models.ProveedorFeedback.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def get_feedback_by_factura(db: AsyncSession, factura_id: int):
    """Get feedback for a specific invoice"""
    result = await db.execute(
        select(models.ProveedorFeedback)
        .options(selectinload(models.ProveedorFeedback.proveedor))
        .filter(models.ProveedorFeedback.factura_id == factura_id)
        .order_by(models.ProveedorFeedback.created_at.desc())
    )
    return result.scalars().all()


async def get_all_feedback(db: AsyncSession, skip: int = 0, limit: int = 100):
    """Get all feedback entries"""
    result = await db.execute(
        select(models.ProveedorFeedback)
        .options(selectinload(models.ProveedorFeedback.proveedor))
        .order_by(models.ProveedorFeedback.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()
