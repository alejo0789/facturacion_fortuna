from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict
import httpx
import os
import uuid
from datetime import date, datetime

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

    payload = {
        "requestId": request_id, 
        "email": query.email,
        "startDate": query.start_date.isoformat(),
        "endDate": query.end_date.isoformat(),
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

async def process_single_file_task(file_info: dict):
    """
    Tarea en segundo plano para procesar un solo archivo:
    1. Copiar de temp_buscador a temp (procesamiento manual)
    2. Llamar al webhook de n8n
    """
    try:
        filename = file_info.get("filename")
        storage_path = file_info.get("storage_path")
        
        # Si storage_path es una ruta completa, extraemos solo el nombre
        if "\\" in storage_path:
            storage_path = storage_path.split("\\")[-1]
            
        source_path = os.path.join(TEMPORAL_FILES_PATH, storage_path)
        
        if not os.path.exists(source_path):
            print(f"Error: Archivo no encontrado {source_path}")
            return

        # Generar nombre único para destino (igual que en facturas.py)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        safe_filename = f"{timestamp}_{unique_id}_{filename}"
        
        dest_path = os.path.join(INVOICE_UPLOAD_PATH, safe_filename)
        url_factura = f"file://192.168.2.20/Facturas/temp/{safe_filename}"
        
        # Copiar archivo
        shutil.copy2(source_path, dest_path)
        
        # Llamar al webhook
        async with httpx.AsyncClient(timeout=120.0) as client:
            webhook_data = {
                "event": "invoice_uploaded_via_search",
                "file_path": dest_path,
                "file_url": url_factura,
                "filename": safe_filename,
                "original_filename": filename,
                "uploaded_at": datetime.now().isoformat()
            }
            # No esperamos respuesta (fire and forget en background) para no bloquear
            # Ojo: Si el n8n falla, no nos enteramos aquí.
            await client.post(WEBHOOK_URL_MANUAL, json=webhook_data)
            
    except Exception as e:
        print(f"Error procesando archivo {filename}: {e}")

@router.post("/asistente/process")
async def process_documents(query: ProcessQuery, background_tasks: BackgroundTasks):
    """
    Envía los archivos seleccionados al flujo de procesamiento manual.
    Se ejecuta en segundo plano para no bloquear al usuario.
    """
    if not query.files:
        raise HTTPException(status_code=400, detail="No se seleccionaron archivos")

    # Asegurar que directorio destino existe
    if not os.path.exists(INVOICE_UPLOAD_PATH):
        os.makedirs(INVOICE_UPLOAD_PATH, exist_ok=True)

    count = 0
    for file_info in query.files:
        if file_info.get("storage_path"):
            background_tasks.add_task(process_single_file_task, file_info)
            count += 1
            
    return {"message": f"Se han enviado {count} archivos a procesar en segundo plano."}

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
    Elimina TODOS los archivos temporales en la carpeta temp_buscador.
    Se ignora el request_id para el borrado de archivos, pero se usa para limpiar caché.
    """
    # 1. Limpiar caché
    if request_id in search_cache:
        del search_cache[request_id]
    
    # 2. Eliminar TODOS los archivos físicos en la carpeta temporal
    deleted_count = 0
    try:
        if os.path.exists(TEMPORAL_FILES_PATH):
            for filename in os.listdir(TEMPORAL_FILES_PATH):
                file_path = os.path.join(TEMPORAL_FILES_PATH, filename)
                try:
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                        deleted_count += 1
                except Exception as e:
                    print(f"Error borrando archivo temporal {filename}: {e}")
                        
        return {"message": f"Limpieza TOTAL completada. {deleted_count} archivos eliminados."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en limpieza: {str(e)}")
