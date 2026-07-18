-- Migración 012: hardening de seguridad — segunda pasada
--
-- Crea 3 tablas nuevas para soportar controles multi-worker safe:
--
--   1. rate_limit_events  — rate limiter compartido entre workers de uvicorn.
--      Antes vivía en memoria del proceso Python → cada worker tenía su propio
--      contador y un atacante podía saltarse el límite balanceándose entre
--      workers. Ahora la ventana deslizante se calcula sobre esta tabla.
--
--   2. token_blacklist    — revocación de JWTs (logout, cambio de contraseña,
--      compromise de credenciales). Cada token trae un claim `jti` (UUID); al
--      hacer logout se inserta el jti aquí y el middleware lo consulta.
--
--   3. audit_log          — traza estructurada de acciones sensibles
--      (login/logout, cambios de config OAuth/DIAN, rotación de API keys,
--      exports masivos, etc.). Cada empresa puede consultar SUS eventos.
--
-- Todas las tablas tienen índices para consultas típicas + limpieza
-- periódica (rate_limit_events y token_blacklist por antigüedad).

BEGIN;

-- =============================================================
-- 1. Rate limiter multi-worker (Postgres-backed)
-- =============================================================
-- Cada intento inserta 1 fila. Chequeo = COUNT(*) donde ts > now() - window.
-- Cleanup periódico borra rows con ts < now() - retention.
CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket VARCHAR(200) NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_rate_limit_events_bucket_ts
    ON rate_limit_events(bucket, attempted_at DESC);

-- Para GC eficiente
CREATE INDEX IF NOT EXISTS ix_rate_limit_events_ts
    ON rate_limit_events(attempted_at);


-- =============================================================
-- 2. Token blacklist (JWT jti revocation)
-- =============================================================
-- El middleware lee de aquí en cada request autenticado. Para evitar N
-- queries a Postgres, se cachea en memoria por `expires_at` (los tokens
-- expiran solos, no requieren borrado sincronizado). Un cleanup borra las
-- filas ya expiradas.
CREATE TABLE IF NOT EXISTS token_blacklist (
    jti VARCHAR(64) PRIMARY KEY,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    reason VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS ix_token_blacklist_expires
    ON token_blacklist(expires_at);


-- =============================================================
-- 3. Audit log
-- =============================================================
-- Registro append-only de acciones sensibles. Un endpoint futuro
-- `/api/audit-log` permitirá al ADMIN consultar los eventos de SU empresa.
-- El campo `details` es JSONB para permitir contexto libre sin migraciones.
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL,
    user_id INTEGER,
    action VARCHAR(80) NOT NULL,
    resource_type VARCHAR(80),
    resource_id VARCHAR(50),
    ip VARCHAR(45),
    user_agent VARCHAR(500),
    result VARCHAR(20) DEFAULT 'success',
    details JSONB
);

CREATE INDEX IF NOT EXISTS ix_audit_log_ts
    ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS ix_audit_log_empresa_ts
    ON audit_log(empresa_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_audit_log_action
    ON audit_log(action);
CREATE INDEX IF NOT EXISTS ix_audit_log_user
    ON audit_log(user_id, ts DESC);

COMMIT;
