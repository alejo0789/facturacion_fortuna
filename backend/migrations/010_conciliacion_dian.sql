-- =============================================================
-- Migración 010: Conciliación DIAN — histórico oficial de facturación
--
-- Tablas y columnas para soportar la nueva pestaña /app/dian:
--   - Guardar credencial DIAN (cédula del representante) encriptada.
--   - Guardar sesión activa (cookies) para reusar entre syncs.
--   - Almacenar el histórico oficial DIAN por empresa (documentos_dian).
--   - Rastrear el estado de cada sincronización (dian_sync_jobs).
-- =============================================================

BEGIN;

-- ---------- Empresa: credencial DIAN + sesión activa ----------
-- cedula_representante_enc: encriptada con Fernet. Solo se pide una vez
-- (o cada vez si el operador prefiere no persistirla — configurable).
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS dian_cedula_representante_enc TEXT;

-- Sesión Playwright (cookies + localStorage) serializada y encriptada.
-- Vive mientras el portal no la expire. Cuando expire, el sync pedirá
-- nuevo magic link automáticamente.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS dian_sesion_estado_enc TEXT;

-- Timestamp del último sync exitoso (para mostrar en UI).
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS dian_ultima_sync TIMESTAMP;

-- Periodicidad tributaria del contribuyente (bimestral/cuatrimestral/anual).
-- Se usa para calcular resumen IVA agrupado en la periodicidad correcta.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS dian_periodicidad VARCHAR(20) DEFAULT 'bimestral';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'empresas' AND constraint_name = 'ck_dian_periodicidad'
  ) THEN
    ALTER TABLE empresas
      ADD CONSTRAINT ck_dian_periodicidad
      CHECK (dian_periodicidad IN ('bimestral', 'cuatrimestral', 'anual'));
  END IF;
END $$;


-- ---------- Documentos DIAN ----------
-- El histórico oficial de facturación electrónica descargado del portal
-- DIAN por empresa. Cada fila = un documento electrónico (factura o nota).
-- La conciliación cruza estos documentos contra la tabla `facturas`
-- (que representa lo procesado por el usuario en la app).
CREATE TABLE IF NOT EXISTS documentos_dian (
    id                SERIAL PRIMARY KEY,
    empresa_id        INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

    -- Identificadores del documento electrónico
    cufe              VARCHAR(100),                 -- CUFE/CUDE - unique cuando existe
    prefijo           VARCHAR(20),
    folio             VARCHAR(50),
    tipo_documento    VARCHAR(80) NOT NULL,         -- "Factura electrónica", "Nota de crédito electrónica", etc.
    grupo             VARCHAR(20),                  -- "Emitidos" (venta) o "Recibidos" (compra)

    -- Fechas
    fecha_emision     DATE,
    fecha_recepcion   DATE,

    -- Emisor / receptor
    nit_emisor        VARCHAR(30),
    nombre_emisor     VARCHAR(500),
    nit_receptor      VARCHAR(30),
    nombre_receptor   VARCHAR(500),

    -- Valores monetarios (números con decimales, todos en COP)
    valor             NUMERIC(18,2) DEFAULT 0,      -- Total tal como lo trae DIAN
    iva               NUMERIC(18,2) DEFAULT 0,
    rete_iva          NUMERIC(18,2) DEFAULT 0,
    rete_renta        NUMERIC(18,2) DEFAULT 0,
    rete_ica          NUMERIC(18,2) DEFAULT 0,

    -- Valores ajustados (NC en negativo, valor_bruto = valor - iva)
    valor_ajustado    NUMERIC(18,2) DEFAULT 0,
    iva_ajustado      NUMERIC(18,2) DEFAULT 0,
    valor_bruto       NUMERIC(18,2) DEFAULT 0,

    -- Estado del documento en el portal DIAN (Notificado / Rechazado / etc.)
    estado            VARCHAR(80),

    -- Metadata local
    downloaded_at     TIMESTAMP DEFAULT NOW(),
    sync_job_id       INTEGER                       -- referencia a dian_sync_jobs
);

-- Idempotencia por CUFE + empresa cuando el CUFE existe; para documentos
-- sin CUFE cae al set (prefijo+folio+nit_emisor).
CREATE UNIQUE INDEX IF NOT EXISTS uq_documento_dian_cufe
  ON documentos_dian (empresa_id, cufe)
  WHERE cufe IS NOT NULL AND cufe <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_documento_dian_folio
  ON documentos_dian (empresa_id, nit_emisor, prefijo, folio)
  WHERE cufe IS NULL OR cufe = '';

CREATE INDEX IF NOT EXISTS ix_documento_dian_empresa_fecha
  ON documentos_dian (empresa_id, fecha_emision);

CREATE INDEX IF NOT EXISTS ix_documento_dian_grupo
  ON documentos_dian (empresa_id, grupo);


-- ---------- Sync jobs ----------
-- Rastrea el estado de cada intento de sincronización con el portal DIAN.
-- Estados: 'pending_magic_link' → 'in_progress' → 'completed' | 'failed'.
-- Cuando el usuario dispara /dian/sync/start, se crea aquí con estado
-- pending_magic_link (o in_progress si la sesión aún era válida).
CREATE TABLE IF NOT EXISTS dian_sync_jobs (
    id                SERIAL PRIMARY KEY,
    empresa_id        INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

    -- Rango solicitado
    fecha_desde       DATE NOT NULL,
    fecha_hasta       DATE NOT NULL,

    -- Estado del job
    estado            VARCHAR(30) NOT NULL DEFAULT 'pending_magic_link',
    mensaje           TEXT,                          -- razón de fallo, o info

    -- Timings
    creado_en         TIMESTAMP DEFAULT NOW(),
    magic_link_recibido_en  TIMESTAMP,
    completado_en     TIMESTAMP,

    -- Resultado
    documentos_nuevos     INTEGER DEFAULT 0,
    documentos_actualizados INTEGER DEFAULT 0,
    documentos_totales    INTEGER DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'dian_sync_jobs' AND constraint_name = 'ck_dian_sync_estado'
  ) THEN
    ALTER TABLE dian_sync_jobs
      ADD CONSTRAINT ck_dian_sync_estado
      CHECK (estado IN ('pending_magic_link', 'in_progress', 'completed', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_dian_sync_empresa_creado
  ON dian_sync_jobs (empresa_id, creado_en DESC);


COMMIT;

-- ---------- Verificación ----------
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'empresas' AND column_name LIKE 'dian_%'
  ORDER BY ordinal_position;

SELECT table_name FROM information_schema.tables
  WHERE table_name IN ('documentos_dian', 'dian_sync_jobs');
