"""
Busca cualquier NB01 que tenga referencias a DC07-1764.
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

print("=== BUSCANDO NB01 CON REFERENCIAS A DC07-1764 EN MNGMCN ===")
cursor.execute("""
    SELECT MCNTIPODOC, MCNNUMEDOC, MCNREG, 
           TRIM(MCNCUENTA) AS CTA,
           MCNVALDEBI, MCNVALCRED, MCNESTADO,
           TRIM(MCNTIPCRU1) AS CRU1_TIP, MCNNUMCRU1 as CRU1_NUM,
           TRIM(MCNTIPCRU2) AS CRU2_TIP, MCNNUMCRU2 as CRU2_NUM
    FROM MANAGER.MNGMCN
    WHERE MCNTIPODOC = 'NB01'
      AND ((MCNTIPCRU1 = 'DC07' AND MCNNUMCRU1 = 1764)
           OR (MCNTIPCRU2 = 'DC07' AND MCNNUMCRU2 = 1764))
""")
rows = cursor.fetchall()
if not rows:
    print("  Ninguna NB01 actual en MNGMCN apunta a DC07-1764.")
else:
    for r in rows:
        print(f"  {r[0]}-{r[1]} REG={r[2]} CTA={r[3]} DEB={r[4]} CRED={r[5]} ESTADO={r[6]} CRU1={r[7]}-{r[8]} CRU2={r[9]}-{r[10]}")


print("\n=== BUSCANDO NB01 CON REFERENCIAS A DC07-1764 EN MNGMCN_AUD ===")
cursor.execute("""
    SELECT MAUTIPODOC, MAUNUMEDOC, MAUTIPOREG, MAUREG,
           TRIM(MAUCUENTA) AS CTA, MAUVALDEBI, MAUVALCRED,
           TRIM(MAUTIPCRU1) AS CRU1_TIP, MAUNUMCRU1 as CRU1_NUM,
           TRIM(MAUTIPCRU2) AS CRU2_TIP, MAUNUMCRU2 as CRU2_NUM,
           MAUESTADO
    FROM MANAGER.MNGMCN_AUD
    WHERE MAUTIPODOC = 'NB01'
      AND ((MAUTIPCRU1 = 'DC07' AND MAUNUMCRU1 = 1764)
           OR (MAUTIPCRU2 = 'DC07' AND MAUNUMCRU2 = 1764))
""")
rows = cursor.fetchall()
if not rows:
    print("  Ninguna NB01 en MNGMCN_AUD apunta a DC07-1764.")
else:
    for r in rows:
        print(f"  {r[0]}-{r[1]} AUD_TIPOREG={r[2]} REG={r[3]} CTA={r[4]} DEB={r[5]} CRED={r[6]} ESTADO={r[11]} CRU1={r[7]}-{r[8]} CRU2={r[9]}-{r[10]}")

print("\n=== BUSCANDO EN CABECERAS MNGDOC_AUD (las posibles NB eliminadas) ===")
cursor.execute("""
    SELECT DAUTIPO, DAUNUMERO, DAUESTADO, DAUTIPOREG, DAUREGFEC, DAUREGUSER
    FROM MANAGER.MNGDOC_AUD
    WHERE DAUTIPO = 'NB01' 
      AND TRUNC(DAUREGFEC) >= TO_DATE('10/03/2026', 'DD/MM/YYYY')
      AND (DAUREGFEC <= TO_DATE('11/03/2026', 'DD/MM/YYYY'))
      -- No podemos filtrar facilmente si apuntaba directo a DC07-1764 desde cabecera, pero vemos las NBs borradas
      AND DAUTIPOREG IN (2,3,4) -- 2=Update, 3=Delete, 4=otras
""")
rows = cursor.fetchall()
if not rows:
    print("  Ninguna cabecera NB01 auditada.")
else:
    for r in rows:
        print(f"  {r[0]}-{r[1]} ESTADO={r[2]} AUD_TIPO={r[3]} FECHA={r[4]} USER={r[5]}")

cursor.close()
conn.close()
