import httpx
import asyncio
import json

# Correct Base URL
API_URL = "https://saman.lafortuna.com.co/facturacion_ia/api/api"
API_KEY = "fortuna_2026_secret_api"

async def check_production():
    headers = {"X-API-Key": API_KEY}
    
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        print(f"Connecting to {API_URL}...")
        
        # 1. Try to find the invoice
        # Some APIs support search param
        search_url = f"{API_URL}/facturas/?skip=0&limit=100"
        print(f"Fetching: {search_url}")
        
        try:
            resp = await client.get(search_url, headers=headers)
            print(f"Status: {resp.status_code}")
            
            if resp.status_code != 200:
                print(f"Content: {resp.text[:500]}")
                return

            facturas = resp.json()
            # The list might be inside a 'data' key or direct list
            if isinstance(facturas, dict):
                items = facturas.get('data', [])
            else:
                items = facturas

            target = None
            for f in items:
                if f.get('numero_factura') == 'BEM16218190':
                    target = f
                    break
            
            if not target:
                print("Invoice BEM16218190 not found in recent 100.")
                # Try searching by query if possible
                resp = await client.get(f"{API_URL}/facturas/?search=BEM16218190", headers=headers)
                if resp.status_code == 200:
                    items = resp.json()
                    if isinstance(items, dict): items = items.get('data', [])
                    for f in items:
                        if f.get('numero_factura') == 'BEM16218190':
                            target = f
                            break

            if target:
                factura_id = target['id']
                print(f"Found Invoice ID: {factura_id}")
                
                # Get Assignments
                detail_url = f"{API_URL}/facturas/{factura_id}"
                resp = await client.get(detail_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    assignments = data.get('oficinas_asignadas', [])
                    print(f"Total Assignments: {len(assignments)}")
                    for oa in assignments:
                        of = oa.get('oficina', {})
                        con = oa.get('contrato', {})
                        print(f"Assignment ID: {oa.get('id')}")
                        print(f"  - Office: ID={of.get('id')}, Code='{of.get('cod_oficina')}', Name='{of.get('nombre')}'")
                        print(f"  - Contract: ID={con.get('id')}, Num='{con.get('num_contrato')}'")
                        print(f"  - Value: {oa.get('valor')}")
                else:
                    print(f"Error fetching detail: {resp.status_code}")
            else:
                print("Could not find invoice BEM16218190.")

        except Exception as e:
            print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(check_production())
