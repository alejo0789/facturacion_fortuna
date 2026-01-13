-- Migration to add nombre_comercial column to proveedores table
-- This column stores an optional commercial/trade name for the provider
-- Run this script in PostgreSQL to add the column

ALTER TABLE proveedores 
ADD COLUMN IF NOT EXISTS nombre_comercial VARCHAR(255);

COMMENT ON COLUMN proveedores.nombre_comercial IS 'Commercial/trade name of the provider (optional)';
