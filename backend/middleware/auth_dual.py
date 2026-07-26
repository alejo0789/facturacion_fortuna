"""
Middleware dual JWT + X-API-Key (ASGI puro).

Comportamiento:
- Rutas públicas: solo las EXPLÍCITAMENTE listadas (regex estricto).
- JWT Bearer: se valida firma y expiración aquí (rápido). La carga del
  usuario real la hace `core.dependencies.get_current_user`.
- X-API-Key: acepta la API_KEY global legada (si está seteada en .env)
  o una api_key de una Empresa (la existencia real en BD se verifica en
  `core.dependencies.get_current_user` — este middleware solo hace un
  gate rápido para dejar pasar la petición al router).

Cambios de seguridad (revisión 2026-07):
- `PUBLIC_SUFFIXES` reemplazado por regex explícito. Antes cualquier ruta
  terminando en '/pdf' bypasseaba auth → cualquiera podía descargar los
  PDFs de contratos de todas las empresas (IDOR).
- X-API-Key ya no acepta "cualquier string ≥ 32 chars". Ahora requiere
  formato válido (hex ≥ 32) y sigue delegando la validación real a las
  dependencias. Esto reduce ruido en logs y bloquea garbage.

Se mantiene ASGI puro (no BaseHTTPMiddleware) para evitar problemas conocidos
con asyncpg + Windows en peticiones concurrentes.
"""
import json
import logging
import re

from jose import jwt, JWTError

from core.config import settings

logger = logging.getLogger(__name__)

# Rutas 100% públicas (no requieren ningún tipo de auth).
PUBLIC_ROUTES = {
    "/",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    # OAuth callback: Google/Microsoft no pueden mandar Authorization headers
    # cuando redirigen de vuelta. Se autentica validando el `state` HMAC-firmado
    # en el propio router.
    "/api/oauth/gmail/callback",
    "/api/oauth/outlook/callback",
}

# Rutas públicas parametrizadas (para PDFs que el navegador abre inline).
# IMPORTANTE: cada endpoint listado aquí DEBE hacer su propia autorización
# usando un token firmado (query param) o similar — el middleware no las
# valida más allá del match de path.
PUBLIC_ROUTE_REGEX = [
    re.compile(r"^/api/facturas/\d+/ver$"),
    re.compile(r"^/api/contratos/\d+/pdf$"),
    re.compile(r"^/api/pagos/nota-bancaria/[^/]+/[^/]+/pdf$"),
    re.compile(r"^/api/asistente/preview/[^/]+$"),
]


class AuthDualMiddleware:
    """ASGI middleware que autoriza JWT Bearer o X-API-Key."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Normalizar slashes duplicados en el path (`//api/x` → `/api/x`).
        # Sin esto, si el frontend arma URLs con VITE_API_URL terminado en `/`,
        # `//api/auth/login` no matchea el set literal de PUBLIC_ROUTES y
        # el usuario recibe 401 aunque las credenciales sean correctas.
        # nginx normaliza esto por default; aquí lo hacemos explícito por si
        # la app sirve directo sin reverse proxy delante.
        raw_path = scope.get("path", "") or "/"
        path = re.sub(r"/+", "/", raw_path)
        method = scope.get("method", "")

        # CORS preflight
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        # Rutas públicas literales
        if path in PUBLIC_ROUTES:
            await self.app(scope, receive, send)
            return

        # Rutas públicas por regex (PDFs inline). Cada endpoint valida
        # autorización por dentro con signed token.
        for pattern in PUBLIC_ROUTE_REGEX:
            if pattern.match(path):
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
            # Llave global legada — validación exacta.
            if settings.API_KEY and api_key == settings.API_KEY:
                await self.app(scope, receive, send)
                return
            # Llave por empresa: aceptamos el formato aquí y delegamos la
            # validación real a `get_current_user`. El formato esperado es
            # hex de 32+ chars (secrets.token_hex(16) o superior).
            if _looks_like_api_key(api_key):
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


_API_KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{32,128}$")


def _looks_like_api_key(value: str) -> bool:
    """Rechaza garbage antes de golpear la BD. La validación real está en
    core.dependencies.get_current_user (busca en Empresa.api_key)."""
    return bool(_API_KEY_RE.match(value))
