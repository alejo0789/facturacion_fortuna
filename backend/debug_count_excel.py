import pandas as pd

def check_excel():
    try:
        df = pd.read_excel('proveedores2.xlsx', sheet_name='Hoja2')
        # Filtrar como codigos string
        df['COD. OFI'] = df['COD. OFI'].astype(str).str.strip()
        filtradas = df[df['COD. OFI'].isin(['001', '010'])]
        print(f"Filas encontradas en Excel: {len(filtradas)}")
        # Print first few to compare order if needed
        # print(filtradas[['COD. OFI', 'NOMBRE OFICINA']].head())
    except Exception as e:
        print(f"Error reading excel: {e}")

if __name__ == "__main__":
    check_excel()
