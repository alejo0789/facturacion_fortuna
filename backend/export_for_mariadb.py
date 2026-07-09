import os
import csv
from sqlalchemy import create_engine
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import mysql
from models import Base
import database  # Asegura que todos los modelos se carguen

# Cambia esto si tu usuario o contraseña de postgres local es distinto
PG_URL = "postgresql://postgres:root@localhost:5432/supplier_db"

EXPORT_DIR = "export_mariadb"

def export_everything():
    os.makedirs(EXPORT_DIR, exist_ok=True)
    engine = create_engine(PG_URL)
    
    # 1. GENERAR EL SCRIPT SQL DE ESTRUCTURA (TABLAS) PARA MARIADB
    schema_path = os.path.join(EXPORT_DIR, "00_schema_mariadb.sql")
    print(f"Generando estructura de tablas en {schema_path}...")
    
    with open(schema_path, "w", encoding="utf-8") as f:
        f.write("SET FOREIGN_KEY_CHECKS=0;\n\n") # Desactiva foreign keys temporalmente
        
        for table in Base.metadata.sorted_tables:
            # Compila la creación de tabla usando el dialecto de MySQL/MariaDB
            create_stmt = CreateTable(table).compile(dialect=mysql.dialect())
            # Limpiar un poco el string resultante
            create_sql = str(create_stmt).strip()
            if not create_sql.endswith(";"):
                create_sql += ";"
            f.write(create_sql + "\n\n")
            
        f.write("SET FOREIGN_KEY_CHECKS=1;\n")
        
    print("Estructura generada correctamente.\n")

    # 2. EXPORTAR LOS DATOS A CSV
    print("Exportando datos a CSV...")
    with engine.connect() as conn:
        for idx, table in enumerate(Base.metadata.sorted_tables, start=1):
            csv_filename = f"{idx:02d}_{table.name}.csv"
            csv_path = os.path.join(EXPORT_DIR, csv_filename)
            
            # Leer datos de Postgres
            result = conn.execute(table.select())
            rows = result.fetchall()
            
            # Escribir CSV
            with open(csv_path, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                
                # Escribir cabeceras
                writer.writerow(table.columns.keys())
                
                # Escribir las filas
                for row in rows:
                    writer.writerow(row)
                    
            print(f"  - {len(rows)} registros exportados a {csv_filename}")
            
    print("\n¡Exportación completada!")
    print(f"Todos los archivos están en la carpeta: {os.path.abspath(EXPORT_DIR)}")
    print("\nPASOS PARA IMPORTAR EN DBEAVER:")
    print("1. Abre DBeaver y conéctate a tu base de datos MariaDB.")
    print("2. Abre un script SQL, pega el contenido de '00_schema_mariadb.sql' y ejecútalo (Esto creará las tablas perfectas).")
    print("3. Haz clic derecho sobre tu base de datos -> Import Data (Importar Datos).")
    print("4. Selecciona formato CSV y elige los archivos numerados que se generaron (ej: 01_categorias.csv).")

if __name__ == "__main__":
    export_everything()
