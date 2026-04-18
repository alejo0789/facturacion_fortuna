"""
Plan Único de Cuentas (PUC) Colombiano — Decreto 2649/2650.

Define el catálogo base y expone `clonar_puc(empresa_id, db)` — idempotente —
para poblar el PUC de una empresa recién creada.

Niveles (Decreto 2650):
  CLASE       → 1 dígito   (1 Activo, 2 Pasivo, 3 Patrimonio, 4 Ingresos, 5 Gastos, 6 Costos, 7 Costos prod, 8 Orden DB, 9 Orden CR)
  GRUPO       → 2 dígitos
  CUENTA      → 4 dígitos
  SUBCUENTA   → 6 dígitos  (permite_movimiento = True para las auxiliares operativas)
  AUXILIAR    → 8+ dígitos (detalle fino, opcional)

Solo SUBCUENTA/AUXILIAR reciben movimientos contables.

Uso:
    from populate_puc import clonar_puc
    await clonar_puc(empresa_id=1, db=async_session)
"""
import asyncio
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import SessionLocal
from models_contabilidad import CuentaPUC


# -----------------------------------------------------------
# Catálogo base del PUC Colombiano (Decreto 2650)
# -----------------------------------------------------------
# Formato: (codigo, nombre, naturaleza, nivel, padre_codigo, permite_movimiento, requiere_tercero)
PUC_DATA = [
    # ===================== CLASE 1: ACTIVO =====================
    ("1", "ACTIVO", "DEBITO", "CLASE", None, False, False),

    # 11 Disponible
    ("11", "DISPONIBLE", "DEBITO", "GRUPO", "1", False, False),
    ("1105", "Caja", "DEBITO", "CUENTA", "11", False, False),
    ("110505", "Caja general", "DEBITO", "SUBCUENTA", "1105", True, False),
    ("110510", "Cajas menores", "DEBITO", "SUBCUENTA", "1105", True, False),
    ("1110", "Bancos", "DEBITO", "CUENTA", "11", False, False),
    ("111005", "Moneda nacional", "DEBITO", "SUBCUENTA", "1110", True, False),
    ("111010", "Moneda extranjera", "DEBITO", "SUBCUENTA", "1110", True, False),
    ("1120", "Cuentas de ahorro", "DEBITO", "CUENTA", "11", False, False),
    ("112005", "Bancos nacionales", "DEBITO", "SUBCUENTA", "1120", True, False),

    # 13 Deudores
    ("13", "DEUDORES", "DEBITO", "GRUPO", "1", False, False),
    ("1305", "Clientes", "DEBITO", "CUENTA", "13", False, False),
    ("130505", "Clientes nacionales", "DEBITO", "SUBCUENTA", "1305", True, True),
    ("130510", "Clientes del exterior", "DEBITO", "SUBCUENTA", "1305", True, True),
    ("1355", "Anticipo de impuestos y contribuciones", "DEBITO", "CUENTA", "13", False, False),
    ("135515", "Retención en la fuente", "DEBITO", "SUBCUENTA", "1355", True, False),
    ("135517", "Impuesto a las ventas retenido", "DEBITO", "SUBCUENTA", "1355", True, False),
    ("135518", "Impuesto de industria y comercio retenido", "DEBITO", "SUBCUENTA", "1355", True, False),

    # 14 Inventarios
    ("14", "INVENTARIOS", "DEBITO", "GRUPO", "1", False, False),
    ("1435", "Mercancías no fabricadas por la empresa", "DEBITO", "CUENTA", "14", False, False),
    ("143505", "Mercancías", "DEBITO", "SUBCUENTA", "1435", True, False),

    # 15 Propiedades, planta y equipo
    ("15", "PROPIEDADES PLANTA Y EQUIPO", "DEBITO", "GRUPO", "1", False, False),
    ("1504", "Terrenos", "DEBITO", "CUENTA", "15", False, False),
    ("150405", "Urbanos", "DEBITO", "SUBCUENTA", "1504", True, False),
    ("1516", "Construcciones y edificaciones", "DEBITO", "CUENTA", "15", False, False),
    ("151605", "Edificios", "DEBITO", "SUBCUENTA", "1516", True, False),
    ("1524", "Equipo de oficina", "DEBITO", "CUENTA", "15", False, False),
    ("152405", "Muebles y enseres", "DEBITO", "SUBCUENTA", "1524", True, False),
    ("1528", "Equipo de computación y comunicación", "DEBITO", "CUENTA", "15", False, False),
    ("152805", "Equipos de procesamiento de datos", "DEBITO", "SUBCUENTA", "1528", True, False),

    # ===================== CLASE 2: PASIVO =====================
    ("2", "PASIVO", "CREDITO", "CLASE", None, False, False),

    # 21 Obligaciones financieras
    ("21", "OBLIGACIONES FINANCIERAS", "CREDITO", "GRUPO", "2", False, False),
    ("2105", "Bancos nacionales", "CREDITO", "CUENTA", "21", False, False),
    ("210505", "Sobregiros", "CREDITO", "SUBCUENTA", "2105", True, False),
    ("210510", "Pagarés", "CREDITO", "SUBCUENTA", "2105", True, False),

    # 22 Proveedores
    ("22", "PROVEEDORES", "CREDITO", "GRUPO", "2", False, False),
    ("2205", "Nacionales", "CREDITO", "CUENTA", "22", False, False),
    ("220505", "Proveedores nacionales", "CREDITO", "SUBCUENTA", "2205", True, True),
    ("2210", "Del exterior", "CREDITO", "CUENTA", "22", False, False),
    ("221005", "Proveedores del exterior", "CREDITO", "SUBCUENTA", "2210", True, True),

    # 23 Cuentas por pagar
    ("23", "CUENTAS POR PAGAR", "CREDITO", "GRUPO", "2", False, False),
    ("2335", "Costos y gastos por pagar", "CREDITO", "CUENTA", "23", False, False),
    ("233505", "Gastos financieros", "CREDITO", "SUBCUENTA", "2335", True, True),
    ("233525", "Honorarios", "CREDITO", "SUBCUENTA", "2335", True, True),
    ("233530", "Servicios técnicos", "CREDITO", "SUBCUENTA", "2335", True, True),
    ("2365", "Retención en la fuente", "CREDITO", "CUENTA", "23", False, False),
    ("236505", "Salarios y pagos laborales", "CREDITO", "SUBCUENTA", "2365", True, True),
    ("236525", "Honorarios", "CREDITO", "SUBCUENTA", "2365", True, True),
    ("236530", "Servicios", "CREDITO", "SUBCUENTA", "2365", True, True),
    ("236540", "Compras", "CREDITO", "SUBCUENTA", "2365", True, True),
    ("236570", "Otras retenciones", "CREDITO", "SUBCUENTA", "2365", True, True),
    ("2367", "Impuesto a las ventas retenido", "CREDITO", "CUENTA", "23", False, False),
    ("236701", "ReteIVA", "CREDITO", "SUBCUENTA", "2367", True, True),
    ("2368", "Impuesto de industria y comercio retenido", "CREDITO", "CUENTA", "23", False, False),
    ("236805", "ReteICA", "CREDITO", "SUBCUENTA", "2368", True, True),
    ("2370", "Retenciones y aportes de nómina", "CREDITO", "CUENTA", "23", False, False),
    ("237005", "Aportes EPS", "CREDITO", "SUBCUENTA", "2370", True, False),
    ("237006", "Aportes Fondo de Pensiones", "CREDITO", "SUBCUENTA", "2370", True, False),

    # 24 Impuestos, gravámenes y tasas
    ("24", "IMPUESTOS GRAVAMENES Y TASAS", "CREDITO", "GRUPO", "2", False, False),
    ("2404", "De renta y complementarios", "CREDITO", "CUENTA", "24", False, False),
    ("240405", "Vigencia fiscal corriente", "CREDITO", "SUBCUENTA", "2404", True, False),
    ("2408", "Impuesto sobre las ventas por pagar", "CREDITO", "CUENTA", "24", False, False),
    ("240805", "IVA generado", "CREDITO", "SUBCUENTA", "2408", True, False),
    ("240810", "IVA descontable", "DEBITO", "SUBCUENTA", "2408", True, False),
    ("2412", "Impuesto de industria y comercio", "CREDITO", "CUENTA", "24", False, False),
    ("241205", "Vigencia fiscal corriente", "CREDITO", "SUBCUENTA", "2412", True, False),

    # 25 Obligaciones laborales
    ("25", "OBLIGACIONES LABORALES", "CREDITO", "GRUPO", "2", False, False),
    ("2505", "Salarios por pagar", "CREDITO", "CUENTA", "25", False, False),
    ("250505", "Salarios por pagar", "CREDITO", "SUBCUENTA", "2505", True, True),
    ("2510", "Cesantías consolidadas", "CREDITO", "CUENTA", "25", False, False),
    ("251005", "Ley 50 y normatividad anterior", "CREDITO", "SUBCUENTA", "2510", True, False),

    # ===================== CLASE 3: PATRIMONIO =====================
    ("3", "PATRIMONIO", "CREDITO", "CLASE", None, False, False),
    ("31", "CAPITAL SOCIAL", "CREDITO", "GRUPO", "3", False, False),
    ("3115", "Aportes sociales", "CREDITO", "CUENTA", "31", False, False),
    ("311505", "Cuotas o partes de interés social", "CREDITO", "SUBCUENTA", "3115", True, False),
    ("36", "RESULTADOS DEL EJERCICIO", "CREDITO", "GRUPO", "3", False, False),
    ("3605", "Utilidad del ejercicio", "CREDITO", "CUENTA", "36", False, False),
    ("360505", "Utilidad del ejercicio", "CREDITO", "SUBCUENTA", "3605", True, False),
    ("3610", "Pérdida del ejercicio", "DEBITO", "CUENTA", "36", False, False),
    ("361005", "Pérdida del ejercicio", "DEBITO", "SUBCUENTA", "3610", True, False),
    ("37", "RESULTADOS DE EJERCICIOS ANTERIORES", "CREDITO", "GRUPO", "3", False, False),
    ("3705", "Utilidades acumuladas", "CREDITO", "CUENTA", "37", False, False),
    ("370505", "Utilidades acumuladas", "CREDITO", "SUBCUENTA", "3705", True, False),

    # ===================== CLASE 4: INGRESOS =====================
    ("4", "INGRESOS", "CREDITO", "CLASE", None, False, False),
    ("41", "OPERACIONALES", "CREDITO", "GRUPO", "4", False, False),
    ("4135", "Comercio al por mayor y al por menor", "CREDITO", "CUENTA", "41", False, False),
    ("413505", "Comercio al por mayor", "CREDITO", "SUBCUENTA", "4135", True, False),
    ("4145", "Transporte, almacenamiento y comunicaciones", "CREDITO", "CUENTA", "41", False, False),
    ("414505", "Servicio de transporte", "CREDITO", "SUBCUENTA", "4145", True, False),
    ("4155", "Actividades de servicios sociales y de salud", "CREDITO", "CUENTA", "41", False, False),
    ("415505", "Actividades de la práctica médica", "CREDITO", "SUBCUENTA", "4155", True, False),
    ("42", "NO OPERACIONALES", "CREDITO", "GRUPO", "4", False, False),
    ("4210", "Financieros", "CREDITO", "CUENTA", "42", False, False),
    ("421005", "Intereses", "CREDITO", "SUBCUENTA", "4210", True, False),

    # ===================== CLASE 5: GASTOS =====================
    ("5", "GASTOS", "DEBITO", "CLASE", None, False, False),

    # 51 Operacionales de administración
    ("51", "OPERACIONALES DE ADMINISTRACION", "DEBITO", "GRUPO", "5", False, False),
    ("5105", "Gastos de personal", "DEBITO", "CUENTA", "51", False, False),
    ("510503", "Salario integral", "DEBITO", "SUBCUENTA", "5105", True, False),
    ("510506", "Sueldos", "DEBITO", "SUBCUENTA", "5105", True, False),
    ("510515", "Horas extras y recargos", "DEBITO", "SUBCUENTA", "5105", True, False),
    ("510527", "Auxilio de transporte", "DEBITO", "SUBCUENTA", "5105", True, False),
    ("5110", "Honorarios", "DEBITO", "CUENTA", "51", False, False),
    ("511005", "Junta directiva", "DEBITO", "SUBCUENTA", "5110", True, True),
    ("511010", "Revisoría fiscal", "DEBITO", "SUBCUENTA", "5110", True, True),
    ("511015", "Auditoría externa", "DEBITO", "SUBCUENTA", "5110", True, True),
    ("511020", "Avalúos", "DEBITO", "SUBCUENTA", "5110", True, True),
    ("511025", "Asesoría jurídica", "DEBITO", "SUBCUENTA", "5110", True, True),
    ("511030", "Asesoría financiera", "DEBITO", "SUBCUENTA", "5110", True, True),
    ("511035", "Asesoría técnica", "DEBITO", "SUBCUENTA", "5110", True, True),
    ("511095", "Otros", "DEBITO", "SUBCUENTA", "5110", True, True),
    ("5115", "Impuestos", "DEBITO", "CUENTA", "51", False, False),
    ("511505", "Industria y comercio", "DEBITO", "SUBCUENTA", "5115", True, False),
    ("511510", "Timbres", "DEBITO", "SUBCUENTA", "5115", True, False),
    ("5120", "Arrendamientos", "DEBITO", "CUENTA", "51", False, False),
    ("512010", "Construcciones y edificaciones", "DEBITO", "SUBCUENTA", "5120", True, True),
    ("512095", "Otros", "DEBITO", "SUBCUENTA", "5120", True, True),
    ("5125", "Contribuciones y afiliaciones", "DEBITO", "CUENTA", "51", False, False),
    ("512505", "Afiliaciones y sostenimiento", "DEBITO", "SUBCUENTA", "5125", True, False),
    ("5130", "Seguros", "DEBITO", "CUENTA", "51", False, False),
    ("513025", "Cumplimiento", "DEBITO", "SUBCUENTA", "5130", True, True),
    ("5135", "Servicios", "DEBITO", "CUENTA", "51", False, False),
    ("513505", "Aseo y vigilancia", "DEBITO", "SUBCUENTA", "5135", True, True),
    ("513510", "Asistencia técnica", "DEBITO", "SUBCUENTA", "5135", True, True),
    ("513525", "Acueducto y alcantarillado", "DEBITO", "SUBCUENTA", "5135", True, True),
    ("513530", "Energía eléctrica", "DEBITO", "SUBCUENTA", "5135", True, True),
    ("513535", "Teléfono", "DEBITO", "SUBCUENTA", "5135", True, True),
    ("513540", "Correo, portes y telegramas", "DEBITO", "SUBCUENTA", "5135", True, True),
    ("513550", "Transporte, fletes y acarreos", "DEBITO", "SUBCUENTA", "5135", True, True),
    ("513555", "Gas", "DEBITO", "SUBCUENTA", "5135", True, True),
    ("513595", "Otros servicios", "DEBITO", "SUBCUENTA", "5135", True, True),
    ("5140", "Gastos legales", "DEBITO", "CUENTA", "51", False, False),
    ("514005", "Notariales", "DEBITO", "SUBCUENTA", "5140", True, False),
    ("514010", "Registro mercantil", "DEBITO", "SUBCUENTA", "5140", True, False),
    ("5145", "Mantenimiento y reparaciones", "DEBITO", "CUENTA", "51", False, False),
    ("514510", "Construcciones y edificaciones", "DEBITO", "SUBCUENTA", "5145", True, True),
    ("514525", "Equipo de oficina", "DEBITO", "SUBCUENTA", "5145", True, True),
    ("514530", "Equipo de computación", "DEBITO", "SUBCUENTA", "5145", True, True),
    ("5155", "Gastos de viaje", "DEBITO", "CUENTA", "51", False, False),
    ("515510", "Alojamiento y manutención", "DEBITO", "SUBCUENTA", "5155", True, False),
    ("515515", "Pasajes aéreos", "DEBITO", "SUBCUENTA", "5155", True, False),
    ("5160", "Depreciaciones", "DEBITO", "CUENTA", "51", False, False),
    ("516005", "Construcciones y edificaciones", "DEBITO", "SUBCUENTA", "5160", True, False),
    ("516025", "Equipo de oficina", "DEBITO", "SUBCUENTA", "5160", True, False),
    ("516030", "Equipo de computación", "DEBITO", "SUBCUENTA", "5160", True, False),

    # 52 Operacionales de ventas
    ("52", "OPERACIONALES DE VENTAS", "DEBITO", "GRUPO", "5", False, False),
    ("5205", "Gastos de personal", "DEBITO", "CUENTA", "52", False, False),
    ("520506", "Sueldos", "DEBITO", "SUBCUENTA", "5205", True, False),
    ("5235", "Servicios", "DEBITO", "CUENTA", "52", False, False),
    ("523525", "Acueducto y alcantarillado", "DEBITO", "SUBCUENTA", "5235", True, True),
    ("523530", "Energía eléctrica", "DEBITO", "SUBCUENTA", "5235", True, True),
    ("523535", "Teléfono", "DEBITO", "SUBCUENTA", "5235", True, True),

    # 53 No operacionales
    ("53", "NO OPERACIONALES", "DEBITO", "GRUPO", "5", False, False),
    ("5305", "Financieros", "DEBITO", "CUENTA", "53", False, False),
    ("530505", "Gastos bancarios", "DEBITO", "SUBCUENTA", "5305", True, False),
    ("530515", "Comisiones", "DEBITO", "SUBCUENTA", "5305", True, False),
    ("530525", "Intereses", "DEBITO", "SUBCUENTA", "5305", True, False),
    ("530535", "Gravamen movimientos financieros", "DEBITO", "SUBCUENTA", "5305", True, False),

    # ===================== CLASE 6: COSTOS DE VENTAS =====================
    ("6", "COSTOS DE VENTAS", "DEBITO", "CLASE", None, False, False),
    ("61", "COSTO DE VENTAS Y DE PRESTACION DE SERVICIOS", "DEBITO", "GRUPO", "6", False, False),
    ("6135", "Comercio al por mayor y al por menor", "DEBITO", "CUENTA", "61", False, False),
    ("613505", "Costo mercancías vendidas", "DEBITO", "SUBCUENTA", "6135", True, False),
    ("6145", "Transporte, almacenamiento y comunicaciones", "DEBITO", "CUENTA", "61", False, False),
    ("614505", "Servicio de transporte", "DEBITO", "SUBCUENTA", "6145", True, True),
]


