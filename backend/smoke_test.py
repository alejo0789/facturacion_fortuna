"""
Smoke test end-to-end del backend SaaS multi-tenant.

Ejecuta un flujo básico contra un backend ya levantado en localhost:8000:
   1. Login como superadmin
   2. Verifica /auth/me
   3. Empresas accesibles
   4. PUC con cuentas clave
   5. Cálculo de impuestos
   6. Crear asiento manual (partida doble DB=CR)
   7. Rechazo 422 de asiento descuadrado
   8. Aprobar asiento
   9. Libro mayor
  10. Balance de comprobación
  11. Cuentas bancarias (crear y listar)
  12. Extractos bancarios (upload CSV en memoria + analizar)
  13. DIAN — resumen y formatos 1001 / 1007 / 1008

Uso:
    python smoke_test.py                       # localhost:8000 con superadmin del .env
    python smoke_test.py http://otro:8000      # otro host
    API_EMAIL=x@y.com API_PASSWORD=yyy python smoke_test.py

Requiere: httpx
"""
import io
import os
import sys
from datetime import date

import httpx


BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
EMAIL = os.getenv("API_EMAIL", "admin@admin.com")
PASSWORD = os.getenv("API_PASSWORD", "admin123")


def section(title: str) -> None:
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)


def check(cond: bool, msg: str) -> None:
    icon = "OK " if cond else "FAIL"
    print(f"  [{icon}] {msg}")
    if not cond:
        sys.exit(1)


