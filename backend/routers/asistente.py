from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict
import httpx
import os
import uuid
from datetime import date, datetime, timedelta

router = APIRouter()

class SearchQuery(BaseModel):
    email: Optional[EmailStr] = None
    start_date: date
    end_date: date

class ProcessQuery(BaseModel):
    files: List[dict] 

class SearchResult(BaseModel):
    request_id: str
    status: str # "processing", "completed", "error"
    data: Optional[List[dict]] = None
    error: Optional[str] = None
    created_at: datetime

# In-memory storage for simplicity (could be Redis/DB in prod)
# Cleanup strategy: manually clear or TTL (omitted for brevity)
search_cache: Dict[str, SearchResult] = {}

# Webhook URLs
N8N_SEARCH_WEBHOOK = os.getenv("N8N_SEARCH_WEBHOOK", "https://your-n8n-instance.com/webhook/search-email")
N8N_PROCESS_WEBHOOK = os.getenv("N8N_PROCESS_WEBHOOK", "https://your-n8n-instance.com/webhook/process-email")

@router.post("/asistente/search")
async def search_emails_async(query: SearchQuery):
    """
    Inicia búsqueda asíncrona de correos via n8n.
    Retorna request_id para consultar estado.
    """
    request_id = str(uuid.uuid4())
    
    # Init cache entry
    search_cache[request_id] = SearchResult(
        request_id=request_id,
        status="processing",
        created_at=datetime.now()
    )

    # Sumar un día para que n8n incluya todo el día final (boundary exclusivo)
    end_date_inclusive = query.end_date + timedelta(days=1)

    payload = {
        "requestId": request_id, 
        "email": query.email,
        "startDate": query.start_date.isoformat(),
        "endDate": end_date_inclusive.isoformat(),
        # Callback URL for n8n to post back results
        # IMPORTANT: This must be accessible from the internet/n8n instance
        # If running locally, you need a tunnel like ngrok.
        # "callbackUrl": "https://your-api.com/api/asistente/callback" 
        # But we'll rely on n8n knowing the endpoint or configuring it via ENV
    }

    try:
        async with httpx.AsyncClient() as client:
            # Send to n8n (fire and forget / quick acknowledgement)
            # n8n webhook must be set to 'Respond Immediately'
            await client.post(
                N8N_SEARCH_WEBHOOK,
                json=payload,
                timeout=5.0 
            )
            return {"requestId": request_id, "status": "processing"}
            
    except Exception as e:
        search_cache[request_id].status = "error"
        search_cache[request_id].error = str(e)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/asistente/search/{request_id}")
async def get_search_result(request_id: str):
    if request_id not in search_cache:
        raise HTTPException(status_code=404, detail="Request ID not found")
    return search_cache[request_id]

import json

# ... (omitted)

@router.post("/asistente/callback/search-results")
async def receive_search_results(payload: dict):
    """
    Endpoint for n8n to push results back.
    Payload expected: { "requestId": "...", "files": [...] }
    """
    req_id = payload.get("requestId")
    if not req_id or req_id not in search_cache:
        # Log warning or just return 404
        raise HTTPException(status_code=404, detail="Unknown Request ID")
    
    files = payload.get("files", [])
    
    # Handle case where n8n sends JSON string instead of list
    if isinstance(files, str):
        try:
            files = json.loads(files)
        except json.JSONDecodeError:
            # If invalid JSON, fallback to empty list or keep as is (likely error state)
            files = []

    # Update cache
    search_cache[req_id].status = "completed"
    search_cache[req_id].data = files
    
    return {"status": "received"}

import shutil
import asyncio

# Configuration from facturas.py (replicated here)
INVOICE_UPLOAD_PATH = r"\\192.168.2.20\Facturas\temp"
TEMPORAL_FILES_PATH = r"\\192.168.2.20\Facturas\temp_buscador"
# ID del webhook de subida manual (tomado de facturas.py)
WEBHOOK_URL_MANUAL = "https://saman.lafortuna.com.co/n8n/webhook/d15fc127-671d-4b24-8221-bac74a6f4648"

async def process_single_file_task(file_info: dict, client: httpx.AsyncClient):
    """
    Tarea para procesar un solo archivo:
    Llamar al webhook de n8n usando el cliente proporcionado.
    El archivo YA debe estar en la carpeta de destino.
    """
    filename = file_info.get("filename")
    safe_filename = file_info.get("safe_filename")
    dest_path = file_info.get("dest_path")
    url_factura = file_info.get("url_factura")
    
    try:
        # Llamar al webhook
        webhook_data = {
            "event": "invoice_uploaded_via_search",
            "file_path": dest_path,
            "file_url": url_factura,
            "filename": safe_filename,
            "original_filename": filename,
            "uploaded_at": datetime.now().isoformat()
        }
        
        print(f"Enviando a n8n: {filename}...")
        response = await client.post(WEBHOOK_URL_MANUAL, json=webhook_data)
        
        if response.status_code >= 400:
            print(f"Error de n8n para {filename}: Status {response.status_code} - {response.text[:200]}")
        else:
            print(f"Archivo {filename} enviado correctamente. Status: {response.status_code}")
            
    except Exception as e:
        print(f"Excepción al enviar {filename} a n8n: {e}")

