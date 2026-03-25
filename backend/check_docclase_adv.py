import oracledb

conn = oracledb.connect(
    user="CAUSA_IA",
    password="IA_CAUSA2026*",
    host="10.150.81.85",
    port=1521,
    service_name="MANAGER1"
)
cursor = conn.cursor()

print("=== 1. BUSCANDO EN PRGPAGO OTRA VEZ CON NOMBRES CORRECTOS ===")
try:
    cursor.execute("""
        SELECT PPGTIPO, PPGNUMERO, PPGTIPCRU1, PPGNUMCRU1, PPGVALOR, PPGACTIVO, PPGMODUSER
        FROM MANAGER.PRGPAGO
        WHERE (PPGTIPCRU1 = 'DC07' AND PPGNUMCRU1 = 1764)
           OR (PPGTIPCRU2 = 'DC07' AND PPGNUMCRU2 = 1764)
    """)
    rows = cursor.fetchall()
    if rows:
        for r in rows:
            print(f"  PRGPAGO: DOC={r[0]}-{r[1]} CRUCE_A={r[2]}-{r[3]} VALOR={r[4]} ESTADO={r[5]} USER={r[6]}")
    else:
        print("  Ninguno en PRGPAGO (Aprobaciones).")
except Exception as e:
    print(f"  Error en PRGPAGO: {e}")

print("\n=== 2. MNGMCN: TODAS LAS FILAS CON MCNNUMCRU1 o CRU2 = 1764 ===")
try:
    cursor.execute("""
        SELECT MCNTIPODOC, MCNNUMEDOC, TRIM(MCNCUENTA),
               MCNVALDEBI, MCNVALCRED, MCNDIMEORI, MCNESTADO, MCNMODUSER,
               MCNTIPCRU1, MCNNUMCRU1, MCNTIPCRU2, MCNNUMCRU2
        FROM MANAGER.MNGMCN
        WHERE MCNNUMCRU1 = 1764 OR MCNNUMCRU2 = 1764
    """)
    for r in cursor.fetchall():
        if r[8] == 'DC07' or r[10] == 'DC07': # Solo cruces verdaderos a DC07
            print(f"  {r[0]}-{r[1]} CTA={r[2]} DEB={r[3]} CRED={r[4]} ESTADO={r[6]} CRU1={r[8]}-{r[9]} CRU2={r[10]}-{r[11]} USER={r[7]}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== 3. SALDOS EN MNGCTA PARA 23355002 ===")
cursor.execute("""
    SELECT CTASIUNO, CTAMES1, CTAMES2, CTAMES3
    FROM MANAGER.MNGCTA
    WHERE TRIM(CTACODIGO) = '23355002'
""")
for r in cursor.fetchall():
    print(f"  MNGCTA SALDOS MESES: {r}")

cursor.close()
conn.close()