def main() -> None:
    client = httpx.Client(base_url=BASE_URL, timeout=30.0)

    # -------------------------------------------------
    section("1. LOGIN")
    # -------------------------------------------------
    r = client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    check(r.status_code == 200, f"POST /api/auth/login → {r.status_code}")
    tokens = r.json()
    access_token = tokens.get("access_token")
    check(bool(access_token), "Access token recibido")
    print(f"     access_token[:20]={access_token[:20]}...")

    auth_headers = {"Authorization": f"Bearer {access_token}"}

    # -------------------------------------------------
    section("2. /auth/me")
    # -------------------------------------------------
    r = client.get("/api/auth/me", headers=auth_headers)
    check(r.status_code == 200, f"GET /api/auth/me → {r.status_code}")
    me = r.json()
    print(f"     usuario: {me.get('email')} | superadmin: {me.get('es_superadmin')}")

    # -------------------------------------------------
    section("3. EMPRESAS DEL USUARIO")
    # -------------------------------------------------
    r = client.get("/api/auth/empresas", headers=auth_headers)
    check(r.status_code == 200, f"GET /api/auth/empresas → {r.status_code}")
    empresas = r.json()
    print(f"     empresas disponibles: {len(empresas)}")

    if not empresas:
        # Superadmin: listar todas
        r = client.get("/api/empresas/", headers=auth_headers)
        if r.status_code == 200:
            empresas = r.json()

    check(len(empresas) > 0, "Hay al menos 1 empresa disponible")
    empresa_id = empresas[0]["id"]
    print(f"     usando empresa_id={empresa_id} ({empresas[0].get('nombre')})")

    # Headers con tenant
    tenant_headers = {**auth_headers, "X-Empresa-Id": str(empresa_id)}

    # -------------------------------------------------
    section("4. PUC")
    # -------------------------------------------------
    r = client.get("/api/contabilidad/puc", headers=tenant_headers)
    check(r.status_code == 200, f"GET /api/contabilidad/puc → {r.status_code}")
    puc = r.json()
    check(len(puc) > 0, f"PUC tiene {len(puc)} cuentas")

    auxiliares = [c for c in puc if c["permite_movimiento"]]
    print(f"     cuentas con movimiento: {len(auxiliares)}")

    # Verificar presencia de cuentas clave para causación
    codigos = {c["codigo"] for c in puc}
    for cuenta in ["511005", "240810", "236540", "220505"]:
        check(cuenta in codigos, f"Cuenta {cuenta} presente en PUC")

    # -------------------------------------------------
    section("5. CALCULO DE IMPUESTOS")
    # -------------------------------------------------
    r = client.post(
        "/api/impuestos/calcular",
        headers=tenant_headers,
        json={
            "valor_total": "1190000",
            "tiene_iva": True,
            "aplica_retefuente": True,
        },
    )
    check(r.status_code == 200, f"POST /api/impuestos/calcular → {r.status_code}")
    calc = r.json()
    print(f"     total={calc['valor_total']}  base={calc['valor_base']}  IVA={calc['valor_iva']}")
    print(f"     retefuente={calc['valor_retefuente']}  neto={calc['valor_neto']}")
    check(float(calc["valor_base"]) == 1000000.0, "valor_base = 1,000,000 (IVA 19%)")

    # -------------------------------------------------
    section("6. CREAR ASIENTO MANUAL (partida doble)")
    # -------------------------------------------------
    hoy = date.today().isoformat()
    asiento_payload = {
        "fecha": hoy,
        "descripcion": "Smoke test - asiento manual",
        "tipo": "MANUAL",
        "lineas": [
            {
                "cuenta_codigo": "511005",
                "nit_tercero": "900123456-7",
                "debito": "500000",
                "credito": "0",
                "detalle": "Honorarios (gasto)",
            },
            {
                "cuenta_codigo": "220505",
                "nit_tercero": "900123456-7",
                "debito": "0",
                "credito": "500000",
                "detalle": "Proveedores por pagar",
            },
        ],
    }
    r = client.post("/api/contabilidad/asientos", headers=tenant_headers, json=asiento_payload)
    check(r.status_code == 200, f"POST /api/contabilidad/asientos → {r.status_code} {r.text[:120]}")
    asiento = r.json()
    print(f"     asiento creado id={asiento['id']} numero={asiento['numero']} estado={asiento['estado']}")
    check(
        float(asiento["total_debito"]) == float(asiento["total_credito"]),
        f"DB ({asiento['total_debito']}) == CR ({asiento['total_credito']})",
    )
    asiento_id = asiento["id"]

    # -------------------------------------------------
    section("7. VALIDACION DE PARTIDA DOBLE (debe fallar)")
    # -------------------------------------------------
    bad_payload = {
        "fecha": hoy,
        "descripcion": "Asiento descuadrado (debe fallar)",
        "tipo": "MANUAL",
        "lineas": [
            {"cuenta_codigo": "511005", "nit_tercero": "900", "debito": "100", "credito": "0"},
            {"cuenta_codigo": "220505", "nit_tercero": "900", "debito": "0", "credito": "99"},
        ],
    }
    r = client.post("/api/contabilidad/asientos", headers=tenant_headers, json=bad_payload)
    check(r.status_code == 422, f"Rechazo de asiento descuadrado → {r.status_code} (esperado 422)")

    # -------------------------------------------------
    section("8. APROBAR ASIENTO")
    # -------------------------------------------------
    r = client.post(f"/api/contabilidad/asientos/{asiento_id}/aprobar", headers=tenant_headers)
    check(r.status_code == 200, f"POST /asientos/{asiento_id}/aprobar → {r.status_code}")
    aprobado = r.json()
    check(aprobado["estado"] == "APROBADO", f"Estado: {aprobado['estado']}")

    # -------------------------------------------------
    section("9. LIBRO MAYOR")
    # -------------------------------------------------
    r = client.get("/api/contabilidad/libro-mayor/511005", headers=tenant_headers)
    check(r.status_code == 200, f"GET /libro-mayor/511005 → {r.status_code}")
    mayor = r.json()
    print(f"     cuenta: {mayor['cuenta_codigo']} {mayor['cuenta_nombre']}")
    print(f"     movimientos: {len(mayor['movimientos'])}  saldo: {mayor['saldo_final']}")

    # -------------------------------------------------
    section("10. BALANCE DE COMPROBACION")
    # -------------------------------------------------
    hoy_d = date.today()
    r = client.get(
        f"/api/contabilidad/balance?anio={hoy_d.year}&mes={hoy_d.month}",
        headers=tenant_headers,
    )
    check(r.status_code == 200, f"GET /balance → {r.status_code}")
    balance = r.json()
    print(f"     Gastos: {balance['total_gastos']}")
    print(f"     Pasivos: {balance['total_pasivos']}")
    print(f"     Utilidad neta: {balance['utilidad_neta']}")

    # -------------------------------------------------
    section("11. CUENTAS BANCARIAS")
    # -------------------------------------------------
    # Busca una subcuenta 1110* en el PUC para mapear la cuenta bancaria
    cuentas_banco_puc = [c for c in puc if c["codigo"].startswith("1110") and c["permite_movimiento"]]
    check(len(cuentas_banco_puc) > 0, "Existe al menos una subcuenta 1110* de movimiento en el PUC")
    puc_banco = cuentas_banco_puc[0]["codigo"]
    print(f"     usando cuenta PUC {puc_banco} ({cuentas_banco_puc[0]['nombre']})")

    numero_unico = f"SMOKE-{date.today().isoformat()}-{os.getpid()}"
    r = client.post(
        "/api/contabilidad/cuentas-bancarias",
        headers=tenant_headers,
        json={
            "banco": "Bancolombia",
            "numero_cuenta": numero_unico,
            "tipo_cuenta": "Ahorros",
            "cuenta_puc_codigo": puc_banco,
            "activa": True,
        },
    )
    # 200 (creada) o 409 (duplicado por reintento)
    check(
        r.status_code in (200, 201, 409),
        f"POST /cuentas-bancarias → {r.status_code} {r.text[:120]}",
    )

    r = client.get(
        "/api/contabilidad/cuentas-bancarias",
        headers=tenant_headers,
        params={"solo_activas": "false"},
    )
    check(r.status_code == 200, f"GET /cuentas-bancarias → {r.status_code}")
    cuentas_banco = r.json()
    check(len(cuentas_banco) >= 1, f"Cuentas bancarias registradas: {len(cuentas_banco)}")
    cuenta_bancaria_id = next(
        (c["id"] for c in cuentas_banco if c["numero_cuenta"] == numero_unico),
        cuentas_banco[0]["id"],
    )

    # -------------------------------------------------
    section("12. EXTRACTOS BANCARIOS")
    # -------------------------------------------------
    # Listado inicial (puede o no tener extractos previos)
    r = client.get("/api/bancario/extractos", headers=tenant_headers)
    check(r.status_code == 200, f"GET /bancario/extractos → {r.status_code}")
    extractos_prev = len(r.json())
    print(f"     extractos existentes: {extractos_prev}")

    # Upload de un CSV genérico en memoria (3 transacciones)
    csv_content = (
        "fecha,descripcion,referencia,monto,tipo\n"
        "2026-04-01,Pago proveedor honorarios,REF-001,500000,DEBITO\n"
        "2026-04-02,Consignacion cliente ABC,REF-002,1200000,CREDITO\n"
        "2026-04-03,Comision bancaria,REF-003,5000,DEBITO\n"
    ).encode("utf-8")

    r = client.post(
        "/api/bancario/extractos/upload",
        headers=tenant_headers,
        data={"cuenta_bancaria_id": str(cuenta_bancaria_id)},
        files={"archivo": ("smoke.csv", io.BytesIO(csv_content), "text/csv")},
    )
    # 200 al primer upload; 400/409 si ya se subió exactamente el mismo CSV antes.
    check(
        r.status_code in (200, 201, 400, 409),
        f"POST /bancario/extractos/upload → {r.status_code} {r.text[:180]}",
    )
    if r.status_code in (200, 201):
        up = r.json()
        extracto_id = up.get("extracto_id") or up.get("id")
        print(
            f"     extracto cargado id={extracto_id} "
            f"transacciones={up.get('transacciones_cargadas') or up.get('total_transacciones')}"
        )

        # Analizar conciliación (con o sin candidatas)
        r = client.post(
            f"/api/bancario/conciliacion/analizar/{extracto_id}",
            headers=tenant_headers,
        )
        check(r.status_code == 200, f"POST /conciliacion/analizar → {r.status_code}")
        analisis = r.json()
        print(
            f"     analizadas={analisis['analizadas']} sugerencias={len(analisis['sugerencias'])}"
            f" auto-conciliadas={analisis['auto_conciliadas']}"
        )
    else:
        print("     (upload saltado — ya había un extracto idéntico)")

    # Rechazo de IDs inexistentes
    r = client.post("/api/bancario/conciliacion/analizar/999999", headers=tenant_headers)
    check(r.status_code == 404, f"Extracto inexistente → {r.status_code} (esperado 404)")

    # -------------------------------------------------
    section("13. DIAN — MEDIOS MAGNETICOS")
    # -------------------------------------------------
    anio_dian = date.today().year
    r = client.get(
        f"/api/dian/medios-magneticos/resumen?anio={anio_dian}",
        headers=tenant_headers,
    )
    check(r.status_code == 200, f"GET /dian/.../resumen → {r.status_code}")
    res = r.json()
    for k in ("f1001_registros", "f1007_registros", "f1008_registros",
              "f1001_total_pagos", "f1007_total_ingresos", "f1008_total_cxc"):
        check(k in res, f"Resumen DIAN contiene '{k}'")

    for formato in ("1001", "1007", "1008"):
        r = client.get(
            f"/api/dian/medios-magneticos/{formato}?anio={anio_dian}",
            headers=tenant_headers,
        )
        check(r.status_code == 200, f"GET /dian/.../{formato} → {r.status_code}")
        body = r.json()
        check("filas" in body, f"Formato {formato} devuelve campo 'filas'")
        print(f"     formato {formato}: {len(body['filas'])} fila(s)")

    # CSV en todos los formatos
    for formato in ("1001", "1007", "1008"):
        r = client.get(
            f"/api/dian/medios-magneticos/{formato}?anio={anio_dian}&formato=csv",
            headers=tenant_headers,
        )
        check(
            r.status_code == 200 and "text/csv" in r.headers.get("content-type", ""),
            f"GET /dian/.../{formato}?formato=csv → {r.status_code} (content-type: {r.headers.get('content-type')})",
        )

    section("RESULTADO")
    print("\n  ✓ TODOS LOS CHEQUEOS PASARON\n")


if __name__ == "__main__":
    try:
        main()
    except httpx.ConnectError:
        print(f"\nERROR: No se puede conectar a {BASE_URL}. ¿Está corriendo el backend?")
        sys.exit(2)
