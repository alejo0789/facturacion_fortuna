# =============================================================================
# n8n para Railway — con fix de permisos del volumen
#
# Problema: n8nio/n8n corre como usuario `node` (UID 1000), pero Railway monta
# los volúmenes como `root:root` por defecto. El primer write de n8n a
# /home/node/.n8n/config falla con EACCES y el container entra en crash loop.
#
# Solución: entrypoint corre como root, hace chown del mount, y ejecuta n8n
# como `node` vía su-exec (drop privileges seguro).
#
# Uso en Railway:
#   - Servicio n8n → Settings → Source → GitHub Repo (este repo)
#   - Root Directory: n8n-service
#   - Builder: Dockerfile (auto-detectado)
# =============================================================================
# Usamos Docker Hub (registry default) en vez de docker.n8n.io porque el
# registry oficial de n8n rate-limita agresivo (429 al primer build en Railway).
# Docker Hub tiene la misma imagen sincronizada.
# Pineamos versión específica (no `latest`) para builds reproducibles y para
# evitar sorpresas por breaking changes al re-desplegar.
FROM n8nio/n8n:1.75.0

# Necesitamos root para chown y para instalar su-exec
USER root

# su-exec: forma segura y ligera de switch de user en Alpine (drop privileges).
RUN apk add --no-cache su-exec

# Entrypoint personalizado
COPY entrypoint.sh /docker-entrypoint-fix.sh
RUN chmod +x /docker-entrypoint-fix.sh

# Health check simple — n8n expone /healthz por default
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -q --spider http://localhost:${N8N_PORT:-5678}/healthz || exit 1

ENTRYPOINT ["/docker-entrypoint-fix.sh"]
CMD ["n8n"]
