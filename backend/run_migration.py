# -*- coding: utf-8 -*-
"""
Run migration to create factura_uploads table
"""

import asyncio
import sys
sys.path.insert(0, '.')

from database import SessionLocal
from sqlalchemy import text

async def main():
    async with SessionLocal() as db:
        sql = """
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
        
        CREATE INDEX IF NOT EXISTS idx_factura_uploads_upload_id ON factura_uploads(upload_id);
        CREATE INDEX IF NOT EXISTS idx_factura_uploads_status ON factura_uploads(status);
        """
        
        await db.execute(text(sql))
        await db.commit()
        print("Migration completed: factura_uploads table created")

asyncio.run(main())
