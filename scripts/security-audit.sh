#!/usr/bin/env bash
#
# security-audit.sh — chequeo periódico de vulnerabilidades y secretos
# expuestos. Sirve para ejecutarlo en CI (GitHub Actions, GitLab CI) o
# manualmente antes de cortar release.
#
# Requiere: pip-audit, git-secrets (opcional), jq (opcional).
#
# Uso:
#     bash scripts/security-audit.sh
#
# Exit code:
#     0 = todo OK
#     1 = alguna vulnerabilidad o secreto detectado
#
set -uo pipefail

cd "$(dirname "$0")/.."

fails=0

# ---------------------------------------------------------------
# 1. Vulnerabilidades en dependencias Python (pip-audit)
# ---------------------------------------------------------------
echo "==> pip-audit (backend)"
if command -v pip-audit >/dev/null 2>&1; then
    if ! pip-audit -r backend/requirements.txt; then
        echo "    ⚠ Vulnerabilidades detectadas en dependencias backend"
        fails=$((fails+1))
    fi
else
    echo "    (pip-audit no instalado — pip install pip-audit)"
fi

# ---------------------------------------------------------------
# 2. Vulnerabilidades en dependencias node (npm audit)
# ---------------------------------------------------------------
echo "==> npm audit (frontend)"
if [ -f frontend/package.json ]; then
    (cd frontend && npm audit --production --audit-level=high) || {
        echo "    ⚠ Vulnerabilidades HIGH+ en dependencias frontend"
        fails=$((fails+1))
    }
fi

# ---------------------------------------------------------------
# 3. Secretos comiteados por error
# ---------------------------------------------------------------
echo "==> git grep de patrones sensibles"
patrones=(
    'password\s*=\s*"[^"]{6,}"'
    'PASSWORD=[A-Za-z0-9]'
    'SECRET_KEY=[A-Za-z0-9]'
    'FERNET_KEY=[A-Za-z0-9]'
    'AWS_SECRET'
    'BEGIN RSA PRIVATE KEY'
    'BEGIN OPENSSH PRIVATE KEY'
)
for p in "${patrones[@]}"; do
    hits=$(git grep -Il -- ':(exclude)*.md' ':(exclude).gitignore' -e "$p" 2>/dev/null | grep -v '.env.example' || true)
    if [ -n "$hits" ]; then
        echo "    ⚠ Patrón '$p' hallado en:"
        echo "$hits" | sed 's/^/       /'
        fails=$((fails+1))
    fi
done

# ---------------------------------------------------------------
# 4. Archivos .env accidentalmente trackeados
# ---------------------------------------------------------------
echo "==> git ls-files de .env"
env_files=$(git ls-files | grep -E '(^|/)\.env(\.|$)' || true)
if [ -n "$env_files" ]; then
    echo "    ⚠ Archivos .env en el repo:"
    echo "$env_files" | sed 's/^/       /'
    fails=$((fails+1))
fi

# ---------------------------------------------------------------
# Resultado
# ---------------------------------------------------------------
echo
if [ "$fails" -eq 0 ]; then
    echo "✓ security-audit OK"
    exit 0
else
    echo "✗ security-audit encontró $fails problema(s)"
    exit 1
fi
