-- Migration: Add facturas table
-- Facturas can be created with only proveedor (contract not required initially)
-- Once oficina is manually assigned, contrato can be auto-detected

CREATE TABLE IF NOT EXISTS facturas (
    id SERIAL PRIMARY KEY,
    
    -- Relations (proveedor required, others optional initially)
    proveedor_id INT NOT NULL REFERENCES proveedores(id),
    oficina_id INT REFERENCES oficinas(id),
    contrato_id INT REFERENCES contratos(id),
    
    -- Invoice details
    numero_factura VARCHAR(100),
    cufe VARCHAR(255),  -- CUFE for Colombian electronic invoicing
    fecha_factura DATE,
    fecha_vencimiento DATE,
    valor DECIMAL(12, 2),
    
    -- Status for workflow
    estado VARCHAR(50) DEFAULT 'PENDIENTE',  -- PENDIENTE, ASIGNADA, PAGADA
    
    -- URL where the invoice is stored (received via API)
    url_factura VARCHAR(500),
    
    -- Audit fields
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor ON facturas(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_facturas_oficina ON facturas(oficina_id);
CREATE INDEX IF NOT EXISTS idx_facturas_contrato ON facturas(contrato_id);
CREATE INDEX IF NOT EXISTS idx_facturas_estado ON facturas(estado);
