-- =============================================================
-- Migración 009: OAuth multi-tenant para Outlook (Microsoft Graph)
--
-- Mismo patrón que la migración 008 (Gmail): el backend guarda el
-- refresh_token encriptado por empresa y refresca el access_token en cada
-- búsqueda. n8n usa Authorization: Bearer dinámico, sin credencial guardada.
--
-- IDEMPOTENTE.
-- =============================================================

BEGIN;

-- Modo OAuth:
--   'saas'   → usa MICROSOFT_OAUTH_CLIENT_ID/SECRET del .env del backend.
--   'custom' → la empresa registró su propia OAuth app en Azure.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS outlook_oauth_mode VARCHAR(10) DEFAULT 'saas';

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS outlook_client_id VARCHAR(500);

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS outlook_client_secret_enc TEXT;

-- Tokens OAuth
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS outlook_refresh_token_enc TEXT;

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS outlook_email VARCHAR(255);

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS outlook_connected_at TIMESTAMP;

-- Tenant ID de la app custom (típicamente 'common' para multi-tenant, o el
-- ID de tu Entra ID). Solo aplica en modo custom.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS outlook_tenant_id VARCHAR(255) DEFAULT 'common';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'empresas' AND constraint_name = 'ck_outlook_oauth_mode'
  ) THEN
    ALTER TABLE empresas
      ADD CONSTRAINT ck_outlook_oauth_mode CHECK (outlook_oauth_mode IN ('saas', 'custom'));
  END IF;
END $$;

COMMIT;

SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'empresas'
    AND column_name LIKE 'outlook_%'
  ORDER BY ordinal_position;
