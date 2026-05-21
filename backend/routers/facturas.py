"""
Facturas Router - Robust invoice management module

Key features:
1. Create facturas with only proveedor (contract not required initially)
2. Manually assign oficina and auto-detect related contrato
3. Store invoice URL (received via API)
4. View invoice via URL or network share
5. Upload invoice PDF manually
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Header
from fastapi.responses import RedirectResponse, FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pathlib import Path
from urllib.parse import unquote
from datetime import datetime, date
import os
from dotenv import load_dotenv
import httpx

load_dotenv()
import img2pdf
from PIL import Image
import io
import uuid
import zipfile
import tempfile
import io
import schemas, crud
from database import get_db

# Image to PDF conversion support
try:
    from PIL import Image
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False
    print("Warning: Pillow not installed. Image to PDF conversion will not be available.")

router = APIRouter()

# Configuration for invoice uploads
INVOICE_UPLOAD_PATH = os.getenv("INVOICE_UPLOAD_PATH", r"\\192.168.2.20\Facturas\temp")
WEBHOOK_URL = os.getenv("N8N_UPLOAD_WEBHOOK", "https://saman.lafortuna.com.co/n8n/webhook/d15fc127-671d-4b24-8221-bac74a6f4648")

# Supported file types
PDF_EXTENSIONS = ['.pdf']
IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png']
SUPPORTED_EXTENSIONS = PDF_EXTENSIONS + IMAGE_EXTENSIONS


def convert_image_to_pdf(image_content: bytes, original_filename: str) -> tuple[bytes, str]:
    """
    Convert an image (JPG/PNG) to PDF format.
    
    Args:
        image_content: The raw bytes of the image file
        original_filename: Original filename for generating the PDF filename
        
    Returns:
        tuple: (pdf_bytes, new_filename_with_pdf_extension)
    """
    if not PILLOW_AVAILABLE:
        raise HTTPException(
            status_code=500, 
            detail="Pillow no está instalado. No se pueden convertir imágenes a PDF."
        )
    
    try:
        # Open the image from bytes
        image = Image.open(io.BytesIO(image_content))
        
        # Convert to RGB if necessary (PNG can have RGBA which PDF doesn't support well)
        if image.mode in ('RGBA', 'LA', 'P'):
            # Create white background
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Save as PDF to bytes buffer
        pdf_buffer = io.BytesIO()
        image.save(pdf_buffer, format='PDF', resolution=100.0)
        pdf_bytes = pdf_buffer.getvalue()
        
        # Generate new filename with .pdf extension
        base_name = os.path.splitext(original_filename)[0]
        new_filename = f"{base_name}.pdf"
        
        return pdf_bytes, new_filename
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error convirtiendo imagen a PDF: {str(e)}"
        )


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


@router.post("/facturas/crear-con-oficina")
async def create_factura_con_oficinas(
    request: schemas.FacturaCreateConOficinas,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new factura with optional oficina assignments using cod_oficina.
    
    ENDPOINT PARA AGENTE N8N - Respuestas de error detalladas incluidas.
    
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
    
    RESPUESTA EXITOSA:
    {
        "success": true,
        "factura_id": 123,
        "factura": {...},
        "proveedor_creado": false,
        "oficinas_asignadas": ["OF-001"],
        "oficinas_no_encontradas": ["OF-002"],
        "warnings": ["Oficina OF-002 no encontrada"]
    }
    
    RESPUESTA DE ERROR:
    {
        "success": false,
        "error_code": "PROVEEDOR_NOT_FOUND",
        "error_message": "Proveedor con NIT 123 no encontrado",
        "accion_sugerida": "Proporcionar proveedor_nombre para crear uno nuevo",
        "datos_recibidos": {...},
        "datos_guardados": {...}
    }
    """
    # Track progress for detailed error reporting
    progress = {
        "proveedor_encontrado": False,
        "proveedor_creado": False,
        "factura_creada": False,
        "oficinas_procesadas": False
    }
    datos_guardados = {}
    warnings = []
    
    try:
        # Step 1: Find or create proveedor (optional)
        proveedor_id = None
        proveedor = None
        
        if request.proveedor_nit:
            proveedor = await crud.get_proveedor_by_nit(db, request.proveedor_nit)
            
            if proveedor:
                proveedor_id = proveedor.id
                progress["proveedor_encontrado"] = True
                datos_guardados["proveedor"] = {
                    "id": proveedor.id,
                    "nit": proveedor.nit,
                    "nombre": proveedor.nombre,
                    "existia": True
                }
            elif request.proveedor_nombre:
                # Create new proveedor
                try:
                    proveedor = await crud.create_proveedor(
                        db, 
                        schemas.ProveedorCreate(
                            nit=request.proveedor_nit,
                            nombre=request.proveedor_nombre
                        )
                    )
                    proveedor_id = proveedor.id
                    progress["proveedor_creado"] = True
                    datos_guardados["proveedor"] = {
                        "id": proveedor.id,
                        "nit": proveedor.nit,
                        "nombre": proveedor.nombre,
                        "existia": False,
                        "recien_creado": True
                    }
                except Exception as e:
                    return {
                        "success": False,
                        "error_code": "PROVEEDOR_CREATE_ERROR",
                        "error_message": f"Error al crear proveedor: {str(e)}",
                        "accion_sugerida": "Verificar que el NIT no esté duplicado y que los datos del proveedor sean válidos. Intentar crear el proveedor manualmente primero.",
                        "datos_recibidos": {
                            "proveedor_nit": request.proveedor_nit,
                            "proveedor_nombre": request.proveedor_nombre
                        },
                        "datos_guardados": datos_guardados,
                        "progress": progress
                    }
            else:
                # Proveedor not found and no name to create
                return {
                    "success": False,
                    "error_code": "PROVEEDOR_NOT_FOUND",
                    "error_message": f"Proveedor con NIT '{request.proveedor_nit}' no encontrado en la base de datos",
                    "accion_sugerida": "Proporcionar el campo 'proveedor_nombre' para crear un nuevo proveedor automáticamente, o crear el proveedor manualmente antes de enviar la factura.",
                    "datos_recibidos": {
                        "proveedor_nit": request.proveedor_nit,
                        "numero_factura": request.numero_factura,
                        "valor": str(request.valor) if request.valor else None
                    },
                    "datos_guardados": datos_guardados,
                    "progress": progress,
                    "alternativa": "Puedes crear la factura sin proveedor omitiendo el campo proveedor_nit, y asignar el proveedor manualmente después."
                }
        
        # Step 1.5: Determine category based on email
        categoria_id = request.categoria_id
        email_to_check = request.remitente_email or x_user_email
        
        # If categoria_id is not provided or invalid (0), try to detect via email
        if (not categoria_id or categoria_id <= 0) and email_to_check:
            from routers.categorias import get_user_categoria_ids, is_super_admin
            # Try to automatically assign category based on the sender's email
            cat_ids = await get_user_categoria_ids(db, email=email_to_check.strip())
            
            if cat_ids:
                categoria_id = cat_ids[0]
                datos_guardados["categoria_autodetectada_por_email"] = True
            elif is_super_admin(identifier=email_to_check.strip()):
                # If it's a super admin but has no specific category assigned, 
                # assign to the first category available in the system so it's not orphan
                from sqlalchemy import select
                import models
                result = await db.execute(select(models.Categoria.id).order_by(models.Categoria.id))
                first_cat = result.scalars().first()
                if first_cat:
                    categoria_id = first_cat
                    datos_guardados["categoria_asignada_por_default_admin"] = True
            
            if categoria_id:
                datos_guardados["email_usado_para_cat"] = email_to_check.strip()
                datos_guardados["categoria_id"] = categoria_id
            else:
                warnings.append(f"No se encontró categoría para el correo: {email_to_check}")
        
        # Step 2: Create factura
        try:
            factura_data = schemas.FacturaCreate(
                proveedor_id=proveedor_id,
                numero_factura=request.numero_factura,
                cufe=request.cufe,
                fecha_factura=request.fecha_factura,
                fecha_vencimiento=request.fecha_vencimiento,
                valor=request.valor,
                url_factura=request.url_factura.strip() if request.url_factura else None,
                observaciones=request.observaciones,
                estado='PENDIENTE' if not request.oficinas else 'ASIGNADA',
                categoria_id=categoria_id
            )
            
            factura = await crud.create_factura(db, factura_data)
            
            # DEBUG: Add info to observations to trace in production
            debug_info = f" [Auth: {email_to_check or 'no-email'}, Cat: {categoria_id or 'none'}]"
            factura.observaciones = (factura.observaciones or "") + debug_info
            await db.commit()
            
            progress["factura_creada"] = True
            datos_guardados["factura"] = {
                "id": factura.id,
                "numero_factura": factura.numero_factura,
                "valor": str(factura.valor) if factura.valor else None,
                "estado": factura.estado
            }
        except Exception as e:
            return {
                "success": False,
                "error_code": "FACTURA_CREATE_ERROR",
                "error_message": f"Error al crear la factura: {str(e)}",
                "accion_sugerida": "Verificar que los campos de la factura tengan el formato correcto. Fechas deben ser YYYY-MM-DD, valor debe ser numérico.",
                "campos_problematicos": {
                    "fecha_factura": str(request.fecha_factura) if request.fecha_factura else None,
                    "fecha_vencimiento": str(request.fecha_vencimiento) if request.fecha_vencimiento else None,
                    "valor": str(request.valor) if request.valor else None
                },
                "datos_recibidos": {
                    "numero_factura": request.numero_factura,
                    "cufe": request.cufe,
                    "proveedor_nit": request.proveedor_nit
                },
                "datos_guardados": datos_guardados,
                "progress": progress
            }
        
        # Step 3: Assign oficinas if provided
        oficinas_asignadas = []
        oficinas_no_encontradas = []
        oficinas_con_error = []
        
        if request.oficinas:
            progress["oficinas_procesadas"] = True
            
            for of in request.oficinas:
                # Skip if cod_oficina is null/empty
                if not of.cod_oficina:
                    warnings.append(f"Se omitió una oficina con código vacío o nulo (valor: {of.valor})")
                    continue
                
                # Find oficina by cod_oficina
                try:
                    oficina = await crud.get_oficina_by_codigo(db, of.cod_oficina)
                    
                    if oficina:
                        # Case NIT 900154335 (WiFi SAS): ignore N8N value if we can fixed it to contract value
                        valor_asignar = float(of.valor)
                        nit_especial = "900154335" # WIFI SAS
                        
                        if request.proveedor_nit == nit_especial:
                            # Try to find the contract for this specific office to get its valor_mensual
                            contrato = await crud.find_contrato_by_proveedor_oficina(db, proveedor_id, oficina.id)
                            if contrato and contrato.valor_mensual:
                                valor_asignar = float(contrato.valor_mensual)
                                # Log the adjustment in facturas table if possible or warnings
                                warnings.append(f"Ajuste especial WIFI SAS: Oficina {of.cod_oficina} cargada con valor de contrato ({valor_asignar}) en lugar de valor extraído.")

                        # Add oficina to factura
                        await crud.add_oficina_to_factura(
                            db, factura.id, oficina.id, valor_asignar, None
                        )
                        oficinas_asignadas.append({
                            "cod_oficina": of.cod_oficina,
                            "oficina_id": oficina.id,
                            "oficina_nombre": oficina.nombre,
                            "valor": str(valor_asignar)
                        })
                    else:
                        oficinas_no_encontradas.append({
                            "cod_oficina": of.cod_oficina,
                            "valor": str(of.valor),
                            "razon": f"No existe oficina con código '{of.cod_oficina}' en la base de datos"
                        })
                        warnings.append(f"Oficina con código '{of.cod_oficina}' no encontrada - el valor {of.valor} no fue asignado")
                except Exception as e:
                    oficinas_con_error.append({
                        "cod_oficina": of.cod_oficina,
                        "valor": str(of.valor),
                        "error": str(e)
                    })
                    warnings.append(f"Error al asignar oficina '{of.cod_oficina}': {str(e)}")
            
            # Update factura observaciones with warnings about missing oficinas
            if oficinas_no_encontradas or oficinas_con_error:
                advertencias = []
                if oficinas_no_encontradas:
                    codigos = [o["cod_oficina"] for o in oficinas_no_encontradas]
                    advertencias.append(f"Oficinas no encontradas: {', '.join(codigos)}")
                if oficinas_con_error:
                    codigos = [o["cod_oficina"] for o in oficinas_con_error]
                    advertencias.append(f"Oficinas con error: {', '.join(codigos)}")
                
                nueva_obs = (factura.observaciones or "") + f" [ADVERTENCIA: {'; '.join(advertencias)}]"
                factura.observaciones = nueva_obs
                await db.commit()
        
        # Refresh factura to get updated relationships
        factura = await crud.get_factura(db, factura.id)
        
        # Build success response with detailed information
        response = {
            "success": True,
            "factura_id": factura.id,
            "factura": {
                "id": factura.id,
                "numero_factura": factura.numero_factura,
                "cufe": factura.cufe,
                "fecha_factura": str(factura.fecha_factura) if factura.fecha_factura else None,
                "fecha_vencimiento": str(factura.fecha_vencimiento) if factura.fecha_vencimiento else None,
                "valor": str(factura.valor) if factura.valor else None,
                "estado": factura.estado,
                "url_factura": factura.url_factura,
                "observaciones": factura.observaciones,
                "proveedor_id": factura.proveedor_id,
                "proveedor_nombre": factura.proveedor.nombre if factura.proveedor else None,
                "proveedor_nit": factura.proveedor.nit if factura.proveedor else None
            },
            "proveedor_creado": progress["proveedor_creado"],
            "oficinas_asignadas": oficinas_asignadas,
            "oficinas_no_encontradas": oficinas_no_encontradas,
            "oficinas_con_error": oficinas_con_error,
            "warnings": warnings if warnings else None,
            "progress": progress
        }
        
        # Add suggestions if there were issues with oficinas
        if oficinas_no_encontradas:
            response["accion_requerida"] = {
                "mensaje": "Algunas oficinas no fueron encontradas y sus valores no fueron asignados",
                "opciones": [
                    "1. Crear las oficinas faltantes en el sistema y luego asignarlas manualmente a la factura",
                    "2. Usar el endpoint PUT /api/facturas/{factura_id}/oficinas-multiples para asignar las oficinas correctas",
                    "3. Verificar que los códigos de oficina sean correctos consultando GET /api/oficinas/"
                ],
                "factura_url": f"/api/facturas/{factura.id}"
            }
        
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Catch any unexpected errors
        return {
            "success": False,
            "error_code": "UNEXPECTED_ERROR",
            "error_message": f"Error inesperado: {str(e)}",
            "error_type": type(e).__name__,
            "accion_sugerida": "Contactar al administrador del sistema. Este es un error no contemplado.",
            "datos_recibidos": {
                "proveedor_nit": request.proveedor_nit,
                "proveedor_nombre": request.proveedor_nombre,
                "numero_factura": request.numero_factura,
                "valor": str(request.valor) if request.valor else None,
                "oficinas_count": len(request.oficinas) if request.oficinas else 0
            },
            "datos_guardados": datos_guardados,
            "progress": progress,
            "nota": "Si se muestra progress.factura_creada=True, la factura fue creada pero hubo un error posterior. Puedes buscarla por numero_factura."
        }


