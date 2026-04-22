import os
import sys
import datetime
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv('.env')

from oracle_database import get_oracle_connection

def format_value(val):
    if val is None:
        return 'NULL'
    elif isinstance(val, str):
        val_escaped = val.replace("'", "''")
        return f"'{val_escaped}'"
    elif hasattr(val, 'read'):
        val_str = val.read()
        if val_str is None:
            return 'NULL'
        val_escaped = val_str.replace("'", "''")
        return f"'{val_escaped}'"
    elif isinstance(val, datetime.datetime):
        return f"TO_DATE('{val.strftime('%Y-%m-%d %H:%M:%S')}', 'YYYY-MM-DD HH24:MI:SS')"
    else:
        return str(val)

def generate():
    conn = get_oracle_connection()
    cursor = conn.cursor()
    
    docs_to_export = [1700, 1737, 1699, 1736, 1735, 1701]
    
    file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'oracle_snapshot.sql')
    print(f"Writing straight to {file_path}")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write("-- ==========================================================\n")
        f.write("-- SCRIPT LOCAL DE INICIALIZACION (ORACLE DOCKER)            \n")
        f.write("-- ==========================================================\n\n")
        
        # User prep
        f.write("CREATE USER MANAGER IDENTIFIED BY manager_root;\n")
        f.write("GRANT ALL PRIVILEGES TO MANAGER;\n")
        f.write("ALTER SESSION SET CURRENT_SCHEMA = MANAGER;\n\n")

        tables = ['MNGDOC', 'MNGMCN', 'MNGCTA', 'MNGTDC', 'PRGPAGO']
        for t in tables:
            print(f"Generating schema for {t}...")
            # Set a timeout for executing so we don't hang infinitely
            cursor.execute(f"SELECT column_name, data_type, data_length FROM all_tab_columns WHERE table_name = '{t}' AND owner='MANAGER' ORDER BY column_id")
            cols = cursor.fetchall()
            
            col_defs = []
            for c in cols:
                dtype = c[1]
                if 'CHAR' in dtype:
                    col_defs.append(f"{c[0]} {dtype}({c[2]})")
                elif dtype == 'NUMBER':
                    col_defs.append(f"{c[0]} NUMBER")
                elif dtype == 'DATE':
                    col_defs.append(f"{c[0]} DATE")
                elif 'LOB' in dtype:
                    col_defs.append(f"{c[0]} {dtype}")
                else:
                    col_defs.append(f"{c[0]} {dtype}")
                    
            ddl = f"CREATE TABLE MANAGER.{t} (\n  " + ",\n  ".join(col_defs) + "\n);"
            f.write(f"-- Estructura de {t}\n")
            f.write(ddl + "\n\n")

        print("DML MNGDOC...")
        doc_nums_str = ','.join(map(str, docs_to_export))
        cursor.execute(f"SELECT * FROM MANAGER.MNGDOC WHERE DOCTIPO IN ('DC07') AND DOCNUMERO IN ({doc_nums_str})")
        cols = [d[0] for d in cursor.description]
        for row in cursor.fetchall():
            vals = [format_value(v) for v in row]
            f.write(f"INSERT INTO MANAGER.MNGDOC ({','.join(cols)}) VALUES ({','.join(vals)});\n")
            
        print("DML MNGMCN...")
        cursor.execute(f"SELECT * FROM MANAGER.MNGMCN WHERE MCNTIPODOC IN ('DC07') AND MCNNUMEDOC IN ({doc_nums_str})")
        cols = [d[0] for d in cursor.description]
        for row in cursor.fetchall():
            vals = [format_value(v) for v in row]
            f.write(f"INSERT INTO MANAGER.MNGMCN ({','.join(cols)}) VALUES ({','.join(vals)});\n")
            
        print("DML MNGCTA...")
        cursor.execute(f"SELECT * FROM MANAGER.MNGCTA WHERE CTACODIGO LIKE '23355%' OR CTACODIGO LIKE '1%' OR CTACODIGO = '23355002      ' FETCH FIRST 20 ROWS ONLY")
        cols = [d[0] for d in cursor.description]
        for row in cursor.fetchall():
            vals = [format_value(v) for v in row]
            f.write(f"INSERT INTO MANAGER.MNGCTA ({','.join(cols)}) VALUES ({','.join(vals)});\n")
            
        print("DML MNGTDC...")
        cursor.execute(f"SELECT * FROM MANAGER.MNGTDC WHERE TDCTIPO IN ('DC07') FETCH FIRST 20 ROWS ONLY")
        cols = [d[0] for d in cursor.description]
        for row in cursor.fetchall():
            vals = [format_value(v) for v in row]
            f.write(f"INSERT INTO MANAGER.MNGTDC ({','.join(cols)}) VALUES ({','.join(vals)});\n")

        f.write("\n-- Vista Aprobados\n")
        f.write("""CREATE OR REPLACE VIEW MANAGER.VW_TESO_APROBADO_CXP_CXC AS
SELECT
    mcnempresa  AS mcnempresa,
    mcnclase    AS mcnclase,
    mcncuenta   AS mcncuenta,
    mcnvincula  AS mcnvincula,
    mcnsucvin   AS mcnsucvin,
    mcnclacru1  AS mcnclacru1,
    mcntipcru1  AS mcntipcru1,
    mcnnumcru1  AS mcnnumcru1,
    mcncuocru1  AS mcncuocru1,
    mcnfecini   AS mcnfecini,
    mcnplazo    AS mcnplazo,
    mcnfecini + mcnplazo AS mcnfecven,
    mcnvaldebi - mcnvalcred AS valini,
    mcnsaldodb - mcnsaldocr AS saldo_reg,
    CASE
      WHEN mngcta.ctaaprpago = 1
      THEN ABS(mcndimeori - ABS((mcnvaldebi - mcnvalcred) - (mcnsaldodb - mcnsaldocr)))
      ELSE ABS(mcnsaldodb - mcnsaldocr)
    END AS saldo_apr,
    mcnvinkey   AS mcnvinkey,
    mcntipodoc  AS mcntipodoc,
    mcnnumedoc  AS mcnnumedoc,
    mcnreg      AS mcnreg,
    mngcta.ctanombre AS ctanombre,
    mngcta.ctanatu AS ctanatu,
    mngcta.ctatpcruce AS ctatpcruce,
    mngcta.ctacrubqvl AS ctacrubqvl,
    mcndimeori  AS mcndimeori,
    mngcta.ctaaprpago AS ctaaprpago,
    mcnfecha    AS mcnfecha,
    NVL(CASE
      WHEN TRIM(mcndetalle) IS NOT NULL AND TRIM(mcndetalle) <> '.' AND TRIM(mcndetalle) <> '' THEN mcndetalle
      ELSE mngdoc.docdetalle
    END, ' ') AS mcndetalle,
    mcnsaldocr  AS mcnsaldocr
FROM MANAGER.MNGMCN
LEFT JOIN MANAGER.MNGDOC mngdoc
  ON mcnempresa = docempresa AND mcnclase = docclase AND mcnvinkey = docvinkey AND mcntipodoc = doctipo AND mcnnumedoc = docnumero
LEFT JOIN MANAGER.MNGCTA mngcta
  ON mcncuenta = ctacodigo
WHERE
  mngcta.ctacruce = 1 AND mngcta.ctatpcruce = 2
  AND mcnsucvin = '.'
  AND mcnsaldocr <> mcnsaldodb
  AND mcnestado = 'a'
  AND mcndimeori >= 0
  AND CASE
      WHEN mngcta.ctaaprpago = 1
      THEN ABS(mcndimeori - ABS((mcnvaldebi - mcnvalcred) - (mcnsaldodb - mcnsaldocr)))
      ELSE mcnsaldodb - mcnsaldocr
  END <> 0;
""")
        f.write("COMMIT;\n")

    print(f"\nSnapshot ready: {file_path}")

if __name__ == '__main__':
    generate()
