"""
Script para verificar qué hay en la columna PROVEEDOR del Excel
"""
import pandas as pd

# Leer Excel
df = pd.read_excel('../proveedores2.xlsx', sheet_name='Hoja2')

# Filtrar oficinas 001 y 010
filtered = df[df['COD. OFI'].isin(['001', '010'])].copy()

print("="*60)
print("DATOS EN EXCEL - OFICINAS 001 Y 010")
print("="*60)
print(f"\nTotal filas: {len(filtered)}\n")

# Mostrar las primeras 10 filas
for idx, row in filtered.head(10).iterrows():
    proveedor = row['PROVEEDOR']
    cod_ofi = row['COD. OFI']
    nombre_ofi = row['NOMBRE OFICINA']
    print(f"Fila {idx}: PROVEEDOR='{proveedor}' | COD={cod_ofi} | OFICINA={nombre_ofi}")

print("\n" + "="*60)
