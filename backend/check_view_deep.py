"""
Inspección profunda de VW_TESO_APROBADO_CXP_CXC para DC07-1764.
La vista muestra 119,000 en MCNVALCRED pero la pantalla de Manager
le suma otras cosas. Vamos a ver todo lo que trae la vista.
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

print("=== TODOS LOS REGISTROS QUE LA VISTA ASOCIA A DC07-1764 ===")
cursor.execute("""
    SELECT mcntipodoc, mcnnumedoc, mcncuenta, valini, saldo_apr, mcndimeori,
           mcnvinkey, ctanatu, ctatpcruce
    FROM MANAGER.VW_TESO_APROBADO_CXP_CXC
    WHERE mcnnumedoc = 1764 -- Sin filtrar tipodoc para ver si hay otros 1764 'DC'
""")
rows = cursor.fetchall()
if not rows:
    print("  La vista no encuentra nada con numero 1764 hoy.")
for r in rows:
    print(f"  {r[0]}-{r[1]} CTA={r[2]} VAL_INI={r[3]} SALDO_APR={r[4]} DIMEORI={r[5]} NATU={r[7]} CRUCE={r[8]}")

cursor.close()
conn.close()
