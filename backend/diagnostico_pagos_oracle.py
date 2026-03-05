"""
DIAGNOSTICO DE PAGOS ORACLE - SOLO LECTURA (SELECT)
=====================================================
Compara el estado de documentos DC07 en produccion (MANAMED) y local (XEPDB1).
SIN NINGUN INSERT, UPDATE o DELETE.

Documentos a analizar:
  - DC07-1700 : debe estar PAGADO (tiene NB01 cruzado)
  - DC07-1737 : solo CAUSADO (aun sin NB01)
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import oracledb
import os
from dotenv import load_dotenv

load_dotenv()

# ── Credenciales locales (activas en .env) ────────────────────────────────────
LOCAL_HOST     = os.getenv("ORACLE_HOST", "localhost")
LOCAL_PORT     = int(os.getenv("ORACLE_PORT", "1521"))
LOCAL_SERVICE  = os.getenv("ORACLE_SERVICE", "XEPDB1")
LOCAL_USER     = os.getenv("ORACLE_USER", "MANAGER")
LOCAL_PASSWORD = os.getenv("ORACLE_PASSWORD", "manager_root")

# ── Credenciales producción (comentadas en .env – se cargan manualmente aquí) ─
PROD_HOST     = "172.17.101.3"
PROD_PORT     = 1521
PROD_SERVICE  = "MANAMED"
PROD_USER     = "CAUSA_IA"
PROD_PASSWORD = "IA_CAUSA2026*"

DOCS_A_ANALIZAR = [
    ("DC07", 1700),  # debe estar PAGADO
    ("DC07", 1737),  # solo causado
]

SEP = "=" * 80


def conectar(host, port, service, user, password, label="DB"):
    """Crea conexión Oracle en modo thin."""
    try:
        conn = oracledb.connect(
            user=user, password=password,
            host=host, port=port, service_name=service
        )
        print(f"[OK]  Conectado a {label} ({service}@{host}:{port})")
        return conn
    except Exception as e:
        print(f"[ERR] Error conectando a {label}: {e}")
        return None


def analizar_documento(cursor, tipo, numero, label):
    """Devuelve un dict con todos los datos relevantes del documento."""
    print(f"\n{'-'*60}")
    print(f"  [{label}]  {tipo}-{numero}")
    print(f"{'-'*60}")

    resultado = {
        "label": label,
        "tipo": tipo,
        "numero": numero,
        "cabecera": None,
        "movimientos": [],
        "nb01_cruzados": [],
        "es_aprobado": False,
        "saldo_cxp": 0.0,
    }

    # ── 1. Cabecera MNGDOC ──────────────────────────────────────────────────
    try:
        cursor.execute("""
            SELECT DOCTIPO, DOCNUMERO, DOCFECHA, DOCESTADO, DOCVINCULA, DOCDETALLE
            FROM MANAGER.MNGDOC
            WHERE DOCTIPO = :t AND DOCNUMERO = :n
        """, {'t': tipo, 'n': numero})
        row = cursor.fetchone()
        if row:
            resultado["cabecera"] = {
                "tipo": str(row[0]).strip(),
                "numero": int(row[1]),
                "fecha": str(row[2]) if row[2] else "N/A",
                "estado": str(row[3]).strip() if row[3] else "N/A",
                "vincula": str(row[4]).strip() if row[4] else "N/A",
                "detalle": str(row[5]).strip() if row[5] else "N/A",
            }
            print(f"\n  [DOC] CABECERA (MNGDOC):")
            for k, v in resultado["cabecera"].items():
                print(f"     {k:<15}: {v}")
        else:
            print(f"  [WARN] No existe cabecera en MNGDOC para {tipo}-{numero}")
    except Exception as e:
        print(f"  [ERR] Error consultando MNGDOC: {e}")

    # ── 2. Movimientos MNGMCN ──────────────────────────────────────────────
    try:
        cursor.execute("""
            SELECT MCNREG, MCNCUENTA, MCNVALDEBI, MCNVALCRED,
                   MCNDETALLE, MCNINDINV, MCNDIMEORI,
                   MCNCCOSTO, MCNDESTINO,
                   MCNCLACRU2, MCNTIPCRU2, MCNNUMCRU2,
                   MCNMODUSER, MCNMODFEC, MCNESTADO, MCNSALDOCR
            FROM MANAGER.MNGMCN
            WHERE MCNTIPODOC = :t AND MCNNUMEDOC = :n
            ORDER BY MCNREG
        """, {'t': tipo, 'n': numero})
        rows = cursor.fetchall()
        print(f"\n  [MCN] MOVIMIENTOS MNGMCN ({len(rows)} registros):")
        print(f"     {'REG':>3} {'CUENTA':<16} {'DEBITO':>14} {'CREDITO':>14} {'INDINV':>6} {'DIMEORI':>12} {'SALDOCR':>12} {'TIPCRU2':>7} {'NUMCRU2':>8} {'ESTADO'}")
        print(f"     {'-'*3} {'-'*16} {'-'*14} {'-'*14} {'-'*6} {'-'*12} {'-'*12} {'-'*7} {'-'*8} {'-'*8}")
        for r in rows:
            reg, cta, deb, crd, det, indinv, dimeori, ccosto, dst, clacru2, tipcru2, numcru2, moduser, modfec, estado, saldocr = r
            deb_v = float(deb) if deb else 0.0
            crd_v = float(crd) if crd else 0.0
            dim_v = float(dimeori) if dimeori else 0.0
            sal_v = float(saldocr) if saldocr else 0.0
            tcru2_s = str(tipcru2).strip() if tipcru2 else ''
            ncru2_i = int(numcru2) if numcru2 else 0
            cta_s   = str(cta).strip()
            est_s   = str(estado).strip() if estado else '-'
            print(f"     {int(reg):>3} {cta_s:<16} {deb_v:>14,.2f} {crd_v:>14,.2f} {str(indinv or ''):>6} {dim_v:>12,.2f} {sal_v:>12,.2f} {tcru2_s:>7} {ncru2_i:>8} {est_s}")
            
            mov_dict = {
                "reg": int(reg), "cuenta": cta_s,
                "debito": deb_v, "credito": crd_v,
                "detalle": str(det).strip() if det else "",
                "indinv": str(indinv).strip() if indinv else "",
                "dimeori": dim_v,
                "saldocr": sal_v,
                "ccosto": str(ccosto).strip() if ccosto else "",
                "destino": str(dst).strip() if dst else "",
                "tipcru2": tcru2_s,
                "numcru2": ncru2_i,
                "moduser": str(moduser).strip() if moduser else "",
                "modfec": str(modfec) if modfec else "",
                "estado": est_s,
            }
            resultado["movimientos"].append(mov_dict)

            # Verificar aprobación en cuenta 23355002
            if cta_s.startswith('23355002'):
                if dim_v > 0:
                    resultado["es_aprobado"] = True
                resultado["saldo_cxp"] += (crd_v - deb_v)
    except Exception as e:
        print(f"  [ERR] Error consultando MNGMCN: {e}")

    # ── 3. NB01 cruzados con este documento ─────────────────────────────────
    try:
        cursor.execute("""
            SELECT MCNTIPODOC, MCNNUMEDOC, MCNREG, MCNCUENTA,
                   MCNVALDEBI, MCNVALCRED, MCNDETALLE,
                   MCNCCOSTO, MCNDESTINO,
                   MCNCLACRU2, MCNTIPCRU2, MCNNUMCRU2,
                   MCNESTADO, MCNINDINV, MCNDIMEORI
            FROM MANAGER.MNGMCN
            WHERE MCNTIPODOC = 'NB01'
              AND MCNTIPCRU2 = :t
              AND MCNNUMCRU2 = :n
            ORDER BY MCNNUMEDOC, MCNREG
        """, {'t': tipo, 'n': numero})
        nb_rows = cursor.fetchall()
        print(f"\n  [NB01] CRUZADOS ({len(nb_rows)} registros):")
        if nb_rows:
            print(f"     {'TIPO':<6} {'NUM':>6} {'REG':>4} {'CUENTA':<16} {'DEBITO':>14} {'CREDITO':>14} {'ESTADO':>8} {'INDINV':>6} {'DIMEORI':>12}")
            print(f"     {'-'*6} {'-'*6} {'-'*4} {'-'*16} {'-'*14} {'-'*14} {'-'*8} {'-'*6} {'-'*12}")
            for nb in nb_rows:
                tdoc, ndoc, nreg, cta, deb, crd, det, cc, dst, clacru2, tcru2, ncru2, estado, indinv, dimeori = nb
                deb_v = float(deb) if deb else 0.0
                crd_v = float(crd) if crd else 0.0
                dim_v = float(dimeori) if dimeori else 0.0
                cta_s = str(cta).strip()
                est_s = str(estado).strip() if estado else '-'
                inv_s = str(indinv).strip() if indinv else '-'
                print(f"     {str(tdoc).strip():<6} {int(ndoc):>6} {int(nreg):>4} {cta_s:<16} {deb_v:>14,.2f} {crd_v:>14,.2f} {est_s:>8} {inv_s:>6} {dim_v:>12,.2f}")
                resultado["nb01_cruzados"].append({
                    "nb_tipo": str(tdoc).strip(), "nb_num": int(ndoc),
                    "reg": int(nreg), "cuenta": cta_s,
                    "debito": deb_v, "credito": crd_v,
                    "estado": est_s, "indinv": inv_s, "dimeori": dim_v
                })
        else:
            print("     (ninguno)")
    except Exception as e:
        print(f"  ❌ Error consultando NB01 cruzados: {e}")

    # ── Resumen ─────────────────────────────────────────────────────────────
    print(f"\n  ✅ RESUMEN {tipo}-{numero} [{label}]:")
    print(f"     Aprobado (DIMEORI > 0 en 23355002) : {resultado['es_aprobado']}")
    print(f"     Saldo CxP (23355002)               : {resultado['saldo_cxp']:,.2f}")
    print(f"     NB01 cruzados                      : {len(resultado['nb01_cruzados'])}")
    pagado = resultado["saldo_cxp"] <= 0.01 and len(resultado["nb01_cruzados"]) > 0
    print(f"     Pagado (saldo ≤ 0.01 y tiene NB01) : {pagado}")

    return resultado


def main():
    print(SEP)
    print("  DIAGNOSTICO DE PAGOS ORACLE - SOLO SELECT (READ ONLY)")
    print(SEP)

    # ─── PRODUCCION ──────────────────────────────────────────────────────────
    print(f"\n{'='*40}  PRODUCCION  {'='*40}")
    conn_prod = conectar(PROD_HOST, PROD_PORT, PROD_SERVICE, PROD_USER, PROD_PASSWORD, "PRODUCCION")
    resultados_prod = {}
    if conn_prod:
        cursor_prod = conn_prod.cursor()
        for tipo, numero in DOCS_A_ANALIZAR:
            r = analizar_documento(cursor_prod, tipo, numero, "PRODUCCION")
            resultados_prod[f"{tipo}-{numero}"] = r
        cursor_prod.close()
        conn_prod.close()
    else:
        print("  [WARN] No se pudo conectar a produccion. Verifique credenciales / VPN.")

    # ─── LOCAL ───────────────────────────────────────────────────────────────
    print(f"\n{'='*40}  LOCAL  {'='*44}")
    conn_local = conectar(LOCAL_HOST, LOCAL_PORT, LOCAL_SERVICE, LOCAL_USER, LOCAL_PASSWORD, "LOCAL")
    resultados_local = {}
    if conn_local:
        cursor_local = conn_local.cursor()
        for tipo, numero in DOCS_A_ANALIZAR:
            r = analizar_documento(cursor_local, tipo, numero, "LOCAL")
            resultados_local[f"{tipo}-{numero}"] = r
        cursor_local.close()
        conn_local.close()
    else:
        print("  [WARN] No se pudo conectar a la DB local. Verifique ORACLE_HOST/SERVICE.")

    # ─── COMPARACION ─────────────────────────────────────────────────────────
    print(f"\n{SEP}")
    print("  COMPARACION PRODUCCION vs LOCAL")
    print(SEP)

    for tipo, numero in DOCS_A_ANALIZAR:
        key = f"{tipo}-{numero}"
        rp = resultados_prod.get(key)
        rl = resultados_local.get(key)

        print(f"\n  [CMP] {key}")
        print(f"     {'Campo':<40} {'PRODUCCION':>20} {'LOCAL':>20}")
        print(f"     {'-'*40} {'-'*20} {'-'*20}")

        campos = [
            ("Cabecera existe",       bool(rp and rp.get("cabecera")),       bool(rl and rl.get("cabecera"))),
            ("Estado cabecera",       rp["cabecera"]["estado"] if rp and rp.get("cabecera") else "N/A",
                                      rl["cabecera"]["estado"] if rl and rl.get("cabecera") else "N/A"),
            ("# Movimientos MCN",     len(rp["movimientos"]) if rp else "N/A",   len(rl["movimientos"]) if rl else "N/A"),
            ("Aprobado (DIMEORI>0)",  rp["es_aprobado"] if rp else "N/A",         rl["es_aprobado"] if rl else "N/A"),
            ("Saldo CxP 23355002",    f"{rp['saldo_cxp']:,.2f}" if rp else "N/A", f"{rl['saldo_cxp']:,.2f}" if rl else "N/A"),
            ("# NB01 cruzados",       len(rp["nb01_cruzados"]) if rp else "N/A",  len(rl["nb01_cruzados"]) if rl else "N/A"),
        ]

        for campo, val_p, val_l in campos:
            match_icon = "[OK] " if str(val_p) == str(val_l) else "[DIF]"
            print(f"  {match_icon}  {campo:<40} {str(val_p):>20} {str(val_l):>20}")

    print(f"\n{SEP}")
    print("  FIN DEL DIAGNOSTICO")
    print(SEP)


if __name__ == "__main__":
    main()
