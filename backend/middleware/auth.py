"""
Middleware de autenticación por API Key
Protege todos los endpoints excepto los públicos
"""
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import os
from dotenv import load_dotenv
import logging

load_dotenv()

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API Key desde variable de entorno
API_KEY = os.getenv("API_KEY", "")

# Log de la API Key cargada (solo primeros caracteres por seguridad)
if API_KEY:
    logger.info(f"API Key cargada: {API_KEY[:8]}...")
else:
    logger.warning("⚠️  API_KEY no configurada en .env")

# Rutas públicas que no requieren autenticación
PUBLIC_ROUTES = [
    "/",
    "/docs",
    "/openapi.json",
    "/redoc"
]

# Patrones de rutas públicas (regex)
import re
PUBLIC_PATTERNS = [
    re.compile(r"^/api/facturas/\d+/ver$"),  # Ver PDFs de facturas
    re.compile(r"^/api/contratos/\d+/pdf$"),  # Ver PDFs de contratos
    re.compile(r"^/api/asistente/preview/.*$"),  # Ver PDFs temporales de asistente
]

class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # Log de todas las peticiones
        logger.info(f"📥 {request.method} {path}")
        
        # Permitir rutas públicas exactas
        if path in PUBLIC_ROUTES:
            logger.info(f"✅ Ruta pública permitida: {path}")
            return await call_next(request)
        
        # Permitir rutas que coincidan con patrones públicos
        for pattern in PUBLIC_PATTERNS:
            if pattern.match(path):
                logger.info(f"✅ Ruta pública (patrón) permitida: {path}")
                return await call_next(request)
        
        # Verificar API Key en header
        api_key = request.headers.get("X-API-Key")
        
        if not api_key:
            logger.warning(f"❌ API Key faltante en {path}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "API Key requerida. Incluya el header X-API-Key"}
            )
        
        if api_key != API_KEY:
            logger.warning(f"❌ API Key inválida en {path}: {api_key[:8]}...")
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "API Key inválida"}
            )
        
        # API Key válida, continuar con la petición
        logger.info(f"✅ API Key válida para {path}")
        response = await call_next(request)
        return response
