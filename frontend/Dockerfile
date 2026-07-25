# =============================================================================
# Frontend — Vite + React → build estático servido por nginx
#
# Multi-stage:
#   Stage 1 (build)    : Node 20 + npm ci + tsc + vite build
#   Stage 2 (serve)    : nginx:alpine sirviendo dist/ con SPA fallback
#
# Build args (setear al deploy):
#   VITE_API_URL       — URL del backend (ej. https://facturacion-backend.up.railway.app)
#   VITE_BASE_PATH     — subpath donde se sirve (default '/' en Railway).
# =============================================================================

# -------- Stage 1: build --------
FROM node:20-alpine AS build

WORKDIR /app

# Dependencias (cache separado del código fuente)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Código
COPY . .

# Args → env para que Vite las lea al hacer build
ARG VITE_API_URL=""
ARG VITE_BASE_PATH="/"
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run build


# -------- Stage 2: serve con nginx --------
FROM nginx:alpine

# Config nginx (SPA fallback + gzip + cache)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Build output → root de nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Railway inyecta PORT. Rewrite nginx config al arrancar para escuchar en ese port.
EXPOSE 80
CMD ["sh", "-c", "sed -i \"s/listen 80;/listen ${PORT:-80};/\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
