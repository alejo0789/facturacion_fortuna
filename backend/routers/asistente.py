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
    
    # Update cache
    search_cache[req_id].status = "completed"
    search_cache[req_id].data = files
    
    return {"status": "received"}

@router.post("/asistente/process")
async def process_documents(query: ProcessQuery):
    """
    Envía los archivos seleccionados al flujo de procesamiento.
    """
    try:
        async with httpx.AsyncClient() as client:
            # This can also be async if needed, but keeping sync for now as per reliable receipt confirmation
            response = await client.post(
                N8N_PROCESS_WEBHOOK,
                json={"files": query.files},
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()

    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Error conectando con n8n: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
