"""
Busca en produccion (MANAMED) cual NB01 cancela el DC07-1700.
Estrategias:
  A) NB01 con debito a 23355002 por el valor exacto ($370,512.61)
  B) NB01 con DOCVINCULA = NIT del proveedor (900971687)
  C) NB01 con debito a 23355002 alrededor de la fecha del DC07-1700
  D) Cualquier MCN con cuenta 23355002 debito cruzando con algo cercano al valor
SOLO SELECT - produccion.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import oracledb

conn = oracledb.connect(
    user="CAUSA_IA", password="IA_CAUSA2026*",
    host="172.17.101.3", port=1521, service_name="MANAMED"
)
cursor = conn.cursor()
SEP = "=" * 100

VALOR_EXACTO = 370512.61
NIT_PROVEEDOR = '900971687'

print(SEP)
print("  BUSCANDO NB01 que cancela DC07-1700  (valor=$370,512.61 | NIT=900971687)")
print(SEP)

# ── A) NB01 con debito a 23355002 por el valor exacto ─────────────────────────
print("\n[A] NB01 con DEBITO a cuenta 23355002 de exactamente $370,512.61")
cursor.execute("""
    SELECT M.MCNTIPODOC, M.MCNNUMEDOC, M.MCNREG,
           M.MCNCUENTA, M.MCNVALDEBI, M.MCNVALCRED,
           M.MCNTIPCRU1, M.MCNNUMCRU1,
           M.MCNTIPCRU2, M.MCNNUMCRU2,
           M.MCNDETALLE, M.MCNVINCULA,
           D.DOCFECHA, D.DOCVINCULA, D.DOCESTADO
    FROM MANAGER.MNGMCN M
    JOIN MANAGER.MNGDOC D ON M.MCNTIPODOC = D.DOCTIPO AND M.MCNNUMEDOC = D.DOCNUMERO
    WHERE M.MCNTIPODOC = 'NB01'
      AND TRIM(M.MCNCUENTA) = '23355002'
      AND M.MCNVALDEBI = :valor
    ORDER BY M.MCNNUMEDOC
""", {'valor': VALOR_EXACTO})
rows_a = cursor.fetchall()
print(f"   Encontrados: {len(rows_a)}")
for r in rows_a:
    tdoc, ndoc, reg, cta, deb, crd, tcru1, ncru1, tcru2, ncru2, det, vincula, fecha, docvinc, docest = r
    print(f"   NB01-{int(ndoc)} | REG={int(reg)} | CTA={str(cta).strip()} | "
          f"DEB={float(deb):.2f} | TIPCRU1={str(tcru1).strip() if tcru1 else ''}-{int(ncru1) if ncru1 else 0} | "
          f"TIPCRU2={str(tcru2).strip() if tcru2 else ''}-{int(ncru2) if ncru2 else 0} | "
          f"FECHA={fecha} | DOCVINC={str(docvinc).strip() if docvinc else ''} | EST={docest}")
    print(f"           DETALLE: {str(det).strip() if det else ''}")

# ── B) NB01 con DOCVINCULA del proveedor ──────────────────────────────────────
print(f"\n[B] NB01 cuya cabecera DOCVINCULA contiene el NIT={NIT_PROVEEDOR}")
cursor.execute("""
    SELECT D.DOCTIPO, D.DOCNUMERO, D.DOCFECHA, D.DOCESTADO, D.DOCVINCULA, D.DOCDETALLE
    FROM MANAGER.MNGDOC D
    WHERE D.DOCTIPO = 'NB01'
      AND TRIM(D.DOCVINCULA) = :nit
    ORDER BY D.DOCNUMERO
