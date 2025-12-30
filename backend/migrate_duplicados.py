# -*- coding: utf-8 -*-
"""
Script para migrar las 13 filas duplicadas que no se pudieron crear antes.
Estas son filas que tienen el mismo proveedor/oficina que otra fila ya migrada.
"""

import pandas as pd
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
from sqlalchemy import func
import os
import sys
from dotenv import load_dotenv

# Configurar stdout para UTF-8
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Agregar el directorio actual al path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

from database import SessionLocal
from models import Proveedor, Oficina, Contrato
from oracle_database import get_proveedor_by_nit_oracle

# Filas específicas a procesar (índice 0-based del Excel, fila Excel = índice + 2)
# Estas son las 13 filas que no se crearon por ser duplicados
FILAS_A_PROCESAR = [
    5,   # Fila 6: CAMON TELECOMUNICACIONES - 106001
    6,   # Fila 7: CAMON TELECOMUNICACIONES - 106001
    53,  # Fila 54: CONEXXION WI-FI - 36001
    56,  # Fila 57: CONEXXION WI-FI - 9001
    68,  # Fila 69: CONEXXION WI-FI - 36001
    72,  # Fila 73: CONEXXION WI-FI - 9001
    111, # Fila 112: GLOBAL PLAY - 103001
    114, # Fila 115: HUGHESNET - 900001
    115, # Fila 116: HUGHESNET - 700001
    122, # Fila 123: ING3NIA SAS - 103001
    154, # Fila 155: TECNIPACIFICO - 900001
    176, # Fila 177: WYSNET - 700001
    180, # Fila 181: WYSNET - 700001
]

# Configuración del archivo Excel
EXCEL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'proveedores.xlsx')
SHEET_NAME = 'Hoja2'


def limpiar_nit(nit_value) -> str:
    if pd.isna(nit_value):
        return None
    nit_str = str(nit_value).strip()
    nit_clean = nit_str.split('-')[0].strip()
    return nit_clean


def limpiar_valor(valor) -> float:
    if pd.isna(valor):
        return 0
    try:
        return float(valor)
    except:
        return 0


def limpiar_texto(texto) -> str:
    if pd.isna(texto):
        return None
    texto_str = str(texto).strip()
    return texto_str if texto_str and texto_str.upper() not in ['NAN', 'N.A', 'N/A', 'NA'] else None


def procesar_iva(iva_value) -> str:
    if pd.isna(iva_value):
        return 'no'
    iva_str = str(iva_value).strip().upper()
    return 'si' if iva_str in ['SI', 'SÍ', 'YES', '1', 'TRUE'] else 'no'


def procesar_retencion(retencion_value) -> tuple:
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
            porcentaje = valor * 100
        else:
            porcentaje = valor
        return ('si', porcentaje)
    except:
        if ret_str in ['SI', 'SÍ', 'YES', '1', 'TRUE']:
            return ('si', 4)
        return ('no', None)


async def get_proveedor_id(db: AsyncSession, nit: str) -> int:
    """Obtiene el ID del proveedor por NIT"""
    if not nit:
        return None
    
    nit_clean = limpiar_nit(nit)
    result = await db.execute(
        select(Proveedor).where(Proveedor.nit == nit_clean)
    )
    proveedor = result.scalar_one_or_none()
    
    if proveedor:
        return proveedor.id
    return None


async def get_oficina_id(db: AsyncSession, cod_oficina: str) -> int:
    """Obtiene el ID de una oficina por su código"""
    if not cod_oficina:
        return None
    
    cod_clean = str(cod_oficina).strip()
    
    result = await db.execute(
        select(Oficina).where(Oficina.cod_oficina == cod_clean)
    )
    oficina = result.scalar_one_or_none()
    
    if oficina:
        return oficina.id
    return None


async def get_next_consecutivo(db: AsyncSession, proveedor_id: int, oficina_id: int) -> str:
    """Obtiene el siguiente consecutivo para num_contrato"""
    result = await db.execute(
        select(func.count()).select_from(Contrato).where(
            Contrato.proveedor_id == proveedor_id,
            Contrato.oficina_id == oficina_id
        )
    )
    count = result.scalar() or 0
    return f"{count + 1:02d}"


async def migrar_duplicados():
    """Migra solo las filas duplicadas que faltaron"""
    print("=" * 60)
    print("MIGRACION DE CONTRATOS DUPLICADOS")
    print("=" * 60)
    
    print(f"\nLeyendo archivo: {EXCEL_FILE}")
    df = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_NAME)
    print(f"Total filas en Excel: {len(df)}")
    print(f"Filas a procesar: {len(FILAS_A_PROCESAR)}")
    
    stats = {'creados': 0, 'errores': 0}
    
    async with SessionLocal() as db:
        for idx in FILAS_A_PROCESAR:
            row = df.iloc[idx]
            print(f"\n--- Procesando fila {idx + 2} ---")
            
            try:
                nit = limpiar_nit(row.get('NIT'))
                cod_oficina = limpiar_texto(row.get('COD. OFI'))
                ref_pago = limpiar_texto(row.get('REF.PAGO'))
                tipo_plan = limpiar_texto(row.get('TIPO PLAN'))
                tipo_canal = limpiar_texto(row.get('TIPO DE CANAL '))
                valor = limpiar_valor(row.get('VALOR'))
                tipo = limpiar_texto(row.get('TIPO'))
                observaciones = limpiar_texto(row.get('OBSERVACIONES'))
                iva = procesar_iva(row.get('IVA'))
                tiene_retefuente, retefuente_pct = procesar_retencion(row.get('RETENCION'))
                
                print(f"   NIT: {nit}, Oficina: {cod_oficina}")
                
                # Obtener IDs
                proveedor_id = await get_proveedor_id(db, nit)
                if not proveedor_id:
                    print(f"  X Proveedor no encontrado: {nit}")
                    stats['errores'] += 1
                    continue
                
                oficina_id = await get_oficina_id(db, cod_oficina)
                if not oficina_id and cod_oficina:
                    print(f"  X Oficina no encontrada: {cod_oficina}")
                    stats['errores'] += 1
                    continue
                
                # Generar consecutivo (será 02, 03, etc. porque ya existe uno)
                num_contrato = await get_next_consecutivo(db, proveedor_id, oficina_id)
                print(f"  Numero de contrato: {num_contrato}")
                
                # Crear contrato
                nuevo_contrato = Contrato(
                    proveedor_id=proveedor_id,
                    oficina_id=oficina_id,
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
                stats['creados'] += 1
                
            except Exception as e:
                print(f"  X Error: {e}")
                stats['errores'] += 1
                import traceback
                traceback.print_exc()
        
        await db.commit()
        
        print("\n" + "=" * 60)
        print("MIGRACION COMPLETADA")
        print("=" * 60)
        print(f"\nContratos creados: {stats['creados']}")
        print(f"Errores: {stats['errores']}")


if __name__ == "__main__":
    asyncio.run(migrar_duplicados())
