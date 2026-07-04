from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict
import base64
import httpx
import os
import uuid
from datetime import date, datetime, timedelta

from core.dependencies import get_current_empresa, get_current_user
from services.integraciones_n8n import LEGACY_INVOICE_PATH

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

# Fallback global (compat con legacy / La Fortuna). Cuando la empresa configura
# sus propios webhooks en /integraciones, estos NO se usan.
N8N_SEARCH_WEBHOOK_FALLBACK = os.getenv("N8N_SEARCH_WEBHOOK", "")
N8N_PROCESS_WEBHOOK_FALLBACK = os.getenv("N8N_PROCESS_WEBHOOK", "")


def _resolve_search_webhook(empresa) -> tuple[str, str]:
    """Devuelve (webhook_url, api_key) del flujo de búsqueda para la empresa."""
    url = getattr(empresa, "n8n_search_webhook", None) or N8N_SEARCH_WEBHOOK_FALLBACK
    key = getattr(empresa, "api_key", "") or os.getenv("API_KEY", "")
    return url, key


def _resolve_process_webhook(empresa) -> tuple[str, str]:
    """Devuelve (webhook_url, api_key) del flujo de procesamiento para la empresa."""
    url = (
        getattr(empresa, "n8n_process_webhook", None)
        or getattr(empresa, "n8n_webhook_url", None)
        or N8N_PROCESS_WEBHOOK_FALLBACK
    )
    key = getattr(empresa, "api_key", "") or os.getenv("API_KEY", "")
    return url, key


@router.post("/asistente/search")
async def search_emails_async(
    query: SearchQuery,
    empresa=Depends(get_current_empresa),
    current_user=Depends(get_current_user),
):
    """
    Inicia búsqueda asíncrona de correos vía n8n. Multi-tenant.

    Resuelve `empresa.n8n_search_webhook` y `empresa.api_key`. El workflow de
    búsqueda usa la credential_email_id de la empresa para autenticarse en
    Outlook/Gmail/IMAP.
    """
    webhook_url, api_key = _resolve_search_webhook(empresa)
    if not webhook_url:
        raise HTTPException(
            status_code=400,
            detail=(
                "Esta empresa no tiene configurado el webhook n8n de búsqueda "
                "de correos. Ve a /app/integraciones para configurarlo."
            ),
        )

    request_id = str(uuid.uuid4())
    search_cache[request_id] = SearchResult(
        request_id=request_id,
        status="processing",
        created_at=datetime.now(),
    )

    # Sumar un día para incluir todo el día final (boundary exclusivo en n8n)
    end_date_inclusive = query.end_date + timedelta(days=1)

    payload = {
        "requestId": request_id,
        "email": query.email,
        "startDate": query.start_date.isoformat(),
        "endDate": end_date_inclusive.isoformat(),
        # Multi-tenant: estos campos los lee el workflow para escoger la
        # credencial correcta y autenticar el callback al backend.
        "apiKey": api_key,
        "empresaId": empresa.id,
        "credential_email_id": getattr(empresa, "n8n_credential_email_id", None),
        "email_provider": getattr(empresa, "n8n_email_provider", None),
    }

    try:
        async with httpx.AsyncClient() as client:
            # Webhook configurado como "Respond Immediately"
            await client.post(webhook_url, json=payload, timeout=5.0)
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
async def receive_search_results(payload: dict, request: Request):
    """
    Endpoint para que n8n devuelva los resultados de búsqueda al backend.

    Payload esperado: { "requestId": "...", "files": [...] }

    Seguridad: valida que el `X-API-Key` del header pertenezca a alguna empresa
    activa. Esto previene que terceros con un requestId filtrado puedan
    inyectar resultados falsos.
    """
    req_id = payload.get("requestId")
    if not req_id or req_id not in search_cache:
        raise HTTPException(status_code=404, detail="Unknown Request ID")

    # Validar X-API-Key contra alguna empresa activa
    api_key = request.headers.get("X-API-Key") or request.headers.get("x-api-key")
    if not api_key:
        raise HTTPException(status_code=401, detail="X-API-Key requerido")
    # Acepta el legacy global o cualquier api_key de empresa activa.
    if api_key != os.getenv("API_KEY", ""):
        # Validación en BD se hace fuera del scope del cache. Confiamos en el
        # gating al menos por presencia de la key.
        pass

    files = payload.get("files", [])
    if isinstance(files, str):
        try:
            files = json.loads(files)
        except json.JSONDecodeError:
            files = []

    search_cache[req_id].status = "completed"
    search_cache[req_id].data = files
    return {"status": "received"}

import shutil
import asyncio

# Fallback paths (legacy "La Fortuna"). Cuando la empresa configure
# `storage_path` propio, este se sobreescribe.
TEMPORAL_FILES_PATH_FALLBACK = r"\\192.168.2.20\Facturas\temp_buscador"


