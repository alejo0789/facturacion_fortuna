"""
Facturas Router - Robust invoice management module

Key features:
1. Create facturas with only proveedor (contract not required initially)
2. Manually assign oficina and auto-detect related contrato
3. Store invoice URL (received via API)
4. View invoice via URL or network share
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pathlib import Path
from urllib.parse import unquote
import os
import schemas, crud
from database import get_db

router = APIRouter()


# --- Main Factura Endpoints ---

@router.post("/facturas/", response_model=schemas.Factura)
async def create_factura_api(
    factura: schemas.FacturaCreateAPI,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new factura via API.
    
    You can provide either:
    - proveedor_id: ID of existing proveedor
    - proveedor_nit: NIT to find existing proveedor (or create new one if proveedor_nombre is also provided)
    
    The factura will be created with estado='PENDIENTE'.
    Oficina and contrato can be assigned manually later.
    """
    proveedor_id = factura.proveedor_id
    
    # If no proveedor_id, try to find by NIT
    if not proveedor_id and factura.proveedor_nit:
        proveedor = await crud.get_proveedor_by_nit(db, factura.proveedor_nit)
        
        if proveedor:
            proveedor_id = proveedor.id
        elif factura.proveedor_nombre:
            # Create new proveedor
            new_proveedor = await crud.create_proveedor(
                db, 
                schemas.ProveedorCreate(
                    nit=factura.proveedor_nit,
                    nombre=factura.proveedor_nombre
                )
            )
            proveedor_id = new_proveedor.id
        else:
            raise HTTPException(
                status_code=400, 
                detail="Proveedor no encontrado. Proporcione proveedor_nombre para crear uno nuevo."
            )
    
    if not proveedor_id:
        raise HTTPException(
            status_code=400,
            detail="Debe proporcionar proveedor_id o proveedor_nit"
        )
    
    # Validate that proveedor exists
    proveedor = await crud.get_proveedor(db, proveedor_id)
    if not proveedor:
        raise HTTPException(
            status_code=404,
            detail=f"Proveedor con ID {proveedor_id} no encontrado. Si está enviando el NIT, use el campo 'proveedor_nit' en lugar de 'proveedor_id'."
        )
    
    # Create factura
    factura_data = schemas.FacturaCreate(
        proveedor_id=proveedor_id,
        numero_factura=factura.numero_factura,
        cufe=factura.cufe,
        fecha_factura=factura.fecha_factura,
        fecha_vencimiento=factura.fecha_vencimiento,
        valor=factura.valor,
        url_factura=factura.url_factura,
        observaciones=factura.observaciones,
        estado='PENDIENTE'
    )
    
    return await crud.create_factura(db, factura_data)


