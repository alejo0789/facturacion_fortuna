-- Migration: Add proveedor_feedback table for Knowledge Base
-- This table stores user feedback about processed invoices
-- The N8N agent can query this before processing new invoices

CREATE TABLE IF NOT EXISTS proveedor_feedback (
    id SERIAL PRIMARY KEY,
    proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
    factura_id INTEGER REFERENCES facturas(id),
    descripcion TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'user_system'
);

-- Index for fast lookup by proveedor
CREATE INDEX IF NOT EXISTS idx_proveedor_feedback_proveedor_id ON proveedor_feedback(proveedor_id);

-- Index for fast lookup by factura
CREATE INDEX IF NOT EXISTS idx_proveedor_feedback_factura_id ON proveedor_feedback(factura_id);
