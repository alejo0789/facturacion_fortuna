"""
Revisar valores de acumuladores para la cuenta 23355002 y el proveedor.
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

print("=== REVISANDO ACUM3 ===")
cursor.execute("""
    SELECT MA3YEAR, MA3MONTH, TRIM(MA3CUENTA), MA3VINCULA, MA3VALDEBI, MA3VALCRED
    FROM MANAGER.MNGMCN_ACUM3
    WHERE MA3VINCULA = '900866624'
      AND MA3CUENTA LIKE '23355002%'
      AND MA3YEAR = 2026 AND MA3MONTH = 3
""")
for r in cursor.fetchall():
    print(r)

print("\n=== REVISANDO ACUM1 ===")
cursor.execute("""
    SELECT MA1YEAR, MA1MONTH, TRIM(MA1CUENTA), MA1VALDEBI, MA1VALCRED
    FROM MANAGER.MNGMCN_ACUM1
    WHERE MA1CUENTA LIKE '23355002%'
      AND MA1YEAR = 2026 AND MA1MONTH = 3
""")
for r in cursor.fetchall():
    print(r)

cursor.close()
conn.close()
