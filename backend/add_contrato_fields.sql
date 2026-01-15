-- Agregar nuevos campos al modelo Contrato
-- Fecha: 2026-01-15

ALTER TABLE contratos 
ADD COLUMN IF NOT EXISTS referencia_contrato VARCHAR(100),
ADD COLUMN IF NOT EXISTS fecha_instalacion DATE,
ADD COLUMN IF NOT EXISTS fecha_retiro DATE;

-- Comentarios para documentar los campos
COMMENT ON COLUMN contratos.referencia_contrato IS 'Referencia adicional del contrato';
COMMENT ON COLUMN contratos.fecha_instalacion IS 'Fecha de instalación del servicio';
COMMENT ON COLUMN contratos.fecha_retiro IS 'Fecha de retiro del servicio';