async def clonar_puc(empresa_id: int, db: AsyncSession) -> int:
    """
    Clona el catálogo base del PUC para una empresa.
    Idempotente: si una cuenta ya existe (por empresa_id + codigo) no la duplica.

    Returns: número de cuentas insertadas.
    """
    # Cargar códigos existentes en una sola query
    result = await db.execute(
        select(CuentaPUC.codigo).where(CuentaPUC.empresa_id == empresa_id)
    )
    existentes = {row[0] for row in result.all()}

    insertadas = 0
    # Ordenar por longitud del código (clases primero, luego grupos, etc.)
    puc_ordenado = sorted(PUC_DATA, key=lambda x: len(x[0]))

    for codigo, nombre, naturaleza, nivel, padre, permite_mov, requiere_tercero in puc_ordenado:
        if codigo in existentes:
            continue

        cuenta = CuentaPUC(
            empresa_id=empresa_id,
            codigo=codigo,
            nombre=nombre,
            naturaleza=naturaleza,
            nivel=nivel,
            padre_codigo=padre,
            permite_movimiento=permite_mov,
            requiere_tercero=requiere_tercero,
            activa=True,
        )
        db.add(cuenta)
        insertadas += 1

    await db.flush()
    return insertadas


async def _cli_main(empresa_id: Optional[int] = None):
    """CLI entry: poblar PUC para una empresa (o todas si empresa_id=None)."""
    from models_tenant import Empresa

    async with SessionLocal() as db:
        if empresa_id:
            empresas_ids = [empresa_id]
        else:
            result = await db.execute(select(Empresa.id))
            empresas_ids = [row[0] for row in result.all()]

        total = 0
        for eid in empresas_ids:
            n = await clonar_puc(eid, db)
            total += n
            print(f"Empresa {eid}: {n} cuentas insertadas")

        await db.commit()
        print(f"\n✅ PUC cargado — total: {total} cuentas en {len(empresas_ids)} empresa(s)")


if __name__ == "__main__":
    import sys
    empresa_id = int(sys.argv[1]) if len(sys.argv) > 1 else None
    asyncio.run(_cli_main(empresa_id))