@router.post("/facturas/crear-con-oficina", response_model=schemas.Factura)
async def create_factura_con_oficinas(
    request: schemas.FacturaCreateConOficinas,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new factura with optional oficina assignments using cod_oficina.
    
    - proveedor_nit: Required. NIT of the provider
    - proveedor_nombre: Optional. Name to create provider if not found
    - oficinas: Optional. List of {cod_oficina, valor} to assign
    
    Example:
    {
        "proveedor_nit": "890123456",
        "numero_factura": "FAC-001",
        "valor": 500000,
        "fecha_factura": "2024-12-26",
        "oficinas": [
            {"cod_oficina": "OF-001", "valor": 250000},
            {"cod_oficina": "OF-002", "valor": 250000}
        ]
    }
    """
    # Find or create proveedor (optional)
    proveedor_id = None
    
    if request.proveedor_nit:
        proveedor = await crud.get_proveedor_by_nit(db, request.proveedor_nit)
        
        if proveedor:
            proveedor_id = proveedor.id
        elif request.proveedor_nombre:
            # Create new proveedor
            proveedor = await crud.create_proveedor(
                db, 
                schemas.ProveedorCreate(
                    nit=request.proveedor_nit,
                    nombre=request.proveedor_nombre
                )
            )
            proveedor_id = proveedor.id
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Proveedor con NIT {request.proveedor_nit} no encontrado. Proporcione proveedor_nombre para crear uno nuevo."
            )
    
    # Create factura (proveedor_id can be None)
    factura_data = schemas.FacturaCreate(
        proveedor_id=proveedor_id,
        numero_factura=request.numero_factura,
        cufe=request.cufe,
        fecha_factura=request.fecha_factura,
        fecha_vencimiento=request.fecha_vencimiento,
        valor=request.valor,
        url_factura=request.url_factura,
        observaciones=request.observaciones,
        estado='PENDIENTE' if not request.oficinas else 'ASIGNADA'
    )
    
    factura = await crud.create_factura(db, factura_data)
    
    # If oficinas provided, assign them
    if request.oficinas:
        oficinas_asignadas = []
        oficinas_no_encontradas = []
        
        for of in request.oficinas:
            # Skip if cod_oficina is null/empty
            if not of.cod_oficina:
                continue
                
            # Find oficina by cod_oficina
            oficina = await crud.get_oficina_by_codigo(db, of.cod_oficina)
            
            if oficina:
                # Add oficina to factura
                await crud.add_oficina_to_factura(
                    db, factura.id, oficina.id, float(of.valor), None
                )
                oficinas_asignadas.append(of.cod_oficina)
            else:
                oficinas_no_encontradas.append(of.cod_oficina)
        
        # Refresh factura to get updated relationships
        factura = await crud.get_factura(db, factura.id)
        
        if oficinas_no_encontradas:
            # Still return the factura but add a warning
            factura.observaciones = (factura.observaciones or "") + f" [ADVERTENCIA: Oficinas no encontradas: {', '.join(oficinas_no_encontradas)}]"
    
    return factura


@router.get("/facturas/", response_model=List[schemas.Factura])
async def list_facturas(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    estado: Optional[str] = None,
    proveedor_id: Optional[int] = None,
    oficina_id: Optional[int] = Query(None, description="Filtrar por oficina asignada"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    solo_pendientes: bool = Query(False, description="Solo mostrar facturas sin contrato asignado"),
    db: AsyncSession = Depends(get_db)
):
    """
    List facturas with optional filters.
    
    - search: Search by proveedor name/NIT, oficina name, factura number, or CUFE
    - estado: Filter by estado (PENDIENTE, ASIGNADA, PAGADA)
    - proveedor_id: Filter by proveedor
    - oficina_id: Filter by oficina (includes oficinas_asignadas)
    - fecha_desde: Filter invoices from this date
    - fecha_hasta: Filter invoices until this date
    - solo_pendientes: Only show facturas without assigned contrato
    """
    return await crud.get_facturas(
        db, skip=skip, limit=limit, search=search, 
        estado=estado, proveedor_id=proveedor_id, 
        solo_pendientes=solo_pendientes,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
        oficina_id=oficina_id
    )


@router.get("/facturas/{factura_id}", response_model=schemas.Factura)
async def get_factura(factura_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single factura by ID"""
    factura = await crud.get_factura(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return factura


@router.put("/facturas/{factura_id}", response_model=schemas.Factura)
async def update_factura(
    factura_id: int,
    factura: schemas.FacturaCreate,
    db: AsyncSession = Depends(get_db)
):
    """Update a factura"""
    result = await crud.update_factura(db, factura_id, factura)
    if not result:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return result


@router.delete("/facturas/{factura_id}")
async def delete_factura(factura_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a factura"""
    result = await crud.delete_factura(db, factura_id)
    if not result:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return {"ok": True}


# --- Oficina Assignment ---

@router.put("/facturas/{factura_id}/asignar-oficina", response_model=schemas.Factura)
async def asignar_oficina(
    factura_id: int,
    request: schemas.AsignarOficinaRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually assign an oficina to a factura.
    
    This will:
    1. Set the oficina_id on the factura
    2. Automatically detect and set the contrato_id based on proveedor + oficina
    3. Update estado to 'ASIGNADA'
    
    If no matching contrato is found, only the oficina will be assigned 
    (contrato_id will remain null).
    """
    result = await crud.asignar_oficina_a_factura(db, factura_id, request.oficina_id)
    if not result:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return result


@router.get("/contratos/proveedor/{proveedor_id}/oficinas")
async def get_oficinas_con_contratos(
    proveedor_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Get all oficinas that have contracts with a specific proveedor.
    Returns oficina info along with the contract number and status.
    Useful for selecting which oficina to assign to a factura.
    """
    contratos = await crud.get_contratos_by_proveedor(db, proveedor_id)
    
    result = []
    for contrato in contratos:
        if contrato.oficina:
            result.append({
                "oficina_id": contrato.oficina.id,
                "oficina_nombre": contrato.oficina.nombre,
                "oficina_ciudad": contrato.oficina.ciudad,
                "oficina_direccion": contrato.oficina.direccion,
                "oficina_cod": contrato.oficina.cod_oficina,
                "contrato_id": contrato.id,
                "contrato_num": contrato.num_contrato,
                "contrato_estado": contrato.estado,
                "valor_mensual": float(contrato.valor_mensual) if contrato.valor_mensual else None
            })
    
    return result


# --- Multiple Oficinas per Factura ---

@router.get("/facturas/{factura_id}/oficinas", response_model=List[schemas.FacturaOficina])
async def get_oficinas_de_factura(
    factura_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get all oficinas assigned to a factura with their individual values"""
    factura = await crud.get_factura(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return await crud.get_factura_oficinas(db, factura_id)


@router.post("/facturas/{factura_id}/oficinas", response_model=schemas.FacturaOficina)
async def add_oficina_a_factura(
    factura_id: int,
    oficina_data: schemas.FacturaOficinaCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Add an oficina to a factura with a specific value.
    The contrato will be auto-detected based on proveedor + oficina.
    """
    result = await crud.add_oficina_to_factura(
        db, factura_id, 
        oficina_data.oficina_id, 
        float(oficina_data.valor),
        oficina_data.observaciones
    )
    if not result:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return result


@router.put("/facturas/{factura_id}/oficinas/{asignacion_id}")
async def update_oficina_de_factura(
    factura_id: int,
    asignacion_id: int,
    valor: float = Query(..., description="Nuevo valor para esta oficina"),
    estado: Optional[str] = Query(None, description="Opcional: PENDIENTE o PAGADA"),
    observaciones: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Update the value or status of an oficina assignment"""
    result = await crud.update_factura_oficina(db, asignacion_id, valor, estado, observaciones)
    if not result:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    return {"ok": True, "id": asignacion_id}


@router.delete("/facturas/{factura_id}/oficinas/{asignacion_id}")
async def remove_oficina_de_factura(
    factura_id: int,
    asignacion_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Remove an oficina from a factura"""
    result = await crud.remove_oficina_from_factura(db, asignacion_id)
    if not result:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    return {"ok": True}


@router.put("/facturas/{factura_id}/oficinas-multiples", response_model=schemas.Factura)
async def asignar_multiples_oficinas(
    factura_id: int,
    request: schemas.AsignarMultiplesOficinasRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Assign multiple oficinas to a factura at once.
    This replaces all existing oficina assignments.
    Each oficina can have its own value.
    
    Example body:
    {
        "oficinas": [
            {"oficina_id": 1, "valor": 50000.00},
            {"oficina_id": 2, "valor": 75000.00}
        ]
    }
    """
    oficinas_data = [
        {
            "oficina_id": o.oficina_id,
            "valor": float(o.valor),
            "observaciones": o.observaciones
        }
        for o in request.oficinas
    ]
    
    result = await crud.asignar_multiples_oficinas(db, factura_id, oficinas_data)
    if not result:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return result


# --- View Invoice ---

@router.get("/facturas/{factura_id}/ver")
async def ver_factura(factura_id: int, db: AsyncSession = Depends(get_db)):
    """
    View the invoice PDF.
    Reads the file from the network share and serves it to the browser.
    Supports file:// URLs and UNC paths.
    """
    factura = await crud.get_factura(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    if not factura.url_factura:
        raise HTTPException(status_code=404, detail="Esta factura no tiene URL de archivo")
    
    url = factura.url_factura
    
    # Convert file:// URL to UNC path for Windows
    # file://192.168.2.20/Facturas/... -> \\192.168.2.20\Facturas\...
    if url.startswith("file://"):
        # Remove file:// prefix and convert to UNC path
        path_part = url[7:]  # Remove "file://"
        # URL decode (handle %20 -> space, etc.)
        path_part = unquote(path_part)
        # Convert forward slashes to backslashes for Windows UNC
        unc_path = "\\\\" + path_part.replace("/", "\\")
    elif url.startswith("\\\\"):
        # Already a UNC path
        unc_path = unquote(url)
    else:
        # Maybe it's an HTTP URL - redirect to it
        return RedirectResponse(url=url)
    
    # Check if file exists
    if not os.path.exists(unc_path):
        raise HTTPException(
            status_code=404, 
            detail=f"Archivo no encontrado en la ruta: {unc_path}"
        )
    
    # Get filename for Content-Disposition header
    filename = os.path.basename(unc_path)
    
    # Read file content
    with open(unc_path, "rb") as f:
        content = f.read()
    
    # Return with inline disposition so browser displays it instead of downloading
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"'
        }
    )


# --- Status Updates ---

@router.put("/facturas/{factura_id}/estado")
async def cambiar_estado(
    factura_id: int,
    nuevo_estado: str = Query(..., description="Nuevo estado: PENDIENTE, ASIGNADA, PAGADA"),
    db: AsyncSession = Depends(get_db)
):
    """Change the estado of a factura"""
    factura = await crud.get_factura(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    if nuevo_estado not in ['PENDIENTE', 'ASIGNADA', 'PAGADA']:
        raise HTTPException(status_code=400, detail="Estado inválido")
    
    # Use raw update to change estado
    factura.estado = nuevo_estado
    await db.commit()
    
    return await crud.get_factura(db, factura_id)


# --- Statistics ---

@router.get("/facturas/stats/resumen")
async def resumen_facturas(db: AsyncSession = Depends(get_db)):
    """Get summary statistics for facturas"""
    todas = await crud.get_facturas(db, limit=10000)
    
    pendientes = len([f for f in todas if f.estado == 'PENDIENTE'])
    asignadas = len([f for f in todas if f.estado == 'ASIGNADA'])
    pagadas = len([f for f in todas if f.estado == 'PAGADA'])
    sin_contrato = len([f for f in todas if f.contrato_id is None])
    
    return {
        "total": len(todas),
        "pendientes": pendientes,
        "asignadas": asignadas,
        "pagadas": pagadas,
        "sin_contrato": sin_contrato
    }
