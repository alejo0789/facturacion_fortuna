-- Migration: Add categories system for role-based invoice filtering
-- Run this migration against your PostgreSQL database

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    color VARCHAR(7) DEFAULT '#6366f1',
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100)
);

-- 2. Create category-role relationship table
CREATE TABLE IF NOT EXISTS categoria_roles (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    rol_id INTEGER NOT NULL,
    rol_nombre VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(categoria_id, rol_id)
);

-- 3. Add categoria_id column to facturas table
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id);

-- 4. Add categoria_id column to contratos table
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id);

-- 5. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_facturas_categoria ON facturas(categoria_id);
CREATE INDEX IF NOT EXISTS idx_contratos_categoria ON contratos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_categoria_roles_rol ON categoria_roles(rol_id);

-- 6. INITIAL DATA: Create 'Internet' category
INSERT INTO categorias (nombre, descripcion, color, activa, created_by)
VALUES ('Internet', 'Facturas de servicios de internet', '#6366f1', true, 'system_migration')
ON CONFLICT (nombre) DO NOTHING;

-- 7. Assign all existing facturas to 'Internet' category
UPDATE facturas SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Internet')
WHERE categoria_id IS NULL;

-- 8. Assign all existing contratos to 'Internet' category
UPDATE contratos SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Internet')
WHERE categoria_id IS NULL;

-- Summary of changes:
-- - Created 'categorias' table for category definitions
-- - Created 'categoria_roles' table for category-role assignments
-- - Added 'categoria_id' to facturas and contratos tables
-- - Migrated all existing data to 'Internet' category
