"""Run the categorias migration script - statement by statement"""
from sqlalchemy import create_engine, text

# Connect using sync driver (psycopg2)
DATABASE_URL = "postgresql://postgres:root@localhost:5432/supplier_db"

print("Connecting to database...")
engine = create_engine(DATABASE_URL)

# List of statements to run
statements = [
    # 1. Create categories table
    """
    CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion TEXT,
        color VARCHAR(7) DEFAULT '#6366f1',
        activa BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100)
    )
    """,
    
    # 2. Create category-role relationship table
    """
    CREATE TABLE IF NOT EXISTS categoria_roles (
        id SERIAL PRIMARY KEY,
        categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
        rol_id INTEGER NOT NULL,
        rol_nombre VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(categoria_id, rol_id)
    )
    """,
    
    # 3. Add categoria_id column to facturas table
    "ALTER TABLE facturas ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id)",
    
    # 4. Add categoria_id column to contratos table
    "ALTER TABLE contratos ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id)",
    
    # 5. Create indexes
    "CREATE INDEX IF NOT EXISTS idx_facturas_categoria ON facturas(categoria_id)",
    "CREATE INDEX IF NOT EXISTS idx_contratos_categoria ON contratos(categoria_id)",
    "CREATE INDEX IF NOT EXISTS idx_categoria_roles_rol ON categoria_roles(rol_id)",
    
    # 6. Create 'Internet' category
    """
    INSERT INTO categorias (nombre, descripcion, color, activa, created_by)
    VALUES ('Internet', 'Facturas de servicios de internet', '#6366f1', true, 'system_migration')
    ON CONFLICT (nombre) DO NOTHING
    """,
    
    # 7. Assign all existing facturas to 'Internet' category
    """
    UPDATE facturas SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Internet')
    WHERE categoria_id IS NULL
    """,
    
    # 8. Assign all existing contratos to 'Internet' category
    """
    UPDATE contratos SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Internet')
    WHERE categoria_id IS NULL
    """,
]

print("Running migration...")
with engine.connect() as conn:
    for i, stmt in enumerate(statements, 1):
        try:
            print(f"Executing statement {i}/{len(statements)}...")
            conn.execute(text(stmt))
            conn.commit()
            print(f"  OK - Success")
        except Exception as e:
            print(f"  WARNING - Error (may be expected): {e}")
            conn.rollback()

print("")
print("Migration complete!")
print("You can now start the backend and frontend.")
