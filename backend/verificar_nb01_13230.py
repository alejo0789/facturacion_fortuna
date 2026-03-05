"""
Verifica NB01-13230 y su relacion con DC07-1700 en produccion (SOLO SELECT).
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import oracledb

# Produccion
conn = oracledb.connect(
    user="CAUSA_IA", password="IA_CAUSA2026*",
    host="172.17.101.3", port=1521, service_name="MANAMED"
)
cursor = conn.cursor()
SEP = "=" * 90

print(SEP)
print("  NB01-13230 vs DC07-1700  -- SOLO SELECT  (produccion MANAMED)")
print(SEP)

# ── 1. Cabecera de la NB01-13230 ──────────────────────────────────────────────
print("\n[1] CABECERA MNGDOC de NB01-13230")
cursor.execute("""
    SELECT DOCTIPO, DOCNUMERO, DOCFECHA, DOCESTADO, DOCVINCULA, DOCDETALLE
    FROM MANAGER.MNGDOC
    WHERE DOCTIPO = 'NB01' AND DOCNUMERO = 13230
""")
row = cursor.fetchone()
if row:
    for k, v in zip(['tipo','numero','fecha','estado','vincula','detalle'], row):
        print(f"   {k:<12}: {v}")
else:
    print("   [NO ENCONTRADO]")

# ── 2. Todos los movimientos MNGMCN de NB01-13230 ─────────────────────────────
print("\n[2] MOVIMIENTOS MNGMCN de NB01-13230")
cursor.execute("""
    SELECT MCNREG, MCNCUENTA,
           MCNVALDEBI, MCNVALCRED,
           MCNDETALLE,
           MCNINDINV, MCNDIMEORI,
           MCNCLACRU1, MCNTIPCRU1, MCNNUMCRU1,
           MCNCLACRU2, MCNTIPCRU2, MCNNUMCRU2,
           MCNESTADO, MCNVINCULA
    FROM MANAGER.MNGMCN
    WHERE MCNTIPODOC = 'NB01' AND MCNNUMEDOC = 13230
    ORDER BY MCNREG
""")
rows = cursor.fetchall()
print(f"   {'REG':>3} {'CUENTA':<16} {'DEBITO':>14} {'CREDITO':>14} "
      f"{'TIPCRU1':>8} {'NUMCRU1':>8} {'TIPCRU2':>8} {'NUMCRU2':>8} "
      f"{'INDINV':>6} {'DIMEORI':>12} {'ESTADO':>6}")
print(f"   {'-'*3} {'-'*16} {'-'*14} {'-'*14} "
      f"{'-'*8} {'-'*8} {'-'*8} {'-'*8} "
      f"{'-'*6} {'-'*12} {'-'*6}")
for r in rows:
    reg, cta, deb, crd, det, indinv, dimeori, clacru1, tcru1, ncru1, clacru2, tcru2, ncru2, estado, vincula = r
    deb_v  = float(deb)    if deb    else 0.0
    crd_v  = float(crd)    if crd    else 0.0
    dim_v  = float(dimeori) if dimeori else 0.0
    tcru1s = str(tcru1).strip() if tcru1 else ''
    ncru1i = int(ncru1) if ncru1 else 0
    tcru2s = str(tcru2).strip() if tcru2 else ''
    ncru2i = int(ncru2) if ncru2 else 0
    cta_s  = str(cta).strip()
    inv_s  = str(indinv).strip() if indinv else ''
    est_s  = str(estado).strip()  if estado  else ''
    print(f"   {int(reg):>3} {cta_s:<16} {deb_v:>14,.2f} {crd_v:>14,.2f} "
          f"{tcru1s:>8} {ncru1i:>8} {tcru2s:>8} {ncru2i:>8} "
          f"{inv_s:>6} {dim_v:>12,.2f} {est_s:>6}")

# ── 3. Verificar desde el lado DC07-1700: sus movimientos cruce ──────────────
print("\n[3] MOVIMIENTOS MNGMCN de DC07-1700 (para ver campos CRU)")
cursor.execute("""
    SELECT MCNREG, MCNCUENTA,
           MCNVALDEBI, MCNVALCRED,
           MCNINDINV, MCNDIMEORI, MCNSALDOCR,
           MCNCLACRU1, MCNTIPCRU1, MCNNUMCRU1,
           MCNCLACRU2, MCNTIPCRU2, MCNNUMCRU2,
           MCNESTADO
    FROM MANAGER.MNGMCN
    WHERE MCNTIPODOC = 'DC07' AND MCNNUMEDOC = 1700
    ORDER BY MCNREG
