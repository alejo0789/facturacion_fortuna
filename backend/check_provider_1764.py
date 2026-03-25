"""
Buscar DC07-1764 por NIT del proveedor (900866624) y cuenta (23355002) 
para ver de dónde saca Manager el "Valor" de 357,000.
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

print("=== BUSCANDO EN MNGMCN POR NIT 900866624 Y CUENTA 23355002 ===")
cursor.execute("""
    SELECT MCNTIPODOC, MCNNUMEDOC, MCNREG, 
           MCNVALDEBI, MCNVALCRED, MCNDIMEORI, MCNINDINV, MCNESTADO,
           TO_CHAR(MCNFECHA, 'YYYY-MM-DD') AS FECHA,
           TRIM(MCNTIPCRU1) AS CRU1_T, MCNNUMCRU1 AS CRU1_N,
           TRIM(MCNTIPCRU2) AS CRU2_T, MCNNUMCRU2 AS CRU2_N
    FROM MANAGER.MNGMCN
    WHERE MCNVINCULA = '900866624'
      AND MCNCUENTA LIKE '23355002%'
      AND (MCNNUMEDOC = 1764 OR MCNNUMCRU1 = 1764 OR MCNNUMCRU2 = 1764)
    ORDER BY MCNFECHA DESC, MCNNUMEDOC, MCNREG
""")
rows = cursor.fetchall()
if not rows:
    print("  No se encontró nada en MNGMCN con esos filtros.")
else:
    for r in rows:
        print(f"  {r[0]}-{r[1]} REG={r[2]} DEB={r[3]} CRED={r[4]} DIMEORI={r[5]} INV={r[6]} ESTADO={r[7]} FECHA={r[8]} CRU1={r[9]}-{r[10]} CRU2={r[11]}-{r[12]}")

print("\n=== BUSCANDO EN CABECERAS MNGDOC PARA NIT 900866624 Y DOC 1764 ===")
cursor.execute("""
    SELECT DOCTIPO, DOCNUMERO, DOCESTADO, DOCVINCULA, DOCDETALLE,
           DOCCANTI, DOCVALOR
    FROM MANAGER.MNGDOC
    WHERE DOCVINCULA = '900866624'
      AND DOCNUMERO = 1764
""")
rows = cursor.fetchall()
if not rows:
    print("  No se encontró nada en MNGDOC.")
else:
    for r in rows:
        print(f"  {r[0]}-{r[1]} ESTADO={r[2]} VINCULA={r[3]} DETALLE={r[4]} CANTI={r[5]} VALOR={r[6]}")

cursor.close()
conn.close()
