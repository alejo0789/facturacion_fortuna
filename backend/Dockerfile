# =============================================================================
# Backend — FastAPI + Playwright + Postgres async
#
# Usa la imagen oficial de Playwright (Ubuntu Jammy + Python 3.11 + Chromium
# + todas las libs del sistema que Chromium necesita). Esto elimina el dolor
# de instalar libnss3, libxkbcommon0, etc. a mano en cada rebuild.
#
# Build:  docker build -t facturacion-backend -f backend/Dockerfile .
# Run:    docker run -p 8000:8000 --env-file backend/.env facturacion-backend
#
# En Railway: apuntar "Root Directory" a `backend/` y este Dockerfile se
# detecta y usa automáticamente.
# =============================================================================
FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

# --- setup base ---
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# --- dependencias Python (capa cacheable) ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- código de la aplicación ---
COPY . .

# --- runtime ---
# Railway inyecta `PORT` (usualmente 8080). Fallback 8000 para local.
ENV PORT=8000
EXPOSE 8000

# Nota: main:application (no main:app) porque la app va envuelta en
# SecurityHeadersMiddleware(AuthDualMiddleware(app)).
CMD ["sh", "-c", "uvicorn main:application --host 0.0.0.0 --port ${PORT:-8000}"]
