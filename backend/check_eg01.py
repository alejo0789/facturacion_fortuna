"""
Busca TODOS los pagos (egresos, nb01, dc05, etc.) que estén apuntando a DC07-1764 en MNGMCN.
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

print("=== TODOS LOS MOVIMIENTOS EN MNGMCN QUE APUNTAN A DC07-1764 ===")
cursor.execute("""
    SELECT MCNTIPODOC, MCNNUMEDOC, MCNREG, 
           TRIM(MCNCUENTA) AS CTA,
           MCNVALDEBI, MCNVALCRED, MCNESTADO,
           TRIM(MCNTIPCRU1) AS CRU1_TIP, MCNNUMCRU1 as CRU1_NUM,
           TRIM(MCNTIPCRU2) AS CRU2_TIP, MCNNUMCRU2 as CRU2_NUM,
           MCNDIMEORI, MCNINDINV
    FROM MANAGER.MNGMCN
    WHERE (MCNTIPCRU1 = 'DC07' AND MCNNUMCRU1 = 1764)
       OR (MCNTIPCRU2 = 'DC07' AND MCNNUMCRU2 = 1764)
""")
rows = cursor.fetchall()
if not rows:
    print("  Ninguna fila apunta a DC07-1764 en CRU1 o CRU2.")
else:
    for r in rows:
        # Excluir el mismo DC07-1764 si es que se apunta a sí mismo
        if not (r[0] == 'DC07' and r[1] == 1764):
            print(f"  {r[0]}-{r[1]} REG={r[2]} CTA={r[3]} DEB={r[4]} CRED={r[5]} ESTADO={r[6]} CRU1={r[7]}-{r[8]} CRU2={r[9]}-{r[10]} DIM={r[11]} INV={r[12]}")

print("\n=== VERIFICAR EL EG01-27720 QUE MENCIONA EL USUARIO ===")
cursor.execute("""
    SELECT MCNTIPODOC, MCNNUMEDOC, MCNREG, TRIM(MCNCUENTA),
           MCNVALDEBI, MCNVALCRED,
           TRIM(MCNTIPCRU1), MCNNUMCRU1,
           TRIM(MCNTIPCRU2), MCNNUMCRU2
    FROM MANAGER.MNGMCN
    WHERE MCNTIPODOC = 'EG01' AND MCNNUMEDOC = 27720
      AND MCNCUENTA LIKE '2335%'
""")
rows = cursor.fetchall()
if not rows:
    print("  No se encontraron cxp en EG01-27720.")
else:
    for r in rows:
        print(f"  EG01-27720 REG={r[2]} CTA={r[3]} DEB={r[4]} CRU1={r[6]}-{r[7]} CRU2={r[8]}-{r[9]}")

cursor.close()
conn.close()
