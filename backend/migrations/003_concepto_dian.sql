-- =========================================================================
-- Migración 003 — Concepto DIAN en LineaAsiento + tarifas retefuente
-- por concepto DIAN colombiano (Resolución de medios magnéticos).
--
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT.
--
-- Qué hace:
--   1. Agrega columna concepto_dian (varchar 10) a linea_asiento + índice.
--   2. Inserta las tarifas estándar de retefuente por concepto DIAN para
--      todas las empresas que ya tengan una ConfiguracionImpuesto activa
--      tipo RETEFUENTE.
--
--      Conceptos DIAN base 2026 (Resolución DIAN — verificar UVT vigente):
--        5001 Honorarios       → 11.00 %, base mínima 0
--        5002 Servicios        →  4.00 %, base 4 UVT  (~$188.000)
--        5003 Compras          →  2.50 %, base 27 UVT (~$1.270.000)
--        5004 Arrendamientos   →  3.50 %, base 27 UVT
--        5005 Transporte carga →  1.00 %, base 4 UVT
--        5006 Comisiones       → 11.00 %, base 0
--        5007 Rendimientos fin →  7.00 %, base 0
--
-- Cómo aplicar:
--   psql -U postgres -d supplier_db -f migrations/003_concepto_dian.sql
-- =========================================================================

-- 1. Columna concepto_dian
ALTER TABLE linea_asiento
    ADD COLUMN IF NOT EXISTS concepto_dian VARCHAR(10);

CREATE INDEX IF NOT EXISTS ix_linea_asiento_concepto_dian
    ON linea_asiento (concepto_dian);

-- 2. Tarifas retefuente por concepto DIAN
--    Para cada empresa con configuracion_impuesto tipo RETEFUENTE, sembrar
--    los conceptos estándar. ON CONFLICT preserva valores ya configurados.
INSERT INTO tarifa_impuesto (configuracion_id, concepto, tarifa_pct, base_minima, es_default)
SELECT ci.id, t.concepto, t.tarifa_pct, t.base_minima, false
FROM configuracion_impuesto ci
CROSS JOIN (VALUES
    ('5001 Honorarios',        11.00,        0.00),
    ('5002 Servicios',          4.00,   188000.00),
    ('5003 Compras',            2.50,  1270000.00),
    ('5004 Arrendamientos',     3.50,  1270000.00),
    ('5005 Transporte carga',   1.00,   188000.00),
    ('5006 Comisiones',        11.00,        0.00),
    ('5007 Rendimientos fin',   7.00,        0.00)
) AS t(concepto, tarifa_pct, base_minima)
WHERE ci.tipo = 'RETEFUENTE'
  AND ci.activo = true
  AND NOT EXISTS (
      SELECT 1 FROM tarifa_impuesto ti
      WHERE ti.configuracion_id = ci.id
        AND ti.concepto = t.concepto
  );
