import pandas as pd
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/facturacion")

async def fix_duplicates():
    print("="*60)
    print("CORRECCION DE OFICINAS DUPLICADAS")
    print("="*60)
    
    # 1. Leer Excel
    try:
        df = pd.read_excel('../proveedores2.xlsx', sheet_name='Hoja2')
        # Limpieza de columna
        df['COD. OFI'] = df['COD. OFI'].astype(str).str.strip().str.replace('.0', '', regex=False)
        
        # Filtrar solo 001 y 010 en orden original
        excel_rows = df[df['COD. OFI'].isin(['001', '010'])].copy()
        print(f"[Excel] Filas encontradas: {len(excel_rows)}")
        
    except Exception as e:
        print(f"[ERROR] No se pudo leer el Excel: {e}")
        return

    # 2. Conectar a DB
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Traer oficinas existentes en orden de creacion (ID)
        # Buscamos las que son 001/010 O las que ya tienen INT (por si se corrio parcialmente)
        q = text("""
            SELECT id, cod_oficina FROM oficinas 
            WHERE cod_oficina IN ('001', '010') 
               OR cod_oficina LIKE '001_INT_%' 
               OR cod_oficina LIKE '010_INT_%'
            ORDER BY id ASC
        """)
        result = await session.execute(q)
        db_oficinas = result.fetchall()
        print(f"[DB] Oficinas conflictivas encontradas: {len(db_oficinas)}")
        
        if len(db_oficinas) != len(excel_rows):
            print("\n[ADVERTENCIA] El numero de oficinas en DB no coincide con Excel.")
            print("No se puede realizar mapeo automatico seguro 1:1.")
            print("Se aborta la operacion para evitar corrupcion de datos.")
            return

        print("\nIniciando actualizacion 1:1...")
        
        counters = {'001': 1, '010': 1}
        updated_count = 0
        
        # Iterar simultaneamente DB y Excel
        # zip match por orden posicional
        for db_row, (_, excel_row) in zip(db_oficinas, excel_rows.iterrows()):
            oficina_id = db_row[0]
            current_cod = db_row[1]
            
            original_cod_excel = excel_row['COD. OFI']
            
            # Generar nuevo codigo unico
            # 001 -> 001_INT_1, 010 -> 010_INT_1
            # Si ya tiene INT en DB, igual lo regeneramos para asegurar consistencia con el Excel
            
            new_cod = f"{original_cod_excel}_INT_{counters[original_cod_excel]}"
            counters[original_cod_excel] += 1
            
            # Datos a actualizar del Excel
            nombre = str(excel_row['NOMBRE OFICINA']).strip() if pd.notna(excel_row['NOMBRE OFICINA']) else None
            tipo_sitio = str(excel_row['TIPO SITIO DE VENTA ']).strip() if pd.notna(excel_row['TIPO SITIO DE VENTA ']) else None
            direccion = str(excel_row['DIRECCION']).strip() if pd.notna(excel_row['DIRECCION']) else None
            ciudad = str(excel_row['CIUDAD / MUNICIPIO']).strip() if pd.notna(excel_row['CIUDAD / MUNICIPIO']) else None
            zona = str(excel_row['Zona']).strip() if pd.notna(excel_row['Zona']) else None
            
            # Update Query
            update_q = text("""
                UPDATE oficinas 
                SET cod_oficina = :cod,
                    nombre = :nom,
                    tipo_sitio = :tipo,
                    direccion = :dir,
                    ciudad = :ciu,
                    zona = :zona
                WHERE id = :id
            """)
            
            await session.execute(update_q, {
                "cod": new_cod,
                "nom": nombre,
                "tipo": tipo_sitio,
                "dir": direccion,
                "ciu": ciudad,
                "zona": zona,
                "id": oficina_id
            })
            
            print(f"  [UPDATE] ID {oficina_id}: {current_cod} -> {new_cod} ({nombre})")
            updated_count += 1
            
        await session.commit()
        print(f"\n[EXITO] Se actualizaron {updated_count} oficinas.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(fix_duplicates())
