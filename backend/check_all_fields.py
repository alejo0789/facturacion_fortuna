"""
Revisar TODOS los campos numéricos de DC07-1764 para encontrar la discrepancia.
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

print("=== TODOS LOS CAMPOS DE DC07-1764 EN MNGMCN ===")
cursor.execute("""
    SELECT * 
    FROM MANAGER.MNGMCN
    WHERE MCNTIPODOC = 'DC07' AND MCNNUMEDOC = 1764
""")
cols = [desc[0] for desc in cursor.description]
rows = cursor.fetchall()
for row in rows:
    d = dict(zip(cols, row))
    # solo imprimir los que no son None, no 0, no '.'
    important = {k: v for k, v in d.items() if v not in (None, 0, '.', '', ' ')}
    print(f"REG={d['MCNREG']} CTA={d['MCNCUENTA'].strip()} -> {important}")

cursor.close()
conn.close()
