
import httpx
import json

base_url = 'http://192.168.2.91:8000/api'
headers = {'X-API-Key': 'fortuna_2026_secret_api'}

def check_facturas(value):
    print(f"Checking Facturas with search='{value}'...")
    try:
        r = httpx.get(f"{base_url}/facturas/?search={value}", headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data:
                for f in data:
                    print(f"Factura: ID={f.get('id')}, Num={f.get('numero_factura')}, Estado={f.get('estado')}, Valor={f.get('valor')}, ContratoID={f.get('contrato_id')}")
                    if f.get('oficinas_asignadas'):
                        for oa in f['oficinas_asignadas']:
                            print(f"  - Oficina: {oa.get('oficina', {}).get('nombre')}, Contrato: {oa.get('contrato', {}).get('num_contrato')}, EstadoAsignacion: {oa.get('estado')}")
            else:
                print(f"No se encontró factura con search={value}")
        else:
            print(f"Error Status Code: {r.status_code}, Response: {r.text}")
    except Exception as e:
        print(f"Error: {e}")

def check_contratos(value):
    print(f"Checking Contratos with search='{value}'...")
    try:
        r = httpx.get(f"{base_url}/contratos/?search={value}", headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data:
                for c in data:
                    print(f"Contrato: ID={c.get('id')}, Num={c.get('num_contrato')}, Estado={c.get('estado')}")
            else:
                print(f"No se encontró contrato con search={value}")
        else:
            print(f"Error Status Code: {r.status_code}, Response: {r.text}")
    except Exception as e:
        print(f"Error: {e}")

def check_recent_ids():
    print(f"Checking details of IDs around 670...")
    try:
        # 668, 672, 674, 675, 676, 677, 678
        for tid in [668, 672, 674, 675, 676, 677, 678]:
            r = httpx.get(f"{base_url}/facturas/{tid}", headers=headers, timeout=10)
            if r.status_code == 200:
                f = r.json()
                print(f"ID={tid}, Num={f['numero_factura']}, Created={f['created_at']}, Estado={f['estado']}, Prov={f.get('proveedor',{}).get('nombre')}")
            else:
                print(f"ID={tid} NOT FOUND (Status: {r.status_code})")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    check_recent_ids()
