"""
Script para insertar contratos de oficinas 001 y 010 desde proveedores2.xlsx
"""
import pandas as pd
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/facturacion")

async def insert_contratos():
    """Insert contracts for offices 001 and 010"""
    
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            print("="*60)
            print("INSERTAR CONTRATOS DE OFICINAS 001 Y 010")
            print("="*60)
            
            # Leer Excel - Hoja2
            print("\nLeyendo archivo Excel...")
            df = pd.read_excel('../proveedores2.xlsx', sheet_name='Hoja2')
            print(f"Total filas: {len(df)}")
            
            # Filtrar oficinas 001 y 010
            contratos_filtrados = df[df['COD. OFI'].isin(['001', '010'])].copy()
            print(f"Contratos filtrados (001, 010): {len(contratos_filtrados)}")
            
            # Obtener mapeo de proveedores (NIT -> ID)
            print("\nObteniendo proveedores...")
            prov_query = text("SELECT id, nit FROM proveedores")
            result = await session.execute(prov_query)
            proveedores_map = {row[1]: row[0] for row in result.fetchall()}
            print(f"Proveedores en BD: {len(proveedores_map)}")
            
            # Obtener mapeo de oficinas recién insertadas (COD_OFICINA -> IDs)
            print("\nObteniendo oficinas 001 y 010...")
            oficinas_query = text("""
                SELECT id, cod_oficina, nombre, ciudad 
                FROM oficinas 
                WHERE cod_oficina IN ('001', '010')
                ORDER BY id DESC
            """)
            result = await session.execute(oficinas_query)
            oficinas_list = result.fetchall()
            print(f"Oficinas encontradas: {len(oficinas_list)}")
            
            # Crear un mapeo más específico: por código, nombre y ciudad
            oficinas_map = {}
            for ofi in oficinas_list:
                key = (str(ofi[1]), str(ofi[2] or ''), str(ofi[3] or ''))
                if key not in oficinas_map:
                    oficinas_map[key] = []
                oficinas_map[key].append(ofi[0])
            
            print("\n" + "="*60)
            print("INSERTANDO CONTRATOS")
            print("="*60)
            
            inserted_count = 0
            skipped_count = 0
            
            for idx, row in contratos_filtrados.iterrows():
                # Datos del Excel - USAR nit_proveedor
                # Convertir a int primero para eliminar .0, luego a string
                nit = None
                if pd.notna(row['nit_proveedor']):
                    try:
                        nit = str(int(float(row['nit_proveedor'])))
                    except:
                        nit = str(row['nit_proveedor']).strip()
                
                cod_oficina = str(row['COD. OFI']).strip()
                nombre_oficina = str(row['NOMBRE OFICINA']).strip() if pd.notna(row['NOMBRE OFICINA']) else ''
                ciudad = str(row['CIUDAD / MUNICIPIO']).strip() if pd.notna(row['CIUDAD / MUNICIPIO']) else ''
                
                titular_nombre = str(row['TITULAR']).strip() if pd.notna(row['TITULAR']) else None
                titular_cc_nit = str(row['C.C. / NIT ']).strip() if pd.notna(row['C.C. / NIT ']) else None
                linea = str(row['LINEA ']).strip() if pd.notna(row['LINEA ']) else None
                
                # REF.PAGO va tanto en num_contrato como en ref_pago
                ref_pago_value = str(row['REF.PAGO']).strip() if pd.notna(row['REF.PAGO']) else None
                num_contrato = ref_pago_value  # Usar REF.PAGO como número de contrato
                ref_pago = ref_pago_value  # También en ref_pago
                
                # Fechas - Excel las guarda como números de serie
                fecha_inicio = None
                if pd.notna(row['FECHA INICIO CONTRATO']):
                    try:
                        # pd.to_datetime maneja automáticamente números de serie de Excel
                        fecha_inicio = pd.to_datetime(row['FECHA INICIO CONTRATO']).date()
                    except:
                        pass
                
                fecha_fin = None
                if pd.notna(row['FECHA FINALIZACIÓN']):
                    try:
                        fecha_fin = pd.to_datetime(row['FECHA FINALIZACIÓN']).date()
                    except:
                        pass
                
                dude = str(row['Dude']).strip() if pd.notna(row['Dude']) else None
                tipo = str(row['TIPO']).strip() if pd.notna(row['TIPO']) else None
                tipo_plan = str(row['TIPO PLAN']).strip() if pd.notna(row['TIPO PLAN']) else None
                tipo_canal = str(row['TIPO DE CANAL ']).strip() if pd.notna(row['TIPO DE CANAL ']) else None
                
                # Valor mensual
                valor_mensual = None
                if pd.notna(row['VALOR']):
                    try:
                        valor_mensual = float(row['VALOR'])
                    except:
                        pass
                
                estado = str(row['ESTADO']).strip() if pd.notna(row['ESTADO']) else None
                observaciones = str(row['OBSERVACIONES']).strip() if pd.notna(row['OBSERVACIONES']) else None
                
                # Impuestos
                iva_str = str(row['IVA']).strip().lower() if pd.notna(row['IVA']) else 'no'
                tiene_iva = 'si' if iva_str in ['si', 'sí', 's', 'yes', '1', 'true'] else 'no'
                
                retencion_str = str(row['RETENCION']).strip().lower() if pd.notna(row['RETENCION']) else 'no'
                tiene_retefuente = 'si' if retencion_str in ['si', 'sí', 's', 'yes', '1', 'true'] else 'no'
                
                # Porcentaje de retención (por defecto 4%)
                retefuente_pct = 4.0 if tiene_retefuente == 'si' else None
                
                # Buscar proveedor_id
                proveedor_id = proveedores_map.get(nit)
                if not proveedor_id:
                    print(f"  [SKIP] NIT {nit} no encontrado en proveedores")
                    skipped_count += 1
                    continue
                
                # Buscar oficina_id
                key = (cod_oficina, nombre_oficina, ciudad)
                oficina_ids = oficinas_map.get(key)
                
                if not oficina_ids:
                    # Intentar buscar solo por código
                    for k, v in oficinas_map.items():
                        if k[0] == cod_oficina:
                            oficina_ids = v
                            break
                
                if not oficina_ids:
                    print(f"  [SKIP] Oficina {cod_oficina} - {nombre_oficina} no encontrada")
                    skipped_count += 1
                    continue
                
                # Usar el primer ID disponible
                oficina_id = oficina_ids[0]
                
                # Insertar contrato
                insert_query = text("""
                    INSERT INTO contratos (
                        proveedor_id, oficina_id, titular_nombre, titular_cc_nit,
                        linea, num_contrato, fecha_inicio, fecha_fin, estado, observaciones,
                        dude, tipo, ref_pago, tipo_plan, tipo_canal, valor_mensual,
                        tiene_iva, tiene_retefuente, retefuente_pct
                    ) VALUES (
                        :proveedor_id, :oficina_id, :titular_nombre, :titular_cc_nit,
                        :linea, :num_contrato, :fecha_inicio, :fecha_fin, :estado, :observaciones,
                        :dude, :tipo, :ref_pago, :tipo_plan, :tipo_canal, :valor_mensual,
                        :tiene_iva, :tiene_retefuente, :retefuente_pct
                    )
                """)
                
                await session.execute(insert_query, {
                    "proveedor_id": proveedor_id,
                    "oficina_id": oficina_id,
                    "titular_nombre": titular_nombre,
                    "titular_cc_nit": titular_cc_nit,
                    "linea": linea,
                    "num_contrato": num_contrato,
                    "fecha_inicio": fecha_inicio,
                    "fecha_fin": fecha_fin,
                    "estado": estado,
                    "observaciones": observaciones,
                    "dude": dude,
                    "tipo": tipo,
                    "ref_pago": ref_pago,
                    "tipo_plan": tipo_plan,
                    "tipo_canal": tipo_canal,
                    "valor_mensual": valor_mensual,
                    "tiene_iva": tiene_iva,
                    "tiene_retefuente": tiene_retefuente,
                    "retefuente_pct": retefuente_pct
                })
                
                print(f"  [NEW] Contrato: {nit} - Ofi:{cod_oficina} - {titular_nombre} - ${valor_mensual}")
                inserted_count += 1
            
            # Commit
            await session.commit()
            
            print("\n" + "="*60)
            print("RESUMEN")
            print("="*60)
            print(f"[OK] Contratos insertados: {inserted_count}")
            print(f"[SKIP] Contratos omitidos: {skipped_count}")
            print(f"[OK] Total procesados: {len(contratos_filtrados)}")
            print("="*60)
            
        except Exception as e:
            await session.rollback()
            print(f"\n[ERROR] {e}")
            import traceback
            traceback.print_exc()
            raise
        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(insert_contratos())