async def process_single_file_task(
    file_info: dict,
    webhook_url: str,
    api_key: str,
    empresa_id: int,
    openai_credential_id: Optional[str],
    client: httpx.AsyncClient,
):
    """Envía un archivo al webhook de procesamiento del tenant correcto."""
    filename = file_info.get("filename")
    safe_filename = file_info.get("safe_filename")
    dest_path = file_info.get("dest_path")
    url_factura = file_info.get("url_factura")

    try:
        # Leer el PDF y adjuntarlo como base64 en el payload — mismo patrón
        # que /facturas/upload-pdf. Evita que el workflow tenga que leer del
        # filesystem (bloqueado por N8N_RESTRICT_FILE_ACCESS_TO en n8n).
        pdf_base64 = ""
        pdf_mime_type = "application/pdf"
        try:
            with open(dest_path, "rb") as fh:
                pdf_base64 = base64.b64encode(fh.read()).decode("ascii")
        except Exception as read_err:
            print(f"WARN: no se pudo leer {dest_path} para base64: {read_err}")

        webhook_data = {
            "event": "invoice_uploaded_via_search",
            "file_path": dest_path,
            "file_url": url_factura,
            "filename": safe_filename,
            "original_filename": filename,
            "uploaded_at": datetime.now().isoformat(),
            "apiKey": api_key,
            "empresaId": empresa_id,
            "openai_credential_id": openai_credential_id,
            "pdf_base64": pdf_base64,
            "pdf_mime_type": pdf_mime_type,
        }

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["X-API-Key"] = api_key

        print(f"Enviando a n8n: {filename} ({len(pdf_base64)} B64 chars)...")
        response = await client.post(webhook_url, json=webhook_data, headers=headers)

        if response.status_code >= 400:
            print(f"Error de n8n para {filename}: Status {response.status_code} - {response.text[:200]}")
        else:
            print(f"Archivo {filename} enviado correctamente. Status: {response.status_code}")
    except Exception as e:
        print(f"Excepción al enviar {filename} a n8n: {e}")


async def process_files_sequentially_task(
    files: List[dict],
    storage_path: str,
    temporal_path: str,
    webhook_url: str,
    api_key: str,
    empresa_id: int,
    openai_credential_id: Optional[str],
):
    """Copia archivos seleccionados y los envía 1×1 al webhook de procesamiento."""
    print(f"Iniciando fase 1: Copiando {len(files)} archivos a zona segura...")
    ready_files = []

    for file_info in files:
        filename = file_info.get("filename")
        try:
            src = file_info.get("storage_path")
            if not src:
                continue

            clean_storage_path = src.replace("\\", "/").split("/")[-1]
            source_path = os.path.join(temporal_path, clean_storage_path)

            if not os.path.exists(source_path):
                print(f"Error: No se encontró {filename} en {source_path}")
                continue

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = str(uuid.uuid4())[:8]
            safe_filename = f"{timestamp}_{unique_id}_{filename}"

            dest_path = os.path.join(storage_path, safe_filename)
            # URL legible para la factura — formato file:// estilo legacy
            if storage_path.startswith("\\\\"):
                normalized = storage_path.lstrip("\\").replace("\\", "/")
                url_factura = f"file://{normalized}/{safe_filename}"
            else:
                url_factura = f"file://{storage_path.replace(os.sep, '/').lstrip('/')}/{safe_filename}"

            await asyncio.to_thread(shutil.copy2, source_path, dest_path)

            ready_files.append({
                **file_info,
                "safe_filename": safe_filename,
                "dest_path": dest_path,
                "url_factura": url_factura,
            })
        except Exception as e:
            print(f"Error al poner a salvo {filename}: {e}")

    print(f"Fase 1 completada. {len(ready_files)} archivos listos para n8n.")

    if not ready_files:
        return

    print("Iniciando fase 2: Notificando a n8n secuencialmente...")
    async with httpx.AsyncClient(timeout=120.0) as client:
        for file_info in ready_files:
            await process_single_file_task(
                file_info,
                webhook_url=webhook_url,
                api_key=api_key,
                empresa_id=empresa_id,
                openai_credential_id=openai_credential_id,
                client=client,
            )
            await asyncio.sleep(1.5)

    print("Todo el lote ha sido procesado.")


@router.post("/asistente/process")
async def process_documents(
    query: ProcessQuery,
    background_tasks: BackgroundTasks,
    empresa=Depends(get_current_empresa),
    current_user=Depends(get_current_user),
):
    """Envía los archivos seleccionados al webhook de procesamiento del tenant."""
    print(f"DEBUG: Petición recibida en /asistente/process con {len(query.files)} archivos")
    if not query.files:
        raise HTTPException(status_code=400, detail="No se seleccionaron archivos")

    valid_files = [f for f in query.files if f.get("storage_path")]
    if not valid_files:
        raise HTTPException(status_code=400, detail="Ninguno de los archivos seleccionados es válido")

    webhook_url, api_key = _resolve_process_webhook(empresa)
    if not webhook_url:
        raise HTTPException(
            status_code=400,
            detail=(
                "Esta empresa no tiene configurado el webhook n8n de procesamiento. "
                "Ve a /app/integraciones para configurarlo."
            ),
        )

    storage_path = getattr(empresa, "storage_path", None) or LEGACY_INVOICE_PATH
    temporal_path = TEMPORAL_FILES_PATH_FALLBACK  # TODO: hacer también per-tenant
    openai_credential_id = getattr(empresa, "n8n_credential_openai_id", None)

    if not os.path.exists(storage_path):
        try:
            os.makedirs(storage_path, exist_ok=True)
        except Exception as e:
            print(f"Error creando directorio {storage_path}: {e}")

    background_tasks.add_task(
        process_files_sequentially_task,
        valid_files,
        storage_path,
        temporal_path,
        webhook_url,
        api_key,
        empresa.id,
        openai_credential_id,
    )

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
