"""
Revisar columnas de acumuladores.
"""
import oracledb

conn = oracledb.connect(
    user="CAUSA_IA",
    password="IA_CAUSA2026*",
    host="10.150.81.85",
    port=1521,
    service_name="MANAGER1"
)
cursor = conn.cursor()

cursor.execute("""
    SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS 
    WHERE TABLE_NAME = 'MNGMCN_ACUM3' AND OWNER = 'MANAGER'
""")
cols = [r[0] for r in cursor.fetchall()]
print(f"MNGMCN_ACUM3: {cols}")

cursor.execute("""
    SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS 
    WHERE TABLE_NAME = 'MNGMCN_ACUM1' AND OWNER = 'MANAGER'
""")
cols = [r[0] for r in cursor.fetchall()]
print(f"MNGMCN_ACUM1: {cols}")

cursor.close()
conn.close()
