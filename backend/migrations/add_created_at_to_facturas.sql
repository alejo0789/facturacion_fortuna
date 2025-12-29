-- Migration: Add created_at column to facturas table
-- This column tracks when the invoice was received/uploaded into the system

ALTER TABLE facturas 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update existing records to have a created_at based on their id ordering
-- This is a rough approximation for existing data
UPDATE facturas 
SET created_at = CURRENT_TIMESTAMP 
WHERE created_at IS NULL;
