-- =========================================================================
-- Migración 002 — Índice UNIQUE parcial para conciliación bancaria
-- Aplicable a una base de datos PostgreSQL con la iteración 2 ya corrida.
--
-- Idempotente: usa CREATE UNIQUE INDEX IF NOT EXISTS.
--
-- Qué hace:
--   Garantiza que una línea contable sólo pueda estar CONCILIADA contra
--   una única transacción bancaria. Previene la race condition donde dos
--   requests paralelos a `POST /bancario/conciliacion/aprobar` marcan la
--   misma `linea_asiento_id` en transacciones distintas.
--
--   El índice es PARCIAL (WHERE estado_conciliacion = 'CONCILIADO') para
--   no restringir transacciones SUGERIDAS o NO_CONCILIADAS, y para permitir
--   múltiples filas NULL en `linea_asiento_id`.
--
--   SQLAlchemy ya declara el mismo índice en el modelo; esta migración
--   permite crearlo sobre bases existentes sin esperar a que Base.metadata
--   lo genere en el arranque (lo cual fallaría si ya hay duplicados).
--
-- Cómo aplicar:
--   psql -U postgres -d supplier_db -f migrations/002_conciliacion_unique.sql
--
-- Antes de aplicar, si la base ya tiene duplicados, limpiarlos:
--   SELECT linea_asiento_id, COUNT(*) FROM transaccion_bancaria
--   WHERE estado_conciliacion = 'CONCILIADO' AND linea_asiento_id IS NOT NULL
--   GROUP BY linea_asiento_id HAVING COUNT(*) > 1;
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_transaccion_bancaria_linea_conciliada
    ON transaccion_bancaria (linea_asiento_id)
    WHERE estado_conciliacion = 'CONCILIADO';
