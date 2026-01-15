#!/usr/bin/env python3
"""
Script de verificación de estructura del backend
Ejecutar en el servidor para verificar que todos los archivos necesarios existen
"""
import os
import sys
from pathlib import Path

def check_file(path, required=True):
    """Verificar si un archivo existe"""
    exists = Path(path).exists()
    status = "✅" if exists else ("❌" if required else "⚠️")
    req_text = "(requerido)" if required else "(opcional)"
    print(f"{status} {path} {req_text}")
    return exists

def check_dir(path, required=True):
    """Verificar si un directorio existe"""
    exists = Path(path).is_dir()
    status = "✅" if exists else ("❌" if required else "⚠️")
    req_text = "(requerido)" if required else "(opcional)"
    print(f"{status} {path}/ {req_text}")
    return exists

def check_env_var(var_name):
    """Verificar si una variable de entorno está configurada en .env"""
    try:
        with open('.env', 'r') as f:
            content = f.read()
            if f"{var_name}=" in content:
                # Extraer valor (solo primeros caracteres por seguridad)
                for line in content.split('\n'):
                    if line.startswith(f"{var_name}="):
                        value = line.split('=', 1)[1].strip()
                        if value:
                            print(f"✅ {var_name} está configurada: {value[:8]}...")
                            return True
                        else:
                            print(f"⚠️  {var_name} está vacía")
                            return False
            else:
                print(f"❌ {var_name} no está configurada en .env")
                return False
    except FileNotFoundError:
        print(f"❌ Archivo .env no encontrado")
        return False

def main():
    print("=" * 60)
    print("Verificación de Estructura del Backend")
    print("=" * 60)
    print()
    
    # Verificar que estamos en el directorio correcto
    if not Path('main.py').exists():
        print("❌ Error: No se encuentra main.py")
        print("   Asegúrate de ejecutar este script desde el directorio backend/")
        sys.exit(1)
    
    print("📂 Archivos principales:")
    all_ok = True
    all_ok &= check_file('main.py')
    all_ok &= check_file('database.py')
    all_ok &= check_file('models.py')
    all_ok &= check_file('schemas.py')
    all_ok &= check_file('crud.py')
    all_ok &= check_file('.env')
    check_file('oracle_database.py', required=False)
    
    print()
    print("📂 Carpeta middleware:")
    all_ok &= check_dir('middleware')
    all_ok &= check_file('middleware/__init__.py')
    all_ok &= check_file('middleware/auth.py')
    
    print()
    print("📂 Carpeta routers:")
    all_ok &= check_dir('routers')
    all_ok &= check_file('routers/__init__.py', required=False)
    all_ok &= check_file('routers/contracts.py')
    all_ok &= check_file('routers/payments.py')
    all_ok &= check_file('routers/facturas.py')
    all_ok &= check_file('routers/consolidado.py')
    all_ok &= check_file('routers/reportes.py')
    check_file('routers/oficinas_oracle.py', required=False)
    check_file('routers/archivo_plano.py', required=False)
    
    print()
    print("🔐 Variables de entorno:")
    all_ok &= check_env_var('DATABASE_URL')
    all_ok &= check_env_var('API_KEY')
    
    print()
    print("=" * 60)
    if all_ok:
        print("✅ Todas las verificaciones pasaron correctamente")
        print("   El backend debería funcionar sin problemas")
    else:
        print("❌ Algunas verificaciones fallaron")
        print("   Revisa los archivos marcados con ❌ arriba")
        sys.exit(1)
    print("=" * 60)

if __name__ == "__main__":
    main()
