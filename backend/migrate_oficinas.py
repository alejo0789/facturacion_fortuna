"""
Script de migracion de oficinas desde Excel.
Lee el archivo proveedores.xlsx (Hoja2), y guarda en PostgreSQL.
"""
import pandas as pd
import asyncio
from database import SessionLocal
import models
import os


async def migrate_oficinas(excel_path: str):
    """
    Migrates offices from Excel file (Hoja2).
    """
    print(f"[INFO] Leyendo archivo Excel: {excel_path}, Hoja2")
    try:
        df = pd.read_excel(excel_path, sheet_name='Hoja2')
    except Exception as e:
        print(f"[ERROR] No se pudo leer la Hoja2: {e}")
        return

    # Columnas esperadas segun el usuario y la revision previa:
    # 'COD. OFI', 'NOMBRE OFICINA', 'TIPO SITIO DE VENTA ', 'Dude', 'DIRECCION', 'CIUDAD / MUNICIPIO', 'Zona'
    
    # Renombrar columnas para facilitar el acceso (quitando espacios extra)
    df.columns = [col.strip() for col in df.columns]
    
    stats = {
        "total": len(df),
        "success": 0,
        "already_exists": 0,
        "errors": 0
    }
    
    async with SessionLocal() as db:
        for index, row in df.iterrows():
            try:
                # 1. Extraer y limpiar Codigo Oficina
                cod_oficina = str(row.get('COD. OFI', '')).strip()
                if cod_oficina.lower() == 'n.a' or not cod_oficina or cod_oficina == 'nan':
                    cod_oficina = '0'
                
                # 2. Extraer otros campos
                nombre = str(row.get('NOMBRE OFICINA', '')).strip()
                tipo_sitio = str(row.get('TIPO SITIO DE VENTA', '')).strip()
                dude = str(row.get('Dude', '')).strip()
                direccion = str(row.get('DIRECCION', '')).strip()
                ciudad = str(row.get('CIUDAD / MUNICIPIO', '')).strip()
                zona = str(row.get('Zona', '')).strip()

                # Evitar basura de pandas (NaN)
                if nombre == 'nan': nombre = ""
                if tipo_sitio == 'nan': tipo_sitio = ""
                if dude == 'nan': dude = ""
                if direccion == 'nan': direccion = ""
                if ciudad == 'nan': ciudad = ""
                if zona == 'nan': zona = ""

                # Verificar si ya existe una oficina identica para no duplicar en la migracion
                # Usamos cod_oficina + nombre + ciudad como llave de unicidad simple para el script
                from sqlalchemy.future import select
                result = await db.execute(
                    select(models.Oficina).filter(
                        models.Oficina.cod_oficina == cod_oficina,
                        models.Oficina.nombre == nombre,
                        models.Oficina.ciudad == ciudad
                    )
                )
                existing = result.scalars().first()
                
                if existing:
                    # Opcional: actualizar si algo cambio? Por ahora saltamos
                    stats["already_exists"] += 1
                    continue
                
                # Crear oficina
                new_oficina = models.Oficina(
                    cod_oficina=cod_oficina,
                    nombre=nombre,
                    tipo_sitio=tipo_sitio,
                    dude=dude,
                    direccion=direccion,
                    ciudad=ciudad,
                    zona=zona
                )
                db.add(new_oficina)
                await db.commit()
                
                stats["success"] += 1
                if index % 10 == 0:
                    print(f"   [PROGRESS] Procesados {index}/{len(df)}...")
                
            except Exception as e:
                print(f"   [ERROR] En fila {index}: {str(e)}")
                stats["errors"] += 1
                await db.rollback()
    
    # Print summary
    print("\n" + "=" * 60)
    print("RESUMEN DE MIGRACION DE OFICINAS")
    print("=" * 60)
    print(f"   Total procesados:       {stats['total']}")
    print(f"   Migradas exitosamente:  {stats['success']}")
    print(f"   Ya existian:            {stats['already_exists']}")
    print(f"   Errores:                {stats['errors']}")
    print("=" * 60)
    
    return stats


if __name__ == "__main__":
    import os
    
    # Ruta por defecto
    excel_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), 
        "proveedores.xlsx"
    )
    
    print("=" * 60)
    print("MIGRACION DE OFICINAS")
    print("=" * 60)
    print(f"   Archivo: {excel_path}")
    print("=" * 60)
    
    asyncio.run(migrate_oficinas(excel_path))
