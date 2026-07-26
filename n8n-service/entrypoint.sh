#!/bin/sh
# Entrypoint wrapper para n8n en Railway.
#
# Corre como root al arrancar (permitido por USER root del Dockerfile):
#   1. Asegura que /home/node/.n8n existe y es escribible por `node`.
#   2. Hace chown recursivo del mount (Railway lo entrega como root:root).
#   3. Drop privileges → ejecuta n8n como `node` vía su-exec.
#
# Sin este fix, n8n falla al iniciar con:
#   Error: EACCES: permission denied, open '/home/node/.n8n/config'
set -e

TARGET_UID=1000
TARGET_GID=1000
DATA_DIR="/home/node/.n8n"

mkdir -p "$DATA_DIR"

# Solo chown si el owner actual no es node (evita rescribir metadata
# en cada arranque cuando ya está bien).
current_uid=$(stat -c '%u' "$DATA_DIR" 2>/dev/null || echo "0")
if [ "$current_uid" != "$TARGET_UID" ]; then
    echo "[entrypoint] Fixing ownership of $DATA_DIR (was UID=$current_uid, setting UID=$TARGET_UID)"
    chown -R "${TARGET_UID}:${TARGET_GID}" "$DATA_DIR"
fi

echo "[entrypoint] Starting n8n as user node..."
exec su-exec node "$@"
