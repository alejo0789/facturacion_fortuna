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
from decimal import Decimal
import logging
import os
import httpx
import img2pdf
from PIL import Image
import io
import uuid
import zipfile
import tempfile
import models, schemas, crud
from database import get_db
from core.dependencies import get_current_empresa, get_current_user
from services.causacion import crear_asiento_causacion_factura
from services.pago import crear_asiento_pago_factura, CUENTA_PROVEEDORES_DEFAULT
from services.integraciones_n8n import (
    get_upload_config,
    build_upload_payload,
    call_upload_webhook,
    file_url_from_storage,
    LEGACY_INVOICE_PATH,
    LEGACY_WEBHOOK_URL,
)
from sqlalchemy import select, func as sqlfunc
from models_contabilidad import AsientoContable, LineaAsiento

# Helper compatible con cambio del compañero: alias `func` apunta a `sqlfunc`
# (el compañero importó `from sqlalchemy import select, func` para detectar
# duplicados; preservamos ese nombre sin doble-import).
func = sqlfunc

logger = logging.getLogger(__name__)

router = APIRouter()


async def _generar_asiento_causacion_safe(
    *,
    empresa_id: int,
    factura,
    proveedor_nit: Optional[str],
    tiene_iva: bool,
    aplica_retefuente: bool,
    user_id: Optional[int],
    db: AsyncSession,
    aplica_reteiva: bool = False,
    aplica_reteica: bool = False,
    concepto_dian: Optional[str] = None,
    centro_costo: Optional[str] = None,
) -> dict:
    """
    Envuelve `crear_asiento_causacion_factura` de forma defensiva.

    Si algo falla (periodo cerrado, cuentas PUC no sembradas, valor nulo, etc.)
    devuelve un dict con el error pero NO rompe el flujo de creación de factura.
    La factura ya está persistida antes de llamar a esta función.
    """
    # Sin NIT no hay forma de anclar el asiento al tercero
    if not proveedor_nit:
        return {"creado": False, "razon": "Sin NIT de proveedor, no se generó asiento de causación"}

    if not factura.valor or Decimal(factura.valor) <= 0:
        return {"creado": False, "razon": "Factura sin valor, no se generó asiento de causación"}

    fecha = factura.fecha_factura or date.today()
    descripcion = (
        f"Causación factura {factura.numero_factura or factura.id} - NIT {proveedor_nit}"
    )

    # Si la factura trae IVA explícito (típico desde n8n del compañero),
    # derivamos el rate efectivo y se lo pasamos al servicio para que la
    # causación cuadre con lo que el OCR/n8n vio en el PDF, en vez de
    # aplicar la tarifa default de la empresa.
    iva_rate_override = None
    factura_iva = getattr(factura, "iva", None)
    if tiene_iva and factura_iva is not None and Decimal(factura_iva) > 0:
        try:
            valor_total_dec = Decimal(factura.valor)
            valor_iva_dec = Decimal(factura_iva)
            valor_base_dec = valor_total_dec - valor_iva_dec
            if valor_base_dec > 0:
                # rate efectivo = iva / base * 100
                iva_rate_override = (valor_iva_dec / valor_base_dec * Decimal("100")).quantize(Decimal("0.01"))
        except Exception:
            iva_rate_override = None  # cualquier fallo de cálculo → tarifa default

    try:
        asiento = await crear_asiento_causacion_factura(
            empresa_id=empresa_id,
            factura_id=factura.id,
            fecha_factura=fecha,
            proveedor_nit=proveedor_nit,
            valor_total=Decimal(factura.valor),
            tiene_iva=tiene_iva,
            aplica_retefuente=aplica_retefuente,
            aplica_reteiva=aplica_reteiva,
            aplica_reteica=aplica_reteica,
            concepto_dian=concepto_dian,
            centro_costo=centro_costo,
            descripcion=descripcion,
            user_id=user_id,
            db=db,
            iva_rate_override=iva_rate_override,
        )
        await db.commit()
        return {
            "creado": True,
            "asiento_id": asiento.id,
            "asiento_numero": asiento.numero,
            "periodo_id": asiento.periodo_id,
        }
    except Exception as e:
        # No rompemos la factura: rollback sólo del asiento y seguimos
        try:
            await db.rollback()
        except Exception:
            pass
        logger.warning(
            "Falló causación automática de factura %s (empresa=%s): %s",
            factura.id,
            empresa_id,
            e,
        )
        return {"creado": False, "razon": f"Error generando asiento: {e}"}

