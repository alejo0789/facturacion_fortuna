-- Migration: Add factura_oficinas table for many-to-many relationship
-- A factura can have multiple oficinas, each with its own assigned value

CREATE TABLE IF NOT EXISTS factura_oficinas (
    id SERIAL PRIMARY KEY,
    
    -- Relations
    factura_id INT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    oficina_id INT NOT NULL REFERENCES oficinas(id),
    contrato_id INT REFERENCES contratos(id),  -- Auto-detected based on proveedor + oficina
    
    -- Value assigned to this oficina for this factura
    valor DECIMAL(12, 2) NOT NULL DEFAULT 0,
    
    -- Status for this specific assignment
    estado VARCHAR(50) DEFAULT 'PENDIENTE',  -- PENDIENTE, PAGADA
    
    -- Audit
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique combination of factura + oficina
    UNIQUE(factura_id, oficina_id)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_factura_oficinas_factura ON factura_oficinas(factura_id);
CREATE INDEX IF NOT EXISTS idx_factura_oficinas_oficina ON factura_oficinas(oficina_id);
CREATE INDEX IF NOT EXISTS idx_factura_oficinas_contrato ON factura_oficinas(contrato_id);

-- Note: The existing oficina_id and contrato_id columns in facturas table will be deprecated
-- but kept for backward compatibility. New logic should use factura_oficinas table.
