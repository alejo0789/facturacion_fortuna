"""
Script para actualizar oficinas en la base de datos:
1. Verificar y reportar oficinas con cod_oficina = '0'
2. Insertar/actualizar oficinas 001 y 010 desde proveedores2.xlsx
"""
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

async def update_oficinas():
    """Main function to update oficinas"""
    
    # Create async engine
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            # ===== PASO 1: Verificar oficinas con cod_oficina = '0' =====
            print("\n" + "="*60)
            print("PASO 1: Verificando oficinas con cod_oficina = '0'")
            print("="*60)
            
            # Contar oficinas con código '0'
            count_query = text("SELECT COUNT(*) FROM oficinas WHERE cod_oficina = '0'")
            result = await session.execute(count_query)
            count_zero = result.scalar()
            print(f"Oficinas con codigo '0' encontradas: {count_zero}")
            
            # Verificar si tienen referencias en factura_oficinas
            check_refs_query = text("""
                SELECT COUNT(*) FROM factura_oficinas fo
                JOIN oficinas o ON fo.oficina_id = o.id
                WHERE o.cod_oficina = '0'
            """)
            result = await session.execute(check_refs_query)
            refs_count = result.scalar()
            
            deleted_count = 0
            if refs_count > 0:
                print(f"ADVERTENCIA: {refs_count} referencias en factura_oficinas. No se pueden borrar.")
                print("Se continuara con la insercion/actualizacion de oficinas 001 y 010.")
            else:
                # Si no hay referencias, borrar
                delete_query = text("DELETE FROM oficinas WHERE cod_oficina = '0'")
                result = await session.execute(delete_query)
                deleted_count = result.rowcount
                print(f"[OK] Oficinas borradas: {deleted_count}")
            
            # ===== PASO 2: Leer Excel y filtrar oficinas 001 y 010 =====
            print("\n" + "="*60)
            print("PASO 2: Leyendo archivo Excel")
            print("="*60)
            
            # Leer el archivo Excel - Hoja2 contiene las oficinas
            df = pd.read_excel('../proveedores2.xlsx', sheet_name='Hoja2')
            
            print(f"Total filas en Excel: {len(df)}")
            print(f"Columnas: {df.columns.tolist()}")
            
            # Filtrar solo oficinas 001 y 010
            oficinas_filtradas = df[df['COD. OFI'].isin(['001', '010'])].copy()
            
            print(f"\n[OK] Oficinas filtradas (001, 010): {len(oficinas_filtradas)}")
            print("\nOficinas a insertar:")
            print(oficinas_filtradas[['COD. OFI', 'NOMBRE OFICINA', 'CIUDAD / MUNICIPIO']].to_string())
            
            # ===== PASO 3: Insertar oficinas en la base de datos =====
            print("\n" + "="*60)
            print("PASO 3: Insertando oficinas en la base de datos")
            print("="*60)
            
            inserted_count = 0
            
            # Contadores para generar codigos internos unicos
            counters = {'001': 1, '010': 1}
            
            for idx, row in oficinas_filtradas.iterrows():
                original_cod = str(row['COD. OFI']).strip()
                nombre = str(row['NOMBRE OFICINA']).strip() if pd.notna(row['NOMBRE OFICINA']) else None
                # Nota: La columna tiene un espacio al final en el Excel
                tipo_sitio = str(row['TIPO SITIO DE VENTA ']).strip() if pd.notna(row['TIPO SITIO DE VENTA ']) else None
                direccion = str(row['DIRECCION']).strip() if pd.notna(row['DIRECCION']) else None
                ciudad = str(row['CIUDAD / MUNICIPIO']).strip() if pd.notna(row['CIUDAD / MUNICIPIO']) else None
                zona = str(row['Zona']).strip() if pd.notna(row['Zona']) else None
                
                # Generar codigo interno unico: 001 -> 001_INT_1, 001_INT_2, etc.
                if original_cod in counters:
                    cod_oficina = f"{original_cod}_INT_{counters[original_cod]}"
                    counters[original_cod] += 1
                else:
                    cod_oficina = original_cod

                # Insertar siempre como nueva oficina (permite duplicados de cod_oficina)
                insert_query = text("""
                    INSERT INTO oficinas (cod_oficina, nombre, tipo_sitio, direccion, ciudad, zona)
                    VALUES (:cod_oficina, :nombre, :tipo_sitio, :direccion, :ciudad, :zona)
                """)
                await session.execute(insert_query, {
                    "cod_oficina": cod_oficina,
                    "nombre": nombre,
                    "tipo_sitio": tipo_sitio,
                    "direccion": direccion,
                    "ciudad": ciudad,
                    "zona": zona
                })
                print(f"  [NEW] Insertada oficina: {cod_oficina} (Original: {original_cod}) - {nombre}")
                inserted_count += 1
            
            # Commit de todas las operaciones
            await session.commit()
            
            print("\n" + "="*60)
            print("RESUMEN")
            print("="*60)
            print(f"[OK] Oficinas borradas (cod='0'): {deleted_count}")
            print(f"[OK] Oficinas nuevas insertadas: {inserted_count}")
            print(f"[OK] Total procesadas: {len(oficinas_filtradas)}")
            print("="*60)
            
            # Verificar las oficinas actuales
            print("\n" + "="*60)
            print("VERIFICACION: Oficinas 001 y 010 en la base de datos")
            print("="*60)
            
            verify_query = text("""
                SELECT id, cod_oficina, nombre, tipo_sitio, ciudad, zona 
                FROM oficinas 
                WHERE cod_oficina IN ('001', '010') OR cod_oficina LIKE '001_INT_%' OR cod_oficina LIKE '010_INT_%'
                ORDER BY cod_oficina
            """)
            result = await session.execute(verify_query)
            oficinas = result.fetchall()
            
            for oficina in oficinas:
                print(f"\nID: {oficina[0]}")
                print(f"  Codigo: {oficina[1]}")
                print(f"  Nombre: {oficina[2]}")
                print(f"  Tipo Sitio: {oficina[3]}")
                print(f"  Ciudad: {oficina[4]}")
                print(f"  Zona: {oficina[5]}")
            
        except Exception as e:
            await session.rollback()
            print(f"\n[ERROR] {e}")
            raise
        finally:
            await engine.dispose()

if __name__ == "__main__":
    print("="*60)
    print("ACTUALIZACION DE OFICINAS")
    print("="*60)
    asyncio.run(update_oficinas())
