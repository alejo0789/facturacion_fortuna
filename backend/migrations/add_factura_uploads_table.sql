-- Migration: Add factura_uploads table for tracking PDF uploads and n8n processing
-- Run this migration to create the table

CREATE TABLE IF NOT EXISTS factura_uploads (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) UNIQUE NOT NULL,
    filename VARCHAR(255),
    original_filename VARCHAR(255),
    file_path TEXT,
    file_url TEXT,
    status VARCHAR(50) DEFAULT 'UPLOADING',
    error_message TEXT,
    factura_id INTEGER REFERENCES facturas(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Index for faster lookups by upload_id
CREATE INDEX IF NOT EXISTS idx_factura_uploads_upload_id ON factura_uploads(upload_id);
CREATE INDEX IF NOT EXISTS idx_factura_uploads_status ON factura_uploads(status);
