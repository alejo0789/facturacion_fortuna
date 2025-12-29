-- Add archivo_contrato column to contratos table
ALTER TABLE contratos 
ADD COLUMN IF NOT EXISTS archivo_contrato VARCHAR(500);

-- Comment describing the column
COMMENT ON COLUMN contratos.archivo_contrato IS 'Relative path to the contract PDF file';