def enrich_factura_with_file_info(factura: models.Factura) -> schemas.Factura:
    """Calculates the expected UNC path and checks if the file exists"""
    # Convert to Pydantic object first if it's a model
    if hasattr(factura, "__dict__"):
        factura_schema = schemas.Factura.model_validate(factura)
    else:
        factura_schema = factura

    if not factura_schema.url_factura:
        factura_schema.file_exists = False
        factura_schema.storage_path = "Sin URL asignada"
        return factura_schema

    url = factura_schema.url_factura
    unc_path = ""
    
    # Logic copied from ver_factura
    if url.startswith("file://"):
        path_part = url[7:]
        path_part = unquote(path_part)
        unc_path = "\\\\" + path_part.replace("/", "\\")
    elif url.startswith("\\\\"):
        unc_path = unquote(url)
    else:
        # HTTP or other
        unc_path = url

    factura_schema.storage_path = unc_path
    
    # Check if it's a local/network path and if it exists
    if unc_path.startswith("\\\\") or (len(unc_path) > 1 and unc_path[1] == ":"):
        try:
            factura_schema.file_exists = os.path.exists(unc_path)
        except:
            factura_schema.file_exists = False
    else:
        # For HTTP URLs we don't easily check existence here without a request
        factura_schema.file_exists = True # Assume true if it's a web URL for now
        
    return factura_schema


