# -*- coding: utf-8 -*-
"""
Script de Migracion de Contratos
Lee datos desde proveedores.xlsx (Hoja2) y los migra a la base de datos local.

Proceso:
1. Para cada fila:
   - Validar si el NIT del proveedor existe en la tabla local
   - Si no existe, buscar en Oracle
   - Si existe en Oracle, guardar en proveedor local
   - Crear el contrato con los datos del Excel
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

# Configuración del archivo Excel
EXCEL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'proveedores.xlsx')
SHEET_NAME = 'Hoja2'


def limpiar_nit(nit_value) -> str:
    """Limpia el NIT removiendo guiones y espacios"""
    if pd.isna(nit_value):
        return None
    nit_str = str(nit_value).strip()
    # Remover guión y dígito verificador si existe
    nit_clean = nit_str.split('-')[0].strip()
    return nit_clean


def limpiar_valor(valor) -> float:
    """Convierte valor a float, retorna 0 si es nulo"""
    if pd.isna(valor):
        return 0
    try:
        return float(valor)
    except:
        return 0


def limpiar_texto(texto) -> str:
    """Limpia texto, retorna None si está vacío"""
    if pd.isna(texto):
        return None
    texto_str = str(texto).strip()
    return texto_str if texto_str and texto_str.upper() not in ['NAN', 'N.A', 'N/A', 'NA'] else None


def procesar_iva(iva_value) -> str:
    """Convierte valor de IVA a 'si' o 'no'"""
    if pd.isna(iva_value):
        return 'no'
    iva_str = str(iva_value).strip().upper()
    return 'si' if iva_str in ['SI', 'SÍ', 'YES', '1', 'TRUE'] else 'no'


def procesar_retencion(retencion_value) -> tuple:
    """
    Procesa el campo de retención y retorna (tiene_retefuente, porcentaje)
    Puede ser: NO, 0.04, 0.06, 4, 6, etc.
    """
    if pd.isna(retencion_value):
        return ('no', None)
    
    ret_str = str(retencion_value).strip().upper()
    
    if ret_str in ['NO', 'N', '0', 'FALSE']:
        return ('no', None)
    
    # Intentar parsear como número
    try:
        valor = float(retencion_value)
        if valor == 0:
            return ('no', None)
        elif valor < 1:  # Es un decimal como 0.04 o 0.06
            porcentaje = valor * 100
        else:  # Es un porcentaje como 4 o 6
            porcentaje = valor
        return ('si', porcentaje)
    except:
        # Si contiene algún valor, asumimos que sí tiene retención con 4%
        if ret_str in ['SI', 'SÍ', 'YES', '1', 'TRUE']:
            return ('si', 4)
        return ('no', None)


async def get_or_create_proveedor(db: AsyncSession, nit: str, nombre_excel: str) -> int:
    """
    Obtiene o crea un proveedor.
    1. Busca en la tabla local
    2. Si no existe, busca en Oracle
    3. Si existe en Oracle, lo crea localmente
    4. Si no existe en ninguno, lo crea con el nombre del Excel
    
    Retorna el ID del proveedor
    """
    if not nit:
        return None
    
    nit_clean = limpiar_nit(nit)
    if not nit_clean:
        return None
    
    # 1. Buscar en la tabla local
    result = await db.execute(
        select(Proveedor).where(Proveedor.nit == nit_clean)
    )
    proveedor = result.scalar_one_or_none()
    
    if proveedor:
        print(f"  ✓ Proveedor encontrado localmente: {proveedor.nombre} (NIT: {nit_clean})")
        return proveedor.id
    
    # 2. Buscar en Oracle
    try:
        oracle_result = get_proveedor_by_nit_oracle(nit_clean)
        if oracle_result:
            nombre = oracle_result['nombre']
            print(f"  ⬇ Proveedor encontrado en Oracle: {nombre} (NIT: {nit_clean})")
        else:
            # Usar nombre del Excel o uno por defecto
            nombre = limpiar_texto(nombre_excel) or f"Proveedor {nit_clean}"
            print(f"  ⚠ Proveedor NO encontrado en Oracle, usando nombre del Excel: {nombre}")
    except Exception as e:
        print(f"  ⚠ Error consultando Oracle: {e}, usando nombre del Excel")
        nombre = limpiar_texto(nombre_excel) or f"Proveedor {nit_clean}"
    
    # 3. Crear proveedor localmente
    nuevo_proveedor = Proveedor(
        nit=nit_clean,
        nombre=nombre
    )
    db.add(nuevo_proveedor)
    await db.flush()
    print(f"  ✚ Proveedor creado localmente: {nombre} (ID: {nuevo_proveedor.id})")
    
    return nuevo_proveedor.id


async def get_oficina_by_codigo(db: AsyncSession, cod_oficina: str) -> int:
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
    
    print(f"  ⚠ Oficina no encontrada: {cod_clean}")
    return None


async def get_next_consecutivo(db: AsyncSession, proveedor_id: int, oficina_id: int) -> str:
    """
    Obtiene el siguiente consecutivo para num_contrato.
    Busca contratos existentes con el mismo proveedor y oficina y asigna el siguiente número.
    """
    result = await db.execute(
        select(func.count()).select_from(Contrato).where(
            Contrato.proveedor_id == proveedor_id,
            Contrato.oficina_id == oficina_id
        )
    )
    count = result.scalar() or 0
    return f"{count + 1:02d}"


async def migrar_contratos():
    """Función principal de migración"""
    print("=" * 60)
    print("MIGRACIÓN DE CONTRATOS DESDE EXCEL")
    print("=" * 60)
    
    # Leer archivo Excel
    print(f"\n📄 Leyendo archivo: {EXCEL_FILE}")
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_NAME)
        print(f"   Encontradas {len(df)} filas en {SHEET_NAME}")
    except Exception as e:
        print(f"❌ Error leyendo archivo Excel: {e}")
        return
    
    # Estadísticas
    stats = {
        'total': len(df),
        'procesados': 0,
        'contratos_creados': 0,
        'contratos_existentes': 0,
        'proveedores_creados': 0,
        'errores': 0,
        'sin_oficina': 0
    }
    
    async with SessionLocal() as db:
        for index, row in df.iterrows():
            print(f"\n--- Fila {index + 1}/{len(df)} ---")
            
            try:
                # Extraer datos de la fila
                nit = limpiar_nit(row.get('NIT'))
                nombre_proveedor = row.get('PROVEEDOR')
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
                
                # Validar datos mínimos
                if not nit:
                    print(f"  ⚠ Saltando fila sin NIT")
                    stats['errores'] += 1
                    continue
                
                # Obtener o crear proveedor
                proveedor_id = await get_or_create_proveedor(db, nit, nombre_proveedor)
                if not proveedor_id:
                    print(f"  ❌ No se pudo obtener/crear proveedor")
                    stats['errores'] += 1
                    continue
                
                # Obtener oficina
                oficina_id = await get_oficina_by_codigo(db, cod_oficina) if cod_oficina else None
                if not oficina_id and cod_oficina:
                    stats['sin_oficina'] += 1
                    # Continuamos de todas formas, el contrato puede no tener oficina
                
                # NOTA: Se permite múltiples contratos para la misma combinación proveedor/oficina
                

                # Determinar número de contrato
                if ref_pago and ref_pago.upper() not in ['N.A', 'N/A', 'NA', 'NAN']:
                    num_contrato = ref_pago
                else:
                    # Generar consecutivo
                    num_contrato = await get_next_consecutivo(db, proveedor_id, oficina_id)
                    print(f"  📝 Número de contrato generado: {num_contrato}")
                
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
                
                print(f"  ✅ Contrato creado (ID: {nuevo_contrato.id})")
                stats['contratos_creados'] += 1
                stats['procesados'] += 1
                
            except Exception as e:
                print(f"  ❌ Error procesando fila: {e}")
                stats['errores'] += 1
                import traceback
                traceback.print_exc()
        
        # Confirmar todos los cambios
        await db.commit()
        print("\n" + "=" * 60)
        print("MIGRACIÓN COMPLETADA")
        print("=" * 60)
        print(f"\n📊 ESTADÍSTICAS:")
        print(f"   Total filas procesadas: {stats['procesados']}/{stats['total']}")
        print(f"   Contratos creados: {stats['contratos_creados']}")
        print(f"   Contratos existentes (omitidos): {stats['contratos_existentes']}")
        print(f"   Filas sin oficina encontrada: {stats['sin_oficina']}")
        print(f"   Errores: {stats['errores']}")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("INICIO DE MIGRACIÓN DE CONTRATOS")
    print("=" * 60)
    asyncio.run(migrar_contratos())