""")
rows2 = cursor.fetchall()
print(f"   {'REG':>3} {'CUENTA':<16} {'DEBITO':>14} {'CREDITO':>14} "
      f"{'INDINV':>6} {'DIMEORI':>12} {'SALDOCR':>12} "
      f"{'TIPCRU1':>8} {'NUMCRU1':>8} {'TIPCRU2':>8} {'NUMCRU2':>8} {'ESTADO':>6}")
print(f"   {'-'*3} {'-'*16} {'-'*14} {'-'*14} "
      f"{'-'*6} {'-'*12} {'-'*12} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*6}")
for r in rows2:
    reg, cta, deb, crd, indinv, dimeori, saldocr, clacru1, tcru1, ncru1, clacru2, tcru2, ncru2, estado = r
    deb_v  = float(deb)    if deb    else 0.0
    crd_v  = float(crd)    if crd    else 0.0
    dim_v  = float(dimeori) if dimeori else 0.0
    sal_v  = float(saldocr) if saldocr else 0.0
    tcru1s = str(tcru1).strip() if tcru1 else ''
    ncru1i = int(ncru1) if ncru1 else 0
    tcru2s = str(tcru2).strip() if tcru2 else ''
    ncru2i = int(ncru2) if ncru2 else 0
    cta_s  = str(cta).strip()
    inv_s  = str(indinv).strip() if indinv else ''
    est_s  = str(estado).strip()  if estado  else ''
    print(f"   {int(reg):>3} {cta_s:<16} {deb_v:>14,.2f} {crd_v:>14,.2f} "
          f"{inv_s:>6} {dim_v:>12,.2f} {sal_v:>12,.2f} "
          f"{tcru1s:>8} {ncru1i:>8} {tcru2s:>8} {ncru2i:>8} {est_s:>6}")

# ── 4. Busqueda amplia: cualquier movimiento que mencione DC07-1700 ──────────
print("\n[4] BUSQUEDA AMPLIA: cualquier MCN con TIPCRU1 o TIPCRU2 = DC07 y num = 1700")
cursor.execute("""
    SELECT MCNTIPODOC, MCNNUMEDOC, MCNREG, MCNCUENTA,
           MCNVALDEBI, MCNVALCRED,
           MCNTIPCRU1, MCNNUMCRU1,
           MCNTIPCRU2, MCNNUMCRU2,
           MCNESTADO
    FROM MANAGER.MNGMCN
    WHERE (MCNTIPCRU1 = 'DC07' AND MCNNUMCRU1 = 1700)
       OR (MCNTIPCRU2 = 'DC07' AND MCNNUMCRU2 = 1700)
    ORDER BY MCNTIPODOC, MCNNUMEDOC, MCNREG
""")
rows3 = cursor.fetchall()
print(f"   Encontrados: {len(rows3)} registros")
print(f"   {'TIPODOC':<8} {'NUMEDOC':>8} {'REG':>4} {'CUENTA':<16} "
      f"{'DEBITO':>14} {'CREDITO':>14} "
      f"{'TIPCRU1':>8} {'NUMCRU1':>8} {'TIPCRU2':>8} {'NUMCRU2':>8} {'ESTADO':>6}")
print(f"   {'-'*8} {'-'*8} {'-'*4} {'-'*16} {'-'*14} {'-'*14} "
      f"{'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*6}")
for r in rows3:
    tdoc, ndoc, reg, cta, deb, crd, tcru1, ncru1, tcru2, ncru2, estado = r
    deb_v  = float(deb)  if deb  else 0.0
    crd_v  = float(crd)  if crd  else 0.0
    tdocs  = str(tdoc).strip()
    ndoci  = int(ndoc)
    tcru1s = str(tcru1).strip() if tcru1 else ''
    ncru1i = int(ncru1) if ncru1 else 0
    tcru2s = str(tcru2).strip() if tcru2 else ''
    ncru2i = int(ncru2) if ncru2 else 0
    cta_s  = str(cta).strip()
    est_s  = str(estado).strip() if estado else ''
    highlight = " <-- *** ENCONTRADO ***" if tdocs == 'NB01' else ""
    print(f"   {tdocs:<8} {ndoci:>8} {int(reg):>4} {cta_s:<16} "
          f"{deb_v:>14,.2f} {crd_v:>14,.2f} "
          f"{tcru1s:>8} {ncru1i:>8} {tcru2s:>8} {ncru2i:>8} {est_s:>6}{highlight}")

print(f"\n{SEP}")
print("  FIN -- SOLO SELECT, nada modificado en produccion")
print(SEP)

cursor.close()
conn.close()