@router.get("/facturas/", response_model=List[schemas.Factura])
async def list_facturas(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    estado: Optional[str] = None,
    proveedor_id: Optional[int] = None,
    categoria_id: Optional[int] = Query(None, description="Filtrar por categoría"),
    oficina_id: Optional[int] = Query(None, description="Filtrar por oficina asignada"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    usar_fecha_estado: bool = Query(False, description="Si True, filtra por fecha de cambio de estado en vez de fecha de recepción"),
    solo_pendientes: bool = Query(False, description="Solo mostrar facturas sin contrato asignado"),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[int] = Header(None, alias="X-User-Rol-Id"),
    db: AsyncSession = Depends(get_db)
):
    """
    List facturas with optional filters.
    """
    # Check if user is super admin
    from routers.categorias import is_super_admin, get_user_categoria_ids
    
    # If not super admin, get allowed categories for this role
    allowed_categoria_ids = None
    if not is_super_admin(x_user_email, x_user_id):
        allowed_categoria_ids = await get_user_categoria_ids(db, rol_id=x_user_rol_id, email=x_user_email)
        # If categoria_id is specified, verify user has access
        if categoria_id and categoria_id not in allowed_categoria_ids:
            # Return empty - user doesn't have access to this category
            return []
    
    facturas_models = await crud.get_facturas(
        db, skip=skip, limit=limit, search=search, 
        estado=estado, proveedor_id=proveedor_id, 
        solo_pendientes=solo_pendientes,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
        oficina_id=oficina_id,
        categoria_id=categoria_id,
        allowed_categoria_ids=allowed_categoria_ids,
        usar_fecha_estado=usar_fecha_estado
    )
    
    # Enrich with file info
    return [enrich_factura_with_file_info(f) for f in facturas_models]


@router.get("/facturas/{factura_id}", response_model=schemas.Factura)
async def get_factura(factura_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single factura by ID"""
    factura = await crud.get_factura(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    return enrich_factura_with_file_info(factura)


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
    result = await crud.asignar_oficina_a_factura(db, factura_id, request.oficina_id, request.contrato_id)
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
            "contrato_id": o.contrato_id,
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
    nuevo_estado: str = Query(..., description="Nuevo estado: PENDIENTE, ASIGNADA, EN_TRAMITE, PAGADA"),
    db: AsyncSession = Depends(get_db)
):
    """Change the estado of a factura"""
    factura = await crud.get_factura(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    if nuevo_estado not in ['PENDIENTE', 'ASIGNADA', 'EN_TRAMITE', 'PAGADA']:
        raise HTTPException(status_code=400, detail="Estado inválido")
    
    # Use raw update to change estado
    if factura.estado != nuevo_estado:
        factura.estado = nuevo_estado
        factura.status_updated_at = datetime.now()
    await db.commit()
    
    return await crud.get_factura(db, factura_id)


# --- Statistics ---

@router.get("/facturas/stats/resumen")
async def resumen_facturas(
    categoria_id: Optional[int] = Query(None),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[str] = Header(None, alias="X-User-Rol-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Get summary statistics for facturas"""
    from datetime import datetime
    from routers.categorias import is_super_admin, get_user_categoria_ids
    
    today = datetime.now()
    
    # RBAC filtering
    allowed_categoria_ids = None
    user_id_int = int(x_user_id) if x_user_id else None
    rol_id_int = int(x_user_rol_id) if x_user_rol_id else None
    is_admin = is_super_admin(x_user_email, user_id_int, rol_id_int)
    
    if not is_admin:
        allowed_categoria_ids = await get_user_categoria_ids(db, rol_id=rol_id_int, email=x_user_email)
        # If category specified, ensure access
        if categoria_id and (allowed_categoria_ids is None or int(categoria_id) not in allowed_categoria_ids):
            return {
                "total": 0, "pendientes": 0, "asignadas": 0, "en_tramite": 0,
                "pagadas": 0, "pendientes_por_llegar": 0
            }

    # Final category filter (override allowed if admin, or restricted to specified)
    final_categoria_id = int(categoria_id) if categoria_id else None
    
    # Total counts by status (all time) - used for pendientes sin oficina
    counts_total = await crud.get_facturas_status_counts(db, allowed_categoria_ids=allowed_categoria_ids, categoria_id=final_categoria_id)
    
    # Monthly counts - used for En Trámite and Pagadas counters (current month)
    counts_mes = await crud.get_facturas_status_counts_mes(db, today.year, today.month, allowed_categoria_ids=allowed_categoria_ids, categoria_id=final_categoria_id)
    
    pendientes = counts_total.get('PENDIENTE', 0)
    asignadas = counts_total.get('ASIGNADA', 0)
    en_tramite_mes = counts_mes.get('EN_TRAMITE', 0)
    pagadas_mes = counts_mes.get('PAGADA', 0)
    total = pendientes + asignadas + counts_total.get('EN_TRAMITE', 0) + counts_total.get('PAGADA', 0)
    
    # Calculate missing invoices for this month
    missing_contracts = await crud.get_contratos_pendientes_por_llegar(db, today.year, today.month, allowed_categoria_ids=allowed_categoria_ids, categoria_id=final_categoria_id)
    pendientes_por_llegar = len(missing_contracts)
    
    return {
        "total": total,
        "sin_oficina": pendientes,
        "pendientes": pendientes,       # Sin oficina asignada (total histórico activo)
        "asignadas": asignadas,
        "en_tramite": en_tramite_mes,   # Solo del mes actual
        "pagadas": pagadas_mes,         # Solo del mes actual
        "pendientes_por_llegar": pendientes_por_llegar
    }


@router.get("/facturas/stats/contratos-pendientes", response_model=List[schemas.Contrato])
async def list_missing_contracts(
    categoria_id: Optional[int] = Query(None),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[str] = Header(None, alias="X-User-Rol-Id"),
    db: AsyncSession = Depends(get_db)
):
    """List contracts that have not sent an invoice in the current month"""
    from datetime import datetime
    from routers.categorias import is_super_admin, get_user_categoria_ids
    
    today = datetime.now()
    
    # RBAC filtering
    allowed_categoria_ids = None
    user_id_int = int(x_user_id) if x_user_id else None
    rol_id_int = int(x_user_rol_id) if x_user_rol_id else None
    is_admin = is_super_admin(x_user_email, user_id_int, rol_id_int)

    if not is_admin:
        allowed_categoria_ids = await get_user_categoria_ids(db, rol_id=rol_id_int, email=x_user_email)
        # If category specified, ensure access
        if categoria_id and (allowed_categoria_ids is None or int(categoria_id) not in allowed_categoria_ids):
            return []

    # Final category filter
    final_categoria_id = int(categoria_id) if categoria_id else None
        
    return await crud.get_contratos_pendientes_por_llegar(
        db, today.year, today.month, 
        allowed_categoria_ids=allowed_categoria_ids,
        categoria_id=final_categoria_id
    )


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
    categoria_id: Optional[int] = Form(None),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
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
    
    # Auto-detect category from email if not provided explicitly
    detected_categoria_id = categoria_id
    if not detected_categoria_id and x_user_email:
        from routers.categorias import get_user_categoria_ids
        cat_ids = await get_user_categoria_ids(db, email=x_user_email.strip())
        if cat_ids:
            detected_categoria_id = cat_ids[0]

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
                    "numero_factura": numero_factura,
                    "user_email": x_user_email,
                    "categoria_id": detected_categoria_id
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
                estado='PENDIENTE',
                categoria_id=detected_categoria_id
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
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a PDF or image file (JPG/PNG) for OCR processing by n8n.
    
    If an image is uploaded, it will be automatically converted to PDF before processing.
    This allows the n8n workflow to continue working with PDF-only filters.
    
    Supported formats: PDF, JPG, JPEG, PNG
    
    Flow:
    1. Frontend uploads PDF or image
    2. If image: convert to PDF automatically
    3. Backend saves PDF and calls webhook
    4. Backend WAITS for n8n to respond (up to 120 seconds)
    5. n8n processes the PDF (OCR, extraction), creates factura
    6. n8n responds with the result
    7. Backend returns the result to frontend
    
    n8n should respond with JSON:
    - Success: {"success": true, "factura_id": 123, "factura": {...}}
    - Error: {"success": false, "error": "Error message"}
    """
    original_filename = file.filename
    file_extension = os.path.splitext(original_filename)[1].lower()
    
    # Validate file type
    if file_extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Formato no soportado. Formatos permitidos: PDF, JPG, JPEG, PNG"
        )
    
    # Read file content
    content = await file.read()
    
    # Convert image to PDF if necessary
    was_converted = False
    if file_extension in IMAGE_EXTENSIONS:
        content, original_filename = convert_image_to_pdf(content, original_filename)
        was_converted = True
    
    # Generate unique filename (always .pdf at this point)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    safe_filename = f"{timestamp}_{unique_id}_{original_filename}"
    
    # Create full path
    file_path = os.path.join(INVOICE_UPLOAD_PATH, safe_filename)
    url_factura = f"file://192.168.2.20/Facturas/temp/{safe_filename}"
    
    # Check if directory exists and save/convert file
    try:
        if not os.path.exists(INVOICE_UPLOAD_PATH):
            os.makedirs(INVOICE_UPLOAD_PATH, exist_ok=True)
        
        with open(file_path, "wb") as f:
            f.write(content)
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error procesando archivo: {str(e)}"
        )
    
    # Call webhook and WAIT for n8n response (timeout 120 seconds for OCR processing)
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            webhook_data = {
                "event": "invoice_uploaded",
                "file_path": file_path,
                "file_url": url_factura,
                "filename": safe_filename,
                "original_filename": file.filename,
                "uploaded_at": datetime.now().isoformat(),
                "converted_from_image": was_converted,
                "original_format": file_extension.replace(".", "").upper() if was_converted else "PDF",
                "x_user_email": x_user_email
            }
            
            response = await client.post(WEBHOOK_URL, json=webhook_data)
            
            # Check if n8n responded successfully
            if response.status_code in [200, 201, 202]:
                try:
                    n8n_result = response.json()
                    
                    # n8n returned success
                    if n8n_result.get("success"):
                        return {
                            "ok": True,
                            "message": "Factura procesada correctamente" + (" (imagen convertida a PDF)" if was_converted else ""),
                            "file_url": url_factura,
                            "filename": safe_filename,
                            "converted_from_image": was_converted,
                            "factura_id": n8n_result.get("factura_id"),
                            "factura": n8n_result.get("factura"),
                            "n8n_response": n8n_result
                        }
                    else:
                        # n8n returned an error
                        return {
                            "ok": False,
                            "message": n8n_result.get("error", "Error procesando factura en n8n"),
                            "file_url": url_factura,
                            "filename": safe_filename,
                            "n8n_response": n8n_result
                        }
                except Exception as json_error:
                    # n8n responded but not with valid JSON
                    return {
                        "ok": True,
                        "message": "Archivo procesado (respuesta no JSON)",
                        "file_url": url_factura,
                        "filename": safe_filename,
                        "raw_response": response.text[:500]
                    }
            else:
                # n8n returned error status
                return {
                    "ok": False,
                    "message": f"Error en n8n: HTTP {response.status_code}",
                    "file_url": url_factura,
                    "filename": safe_filename
                }
            
    except httpx.TimeoutException:
        return {
            "ok": False,
            "message": "Timeout: n8n tardó demasiado en procesar (más de 120 segundos)",
            "file_url": url_factura,
            "filename": safe_filename
        }
    except Exception as e:
        return {
            "ok": False,
            "message": f"Error conectando con n8n: {str(e)}",
            "file_url": url_factura,
            "filename": safe_filename
        }


@router.post("/facturas/upload-zip")
async def upload_factura_zip(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a ZIP file containing multiple PDF invoices for OCR processing.
    
    Each PDF in the ZIP will be:
    1. Extracted to the upload folder
    2. Processed by n8n via webhook
    
    Returns a summary of processed files.
    """
    # Validate file type
    if not file.filename.lower().endswith('.zip'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos ZIP")
    
    results = []
    errors = []
    
    # Save ZIP to temp location and extract
    try:
        # Read ZIP content
        zip_content = await file.read()
        
        # Create a temporary file for the ZIP
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_zip:
            tmp_zip.write(zip_content)
            tmp_zip_path = tmp_zip.name
        
        # Extract PDFs from ZIP
        with zipfile.ZipFile(tmp_zip_path, 'r') as zip_ref:
            pdf_files = [f for f in zip_ref.namelist() if f.lower().endswith('.pdf') and not f.startswith('__MACOSX')]
            
            if not pdf_files:
                os.unlink(tmp_zip_path)
                raise HTTPException(status_code=400, detail="El archivo ZIP no contiene archivos PDF")
            
            for pdf_name in pdf_files:
                try:
                    # Extract PDF content
                    pdf_content = zip_ref.read(pdf_name)
                    
                    # Generate unique filename
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    unique_id = str(uuid.uuid4())[:8]
                    # Get just the filename without directory path
                    original_filename = os.path.basename(pdf_name)
                    safe_filename = f"{timestamp}_{unique_id}_{original_filename}"
                    
                    # Save PDF to upload folder
                    file_path = os.path.join(INVOICE_UPLOAD_PATH, safe_filename)
                    url_factura = f"file://192.168.2.20/Facturas/temp/{safe_filename}"
                    
                    # Ensure directory exists
                    if not os.path.exists(INVOICE_UPLOAD_PATH):
                        os.makedirs(INVOICE_UPLOAD_PATH, exist_ok=True)
                    
                    with open(file_path, "wb") as f:
                        f.write(pdf_content)
                    
                    # Call webhook for this PDF
                    try:
                        async with httpx.AsyncClient(timeout=120.0) as client:
                            webhook_data = {
                                "event": "invoice_uploaded",
                                "file_path": file_path,
                                "file_url": url_factura,
                                "filename": safe_filename,
                                "original_filename": original_filename,
                                "uploaded_at": datetime.now().isoformat(),
                                "from_zip": True,
                                "zip_filename": file.filename
                            }
                            
                            response = await client.post(WEBHOOK_URL, json=webhook_data)
                            
                            if response.status_code in [200, 201, 202]:
                                try:
                                    n8n_result = response.json()
                                    if n8n_result.get("success"):
                                        results.append({
                                            "filename": original_filename,
                                            "status": "success",
                                            "factura_id": n8n_result.get("factura_id"),
                                            "message": "Procesado correctamente"
                                        })
                                    else:
                                        errors.append({
                                            "filename": original_filename,
                                            "status": "error",
                                            "message": n8n_result.get("error", "Error en n8n")
                                        })
                                except:
                                    results.append({
                                        "filename": original_filename,
                                        "status": "success",
                                        "message": "Archivo guardado (respuesta no JSON)"
                                    })
                            else:
                                errors.append({
                                    "filename": original_filename,
                                    "status": "error",
                                    "message": f"Error n8n: HTTP {response.status_code}"
                                })
                                
                    except httpx.TimeoutException:
                        errors.append({
                            "filename": original_filename,
                            "status": "timeout",
                            "message": "Timeout procesando PDF"
                        })
                    except Exception as webhook_err:
                        errors.append({
                            "filename": original_filename,
                            "status": "error",
                            "message": f"Error webhook: {str(webhook_err)}"
                        })
                        
                except Exception as pdf_err:
                    errors.append({
                        "filename": pdf_name,
                        "status": "error",
                        "message": f"Error extrayendo PDF: {str(pdf_err)}"
                    })
        
        # Clean up temp ZIP
        os.unlink(tmp_zip_path)
        
        return {
            "ok": len(errors) == 0,
            "message": f"Procesados {len(results)} de {len(pdf_files)} archivos PDF",
            "total_pdfs": len(pdf_files),
            "successful": len(results),
            "failed": len(errors),
            "results": results,
            "errors": errors
        }
        
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="El archivo ZIP está corrupto o no es válido")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando ZIP: {str(e)}")


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

