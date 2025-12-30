"""
Facturas Router - Robust invoice management module

Key features:
1. Create facturas with only proveedor (contract not required initially)
2. Manually assign oficina and auto-detect related contrato
3. Store invoice URL (received via API)
4. View invoice via URL or network share
5. Upload invoice PDF manually
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import RedirectResponse, FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pathlib import Path
from urllib.parse import unquote
from datetime import datetime, date
import os
import httpx
import uuid
import schemas, crud
from database import get_db

router = APIRouter()

# Configuration for invoice uploads
INVOICE_UPLOAD_PATH = r"\\192.168.2.20\Facturas\temp"
WEBHOOK_URL = "https://acertemos.a.pinggy.link/webhook/d15fc127-671d-4b24-8221-bac74a6f4648"




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
    from datetime import datetime
    todas = await crud.get_facturas(db, limit=10000)
    
    pendientes = len([f for f in todas if f.estado == 'PENDIENTE'])
    asignadas = len([f for f in todas if f.estado == 'ASIGNADA'])
    pagadas = len([f for f in todas if f.estado == 'PAGADA'])
    
    # Calculate missing invoices for this month
    today = datetime.now()
    missing_contracts = await crud.get_contratos_pendientes_por_llegar(db, today.year, today.month)
    pendientes_por_llegar = len(missing_contracts)
    
    return {
        "total": len(todas),
        "sin_oficina": pendientes, # Re-labeling or providing specific key
        "pendientes": pendientes,   # Keeping old key for compatibility
        "asignadas": asignadas,
        "pagadas": pagadas,
        "pendientes_por_llegar": pendientes_por_llegar
    }


@router.get("/facturas/stats/contratos-pendientes", response_model=List[schemas.Contrato])
async def list_missing_contracts(db: AsyncSession = Depends(get_db)):
    """List contracts that have not sent an invoice in the current month"""
    from datetime import datetime
    today = datetime.now()
    return await crud.get_contratos_pendientes_por_llegar(db, today.year, today.month)


# --- Manual Invoice Upload ---

@router.post("/facturas/upload")
async def upload_factura(
    file: UploadFile = File(None),
    proveedor_nit: str = Form(None),
    proveedor_nombre: str = Form(None),
    numero_factura: str = Form(None),
    fecha_factura: str = Form(None),
    fecha_vencimiento: str = Form(None),
    valor: float = Form(None),
    observaciones: str = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload an invoice PDF manually or create an invoice with manual data.
    
    - If a PDF file is provided, it will be saved to the server and the webhook will be notified
    - If no file is provided, an invoice will be created with the manual data
    
    The PDF is saved to: \\\\192.168.2.20\\Facturas\\temp
    Then webhook is notified: https://acertemos.a.pinggy.link/webhook/...
    """
    url_factura = None
    
    # Handle PDF file upload
    if file and file.filename:
        # Validate file type
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")
        
        # Generate unique filename to avoid conflicts
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        safe_filename = f"{timestamp}_{unique_id}_{file.filename}"
        
        # Create full path
        file_path = os.path.join(INVOICE_UPLOAD_PATH, safe_filename)
        
        # Check if directory exists
        try:
            if not os.path.exists(INVOICE_UPLOAD_PATH):
                os.makedirs(INVOICE_UPLOAD_PATH, exist_ok=True)
        except Exception as e:
            raise HTTPException(
                status_code=500, 
                detail=f"No se puede acceder a la carpeta de destino: {INVOICE_UPLOAD_PATH}. Error: {str(e)}"
            )
        
        # Save file
        try:
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)
            
            # Create URL for the saved file
            url_factura = f"file://192.168.2.20/Facturas/temp/{safe_filename}"
            
        except Exception as e:
            raise HTTPException(
                status_code=500, 
                detail=f"Error guardando archivo: {str(e)}"
            )
        
        # Notify webhook
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                webhook_data = {
                    "event": "invoice_uploaded",
                    "file_path": file_path,
                    "file_url": url_factura,
                    "filename": safe_filename,
                    "original_filename": file.filename,
                    "uploaded_at": datetime.now().isoformat(),
                    "proveedor_nit": proveedor_nit,
                    "numero_factura": numero_factura
                }
                
                response = await client.post(WEBHOOK_URL, json=webhook_data)
                webhook_status = response.status_code
                
        except Exception as e:
            # Don't fail the upload if webhook fails, just log it
            print(f"Warning: Webhook notification failed: {e}")
            webhook_status = None
    
    # If no file and no invoice data provided
    if not file and not proveedor_nit and not numero_factura:
        raise HTTPException(
            status_code=400, 
            detail="Debe proporcionar un archivo PDF o datos de la factura"
        )
    
    # Create factura record if proveedor info is provided
    factura_created = None
    if proveedor_nit:
        # Parse dates if provided
        parsed_fecha_factura = None
        parsed_fecha_vencimiento = None
        
        if fecha_factura:
            try:
                parsed_fecha_factura = datetime.strptime(fecha_factura, "%Y-%m-%d").date()
            except:
                pass
        
        if fecha_vencimiento:
            try:
                parsed_fecha_vencimiento = datetime.strptime(fecha_vencimiento, "%Y-%m-%d").date()
            except:
                pass
        
        # Find or create proveedor
        proveedor = await crud.get_proveedor_by_nit(db, proveedor_nit)
        
        if not proveedor and proveedor_nombre:
            proveedor = await crud.create_proveedor(
                db, 
                schemas.ProveedorCreate(nit=proveedor_nit, nombre=proveedor_nombre)
            )
        
        if proveedor:
            # Create factura
            factura_data = schemas.FacturaCreate(
                proveedor_id=proveedor.id,
                numero_factura=numero_factura,
                fecha_factura=parsed_fecha_factura,
                fecha_vencimiento=parsed_fecha_vencimiento,
                valor=valor,
                url_factura=url_factura,
                observaciones=observaciones,
                estado='PENDIENTE'
            )
            
            factura_created = await crud.create_factura(db, factura_data)
    
    return {
        "ok": True,
        "message": "Factura procesada correctamente",
        "file_saved": url_factura is not None,
        "file_url": url_factura,
        "webhook_notified": True if file else False,
        "factura_id": factura_created.id if factura_created else None,
        "factura": factura_created
    }


