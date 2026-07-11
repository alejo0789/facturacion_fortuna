-- =============================================================
-- Migración 008: OAuth multi-tenant para Gmail + Gemini per-tenant
--
-- Refactoriza integraciones para que cada empresa pueda conectar SU propio
-- Gmail vía OAuth (Modelo A: 1 click, o Modelo B: BYO OAuth app) sin
-- credenciales guardadas en n8n. El backend guarda el refresh_token
-- encriptado (Fernet) y refresca el access_token en cada búsqueda.
--
-- IDEMPOTENTE: usa IF NOT EXISTS para no fallar en re-ejecución.
-- =============================================================

BEGIN;

-- ---------- Modo OAuth por-tenant ----------
-- 'saas'   → el backend usa GOOGLE_OAUTH_CLIENT_ID/SECRET del .env (default).
-- 'custom' → la empresa registró su propia OAuth app y sus Client ID/Secret
--            se guardan en gmail_client_id / gmail_client_secret_enc.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS gmail_oauth_mode VARCHAR(10) DEFAULT 'saas';

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS gmail_client_id VARCHAR(500);

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS gmail_client_secret_enc TEXT;

-- ---------- Tokens OAuth ----------
-- refresh_token encriptado con Fernet (settings.FERNET_KEY).
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS gmail_refresh_token_enc TEXT;

-- Correo autorizado (para mostrar "Conectado como user@example.com" en UI).
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS gmail_email VARCHAR(255);

-- Timestamp de la última autorización exitosa.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS gmail_connected_at TIMESTAMP;

-- ---------- Gemini API key per-tenant (override opcional) ----------
-- Encriptado con Fernet. Si NULL, el backend usa GEMINI_API_KEY_GLOBAL del .env.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS gemini_api_key_enc TEXT;

-- ---------- CHECK constraint sobre el modo ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'empresas' AND constraint_name = 'ck_gmail_oauth_mode'
  ) THEN
    ALTER TABLE empresas
      ADD CONSTRAINT ck_gmail_oauth_mode CHECK (gmail_oauth_mode IN ('saas', 'custom'));
  END IF;
END $$;

COMMIT;

-- ---------- Verificación ----------
SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'empresas'
    AND column_name LIKE 'gmail_%' OR column_name = 'gemini_api_key_enc'
  ORDER BY ordinal_position;
