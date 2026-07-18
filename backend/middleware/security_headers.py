"""
Middleware ASGI para añadir security headers a todas las respuestas.

Headers aplicados:
  - X-Content-Type-Options: nosniff  → bloquea MIME sniffing
  - X-Frame-Options: DENY             → previene clickjacking (bloquea iframe embedding)
  - Referrer-Policy: strict-origin-when-cross-origin
  - Strict-Transport-Security (HSTS)  → solo si settings.PRODUCTION_MODE, para no bloquear dev
  - Permissions-Policy: bloquea features potentes por default

CSP (Content-Security-Policy) NO se pone aquí — pertenece al frontend/reverse proxy
(nginx/traefik) porque depende de qué scripts inline usa el bundle.
"""
from __future__ import annotations

from core.config import settings


_HEADERS_BASE = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy",
     b"geolocation=(), microphone=(), camera=(), payment=(), usb=()"),
]

_HSTS_HEADER = (
    b"strict-transport-security",
    b"max-age=31536000; includeSubDomains",
)


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app
        self._headers = list(_HEADERS_BASE)
        # HSTS solo cuando corremos en modo prod (evita romper localhost sin TLS).
        if getattr(settings, "PRODUCTION_MODE", False):
            self._headers.append(_HSTS_HEADER)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers_to_add = self._headers

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                existing = list(message.get("headers", []))
                existing_keys = {k for k, _ in existing}
                for k, v in headers_to_add:
                    if k not in existing_keys:
                        existing.append((k, v))
                message["headers"] = existing
            await send(message)

        await self.app(scope, receive, send_with_headers)
