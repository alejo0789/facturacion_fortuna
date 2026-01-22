"""
Script de migración para producción: Actualizar oficinas 001/010 y contratos
Ejecuta todos los pasos necesarios en orden
"""
import asyncio
import sys
from delete_oficinas_zero import delete_oficinas_zero
from fix_sequence import fix_sequence
from update_oficinas import update_oficinas
from insert_contratos import insert_contratos

async def migrate_production():
    """
    Ejecuta la migración completa en orden:
    1. Borrar oficinas con código '0'
    2. Resetear secuencia de IDs
    3. Insertar oficinas 001 y 010
    4. Insertar contratos
    """
    
    print("="*70)
    print("MIGRACIÓN DE PRODUCCIÓN: OFICINAS 001/010 Y CONTRATOS")
    print("="*70)
    print("\n⚠️  ADVERTENCIA: Este script modificará la base de datos de producción")
    print("Asegúrate de tener un backup antes de continuar.\n")
    
    respuesta = input("¿Deseas continuar? (escribe 'SI' para confirmar): ")
    if respuesta.upper() != 'SI':
        print("\n❌ Migración cancelada por el usuario")
        sys.exit(0)
    
    try:
        # Paso 1: Borrar oficinas con código '0'
        print("\n" + "="*70)
        print("PASO 1/4: Borrando oficinas con código '0'...")
        print("="*70)
        await delete_oficinas_zero()
        
        # Paso 2: Resetear secuencia
        print("\n" + "="*70)
        print("PASO 2/4: Reseteando secuencia de IDs...")
        print("="*70)
        await fix_sequence()
        
        # Paso 3: Insertar oficinas
        print("\n" + "="*70)
        print("PASO 3/4: Insertando oficinas 001 y 010...")
        print("="*70)
        await update_oficinas()
        
        # Paso 4: Insertar contratos
        print("\n" + "="*70)
        print("PASO 4/4: Insertando contratos...")
        print("="*70)
        await insert_contratos()
        
        print("\n" + "="*70)
        print("✅ MIGRACIÓN COMPLETADA EXITOSAMENTE")
        print("="*70)
        print("\nResumen:")
        print("- Oficinas con código '0': Borradas")
        print("- Secuencia de IDs: Reseteada")
        print("- Oficinas 001/010: Insertadas")
        print("- Contratos: Insertados")
        print("\n" + "="*70)
        
    except Exception as e:
        print("\n" + "="*70)
        print("❌ ERROR EN LA MIGRACIÓN")
        print("="*70)
        print(f"Error: {e}")
        print("\nLa migración se detuvo. Revisa el error y vuelve a intentar.")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(migrate_production())