# Configuration for invoice uploads — fallback legacy
# La configuración real ahora se resuelve por empresa vía
# services.integraciones_n8n.get_upload_config(empresa). Estas constantes
# quedan solo como fallback para empresas que aún no configuraron su panel
# (ver migración 007_integraciones_n8n.sql).
INVOICE_UPLOAD_PATH = LEGACY_INVOICE_PATH
WEBHOOK_URL = LEGACY_WEBHOOK_URL




# --- Main Factura Endpoints ---

@router.post("/facturas/", response_model=schemas.Factura)
async def create_factura_api(
    factura: schemas.FacturaCreateAPI,
    empresa=Depends(get_current_empresa),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new factura via API.

    You can provide either:
    - proveedor_id: ID of existing proveedor
    - proveedor_nit: NIT to find existing proveedor (or create new one if proveedor_nombre is also provided)

    The factura will be created with estado='PENDIENTE'.
    Oficina and contrato can be assigned manually later.

    Si `generar_asiento=True` (default) y hay NIT + valor, se registra
    automáticamente el asiento contable CAUSACION en estado BORRADOR.
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
        iva=factura.iva,
        url_factura=factura.url_factura,
        observaciones=factura.observaciones,
        estado='PENDIENTE'
    )

    factura_creada = await crud.create_factura(db, factura_data, empresa_id=empresa.id)

    # Causación contable automática (best-effort, no bloquea la factura)
    if factura.generar_asiento:
        await _generar_asiento_causacion_safe(
            empresa_id=empresa.id,
            factura=factura_creada,
            proveedor_nit=proveedor.nit,
            tiene_iva=bool(factura.tiene_iva),
            aplica_retefuente=bool(factura.aplica_retefuente),
            aplica_reteiva=bool(getattr(factura, 'aplica_reteiva', False)),
            aplica_reteica=bool(getattr(factura, 'aplica_reteica', False)),
            concepto_dian=getattr(factura, 'concepto_dian', None),
            user_id=getattr(current_user, "id", None),
            db=db,
        )

    return factura_creada


@router.post("/facturas/crear-con-oficina")
async def create_factura_con_oficinas(
    request: schemas.FacturaCreateConOficinas,
    empresa=Depends(get_current_empresa),
    current_user=Depends(get_current_user),
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
                        ),
                        empresa_id=empresa.id,
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
        
        # Step 2: Create factura
        try:
            factura_data = schemas.FacturaCreate(
                proveedor_id=proveedor_id,
                numero_factura=request.numero_factura,
                cufe=request.cufe,
                fecha_factura=request.fecha_factura,
                fecha_vencimiento=request.fecha_vencimiento,
                valor=request.valor,
                iva=request.iva,
                url_factura=request.url_factura,
                observaciones=request.observaciones,
                estado='PENDIENTE' if not request.oficinas else 'ASIGNADA'
            )
            
            factura = await crud.create_factura(db, factura_data, empresa_id=empresa.id)
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

        # Causación contable automática (best-effort)
        asiento_info = None
        if request.generar_asiento and request.proveedor_nit:
            # Si la factura está asignada a una sola oficina, usarla como
            # centro de costo del asiento (para reportes por sede).
            cc = None
            if request.oficinas and len(request.oficinas) == 1:
                cc = request.oficinas[0].cod_oficina

            asiento_info = await _generar_asiento_causacion_safe(
                empresa_id=empresa.id,
                factura=factura,
                proveedor_nit=request.proveedor_nit,
                tiene_iva=bool(request.tiene_iva),
                aplica_retefuente=bool(request.aplica_retefuente),
                aplica_reteiva=bool(getattr(request, 'aplica_reteiva', False)),
                aplica_reteica=bool(getattr(request, 'aplica_reteica', False)),
                concepto_dian=getattr(request, 'concepto_dian', None),
                centro_costo=cc,
                user_id=getattr(current_user, "id", None),
                db=db,
            )
            if not asiento_info.get("creado") and asiento_info.get("razon"):
                warnings.append(f"Causación: {asiento_info['razon']}")

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
                "iva": str(factura.iva) if factura.iva is not None else None,
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
            "asiento_contable": asiento_info,
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
    oficina_id: Optional[int] = Query(None, description="Filtrar por oficina asignada"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    usar_fecha_estado: bool = Query(False, description="Si True, filtra por fecha de cambio de estado en vez de fecha de recepción"),
    solo_pendientes: bool = Query(False, description="Solo mostrar facturas sin contrato asignado"),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db)
):
    """
    List facturas with optional filters. Filtra por empresa activa (multi-tenant).
    """
    facturas_models = await crud.get_facturas(
        db, skip=skip, limit=limit, search=search,
        estado=estado, proveedor_id=proveedor_id,
        solo_pendientes=solo_pendientes,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
        oficina_id=oficina_id,
        usar_fecha_estado=usar_fecha_estado,
        empresa_id=empresa.id,
    )
    
    # Check for duplicates in the current results
    # A factura is duplicate if there's another one with same proveedor_id and numero_factura
    # that is NOT null/empty.
    
    # Efficiently find all duplicates for these providers in one go
    prov_ids = list(set(f.proveedor_id for f in facturas_models))
    nums = list(set(f.numero_factura for f in facturas_models if f.numero_factura))
    
    duplicate_counts = {}
    if nums:
        # select proveedor_id, numero_factura, count(*) from facturas 
        # where proveedor_id in (...) and numero_factura in (...)
        # group by proveedor_id, numero_factura having count(*) > 1
        dup_query = (
            select(models.Factura.proveedor_id, models.Factura.numero_factura, func.count(models.Factura.id))
            .filter(models.Factura.proveedor_id.in_(prov_ids))
            .filter(models.Factura.numero_factura.in_(nums))
            .group_by(models.Factura.proveedor_id, models.Factura.numero_factura)
        )
        dup_res = await db.execute(dup_query)
        for p_id, f_num, count in dup_res.all():
            if count > 1:
                duplicate_counts[(p_id, f_num)] = True

    # Enrich with file info and duplicate flag
    enriched = []
    for f in facturas_models:
        schema_obj = enrich_factura_with_file_info(f)
        if f.numero_factura and (f.proveedor_id, f.numero_factura) in duplicate_counts:
            schema_obj.es_duplicada = True
        else:
            schema_obj.es_duplicada = False
        enriched.append(schema_obj)
        
    return enriched


