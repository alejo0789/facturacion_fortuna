"""
Busqueda SOLO LECTURA en PRGPAGO que es la Programacion de Pagos.
"""
import oracledb

conn = oracledb.connect(
    user="CAUSA_IA",
    password="IA_CAUSA2026*",
    host="10.150.81.85",
    port=1521,
    service_name="MANAGER1"
)
cursor = conn.cursor()

print("=== BUSCANDO DC07-1764 EN PRGPAGO ===")
cursor.execute("""
    SELECT PPGEMPRESA, PPGCLASE, PPGTIPO, PPGNUMERO, 
           TRIM(PPGTIPCRU1) AS CRU1_T, PPGNUMCRU1 AS CRU1_N,
           PPGVALOR, PPGACTIVO, TRIM(PPGCUENTA) AS CTA, PPGNEWUSER
    FROM MANAGER.PRGPAGO
    WHERE (PPGTIPCRU1 = 'DC07' AND PPGNUMCRU1 = 1764)
       OR (PPGTIPCRU2 = 'DC07' AND PPGNUMCRU2 = 1764)
""")
rows = cursor.fetchall()
if not rows:
    print("  No se encontró DC07-1764 en PRGPAGO.")
else:
    for r in rows:
        print(f"  PRG: {r[2]}-{r[3]} CRU1={r[4]}-{r[5]} VALOR={r[6]} ACTIVO={r[7]} CTA={r[8]} USER={r[9]}")


print("\n=== BUSCANDO EN TODAS LAS TABLAS DE PAGOS ===")
tablas = ['NE6EMPPAGO', 'NMNOMIPAGO', 'VINPAGO', 'FORMAPAGO', 'CATVTAPRO', 'CATVTAPROSN']
for t in tablas:
    try:
        cursor.execute(f"""
            SELECT COUNT(*) FROM MANAGER.{t}
            WHERE ROWNUM <= 1
        """)
        # Si no falla, busquemos columnas que se llamen algo con TIPO o NUM
        cursor.execute(f"""
            SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS 
            WHERE TABLE_NAME = '{t}' AND OWNER = 'MANAGER'
              AND (COLUMN_NAME LIKE '%TIPO%' OR COLUMN_NAME LIKE '%NUM%')
        """)
        cols = [r[0] for r in cursor.fetchall()]
        print(f"  Tabla {t} tiene columnas de busqueda: {cols}")
        
    except Exception as e:
        print(f"  Tabla {t} inaccesible o error: {e}")

cursor.close()
conn.close()