async def process_files_sequentially_task(files: List[dict]):
    """
    Procesa una lista de archivos:
    1. Los copia TODOS primero a la carpeta segura.
    2. Los envía uno por uno a n8n.
    """
    print(f"Iniciando fase 1: Copiando {len(files)} archivos a zona segura...")
    ready_files = []
    
    for file_info in files:
        filename = file_info.get("filename")
        try:
            storage_path = file_info.get("storage_path")
            if not storage_path: continue
                
            clean_storage_path = storage_path.replace("\\", "/").split("/")[-1]
            source_path = os.path.join(TEMPORAL_FILES_PATH, clean_storage_path)
            
            if not os.path.exists(source_path):
                print(f"Error: No se encontró {filename} en {source_path}")
                continue

            # Generar nombre único
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = str(uuid.uuid4())[:8]
            safe_filename = f"{timestamp}_{unique_id}_{filename}"
            
            dest_path = os.path.join(INVOICE_UPLOAD_PATH, safe_filename)
            url_factura = f"file://192.168.2.20/Facturas/temp/{safe_filename}"
            
            # Copiar inmediatamente
            await asyncio.to_thread(shutil.copy2, source_path, dest_path)
            
            # Guardar datos para la fase 2
            ready_files.append({
                **file_info,
                "safe_filename": safe_filename,
                "dest_path": dest_path,
                "url_factura": url_factura
            })
        except Exception as e:
            print(f"Error al poner a salvo {filename}: {e}")

    print(f"Fase 1 completada. {len(ready_files)} archivos listos para n8n.")
    
    if not ready_files:
        return

    print("Iniciando fase 2: Notificando a n8n secuencialmente...")
    async with httpx.AsyncClient(timeout=120.0) as client:
        for i, file_info in enumerate(ready_files):
            await process_single_file_task(file_info, client)
            # Retraso para no saturar n8n
            await asyncio.sleep(1.5)
            
    print("Todo el lote ha sido procesado.")

@router.post("/asistente/process")
async def process_documents(query: ProcessQuery, background_tasks: BackgroundTasks):
    """
    Envía los archivos seleccionados al flujo de procesamiento manual.
    Se ejecuta en segundo plano de forma secuencial para no saturar n8n.
    """
    print(f"DEBUG: Petición recibida en /asistente/process con {len(query.files)} archivos")
    if not query.files:
        raise HTTPException(status_code=400, detail="No se seleccionaron archivos")

    # Filtrar solo los que tienen storage_path
    valid_files = [f for f in query.files if f.get("storage_path")]
    
    if not valid_files:
        raise HTTPException(status_code=400, detail="Ninguno de los archivos seleccionados es válido")

    # Asegurar que directorio destino existe
    if not os.path.exists(INVOICE_UPLOAD_PATH):
        try:
            os.makedirs(INVOICE_UPLOAD_PATH, exist_ok=True)
        except Exception as e:
            print(f"Error creando directorio {INVOICE_UPLOAD_PATH}: {e}")

    # Agregamos UNA SOLA tarea de fondo que procesará todo secuencialmente
    background_tasks.add_task(process_files_sequentially_task, valid_files)
            
    return {"message": f"Se han enviado {len(valid_files)} archivos a procesar secuencialmente en segundo plano."}

from fastapi.responses import FileResponse
from urllib.parse import unquote
import os

@router.get("/asistente/preview/{filename}")
async def preview_temp_file(filename: str):
    """
    Serve a temporary PDF file for preview.
    """
    # Security: Prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
         raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = os.path.join(TEMPORAL_FILES_PATH, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found or expired")

    return FileResponse(file_path, media_type="application/pdf", filename=filename, content_disposition_type="inline")

@router.delete("/asistente/cleanup/{request_id}")
async def cleanup_temp_files(request_id: str):
    """
    Elimina los datos de caché para el request_id.
    La eliminación física de archivos se ha desactivado temporalmente para evitar 
    conflictos con el procesamiento en segundo plano.
    """
    # 1. Limpiar caché
    if request_id in search_cache:
        del search_cache[request_id]
    
    # 2. La eliminación física se omite por ahora para mayor seguridad
    # durante el procesamiento de lotes grandes.
    
    return {"message": f"Limpieza de caché para {request_id} completada."}
