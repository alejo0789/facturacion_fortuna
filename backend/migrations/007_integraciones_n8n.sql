-- 007_integraciones_n8n.sql
-- Campos para la integración n8n + IA + proveedor de correo por empresa.
--
-- Diseño: el usuario crea sus propias credenciales en n8n (OAuth Outlook/Gmail
-- y API Key de OpenAI) y pega los IDs en su panel de Integraciones. El backend
-- los inyecta en el payload al disparar los webhooks, y el workflow de n8n los
-- usa como credentialId dinámico (n8n soporta expresión en el campo id de
-- credentials desde la v1.x).
--
-- empresas.n8n_webhook_url ya existía — guarda la URL del workflow de upload
-- manual de PDF. n8n_search_webhook y n8n_process_webhook también ya estaban
-- pero no se usaban; aquí los formalizamos con comentarios y agregamos los
-- credentialIds y el provider de correo.

ALTER TABLE empresas
    -- ID de la credencial OpenAI en n8n (para extracción IA). El usuario la
    -- crea en n8n una sola vez y pega el ID acá.
    ADD COLUMN IF NOT EXISTS n8n_credential_openai_id VARCHAR(100),

    -- ID de la credencial del proveedor de correo en n8n (para búsqueda de
    -- facturas en email — fase 2). Outlook/Gmail OAuth o IMAP.
    ADD COLUMN IF NOT EXISTS n8n_credential_email_id VARCHAR(100),

    -- Proveedor de correo usado en el workflow de búsqueda:
    --   'outlook' → Microsoft Outlook OAuth2
    --   'gmail'   → Gmail OAuth2
    --   'yahoo'   → IMAP genérico con credenciales de app
    --   'imap'    → IMAP genérico para cualquier otro proveedor
    ADD COLUMN IF NOT EXISTS n8n_email_provider VARCHAR(20)
        CHECK (n8n_email_provider IS NULL
               OR n8n_email_provider IN ('outlook', 'gmail', 'yahoo', 'imap')),

    -- Fecha de la última prueba exitosa del webhook de procesamiento.
    -- Permite mostrar en UI cuándo se validó por última vez.
    ADD COLUMN IF NOT EXISTS n8n_webhook_last_test TIMESTAMP,

    -- Estado del último test ('ok', 'error', null si nunca se probó).
    ADD COLUMN IF NOT EXISTS n8n_webhook_last_status VARCHAR(10)
        CHECK (n8n_webhook_last_status IS NULL
               OR n8n_webhook_last_status IN ('ok', 'error'));

COMMENT ON COLUMN empresas.n8n_webhook_url IS
    'URL del webhook n8n para upload manual de PDF. Recibe {apiKey, file_path, file_url, filename, empresa_id}';

COMMENT ON COLUMN empresas.n8n_search_webhook IS
    'URL del webhook n8n para búsqueda de correos (fase 2). Recibe {apiKey, requestId, callbackUrl, startDate, endDate, email, credential_email_id}';

COMMENT ON COLUMN empresas.n8n_process_webhook IS
    'URL del webhook n8n para procesar adjuntos seleccionados (fase 2). Recibe {apiKey, file_path, openai_credential_id}';

COMMENT ON COLUMN empresas.n8n_credential_openai_id IS
    'ID de la credencial OpenAI en n8n. El usuario lo copia del panel n8n > Credentials.';

COMMENT ON COLUMN empresas.n8n_credential_email_id IS
    'ID de la credencial del proveedor de correo en n8n (Outlook/Gmail OAuth o IMAP).';

COMMENT ON COLUMN empresas.api_key IS
    'API Key única por empresa. Se incluye en el header X-API-Key de los callbacks de n8n para autenticar.';

-- Índice para que el lookup por api_key (header X-API-Key) sea O(1)
CREATE UNIQUE INDEX IF NOT EXISTS ix_empresas_api_key ON empresas(api_key);
