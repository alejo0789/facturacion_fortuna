"""
Verificación final del documento DC07-1764 en la base de datos y la vista de Manager.
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

print("=== VERIFICACIÓN EN MNGMCN (TABLA PRINCIPAL) ===")
cursor.execute("""
    SELECT MCNREG, MCNSALDODB, MCNSALDOCR, MCNDIMEORI, MCNVALCRED
    FROM MANAGER.MNGMCN
    WHERE MCNTIPODOC = 'DC07' 
      AND MCNNUMEDOC = 1764 
      AND MCNCUENTA LIKE '23355002%'
""")
for r in cursor.fetchall():
    print(f"  REG={r[0]} | Saldo Débito={r[1]} | Saldo Crédito={r[2]} | Valor Aprobado (DIMEORI)={r[3]} | Valor Crédito={r[4]}")

print("\n=== VERIFICACIÓN EN LA VISTA DE LA PANTALLA DE MANAGER (VW_TESO_APROBADO_CXP_CXC) ===")
cursor.execute("""
    SELECT mcntipodoc, mcnnumedoc, mcncuenta, valini, saldo_apr, mcndimeori
    FROM MANAGER.VW_TESO_APROBADO_CXP_CXC
    WHERE mcntipodoc = 'DC07' AND mcnnumedoc = 1764
""")

rows = cursor.fetchall()
if not rows:
    print("  La vista no devuelve nada para DC07 1764.")
else:
    for row in rows:
        print(f"  Doc: {row[0]}-{int(row[1])} | Cuenta: {row[2].strip()} | Valor Factura(valini): {abs(float(row[3]))} | Vlr Aprobado(saldo_apr) A MOSTRAR: {abs(float(row[4]))}")

cursor.close()
conn.close()
print("\n¡Todo verificado!")