@router.get("/facturas/{factura_id}", response_model=schemas.Factura)
async def get_factura(factura_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single factura by ID"""
    factura = await crud.get_factura(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    schema_obj = enrich_factura_with_file_info(factura)
    
    # Check if duplicate exists
    if factura.numero_factura:
        dup_query = (
            select(func.count(models.Factura.id))
            .filter(models.Factura.proveedor_id == factura.proveedor_id)
            .filter(models.Factura.numero_factura == factura.numero_factura)
        )
        dup_count = await db.execute(dup_query)
        schema_obj.es_duplicada = dup_count.scalar() > 1
    else:
        schema_obj.es_duplicada = False
        
    return schema_obj


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
    cuenta_banco_codigo: Optional[str] = Query(
        None,
        description="Código PUC del banco/caja a acreditar (solo al pasar a PAGADA). "
                    "Si se omite, se usa la primera CuentaBancaria activa o 111005 por default.",
    ),
    generar_asiento: bool = Query(
        True,
        description="Si True y el nuevo estado es PAGADA, genera el asiento contable de PAGO.",
    ),
    db: AsyncSession = Depends(get_db),
    empresa=Depends(get_current_empresa),
    current_user=Depends(get_current_user),
):
    """Change the estado of a factura. When transitioning to PAGADA, generates
    the corresponding PAGO journal entry (DB Proveedores / CR Banco)."""
    factura = await crud.get_factura(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if nuevo_estado not in ['PENDIENTE', 'ASIGNADA', 'EN_TRAMITE', 'PAGADA']:
        raise HTTPException(status_code=400, detail="Estado inválido")

    estado_anterior = factura.estado
    if factura.estado != nuevo_estado:
        factura.estado = nuevo_estado
        factura.status_updated_at = datetime.now()
    await db.commit()

    asiento_info: dict = {"creado": False}

    # Solo generamos asiento si es transición real a PAGADA y el caller lo pidió
    if (
        generar_asiento
        and nuevo_estado == "PAGADA"
        and estado_anterior != "PAGADA"
    ):
        asiento_info = await _generar_asiento_pago_safe(
            empresa_id=empresa.id,
            factura=factura,
            cuenta_banco_codigo=cuenta_banco_codigo,
            user_id=getattr(current_user, "id", None),
            db=db,
        )

    factura_actualizada = await crud.get_factura(db, factura_id)
    # `get_factura` retorna el ORM; lo devolvemos tal cual y adjuntamos info del asiento
    # en el header de respuesta por medio de un dict wrapper no sería compatible con el
    # tipo de retorno anterior, así que se retorna solo el log en el response body
    # cuando se genera asiento.
    if asiento_info.get("creado"):
        logger.info(
            "Asiento PAGO creado id=%s para factura_id=%s",
            asiento_info.get("asiento_id"),
            factura_id,
        )
    elif asiento_info.get("razon"):
        logger.info(
            "No se generó asiento de pago para factura_id=%s: %s",
            factura_id,
            asiento_info["razon"],
        )

    return factura_actualizada


async def _calcular_neto_pago_desde_causacion(
    *,
    empresa_id: int,
    factura_id: int,
    proveedor_nit: str,
    db: AsyncSession,
    cuenta_proveedor_codigo: str = CUENTA_PROVEEDORES_DEFAULT,
) -> Optional[Decimal]:
    """
    Devuelve el saldo CR neto que la(s) causación(es) de la factura dejaron
    en la cuenta de proveedores para el NIT dado, o None si no existe ninguna.

    Esta es la fuente de verdad del "neto a pagar": cierra exactamente la
    CxP que abrió la causación, sin importar qué retenciones se aplicaron.

    Suma sólo asientos no-anulados (BORRADOR + APROBADO) para que también
    funcione si el contador no aprobó todavía la causación.
    """
    stmt = (
        select(
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.credito - LineaAsiento.debito), 0)
        )
        .select_from(LineaAsiento)
        .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
        .where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.factura_id == factura_id,
            AsientoContable.tipo == "CAUSACION",
            AsientoContable.estado != "ANULADO",
            LineaAsiento.cuenta_codigo == cuenta_proveedor_codigo,
            LineaAsiento.nit_tercero == proveedor_nit,
        )
    )
    saldo = (await db.execute(stmt)).scalar_one()
    saldo = Decimal(saldo or 0)
    return saldo if saldo > 0 else None


async def _generar_asiento_pago_safe(
    *,
    empresa_id: int,
    factura,
    cuenta_banco_codigo: Optional[str],
    user_id: Optional[int],
    db: AsyncSession,
) -> dict:
    """Envuelve la creación del asiento de pago con manejo de errores.

    Nunca lanza: devuelve {creado: bool, razon?: str, asiento_id?: int}.
    """
    proveedor_nit = None
    if factura.proveedor_id:
        # factura.proveedor puede no estar cargado; refrescamos mínimo lo necesario
        proveedor = await crud.get_proveedor(db, factura.proveedor_id) if hasattr(crud, "get_proveedor") else None
        if proveedor and getattr(proveedor, "nit", None):
            proveedor_nit = proveedor.nit
        elif getattr(factura, "proveedor", None) and getattr(factura.proveedor, "nit", None):
            proveedor_nit = factura.proveedor.nit

    if not proveedor_nit:
        return {"creado": False, "razon": "Sin NIT de proveedor"}
    if not factura.valor or Decimal(factura.valor) <= 0:
        return {"creado": False, "razon": "Factura sin valor positivo"}

    # Calcular el NETO a pagar leyendo la causación previa.
    # Razón: la causación crea CR Proveedores (220505) por el bruto MENOS las
    # retenciones. Si el pago usa `factura.valor` (bruto) deja un débito
    # residual en 220505 igual al total de retenciones. La fuente de verdad
    # del "neto a pagar al proveedor" es la línea CR del asiento CAUSACION.
    valor_neto = await _calcular_neto_pago_desde_causacion(
        empresa_id=empresa_id,
        factura_id=factura.id,
        proveedor_nit=proveedor_nit,
        db=db,
    )
    if valor_neto is None:
        # Fallback (no hay causación previa): usa el bruto. No es ideal pero
        # mantiene el flujo operativo si alguien marcó PAGADA antes de causar.
        valor_neto = Decimal(factura.valor)

    fecha = date.today()
    descripcion = (
        f"Pago factura {factura.numero_factura or factura.id} - NIT {proveedor_nit}"
    )

    try:
        asiento = await crear_asiento_pago_factura(
            empresa_id=empresa_id,
            factura_id=factura.id,
            fecha_pago=fecha,
            valor_pagado=valor_neto,
            proveedor_nit=proveedor_nit,
            descripcion=descripcion,
            user_id=user_id,
            db=db,
            cuenta_banco_codigo=cuenta_banco_codigo,
        )
        await db.commit()
        return {"creado": True, "asiento_id": asiento.id, "numero": asiento.numero}
    except Exception as e:
        await db.rollback()
        logger.warning("Error generando asiento de pago factura_id=%s: %s", factura.id, e)
        return {"creado": False, "razon": f"Error generando asiento: {e}"}


# --- Statistics ---

@router.get("/facturas/stats/resumen")
async def resumen_facturas(db: AsyncSession = Depends(get_db)):
    """Get summary statistics for facturas"""
    from datetime import datetime
    
    today = datetime.now()
    
    # Total counts by status (all time) - used for pendientes sin oficina
    counts_total = await crud.get_facturas_status_counts(db)
    
    # Monthly counts - used for En Trámite and Pagadas counters (current month)
    counts_mes = await crud.get_facturas_status_counts_mes(db, today.year, today.month)
    
    pendientes = counts_total.get('PENDIENTE', 0)
    asignadas = counts_total.get('ASIGNADA', 0)
    en_tramite_mes = counts_mes.get('EN_TRAMITE', 0)
    pagadas_mes = counts_mes.get('PAGADA', 0)
    total = pendientes + asignadas + counts_total.get('EN_TRAMITE', 0) + counts_total.get('PAGADA', 0)
    
    # Calculate missing invoices for this month
    missing_contracts = await crud.get_contratos_pendientes_por_llegar(db, today.year, today.month)
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
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload an invoice PDF manually or create an invoice with manual data.
    Multi-tenant: storage path y webhook se leen de la empresa activa.

    - Si llega PDF, se guarda en empresa.storage_path y se notifica al webhook
      empresa.n8n_webhook_url con la api_key + credential OpenAI del tenant.
    - Si no llega archivo, se crea la factura solo con los datos manuales.
    """
    cfg = get_upload_config(empresa)
    url_factura = None
    webhook_status = None

    # Handle PDF file upload
    if file and file.filename:
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        safe_filename = f"{timestamp}_{unique_id}_{file.filename}"

        file_path = os.path.join(cfg.storage_path, safe_filename)

        try:
            if not os.path.exists(cfg.storage_path):
                os.makedirs(cfg.storage_path, exist_ok=True)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"No se puede acceder a la carpeta de destino: {cfg.storage_path}. Error: {str(e)}",
            )

        try:
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)
            url_factura = file_url_from_storage(cfg.storage_path, safe_filename)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error guardando archivo: {str(e)}")

        # Notify webhook (best-effort: el upload no falla si el webhook falla)
        try:
            webhook_data = build_upload_payload(
                cfg=cfg,
                file_path=file_path,
                file_url=url_factura,
                safe_filename=safe_filename,
                original_filename=file.filename,
                uploaded_at_iso=datetime.now().isoformat(),
                extras={
                    "proveedor_nit": proveedor_nit,
                    "numero_factura": numero_factura,
                },
            )
            response = await call_upload_webhook(cfg, webhook_data, timeout=30.0)
            webhook_status = response.status_code
        except Exception as e:
            logger.warning("Webhook notification failed: %s", e)
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
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a PDF file for OCR processing by n8n. Multi-tenant.

    Sincrónico — espera la respuesta de n8n (timeout 120s). El webhook URL,
    la api_key y la credencial OpenAI se resuelven por empresa (ver
    services.integraciones_n8n.get_upload_config).

    Flow:
    1. Frontend uploads PDF (JWT identifica empresa activa)
    2. Backend guarda el PDF en empresa.storage_path
    3. Backend dispara el webhook empresa.n8n_webhook_url con apiKey +
       openai_credential_id del tenant
    4. n8n procesa con la credencial OpenAI del tenant y responde
    5. Backend devuelve el resultado

    n8n responde con JSON:
    - Success: {"success": true, "factura_id": 123, "factura": {...}}
    - Error:   {"success": false, "error": "..."}
    """
    # Resolver config n8n de la empresa activa
    cfg = get_upload_config(empresa)

    # Validate file type and prepare filename
    filename = file.filename.lower()
    is_image = filename.endswith(('.jpg', '.jpeg', '.png'))

    if not (filename.endswith('.pdf') or is_image):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF, JPG o PNG")

    # Generate unique filename (always .pdf for storage)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]

    original_name_base = os.path.splitext(file.filename)[0]
    safe_filename = f"{timestamp}_{unique_id}_{original_name_base}.pdf"

    # Create full path (usa empresa.storage_path con fallback a legacy)
    file_path = os.path.join(cfg.storage_path, safe_filename)
    url_factura = file_url_from_storage(cfg.storage_path, safe_filename)

    # Check if directory exists and save/convert file
    try:
        if not os.path.exists(cfg.storage_path):
            os.makedirs(cfg.storage_path, exist_ok=True)

        content = await file.read()

        if is_image:
            image = Image.open(io.BytesIO(content))
            if image.mode == 'RGBA':
                image = image.convert('RGB')
            image.save(file_path, "PDF", resolution=100.0)
        else:
            with open(file_path, "wb") as f:
                f.write(content)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error procesando archivo: {str(e)}"
        )

    # Call webhook and WAIT for n8n response (timeout 120 seconds for OCR processing)
    try:
        webhook_data = build_upload_payload(
            cfg=cfg,
            file_path=file_path,
            file_url=url_factura,
            safe_filename=safe_filename,
            original_filename=file.filename,
            uploaded_at_iso=datetime.now().isoformat(),
        )
        response = await call_upload_webhook(cfg, webhook_data, timeout=120.0)

        # Check if n8n responded successfully
        if response.status_code in [200, 201, 202]:
            try:
                n8n_result = response.json()

                # n8n returned success
                if n8n_result.get("success"):
                    return {
                        "ok": True,
                        "message": "Factura procesada correctamente",
                        "file_url": url_factura,
                        "filename": safe_filename,
                        "factura_id": n8n_result.get("factura_id"),
                        "factura": n8n_result.get("factura"),
                        "n8n_response": n8n_result,
                    }
                # n8n returned an error
                return {
                    "ok": False,
                    "message": n8n_result.get("error", "Error procesando factura en n8n"),
                    "file_url": url_factura,
                    "filename": safe_filename,
                    "n8n_response": n8n_result,
                }
            except Exception:
                # n8n responded but not with valid JSON
                return {
                    "ok": True,
                    "message": "Archivo procesado (respuesta no JSON)",
                    "file_url": url_factura,
                    "filename": safe_filename,
                    "raw_response": response.text[:500],
                }

        # n8n returned error status
        return {
            "ok": False,
            "message": f"Error en n8n: HTTP {response.status_code}",
            "file_url": url_factura,
            "filename": safe_filename,
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
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a ZIP file containing multiple PDF invoices for OCR processing.
    Multi-tenant: storage path y webhook se resuelven por empresa activa.

    Each PDF in the ZIP will be:
    1. Extracted to empresa.storage_path
    2. Processed by n8n via empresa.n8n_webhook_url

    Returns a summary of processed files.
    """
    cfg = get_upload_config(empresa)
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
                    
                    # Save PDF to empresa.storage_path
                    file_path = os.path.join(cfg.storage_path, safe_filename)
                    url_factura = file_url_from_storage(cfg.storage_path, safe_filename)

                    if not os.path.exists(cfg.storage_path):
                        os.makedirs(cfg.storage_path, exist_ok=True)

                    with open(file_path, "wb") as f:
                        f.write(pdf_content)

                    # Call webhook for this PDF (multi-tenant)
                    try:
                        webhook_data = build_upload_payload(
                            cfg=cfg,
                            file_path=file_path,
                            file_url=url_factura,
                            safe_filename=safe_filename,
                            original_filename=original_filename,
                            uploaded_at_iso=datetime.now().isoformat(),
                            extras={"from_zip": True, "zip_filename": file.filename},
                        )
                        response = await call_upload_webhook(cfg, webhook_data, timeout=120.0)

                        if response.status_code in [200, 201, 202]:
                            try:
                                n8n_result = response.json()
                                if n8n_result.get("success"):
                                    results.append({
                                        "filename": original_filename,
                                        "status": "success",
                                        "factura_id": n8n_result.get("factura_id"),
                                        "message": "Procesado correctamente",
                                        "data": {
                                            "numero_factura": n8n_result.get("factura", {}).get("numero_factura"),
                                            "es_duplicada": n8n_result.get("factura", {}).get("es_duplicada", False),
                                        },
                                    })
                                else:
                                    errors.append({
                                        "filename": original_filename,
                                        "status": "error",
                                        "message": n8n_result.get("error", "Error en n8n"),
                                    })
                            except Exception:
                                results.append({
                                    "filename": original_filename,
                                    "status": "success",
                                    "message": "Archivo guardado (respuesta no JSON)",
                                })
                        else:
                            errors.append({
                                "filename": original_filename,
                                "status": "error",
                                "message": f"Error n8n: HTTP {response.status_code}",
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

