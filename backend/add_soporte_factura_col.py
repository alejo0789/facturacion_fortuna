from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

load_dotenv()
# Fallback to local if not found
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:root@localhost:5432/supplier_db")
# Force sync driver
DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg", "postgresql")

print(f"Connecting to {DATABASE_URL}...")
engine = create_engine(DATABASE_URL)

stmt = """
ALTER TABLE soportes_bancarios 
ADD COLUMN IF NOT EXISTS factura_id INTEGER REFERENCES facturas(id) ON DELETE SET NULL;
"""

try:
    with engine.connect() as conn:
        conn.execute(text(stmt))
        conn.commit()
        print("Column factura_id added to soportes_bancarios successfully!")
except Exception as e:
    print(f"Error: {e}")