""", {'nit': NIT_PROVEEDOR})
rows_b = cursor.fetchall()
print(f"   Encontrados: {len(rows_b)}")
for r in rows_b:
    tdoc, ndoc, fecha, estado, vinc, det = r
    print(f"   NB01-{int(ndoc)} | FECHA={fecha} | ESTADO={estado} | VINCULA={str(vinc).strip() if vinc else ''}")
    print(f"           DETALLE: {str(det).strip() if det else ''}")

# ── C) NB01 con debito a 23355002 dentro del rango ±10% del valor ─────────────
print(f"\n[C] NB01 con DEBITO a 23355002 entre $333,461 y $407,563 (±10% de $370,512) - Feb/Mar 2026")
cursor.execute("""
    SELECT M.MCNTIPODOC, M.MCNNUMEDOC, M.MCNREG,
           M.MCNCUENTA, M.MCNVALDEBI,
           M.MCNTIPCRU1, M.MCNNUMCRU1,
           M.MCNTIPCRU2, M.MCNNUMCRU2,
           M.MCNDETALLE, M.MCNVINCULA,
           D.DOCFECHA, D.DOCVINCULA, D.DOCESTADO
    FROM MANAGER.MNGMCN M
    JOIN MANAGER.MNGDOC D ON M.MCNTIPODOC = D.DOCTIPO AND M.MCNNUMEDOC = D.DOCNUMERO
    WHERE M.MCNTIPODOC = 'NB01'
      AND TRIM(M.MCNCUENTA) = '23355002'
      AND M.MCNVALDEBI BETWEEN 333461 AND 407563
      AND D.DOCFECHA >= DATE '2026-02-01'
    ORDER BY M.MCNNUMEDOC DESC
""")
rows_c = cursor.fetchall()
print(f"   Encontrados: {len(rows_c)}")
for r in rows_c:
    tdoc, ndoc, reg, cta, deb, tcru1, ncru1, tcru2, ncru2, det, vincula, fecha, docvinc, docest = r
    deb_v = float(deb) if deb else 0.0
    tcru1s = str(tcru1).strip() if tcru1 else ''
    ncru1i = int(ncru1) if ncru1 else 0
    tcru2s = str(tcru2).strip() if tcru2 else ''
    ncru2i = int(ncru2) if ncru2 else 0
    print(f"   NB01-{int(ndoc)} | REG={int(reg)} | DEB={deb_v:,.2f} | "
          f"TIPCRU1={tcru1s}-{ncru1i} | TIPCRU2={tcru2s}-{ncru2i} | "
          f"FECHA={fecha} | DOCVINC={str(docvinc).strip() if docvinc else ''} | EST={docest}")
    print(f"           DETALLE: {str(det).strip() if det else ''}")

# ── D) Buscar en MNGMCN de NB01 recientes que tengan vincula=NIT proveedor ────
print(f"\n[D] NB01 recientes (Feb-Mar 2026) con MCNVINCULA = {NIT_PROVEEDOR} en cuenta 23355002")
cursor.execute("""
    SELECT M.MCNTIPODOC, M.MCNNUMEDOC, M.MCNREG,
           M.MCNCUENTA, M.MCNVALDEBI, M.MCNVALCRED,
           M.MCNTIPCRU1, M.MCNNUMCRU1,
           M.MCNTIPCRU2, M.MCNNUMCRU2,
           M.MCNDETALLE, M.MCNVINCULA,
           D.DOCFECHA, D.DOCESTADO
    FROM MANAGER.MNGMCN M
    JOIN MANAGER.MNGDOC D ON M.MCNTIPODOC = D.DOCTIPO AND M.MCNNUMEDOC = D.DOCNUMERO
    WHERE M.MCNTIPODOC = 'NB01'
      AND TRIM(M.MCNVINCULA) = :nit
      AND D.DOCFECHA >= DATE '2026-02-01'
    ORDER BY M.MCNNUMEDOC DESC
""", {'nit': NIT_PROVEEDOR})
rows_d = cursor.fetchall()
print(f"   Encontrados: {len(rows_d)}")
for r in rows_d:
    tdoc, ndoc, reg, cta, deb, crd, tcru1, ncru1, tcru2, ncru2, det, vincula, fecha, docest = r
    deb_v = float(deb) if deb else 0.0
    crd_v = float(crd) if crd else 0.0
    tcru1s = str(tcru1).strip() if tcru1 else ''
    ncru1i = int(ncru1) if ncru1 else 0
    tcru2s = str(tcru2).strip() if tcru2 else ''
    ncru2i = int(ncru2) if ncru2 else 0
    cta_s = str(cta).strip()
    print(f"   NB01-{int(ndoc)} | REG={int(reg)} | CTA={cta_s} | DEB={deb_v:,.2f} | CRD={crd_v:,.2f} | "
          f"TIPCRU1={tcru1s}-{ncru1i} | TIPCRU2={tcru2s}-{ncru2i} | "
          f"FECHA={fecha} | EST={docest}")
    print(f"           DETALLE: {str(det).strip() if det else ''}")

print(f"\n{SEP}")
print("  FIN -- SOLO SELECT")
print(SEP)

cursor.close()
conn.close()
