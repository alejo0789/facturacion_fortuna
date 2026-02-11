import httpx
import asyncio

API_URL = "https://saman.lafortuna.com.co/facturacion_ia/api/api/"
API_KEY = "fortuna_2026_secret_api"

async def check_production():
    headers = {"X-API-Key": API_KEY}
    
    # 1. Search for the invoice BEM16218190
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            # First, we need to find the invoice ID. We search for invoices.
            # Assuming GET /facturas accepts search query
            resp = await client.get(f"{API_URL}/facturas?skip=0&limit=50", headers=headers)
            if resp.status_code != 200:
                print(f"Error fetching invoices: {resp.status_code}")
                return
            
            facturas = resp.json()
            target_factura = next((f for f in facturas if f['numero_factura'] == 'BEM16218190'), None)
            
            if not target_factura:
                print("Invoice BEM16218190 not found in the first 50 results.")
                return
            
            print(f"Found Invoice ID: {target_factura['id']}")
            
            # 2. Get full details including assignments
            resp = await client.get(f"{API_URL}/facturas/{target_factura['id']}", headers=headers)
            factura_details = resp.json()
            
            print("Assignments:")
            for oa in factura_details.get('oficinas_asignadas', []):
                oficina = oa.get('oficina', {})
                print(f" - Oficina ID: {oficina.get('id')}, Code: {oficina.get('cod_oficina')}, Value: {oa.get('valor')}")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_production())
