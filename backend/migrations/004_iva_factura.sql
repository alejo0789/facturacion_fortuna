-- =========================================================================
-- Migración 004 — Columna `iva` opcional en `facturas`
--
-- Origen: trabajo del compañero en main. n8n envía el monto de IVA explícito
-- desde el OCR, y el backend lo persiste para que la causación lo respete
-- en vez de calcularlo con la tarifa default.
--
-- Idempotente: usa ADD COLUMN IF NOT EXISTS.
--
-- Cómo aplicar:
--   psql -U postgres -d supplier_db -f migrations/004_iva_factura.sql
-- =========================================================================

ALTER TABLE facturas
    ADD COLUMN IF NOT EXISTS iva NUMERIC(12, 2);
