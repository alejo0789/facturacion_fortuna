"""
Script de migracion de proveedores desde Excel.
Lee el archivo proveedores.xlsx, extrae los NITs, 
consulta el nombre en Oracle MANAGER.VINCULADO y guarda en PostgreSQL.
"""
import pandas as pd
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from database import SessionLocal
from oracle_database import get_proveedor_by_nit_oracle
import models
import re


async def migrate_proveedores(excel_path: str):
    """
    Migrates providers from Excel file.
    Reads NIT from "NUMERO DE ID" column, queries Oracle for name, 
    and saves to PostgreSQL.
    """
    # Read Excel file
    print(f"[INFO] Leyendo archivo Excel: {excel_path}")
    df = pd.read_excel(excel_path)
    
    # Find the column with NIT (might be named differently)
    print(f"[INFO] Columnas encontradas: {list(df.columns)}")
    
    # Look for column containing "NUMERO DE ID" or "NUMERO"
    nit_column = None
    for col in df.columns:
        col_upper = str(col).upper()
        if 'NUMERO DE ID' in col_upper:
            nit_column = col
            break
        elif 'NUMERO' in col_upper and nit_column is None:
            nit_column = col
    
    if nit_column is None:
        print("[ERROR] No se encontro la columna con el numero de identificacion")
        print("   Usando la primera columna:", df.columns[0])
        nit_column = df.columns[0]
    
    print(f"[INFO] Usando columna: '{nit_column}'")
    
    # Get unique NITs
    nits_raw = df[nit_column].dropna().unique()
    print(f"[INFO] Total de registros unicos en el archivo: {len(nits_raw)}")
    
    # Process NITs - remove part after hyphen if exists
    nits_processed = []
    for nit_raw in nits_raw:
        nit_str = str(nit_raw).strip()
        # Remove part after hyphen (e.g., "12345-1" -> "12345")
        if '-' in nit_str:
            nit_clean = nit_str.split('-')[0].strip()
        else:
            nit_clean = nit_str
        
        # Remove any non-numeric characters for safety, but keep the original for lookup
        nit_clean = re.sub(r'[^\d]', '', nit_clean)
        
        if nit_clean:
            nits_processed.append(nit_clean)
    
    # Remove duplicates after processing
    nits_unique = list(set(nits_processed))
    print(f"[INFO] NITs unicos a procesar: {len(nits_unique)}")
    
    # Statistics
    stats = {
        "total": len(nits_unique),
        "success": 0,
        "not_found_oracle": 0,
        "already_exists": 0,
        "errors": 0
    }
    
    async with SessionLocal() as db:
        for i, nit in enumerate(nits_unique, 1):
            try:
                print(f"\n[{i}/{len(nits_unique)}] Procesando NIT: {nit}")
                
                # Check if proveedor already exists in our DB
                from sqlalchemy.future import select
                result = await db.execute(
                    select(models.Proveedor).filter(models.Proveedor.nit == nit)
                )
                existing = result.scalars().first()
                
                if existing:
                    print(f"   [SKIP] Ya existe en BD: {existing.nombre}")
                    stats["already_exists"] += 1
                    continue
                
                # Query Oracle for provider name
                oracle_result = get_proveedor_by_nit_oracle(nit)
                
                if oracle_result is None:
                    print(f"   [WARN] No encontrado en Oracle (VINCULADO)")
                    stats["not_found_oracle"] += 1
                    continue
                
                nombre = oracle_result["nombre"]
                print(f"   [OK] Encontrado en Oracle: {nombre}")
                
                # Create proveedor in our DB
                new_proveedor = models.Proveedor(
                    nit=nit,
                    nombre=nombre
                )
                db.add(new_proveedor)
                await db.commit()
                
                print(f"   [SAVED] Guardado en PostgreSQL")
                stats["success"] += 1
                
            except Exception as e:
                print(f"   [ERROR] {str(e)}")
                stats["errors"] += 1
                await db.rollback()
    
    # Print summary
    print("\n" + "=" * 60)
    print("RESUMEN DE MIGRACION")
    print("=" * 60)
    print(f"   Total procesados:       {stats['total']}")
    print(f"   Migrados exitosamente:  {stats['success']}")
    print(f"   Ya existian:            {stats['already_exists']}")
    print(f"   No encontrados Oracle:  {stats['not_found_oracle']}")
    print(f"   Errores:                {stats['errors']}")
    print("=" * 60)
    
    return stats


if __name__ == "__main__":
    import sys
    import os
    
    # Default path - adjust to your Excel file location
    excel_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), 
        "proveedores.xlsx"
    )
    
    # Allow custom path from command line
    if len(sys.argv) > 1:
        excel_path = sys.argv[1]
    
    print("=" * 60)
    print("MIGRACION DE PROVEEDORES")
    print("=" * 60)
    print(f"   Archivo: {excel_path}")
    print("=" * 60)
    
    asyncio.run(migrate_proveedores(excel_path))
