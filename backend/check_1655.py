"""
Buscar si DC07-1655 tiene adentro a DC07-1764 u otro cruce raro.
SOLO LECTURA.
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

print("=== DETALLES DE DC07-1655 EN MNGMCN ===")
cursor.execute("""
    SELECT MCNREG, TRIM(MCNCUENTA) AS CTA,
           MCNVALDEBI, MCNVALCRED, MCNDIMEORI, MCNINDINV,
           TRIM(MCNTIPCRU1) AS CRU1_T, MCNNUMCRU1 AS CRU1_N,
           TRIM(MCNTIPCRU2) AS CRU2_T, MCNNUMCRU2 AS CRU2_N
    FROM MANAGER.MNGMCN
    WHERE MCNTIPODOC = 'DC07' AND MCNNUMEDOC = 1655
""")
rows = cursor.fetchall()
if not rows:
    print("  No se encontró DC07-1655.")
else:
    for r in rows:
        print(f"  REG={r[0]:<2} CTA={r[1]:<10} DEB={r[2]:>9} CRED={r[3]:>9} DIMEORI={r[4]:>9} INV={r[5]} CRU1={r[6]}-{r[7]} CRU2={r[8]}-{r[9]}")

print("\n=== CABECERA DE DC07-1655 EN MNGDOC ===")
cursor.execute("""
    SELECT DOCESTADO, DOCVINCULA, DOCDETALLE, DOCRESPALD
    FROM MANAGER.MNGDOC
    WHERE DOCTIPO = 'DC07' AND DOCNUMERO = 1655
""")
for r in cursor.fetchall():
    print(f"  ESTADO={r[0]} VINCULA={str(r[1]).strip()} DETALLE={r[2]} RESP={r[3]}")

cursor.close()
conn.close()
