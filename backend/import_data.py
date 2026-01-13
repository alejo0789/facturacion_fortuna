"""
Script para importar datos de producción desde solo_datos.sql
Usa subprocess para ejecutar psql con el archivo SQL
"""
import subprocess
import os
from dotenv import load_dotenv

load_dotenv()

# Obtener DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/supplier_db")

# Convertir a formato psql (sin asyncpg)
if "+asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")

print(f"DATABASE_URL: {DATABASE_URL}")

# Primero vamos a probar con psycopg2 directamente
try:
    import psycopg2
    
    # Parsear la URL
    # postgresql://user:pass@host:port/dbname
    parts = DATABASE_URL.replace("postgresql://", "").split("@")
    user_pass = parts[0].split(":")
    host_port_db = parts[1].split("/")
    host_port = host_port_db[0].split(":")
    
    conn = psycopg2.connect(
        host=host_port[0],
        port=host_port[1] if len(host_port) > 1 else 5432,
        user=user_pass[0],
        password=user_pass[1],
        database=host_port_db[1]
    )
    conn.autocommit = True
    cur = conn.cursor()
    
    print("Conexión exitosa!")
    
    # Truncar tablas
    print("Limpiando tablas...")
    cur.execute("TRUNCATE TABLE factura_oficinas, facturas, contratos, proveedores, oficinas, pagos RESTART IDENTITY CASCADE;")
    print("Tablas limpiadas!")
    
    # Leer y ejecutar el SQL file
    print("Ejecutando archivo SQL...")
    
    sql_file_path = os.path.join(os.path.dirname(__file__), '..', 'solo_datos.sql')
    
    with open(sql_file_path, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    # Remover la línea \restrict
    sql_content = sql_content.replace('\\restrict RSNhFFgNobaKK0lfXciMpM1YdaeArUyxdnESqt7YpJYuUTKoQVE6swIgfMjHZpc', '')
    
    # Procesar COPY statements
    lines = sql_content.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        
        if line.startswith('COPY public.'):
            # Encontrar el bloque COPY completo
            table_name = line.split('COPY public.')[1].split(' (')[0]
            columns = line.split('(')[1].split(') FROM')[0]
            
            print(f"Importando tabla: {table_name}...")
            
            # Recopilar los datos
            data_lines = []
            i += 1
            while i < len(lines) and lines[i].rstrip() != '\\.':
                if lines[i].rstrip():  # Solo líneas no vacías
                    data_lines.append(lines[i])
                i += 1
            
            # Usar COPY con StringIO
            if data_lines:
                from io import StringIO
                data = '\n'.join(data_lines)
                f_data = StringIO(data)
                
                # Ejecutar COPY
                copy_sql = f"COPY {table_name} ({columns}) FROM STDIN WITH (FORMAT text, NULL '\\N')"
                cur.copy_expert(copy_sql, f_data)
                print(f"  Insertados {len(data_lines)} registros")
        
        i += 1
    
    conn.commit()
    cur.close()
    conn.close()
    
    print("\n¡Importación completada exitosamente!")
    
except ImportError:
    print("psycopg2 no está instalado. Instalando...")
    subprocess.run(["pip", "install", "psycopg2-binary"])
    print("Por favor ejecute el script de nuevo.")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
