"""
Middleware dual JWT + X-API-Key (ASGI puro).

Comportamiento:
- Rutas públicas (docs, login/register, visualización de PDFs) se dejan pasar.
- JWT Bearer: se valida firma y expiración aquí (rápido). La carga del
  usuario real la hace `core.dependencies.get_current_user`.
- X-API-Key acepta tanto:
    a) la API_KEY global (legada — n8n actual de La Fortuna), configurada en .env
    b) una api_key por Empresa (se valida su longitud aquí y la existencia en DB
       ya en las dependencias).

Se mantiene ASGI puro (no BaseHTTPMiddleware) para evitar problemas conocidos
con asyncpg + Windows en peticiones concurrentes.
"""
import json
import logging
from jose import jwt, JWTError

from core.config import settings

logger = logging.getLogger(__name__)

PUBLIC_ROUTES = {
    "/",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    # OAuth callback: Google no puede mandar Authorization headers cuando
    # redirige de vuelta. La autenticación se hace validando el `state`
    # opaco contra un cache en memoria en el propio router.
    "/api/oauth/gmail/callback",
    "/api/oauth/outlook/callback",
}

PUBLIC_SUFFIXES = ("/ver", "/pdf")
PUBLIC_SUBSTRINGS = ("/asistente/preview/",)


class AuthDualMiddleware:
    """ASGI middleware que autoriza JWT Bearer o X-API-Key."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "")

        # CORS preflight
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        # Rutas públicas
        if path in PUBLIC_ROUTES:
            await self.app(scope, receive, send)
            return
        for suffix in PUBLIC_SUFFIXES:
            if path.endswith(suffix):
                await self.app(scope, receive, send)
                return
        for sub in PUBLIC_SUBSTRINGS:
            if sub in path:
                await self.app(scope, receive, send)
                return

        # Cabeceras
        auth_header = None
        api_key = None
        for key, value in scope.get("headers", []):
            k = key.lower()
            if k == b"authorization":
                auth_header = value.decode("utf-8", errors="ignore")
            elif k == b"x-api-key":
                api_key = value.decode("utf-8", errors="ignore")

        # JWT Bearer
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                payload = jwt.decode(
                    token,
                    settings.JWT_SECRET_KEY,
                    algorithms=[settings.JWT_ALGORITHM],
                )
                if payload.get("type") == "access":
                    await self.app(scope, receive, send)
                    return
            except JWTError:
                pass

        # X-API-Key
        if api_key:
            # Llave global legada
            if settings.API_KEY and api_key == settings.API_KEY:
                await self.app(scope, receive, send)
                return
            # Llave por empresa (validación profunda en dependencias)
            if len(api_key) >= 32:
                await self.app(scope, receive, send)
                return

        logger.warning("Auth rechazado: %s %s", method, path)
        await self._send_401(send)

    @staticmethod
    async def _send_401(send):
        body = json.dumps(
            {"detail": "Autenticacion requerida. Use Bearer token o X-API-Key"}
        ).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 401,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("utf-8")),
            ],
        })
        await send({"type": "http.response.body", "body": body})
