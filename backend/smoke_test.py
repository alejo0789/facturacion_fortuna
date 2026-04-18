"""
Smoke test end-to-end del backend SaaS multi-tenant.

Ejecuta un flujo básico contra un backend ya levantado en localhost:8000:
  1. Login como superadmin
  2. Verifica /auth/me
  3. Lista el PUC de la empresa por defecto
  4. Simula cálculo de impuestos
  5. Crea un asiento contable manual (verifica partida doble DB=CR)
  6. Aprueba el asiento
  7. Consulta el libro mayor de una cuenta
  8. Consulta el balance de comprobación

Uso:
    python smoke_test.py                       # localhost:8000 con superadmin del .env
    python smoke_test.py http://otro:8000      # otro host
    API_EMAIL=x@y.com API_PASSWORD=yyy python smoke_test.py

Requiere: httpx
"""
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

    section("RESULTADO")
    print("\n  ✓ TODOS LOS CHEQUEOS PASARON\n")


if __name__ == "__main__":
    try:
        main()
    except httpx.ConnectError:
        print(f"\nERROR: No se puede conectar a {BASE_URL}. ¿Está corriendo el backend?")
        sys.exit(2)
