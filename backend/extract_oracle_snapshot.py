import os
import sys
import datetime
from dotenv import load_dotenv

# Asegurar que se puede importar el modulo de conexion
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv('.env')

try:
    from oracle_database import get_oracle_connection
except ImportError:
    print("No se pudo importar oracle_database. Asegúrate de ejecutar esto desde la carpeta backend.")
    sys.exit(1)

def clean_ddl(ddl_str):
    """Limpia el DDL de Oracle para evitar errores en otras bases de datos locales (quita tablespaces, etc)."""
    if not ddl_str:
        return ""
    if hasattr(ddl_str, 'read'):
        ddl_str = ddl_str.read()
    
    # Remover dobles comillas para los esquemas o parametros especificos
    ddl_str = str(ddl_str)
    
    # Eliminar bloques de SEGMENT CREATION, TABLESPACE, y otros atributos fisicos de Oracle 
    # que suelen causar problemas en bases nuevas
    import re
    ddl_str = re.sub(r'SEGMENT CREATION \w+', '', ddl_str)
    ddl_str = re.sub(r'TABLESPACE "\w+"', '', ddl_str)
    ddl_str = re.sub(r'PCTFREE \d+', '', ddl_str)
    ddl_str = re.sub(r'PCTUSED \d+', '', ddl_str)
    ddl_str = re.sub(r'INITRANS \d+', '', ddl_str)
    ddl_str = re.sub(r'MAXTRANS \d+', '', ddl_str)
    ddl_str = re.sub(r'STORAGE\(.*?\)', '', ddl_str, flags=re.DOTALL)
    ddl_str = re.sub(r'LOB .*? STORE AS .*? \(.*?\)', '', ddl_str, flags=re.DOTALL|re.IGNORECASE)
    
    ddl_str = ddl_str.strip()
    if not ddl_str.endswith(';'):
         ddl_str += ';'
    return ddl_str

def format_value(val):
    if val is None:
        return 'NULL'
    elif isinstance(val, str):
        # Escapar comillas simples
        val_escaped = val.replace("'", "''")
        return f"'{val_escaped}'"
    elif hasattr(val, 'read'): # LOBs/CLOBs
        val_str = val.read()
        if val_str is None:
            return 'NULL'
        val_escaped = val_str.replace("'", "''")
        return f"'{val_escaped}'"
    elif isinstance(val, datetime.datetime):
        return f"TO_DATE('{val.strftime('%Y-%m-%d %H:%M:%S')}', 'YYYY-MM-DD HH24:MI:SS')"
    else:
        return str(val)

def export_snapshot():
    conn = get_oracle_connection()
    cursor = conn.cursor()
    
    # Tablas a extraer y los numeros de documentos que cruzamos como ejemplo
    tables_to_export = ['MNGDOC', 'MNGMCN', 'MNGCTA', 'MNGTDC']
    docs_to_export = [1700, 1737, 1699, 1736, 1735, 1701]
    
    output_lines = []
    
    output_lines.append("-- ==========================================================")
    output_lines.append("-- SCRIPT DE INICIALIZACION PARA ORACLE LOCAL (DOCKER)       ")
    output_lines.append("-- ==========================================================\n")
    
    # Comandos para preparar la BD
    output_lines.append("CREATE USER MANAGER IDENTIFIED BY manager_root;")
    output_lines.append("GRANT ALL PRIVILEGES TO MANAGER;")
    output_lines.append("ALTER SESSION SET CURRENT_SCHEMA = MANAGER;\n")
    
    print("1. Extrayendo DDL (Estructuras de las tablas)...")
    try:
         # Configurar extracción limpia sin informacion de almacenamiento
         cursor.execute("BEGIN DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'STORAGE', FALSE); END;")
         cursor.execute("BEGIN DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'TABLESPACE', FALSE); END;")
         cursor.execute("BEGIN DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SEGMENT_ATTRIBUTES', FALSE); END;")
    except:
         pass
         
    for table_name in tables_to_export:
        try:
            cursor.execute(f"SELECT DBMS_METADATA.GET_DDL('TABLE', '{table_name}', 'MANAGER') FROM DUAL")
            row = cursor.fetchone()
            if row:
                ddl = clean_ddl(row[0])
                # Algunos fixes rapidos al SQL exportado:
                ddl = ddl.replace('"MANAGER".', 'MANAGER.')
                output_lines.append(f"-- Estructura de {table_name}")
                output_lines.append(ddl)
                output_lines.append("\n")
        except Exception as e:
            print(f" > Error o saltando DDl de {table_name}: {e}")
            
    print("2. Extrayendo DML (Datos de MNGDOC)...")
    doc_nums_str = ','.join(map(str, docs_to_export))
    cursor.execute(f"SELECT * FROM MANAGER.MNGDOC WHERE DOCNUMERO IN ({doc_nums_str})")
    cols = [d[0] for d in cursor.description]
    for row in cursor.fetchall():
        vals = [format_value(v) for v in row]
        output_lines.append(f"INSERT INTO MANAGER.MNGDOC ({','.join(cols)}) VALUES ({','.join(vals)});")
        
    print("3. Extrayendo DML (Datos de MNGMCN)...")
    cursor.execute(f"SELECT * FROM MANAGER.MNGMCN WHERE MCNNUMEDOC IN ({doc_nums_str})")
    cols = [d[0] for d in cursor.description]
    for row in cursor.fetchall():
        vals = [format_value(v) for v in row]
        output_lines.append(f"INSERT INTO MANAGER.MNGMCN ({','.join(cols)}) VALUES ({','.join(vals)});")
        
    print("4. Extrayendo DML (Datos de plan de cuentas MNGCTA)...")
    # Buscamos traer la cuenta 23355002 y un par más que sean primordiales
    cursor.execute(f"SELECT * FROM MANAGER.MNGCTA WHERE CTACODIGO LIKE '23355%' OR CTACODIGO LIKE '1%' FETCH FIRST 20 ROWS ONLY")
    cols = [d[0] for d in cursor.description]
    for row in cursor.fetchall():
        vals = [format_value(v) for v in row]
        output_lines.append(f"INSERT INTO MANAGER.MNGCTA ({','.join(cols)}) VALUES ({','.join(vals)});")

    print("5. Extrayendo Vista VW_TESO_APROBADO_CXP_CXC...")
    try:
        cursor.execute("SELECT DBMS_METADATA.GET_DDL('VIEW', 'VW_TESO_APROBADO_CXP_CXC', 'MANAGER') FROM DUAL")
        row = cursor.fetchone()
        if row:
            vw_ddl = clean_ddl(row[0]).replace('"MANAGER".', 'MANAGER.')
            output_lines.append("-- Estructura de la Vista")
            output_lines.append(vw_ddl)
    except Exception as e:
        print(f" > No se pudo extraer la vista (probablemente falten tablas subyacentes): {e}")

    output_lines.append("COMMIT;")
    
    file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'oracle_snapshot.sql')
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(output_lines))
        
    print(f"\n¡Éxito! Archivo generado en: {file_path}")

if __name__ == '__main__':
    export_snapshot()
