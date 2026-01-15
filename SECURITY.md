# Guía de Seguridad - API Key Authentication

## Implementación

Se ha implementado un sistema de autenticación basado en API Key para proteger el backend de accesos no autorizados.

## Cómo Funciona

1. **Backend**: Middleware que verifica el header `X-API-Key` en cada petición
2. **Frontend**: Cliente HTTP que agrega automáticamente la API Key a todas las peticiones
3. **Configuración**: API Key almacenada en variables de entorno

## Configuración

### Backend (.env)

```bash
API_KEY=fortuna_2026_secure_api_key_change_in_production
```

### Frontend (.env y .env.production)

```bash
VITE_API_KEY=fortuna_2026_secure_api_key_change_in_production
```

**IMPORTANTE**: Ambas claves deben ser idénticas.

## Generar una API Key Segura

Para producción, genera una clave segura:

```bash
# Python
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# OpenSSL
openssl rand -base64 32
```

## Uso en el Frontend

### Opción 1: Usar el cliente HTTP (Recomendado)

```typescript
import { apiGet, apiPost, apiPut, apiDelete } from '@/utils/apiClient';

// GET
const contratos = await apiGet('/contratos/', { skip: 0, limit: 20 });

// POST
const newContrato = await apiPost('/contratos/', { ...data });

// PUT
const updated = await apiPut(`/contratos/${id}`, { ...data });

// DELETE
await apiDelete(`/contratos/${id}`);
```

### Opción 2: Fetch manual

```typescript
import { apiFetch } from '@/utils/apiClient';

const response = await apiFetch('/contratos/', {
    method: 'GET',
    params: { skip: 0, limit: 20 }
});
```

### Opción 3: Fetch nativo (agregar header manualmente)

```typescript
const API_KEY = import.meta.env.VITE_API_KEY;

const response = await fetch('http://api.example.com/endpoint', {
    headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
    }
});
```

## Migración del Código Existente

Para migrar código existente que usa `fetch` directamente:

### Antes:
```typescript
const res = await fetch(`${API_URL}/contratos/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
});
```

### Después:
```typescript
import { apiPost } from '@/utils/apiClient';

const res = await apiPost('/contratos/', data);
```

## Rutas Públicas

Las siguientes rutas NO requieren API Key:
- `/` - Root endpoint
- `/docs` - Documentación Swagger
- `/redoc` - Documentación ReDoc
- `/openapi.json` - OpenAPI schema

## Seguridad Adicional

### 1. Rate Limiting (Recomendado para producción)

Instalar:
```bash
pip install slowapi
```

Agregar a `main.py`:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.get("/api/contratos/")
@limiter.limit("100/minute")
async def get_contratos(request: Request):
    ...
```

### 2. HTTPS Only

En producción, asegúrate de que:
- Apache/Nginx redirija HTTP a HTTPS
- El backend solo acepte conexiones desde el proxy
- Los certificados SSL estén actualizados

### 3. Firewall

Configurar firewall para que solo Apache pueda acceder al backend:

```bash
# CentOS/RHEL
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="127.0.0.1" port port="8000" protocol="tcp" accept'
sudo firewall-cmd --reload
```

### 4. Rotación de API Keys

Cambia la API Key periódicamente:

1. Genera nueva clave
2. Actualiza `.env` en backend
3. Actualiza `.env.production` en frontend
4. Rebuild y redeploy frontend
5. Reinicia backend

## Troubleshooting

### Error 401: API Key requerida
- Verifica que `VITE_API_KEY` esté configurada
- Verifica que estés usando `apiClient` o agregando el header manualmente

### Error 403: API Key inválida
- Verifica que la API Key en frontend y backend sean idénticas
- Verifica que no haya espacios extra en las variables de entorno

### Error en desarrollo
- Verifica que el archivo `.env` exista en `frontend/`
- Reinicia el servidor de desarrollo de Vite

### Error en producción
- Verifica que `.env.production` tenga la API Key correcta
- Verifica que el build de producción incluya las variables de entorno
- Verifica que el backend en producción tenga la misma API Key

## Monitoreo

Logs de autenticación fallida en el backend:

```python
# En middleware/auth.py, agregar logging
import logging

logger = logging.getLogger(__name__)

if api_key != API_KEY:
    logger.warning(f"Invalid API key attempt from {request.client.host}")
    ...
```