@router.post("/facturas/upload-pdf")
async def upload_factura_pdf(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a PDF file for OCR processing by n8n.
    
    Returns an upload_id that can be used to poll for processing status.
    The frontend should poll /facturas/upload-status/{upload_id} to check when
    n8n has finished processing the invoice.
    
    Flow:
    1. Frontend uploads PDF -> gets upload_id
    2. Backend saves PDF and notifies webhook with upload_id
    3. n8n processes the PDF (OCR, extraction)
    4. n8n calls /facturas/crear-con-oficina with upload_id in the request
    5. Backend creates factura and updates upload status to COMPLETED
    6. Frontend polls /facturas/upload-status/{upload_id} and sees COMPLETED
    """
    import models
    from sqlalchemy.future import select
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")
    
    # Generate unique upload_id
    upload_id = str(uuid.uuid4())
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{upload_id[:8]}_{file.filename}"
    
    # Create full path
    file_path = os.path.join(INVOICE_UPLOAD_PATH, safe_filename)
    url_factura = f"file://192.168.2.20/Facturas/temp/{safe_filename}"
    
    # Create upload tracking record
    upload_record = models.FacturaUpload(
        upload_id=upload_id,
        filename=safe_filename,
        original_filename=file.filename,
        file_path=file_path,
        file_url=url_factura,
        status='UPLOADING'
    )
    db.add(upload_record)
    await db.commit()
    
    # Check if directory exists and save file
    try:
        if not os.path.exists(INVOICE_UPLOAD_PATH):
            os.makedirs(INVOICE_UPLOAD_PATH, exist_ok=True)
        
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Update status to PROCESSING
        upload_record.status = 'PROCESSING'
        await db.commit()
        
    except Exception as e:
        # Update status to ERROR
        upload_record.status = 'ERROR'
        upload_record.error_message = str(e)
        await db.commit()
        
        raise HTTPException(
            status_code=500, 
            detail=f"Error guardando archivo: {str(e)}"
        )
    
    # Notify webhook with upload_id
    webhook_success = False
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            webhook_data = {
                "event": "invoice_uploaded",
                "upload_id": upload_id,  # Important! n8n needs this to update status
                "file_path": file_path,
                "file_url": url_factura,
                "filename": safe_filename,
                "original_filename": file.filename,
                "uploaded_at": datetime.now().isoformat()
            }
            
            response = await client.post(WEBHOOK_URL, json=webhook_data)
            webhook_success = response.status_code in [200, 201, 202]
            
    except Exception as e:
        print(f"Warning: Webhook notification failed: {e}")
        # Don't fail - just mark as error in record
        upload_record.error_message = f"Webhook failed: {e}"
        await db.commit()
    
    return {
        "ok": True,
        "upload_id": upload_id,
        "message": "Archivo subido, procesando...",
        "filename": safe_filename,
        "webhook_notified": webhook_success
    }


@router.get("/facturas/upload-status/{upload_id}")
async def get_upload_status(
    upload_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Check the status of a PDF upload/processing.
    
    Statuses:
    - UPLOADING: File is being uploaded
    - PROCESSING: File uploaded, n8n is processing
    - COMPLETED: n8n finished, factura created
    - ERROR: Something went wrong
    
    When status is COMPLETED, the response includes the created factura.
    """
    import models
    from sqlalchemy.future import select
    from sqlalchemy.orm import selectinload
    
    result = await db.execute(
        select(models.FacturaUpload).filter(models.FacturaUpload.upload_id == upload_id)
    )
    upload = result.scalars().first()
    
    if not upload:
        raise HTTPException(status_code=404, detail="Upload no encontrado")
    
    response = {
        "upload_id": upload.upload_id,
        "status": upload.status,
        "filename": upload.original_filename,
        "created_at": upload.created_at.isoformat() if upload.created_at else None,
        "processed_at": upload.processed_at.isoformat() if upload.processed_at else None,
        "error_message": upload.error_message
    }
    
    # If completed, include factura details
    if upload.status == 'COMPLETED' and upload.factura_id:
        factura = await crud.get_factura(db, upload.factura_id)
        if factura:
            response["factura"] = {
                "id": factura.id,
                "numero_factura": factura.numero_factura,
                "proveedor_nombre": factura.proveedor.nombre if factura.proveedor else None,
                "proveedor_nit": factura.proveedor.nit if factura.proveedor else None,
                "valor": float(factura.valor) if factura.valor else None,
                "estado": factura.estado,
                "oficinas_count": len(factura.oficinas_asignadas) if factura.oficinas_asignadas else 0
            }
    
    return response


@router.post("/facturas/upload-complete/{upload_id}")
async def complete_upload(
    upload_id: str,
    factura_id: int = Query(None, description="ID of the created factura"),
    status: str = Query("COMPLETED", description="COMPLETED or ERROR"),
    error_message: str = Query(None, description="Error message if status is ERROR"),
    db: AsyncSession = Depends(get_db)
):
    """
    Called by n8n to update the upload status when processing is complete.
    
    n8n should call this endpoint after creating the factura via /facturas/crear-con-oficina.
    """
    import models
    from sqlalchemy.future import select
    
    result = await db.execute(
        select(models.FacturaUpload).filter(models.FacturaUpload.upload_id == upload_id)
    )
    upload = result.scalars().first()
    
    if not upload:
        raise HTTPException(status_code=404, detail="Upload no encontrado")
    
    upload.status = status
    upload.processed_at = datetime.now()
    
    if factura_id:
        upload.factura_id = factura_id
    
    if error_message:
        upload.error_message = error_message
    
    await db.commit()
    
    return {
        "ok": True,
        "upload_id": upload_id,
        "status": status,
        "factura_id": factura_id
    }

