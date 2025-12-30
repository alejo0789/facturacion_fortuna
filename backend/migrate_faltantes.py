# -*- coding: utf-8 -*-
"""
Script para verificar y migrar las filas que aún faltan.
"""

import pandas as pd
import asyncio
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, '.')
from database import SessionLocal
from models import Proveedor, Oficina, Contrato
from sqlalchemy.future import select
from sqlalchemy import func
from dotenv import load_dotenv
import os

load_dotenv()

EXCEL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'proveedores.xlsx')

def limpiar_nit(nit_value):
    if pd.isna(nit_value):
        return None
    nit_str = str(nit_value).strip()
    return nit_str.split('-')[0].strip()

def limpiar_texto(texto):
    if pd.isna(texto):
        return None
    texto_str = str(texto).strip()
    return texto_str if texto_str and texto_str.upper() not in ['NAN', 'N.A', 'N/A', 'NA'] else None

def limpiar_valor(valor):
    if pd.isna(valor):
        return 0
    try:
        return float(valor)
    except:
        return 0

def procesar_iva(iva_value):
    if pd.isna(iva_value):
        return 'no'
    iva_str = str(iva_value).strip().upper()
    return 'si' if iva_str in ['SI', 'SÍ', 'YES', '1', 'TRUE'] else 'no'

def procesar_retencion(retencion_value):
    if pd.isna(retencion_value):
        return ('no', None)
    ret_str = str(retencion_value).strip().upper()
    if ret_str in ['NO', 'N', '0', 'FALSE']:
        return ('no', None)
    try:
        valor = float(retencion_value)
        if valor == 0:
            return ('no', None)
        elif valor < 1:
            return ('si', valor * 100)
        else:
            return ('si', valor)
    except:
        if ret_str in ['SI', 'SÍ', 'YES', '1', 'TRUE']:
            return ('si', 4)
        return ('no', None)


async def main():
    df = pd.read_excel(EXCEL_FILE, sheet_name='Hoja2')
    
    print("=" * 70)
    print("VERIFICACION DE FILAS FALTANTES")
    print("=" * 70)
    
    async with SessionLocal() as db:
        # Obtener mapeos
        result = await db.execute(select(Oficina))
        oficinas_bd = {o.cod_oficina: o.id for o in result.scalars().all() if o.cod_oficina}
        
        result = await db.execute(select(Proveedor))
        proveedores_bd = {p.nit: p.id for p in result.scalars().all()}
        
        result = await db.execute(select(Contrato))
        contratos = result.scalars().all()
        
        # Set de combinaciones existentes con contador
        contratos_count = {}
        for c in contratos:
            key = (c.proveedor_id, c.oficina_id)
            contratos_count[key] = contratos_count.get(key, 0) + 1
        
        print(f"\nProveedores en BD: {len(proveedores_bd)}")
        print(f"Oficinas en BD: {len(oficinas_bd)}")
        print(f"Contratos en BD: {len(contratos)}")
        
        # Analizar cada fila del Excel y contar cuántos contratos deberían existir
        faltantes = []
        excel_count = {}  # Contador por combinación proveedor/oficina en Excel
        
        for idx, row in df.iterrows():
            nit = limpiar_nit(row.get('NIT'))
            cod_oficina = limpiar_texto(row.get('COD. OFI'))
            
            if not nit or not cod_oficina:
                continue  # Ya sabemos que estas faltan
            
            if nit not in proveedores_bd or cod_oficina not in oficinas_bd:
                continue  # Ya sabemos que estas faltan
            
            proveedor_id = proveedores_bd[nit]
            oficina_id = oficinas_bd[cod_oficina]
            key = (proveedor_id, oficina_id)
            
            # Contar en Excel
            excel_count[key] = excel_count.get(key, 0) + 1
            expected = excel_count[key]
            actual = contratos_count.get(key, 0)
            
            if expected > actual:
                faltantes.append({
                    'fila': idx + 2,
                    'idx': idx,
                    'nit': nit,
                    'proveedor': row.get('PROVEEDOR'),
                    'cod_oficina': cod_oficina,
                    'nombre_oficina': row.get('NOMBRE OFICINA'),
                    'proveedor_id': proveedor_id,
                    'oficina_id': oficina_id,
                    'expected': expected,
                    'actual': actual
                })
        
        print(f"\nFilas faltantes por crear: {len(faltantes)}")
        
        if faltantes:
            print("\nCreando contratos faltantes...")
            print("-" * 70)
            
            for item in faltantes:
                idx = item['idx']
                row = df.iloc[idx]
                
                print(f"\nFila {item['fila']}: {item['proveedor']} - {item['cod_oficina']}")
                
                # Generar número de contrato
                key = (item['proveedor_id'], item['oficina_id'])
                result = await db.execute(
                    select(func.count()).select_from(Contrato).where(
                        Contrato.proveedor_id == item['proveedor_id'],
                        Contrato.oficina_id == item['oficina_id']
                    )
                )
                count = result.scalar() or 0
                num_contrato = f"{count + 1:02d}"
                
                # Datos del contrato
                ref_pago = limpiar_texto(row.get('REF.PAGO'))
                if ref_pago and ref_pago.upper() not in ['N.A', 'N/A', 'NA', 'NAN']:
                    num_contrato = ref_pago
                
                tipo = limpiar_texto(row.get('TIPO'))
                tipo_plan = limpiar_texto(row.get('TIPO PLAN'))
                tipo_canal = limpiar_texto(row.get('TIPO DE CANAL '))
                valor = limpiar_valor(row.get('VALOR'))
                observaciones = limpiar_texto(row.get('OBSERVACIONES'))
                iva = procesar_iva(row.get('IVA'))
                tiene_retefuente, retefuente_pct = procesar_retencion(row.get('RETENCION'))
                
                nuevo_contrato = Contrato(
                    proveedor_id=item['proveedor_id'],
                    oficina_id=item['oficina_id'],
                    num_contrato=num_contrato,
                    titular_nombre="La Fortuna S.A.",
                    valor_mensual=valor,
                    estado="ACTIVO",
                    tipo=tipo,
                    tipo_plan=tipo_plan,
                    tipo_canal=tipo_canal,
                    tiene_iva=iva,
                    tiene_retefuente=tiene_retefuente,
                    retefuente_pct=retefuente_pct,
                    observaciones=observaciones
                )
                
                db.add(nuevo_contrato)
                await db.flush()
                print(f"  OK Contrato creado (ID: {nuevo_contrato.id})")
                
                # Actualizar el contador
                contratos_count[key] = contratos_count.get(key, 0) + 1
            
            await db.commit()
            print("\n" + "=" * 70)
            print(f"MIGRACION COMPLETADA - {len(faltantes)} contratos creados")
            print("=" * 70)
        else:
            print("\nNo hay contratos faltantes por crear.")

asyncio.run(main())
