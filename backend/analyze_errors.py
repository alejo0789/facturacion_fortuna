# -*- coding: utf-8 -*-
import pandas as pd
import sys
import io
import asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, '.')
from database import SessionLocal
from models import Oficina, Contrato, Proveedor
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

async def main():
    df = pd.read_excel('../proveedores.xlsx', sheet_name='Hoja2')

    print('=' * 70)
    print('ANALISIS DE DATOS NO MIGRADOS')
    print('=' * 70)
    print(f'Total filas en Excel: {len(df)}')
    print()

    # Verificar NITs
    def limpiar_nit(nit_value):
        if pd.isna(nit_value):
            return None
        nit_str = str(nit_value).strip()
        nit_clean = nit_str.split('-')[0].strip()
        return nit_clean if nit_clean else None
    
    def limpiar_texto(texto):
        if pd.isna(texto):
            return None
        texto_str = str(texto).strip()
        return texto_str if texto_str and texto_str.upper() not in ['NAN', 'N.A', 'N/A', 'NA'] else None

    async with SessionLocal() as db:
        # Obtener todas las oficinas de la BD
        result = await db.execute(select(Oficina))
        oficinas_bd = {o.cod_oficina: o.id for o in result.scalars().all() if o.cod_oficina}
        
        # Obtener todos los proveedores de la BD
        result = await db.execute(select(Proveedor))
        proveedores_bd = {p.nit: p.id for p in result.scalars().all()}
        
        # Obtener todos los contratos creados
        result = await db.execute(
            select(Contrato).options(selectinload(Contrato.proveedor), selectinload(Contrato.oficina))
        )
        contratos = result.scalars().all()
        
        # Crear un set de (proveedor_id, oficina_id) para comparar
        contratos_set = {(c.proveedor_id, c.oficina_id) for c in contratos}
        
        print(f'Oficinas en BD: {len(oficinas_bd)}')
        print(f'Proveedores en BD: {len(proveedores_bd)}')
        print(f'Contratos en BD: {len(contratos)}')
        print()
        
        # Analizar cada fila del Excel
        no_migradas = []
        for idx, row in df.iterrows():
            nit = limpiar_nit(row.get('NIT'))
            cod_oficina = limpiar_texto(row.get('COD. OFI'))
            
            razon = None
            
            # Caso 1: Sin NIT
            if not nit:
                razon = 'Sin NIT valido'
            # Caso 2: Sin codigo de oficina
            elif not cod_oficina:
                razon = 'Sin codigo de oficina en Excel'
            # Caso 3: Oficina no existe en BD
            elif cod_oficina not in oficinas_bd:
                razon = f'Oficina {cod_oficina} no existe en BD'
            # Caso 4: Proveedor no existe (no debería pasar porque se crea)
            elif nit not in proveedores_bd:
                razon = f'Proveedor {nit} no creado'
            else:
                # Verificar si el contrato existe
                proveedor_id = proveedores_bd.get(nit)
                oficina_id = oficinas_bd.get(cod_oficina)
                if (proveedor_id, oficina_id) not in contratos_set:
                    razon = 'Contrato no creado (error desconocido)'
            
            if razon:
                no_migradas.append({
                    'fila': idx + 2,  # +2 porque Excel es 1-indexed y tiene header
                    'nit': nit,
                    'proveedor': row.get('PROVEEDOR'),
                    'cod_oficina': cod_oficina,
                    'nombre_oficina': row.get('NOMBRE OFICINA'),
                    'razon': razon
                })
        
        print('=' * 70)
        print(f'FILAS NO MIGRADAS: {len(no_migradas)}')
        print('=' * 70)
        
        # Agrupar por razón
        razones = {}
        for item in no_migradas:
            razon = item['razon']
            if razon not in razones:
                razones[razon] = []
            razones[razon].append(item)
        
        for razon, items in razones.items():
            print(f'\n{razon}: {len(items)} filas')
            print('-' * 50)
            for item in items:
                print(f"  Fila {item['fila']}: {item['proveedor']} (NIT: {item['nit']})")
                print(f"       Oficina: {item['cod_oficina']} - {item['nombre_oficina']}")

asyncio.run(main())
