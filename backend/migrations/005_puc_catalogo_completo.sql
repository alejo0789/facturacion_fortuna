-- =========================================================================
-- Migración 005 — Catálogo PUC Decreto 2650 (completo) + tabla shared
--
-- Fuente: 9 PDFs oficiales "PUC - Lista de cuentas de la clase N" extraídos
-- de https://puc.com.co/ (catálogo público del PUC para comerciantes
-- colombianos, Decreto 2650 de 1993).
--
-- Estructura:
--   - puc_catalogo: tabla SHARED (sin empresa_id). Es el catálogo maestro
--     del Decreto 2650 que TODAS las empresas pueden consultar para añadir
--     cuentas a su propio PUC (tabla cuenta_puc).
--   - cuenta_puc sigue siendo POR EMPRESA — solo las cuentas que la empresa
--     realmente usa. Al "agregar desde catálogo" se hace un INSERT en
--     cuenta_puc con los valores tomados del catálogo.
--
-- Idempotente: ON CONFLICT DO NOTHING en cada insert.
--
-- Cómo aplicar:
--   psql -U postgres -d supplier_db -f migrations/005_puc_catalogo_completo.sql
-- =========================================================================

-- 1. Tabla del catálogo maestro
CREATE TABLE IF NOT EXISTS puc_catalogo (
    codigo        VARCHAR(10) PRIMARY KEY,
    nombre        VARCHAR(255) NOT NULL,
    clase         VARCHAR(1)  NOT NULL,    -- 1..9
    nivel         INTEGER     NOT NULL,    -- 1 clase, 2 grupo, 4 cuenta, 6 subcuenta
    naturaleza    VARCHAR(10) NOT NULL,    -- DEBITO | CREDITO
    permite_mov   BOOLEAN     DEFAULT FALSE,
    padre_codigo  VARCHAR(10),             -- jerarquía
    descripcion   TEXT,
    busqueda      TEXT GENERATED ALWAYS AS (lower(codigo || ' ' || nombre)) STORED
);

CREATE INDEX IF NOT EXISTS ix_puc_cat_clase ON puc_catalogo (clase);
CREATE INDEX IF NOT EXISTS ix_puc_cat_nivel ON puc_catalogo (nivel);
CREATE INDEX IF NOT EXISTS ix_puc_cat_padre ON puc_catalogo (padre_codigo);
CREATE INDEX IF NOT EXISTS ix_puc_cat_busqueda ON puc_catalogo USING GIN (to_tsvector('spanish', busqueda));

-- 2. Insertar el catálogo completo Decreto 2650
-- Nota: permite_mov=true solo en subcuentas (6 dígitos), siguiendo convención.
-- Ajustes por inflación (sufijo 99 en cuentas de 4 dígitos) se marcan
-- explícitamente como NO movimiento (son cuentas técnicas).

-- =========================================================================
-- CLASE 1 - ACTIVO  (naturaleza DEBITO)
-- =========================================================================
INSERT INTO puc_catalogo (codigo, nombre, clase, nivel, naturaleza, permite_mov, padre_codigo) VALUES
('1',     'Activo',                          '1', 1, 'DEBITO', false, NULL),
('11',    'Disponible',                      '1', 2, 'DEBITO', false, '1'),
('1105',  'Caja',                            '1', 4, 'DEBITO', false, '11'),
('110505','Caja general',                    '1', 6, 'DEBITO', true,  '1105'),
('110510','Cajas menores',                   '1', 6, 'DEBITO', true,  '1105'),
('110515','Moneda extranjera',               '1', 6, 'DEBITO', true,  '1105'),
('1110',  'Bancos',                          '1', 4, 'DEBITO', false, '11'),
('111005','Moneda nacional',                 '1', 6, 'DEBITO', true,  '1110'),
('111010','Moneda extranjera',               '1', 6, 'DEBITO', true,  '1110'),
('1115',  'Remesas en tránsito',             '1', 4, 'DEBITO', false, '11'),
('111505','Moneda nacional',                 '1', 6, 'DEBITO', true,  '1115'),
('111510','Moneda extranjera',               '1', 6, 'DEBITO', true,  '1115'),
('1120',  'Cuentas de ahorro',               '1', 4, 'DEBITO', false, '11'),
('112005','Bancos',                          '1', 6, 'DEBITO', true,  '1120'),
('112010','Corporaciones de ahorro y vivienda','1',6,'DEBITO', true,  '1120'),
('112015','Organismos cooperativos financieros','1',6,'DEBITO',true,  '1120'),
('1125',  'Fondos',                          '1', 4, 'DEBITO', false, '11'),
('112505','Rotatorios moneda nacional',      '1', 6, 'DEBITO', true,  '1125'),
('112510','Rotatorios moneda extranjera',    '1', 6, 'DEBITO', true,  '1125'),
('112515','Especiales moneda nacional',      '1', 6, 'DEBITO', true,  '1125'),
('112520','Especiales moneda extranjera',    '1', 6, 'DEBITO', true,  '1125'),
('12',    'Inversiones',                     '1', 2, 'DEBITO', false, '1'),
('1205',  'Acciones',                        '1', 4, 'DEBITO', true,  '12'),
('1210',  'Cuotas o partes de interés social','1',4, 'DEBITO', true,  '12'),
('1215',  'Bonos',                           '1', 4, 'DEBITO', true,  '12'),
('1220',  'Cédulas',                         '1', 4, 'DEBITO', true,  '12'),
('1225',  'Certificados',                    '1', 4, 'DEBITO', false, '12'),
('122505','Certificados de depósito a término (CDT)','1',6,'DEBITO',true,'1225'),
('122510','Certificados de depósito de ahorro','1',6,'DEBITO',true,'1225'),
('1230',  'Papeles comerciales',             '1', 4, 'DEBITO', true,  '12'),
('1235',  'Títulos',                         '1', 4, 'DEBITO', true,  '12'),
('123515','Títulos de tesorería (TES)',      '1', 6, 'DEBITO', true,  '1235'),
('1245',  'Derechos fiduciarios',            '1', 4, 'DEBITO', true,  '12'),
('1295',  'Otras inversiones',               '1', 4, 'DEBITO', true,  '12'),
('1299',  'Provisiones',                     '1', 4, 'CREDITO',false, '12'),
('13',    'Deudores',                        '1', 2, 'DEBITO', false, '1'),
('1305',  'Clientes',                        '1', 4, 'DEBITO', false, '13'),
('130505','Nacionales',                      '1', 6, 'DEBITO', true,  '1305'),
('130510','Del exterior',                    '1', 6, 'DEBITO', true,  '1305'),
('130515','Deudores del sistema',            '1', 6, 'DEBITO', true,  '1305'),
('1320',  'Cuentas por cobrar a vinculados económicos','1',4,'DEBITO',false,'13'),
('132005','Filiales',                        '1', 6, 'DEBITO', true,  '1320'),
('132010','Subsidiarias',                    '1', 6, 'DEBITO', true,  '1320'),
('1325',  'Cuentas por cobrar a socios y accionistas','1',4,'DEBITO',false,'13'),
('132505','A socios',                        '1', 6, 'DEBITO', true,  '1325'),
('132510','A accionistas',                   '1', 6, 'DEBITO', true,  '1325'),
('1330',  'Anticipos y avances',             '1', 4, 'DEBITO', false, '13'),
('133005','A proveedores',                   '1', 6, 'DEBITO', true,  '1330'),
('133010','A contratistas',                  '1', 6, 'DEBITO', true,  '1330'),
('133015','A trabajadores',                  '1', 6, 'DEBITO', true,  '1330'),
('1345',  'Ingresos por cobrar',             '1', 4, 'DEBITO', false, '13'),
('134505','Dividendos y/o participaciones',  '1', 6, 'DEBITO', true,  '1345'),
('134510','Intereses',                       '1', 6, 'DEBITO', true,  '1345'),
('134515','Comisiones',                      '1', 6, 'DEBITO', true,  '1345'),
('134520','Honorarios',                      '1', 6, 'DEBITO', true,  '1345'),
('134525','Servicios',                       '1', 6, 'DEBITO', true,  '1345'),
('134530','Arrendamientos',                  '1', 6, 'DEBITO', true,  '1345'),
('1355',  'Anticipo de impuestos y contribuciones o saldos a favor','1',4,'DEBITO',false,'13'),
('135505','Anticipo de impuestos de renta y complementarios','1',6,'DEBITO',true,'1355'),
('135510','Anticipo de impuestos de industria y comercio','1',6,'DEBITO',true,'1355'),
('135515','Retención en la fuente',          '1', 6, 'DEBITO', true,  '1355'),
('135517','Impuesto a las ventas retenido',  '1', 6, 'DEBITO', true,  '1355'),
('135518','Impuesto de industria y comercio retenido','1',6,'DEBITO',true,'1355'),
('135525','Contribuciones',                  '1', 6, 'DEBITO', true,  '1355'),
('135530','Impuestos descontables',          '1', 6, 'DEBITO', true,  '1355'),
('1365',  'Cuentas por cobrar a trabajadores','1', 4, 'DEBITO', false, '13'),
('136505','Vivienda',                        '1', 6, 'DEBITO', true,  '1365'),
('136510','Vehículos',                       '1', 6, 'DEBITO', true,  '1365'),
('136515','Educación',                       '1', 6, 'DEBITO', true,  '1365'),
('1380',  'Deudores varios',                 '1', 4, 'DEBITO', true,  '13'),
('1399',  'Provisiones',                     '1', 4, 'CREDITO',false, '13'),
('14',    'Inventarios',                     '1', 2, 'DEBITO', false, '1'),
('1405',  'Materias primas',                 '1', 4, 'DEBITO', true,  '14'),
('1410',  'Productos en proceso',            '1', 4, 'DEBITO', true,  '14'),
('1430',  'Productos terminados',            '1', 4, 'DEBITO', false, '14'),
('143005','Productos manufacturados',        '1', 6, 'DEBITO', true,  '1430'),
('143010','Productos extraídos y/o procesados','1',6,'DEBITO', true,  '1430'),
('143015','Productos agrícolas y forestales','1', 6, 'DEBITO', true,  '1430'),
('1435',  'Mercancías no fabricadas por la empresa','1',4,'DEBITO',true,'14'),
('1440',  'Bienes raíces para la venta',     '1', 4, 'DEBITO', true,  '14'),
('1445',  'Semovientes',                     '1', 4, 'DEBITO', true,  '14'),
('1455',  'Materiales, repuestos y accesorios','1',4,'DEBITO', true,  '14'),
('1460',  'Envases y empaques',              '1', 4, 'DEBITO', true,  '14'),
('1465',  'Inventarios en tránsito',         '1', 4, 'DEBITO', true,  '14'),
('1499',  'Provisiones',                     '1', 4, 'CREDITO',false, '14'),
('15',    'Propiedades, planta y equipo',    '1', 2, 'DEBITO', false, '1'),
('1504',  'Terrenos',                        '1', 4, 'DEBITO', false, '15'),
('150405','Urbanos',                         '1', 6, 'DEBITO', true,  '1504'),
('150410','Rurales',                         '1', 6, 'DEBITO', true,  '1504'),
('1516',  'Construcciones y edificaciones',  '1', 4, 'DEBITO', false, '15'),
('151605','Edificios',                       '1', 6, 'DEBITO', true,  '1516'),
('151610','Oficinas',                        '1', 6, 'DEBITO', true,  '1516'),
('151615','Almacenes',                       '1', 6, 'DEBITO', true,  '1516'),
('151620','Fábricas y plantas industriales', '1', 6, 'DEBITO', true,  '1516'),
('151680','Bodegas',                         '1', 6, 'DEBITO', true,  '1516'),
('1520',  'Maquinaria y equipo',             '1', 4, 'DEBITO', true,  '15'),
('1524',  'Equipo de oficina',               '1', 4, 'DEBITO', false, '15'),
('152405','Muebles y enseres',               '1', 6, 'DEBITO', true,  '1524'),
('152410','Equipos',                         '1', 6, 'DEBITO', true,  '1524'),
('1528',  'Equipo de computación y comunicación','1',4,'DEBITO',false,'15'),
('152805','Equipos de procesamiento de datos','1',6,'DEBITO', true,  '1528'),
('152810','Equipos de telecomunicaciones',   '1', 6, 'DEBITO', true,  '1528'),
('152825','Líneas telefónicas',              '1', 6, 'DEBITO', true,  '1528'),
('1540',  'Flota y equipo de transporte',    '1', 4, 'DEBITO', false, '15'),
('154005','Autos, camionetas y camperos',    '1', 6, 'DEBITO', true,  '1540'),
('154008','Camiones, volquetas y furgones',  '1', 6, 'DEBITO', true,  '1540'),
('154030','Motocicletas',                    '1', 6, 'DEBITO', true,  '1540'),
('1592',  'Depreciación acumulada',          '1', 4, 'CREDITO',false, '15'),
('159205','Construcciones y edificaciones',  '1', 6, 'CREDITO',true,  '1592'),
('159210','Maquinaria y equipo',             '1', 6, 'CREDITO',true,  '1592'),
('159215','Equipo de oficina',               '1', 6, 'CREDITO',true,  '1592'),
('159220','Equipo de computación y comunicación','1',6,'CREDITO',true,'1592'),
('159235','Flota y equipo de transporte',    '1', 6, 'CREDITO',true,  '1592'),
('16',    'Intangibles',                     '1', 2, 'DEBITO', false, '1'),
('1605',  'Crédito mercantil',               '1', 4, 'DEBITO', true,  '16'),
('1610',  'Marcas',                          '1', 4, 'DEBITO', true,  '16'),
('1615',  'Patentes',                        '1', 4, 'DEBITO', true,  '16'),
('1635',  'Licencias',                       '1', 4, 'DEBITO', true,  '16'),
('1698',  'Depreciación y/o amortización acumulada','1',4,'CREDITO',false,'16'),
('17',    'Diferidos',                       '1', 2, 'DEBITO', false, '1'),
('1705',  'Gastos pagados por anticipado',   '1', 4, 'DEBITO', false, '17'),
('170505','Intereses',                       '1', 6, 'DEBITO', true,  '1705'),
('170510','Honorarios',                      '1', 6, 'DEBITO', true,  '1705'),
('170520','Seguros y fianzas',               '1', 6, 'DEBITO', true,  '1705'),
('170525','Arrendamientos',                  '1', 6, 'DEBITO', true,  '1705'),
('170540','Servicios',                       '1', 6, 'DEBITO', true,  '1705'),
('1710',  'Cargos diferidos',                '1', 4, 'DEBITO', false, '17'),
('171004','Organización y preoperativos',    '1', 6, 'DEBITO', true,  '1710'),
('171016','Programas para computador (software)','1',6,'DEBITO',true, '1710'),
('171020','Útiles y papelería',              '1', 6, 'DEBITO', true,  '1710'),
('18',    'Otros activos',                   '1', 2, 'DEBITO', false, '1'),
('1805',  'Bienes de arte y cultura',        '1', 4, 'DEBITO', true,  '18'),
('1895',  'Diversos',                        '1', 4, 'DEBITO', true,  '18'),
('19',    'Valorizaciones',                  '1', 2, 'DEBITO', false, '1'),
('1905',  'De inversiones',                  '1', 4, 'DEBITO', true,  '19'),
('1910',  'De propiedades, planta y equipo', '1', 4, 'DEBITO', true,  '19')
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================================
-- CLASE 2 - PASIVO  (naturaleza CREDITO)
-- =========================================================================
INSERT INTO puc_catalogo (codigo, nombre, clase, nivel, naturaleza, permite_mov, padre_codigo) VALUES
('2',     'Pasivo',                          '2', 1, 'CREDITO',false, NULL),
('21',    'Obligaciones financieras',        '2', 2, 'CREDITO',false, '2'),
('2105',  'Bancos nacionales',               '2', 4, 'CREDITO',false, '21'),
('210505','Sobregiros',                      '2', 6, 'CREDITO',true,  '2105'),
('210510','Pagarés',                         '2', 6, 'CREDITO',true,  '2105'),
('210515','Cartas de crédito',               '2', 6, 'CREDITO',true,  '2105'),
('2110',  'Bancos del exterior',             '2', 4, 'CREDITO',false, '21'),
('211005','Sobregiros',                      '2', 6, 'CREDITO',true,  '2110'),
('211010','Pagarés',                         '2', 6, 'CREDITO',true,  '2110'),
('2120',  'Compañías de financiamiento comercial','2',4,'CREDITO',false,'21'),
('212005','Pagarés',                         '2', 6, 'CREDITO',true,  '2120'),
('212020','Contratos de arrendamiento financiero (leasing)','2',6,'CREDITO',true,'2120'),
('22',    'Proveedores',                     '2', 2, 'CREDITO',false, '2'),
('2205',  'Nacionales',                      '2', 4, 'CREDITO',true,  '22'),
('220505','Proveedores nacionales',          '2', 6, 'CREDITO',true,  '2205'),
('2210',  'Del exterior',                    '2', 4, 'CREDITO',true,  '22'),
('221005','Proveedores del exterior',        '2', 6, 'CREDITO',true,  '2210'),
('23',    'Cuentas por pagar',               '2', 2, 'CREDITO',false, '2'),
('2335',  'Costos y gastos por pagar',       '2', 4, 'CREDITO',false, '23'),
('233505','Gastos financieros',              '2', 6, 'CREDITO',true,  '2335'),
('233510','Gastos legales',                  '2', 6, 'CREDITO',true,  '2335'),
('233520','Comisiones',                      '2', 6, 'CREDITO',true,  '2335'),
('233525','Honorarios',                      '2', 6, 'CREDITO',true,  '2335'),
('233530','Servicios técnicos',              '2', 6, 'CREDITO',true,  '2335'),
('233535','Servicios de mantenimiento',      '2', 6, 'CREDITO',true,  '2335'),
('233540','Arrendamientos',                  '2', 6, 'CREDITO',true,  '2335'),
('233545','Transportes, fletes y acarreos',  '2', 6, 'CREDITO',true,  '2335'),
('233550','Servicios públicos',              '2', 6, 'CREDITO',true,  '2335'),
('233555','Seguros',                         '2', 6, 'CREDITO',true,  '2335'),
('233560','Gastos de viaje',                 '2', 6, 'CREDITO',true,  '2335'),
('2360',  'Dividendos o participaciones por pagar','2',4,'CREDITO',false,'23'),
('236005','Dividendos',                      '2', 6, 'CREDITO',true,  '2360'),
('236010','Participaciones',                 '2', 6, 'CREDITO',true,  '2360'),
('2365',  'Retención en la fuente',          '2', 4, 'CREDITO',false, '23'),
('236505','Salarios y pagos laborales',      '2', 6, 'CREDITO',true,  '2365'),
('236515','Honorarios',                      '2', 6, 'CREDITO',true,  '2365'),
('236520','Comisiones',                      '2', 6, 'CREDITO',true,  '2365'),
('236525','Servicios',                       '2', 6, 'CREDITO',true,  '2365'),
('236530','Arrendamientos',                  '2', 6, 'CREDITO',true,  '2365'),
('236535','Rendimientos financieros',        '2', 6, 'CREDITO',true,  '2365'),
('236540','Compras',                         '2', 6, 'CREDITO',true,  '2365'),
('236570','Otras retenciones y patrimonio',  '2', 6, 'CREDITO',true,  '2365'),
('236575','Autorretenciones',                '2', 6, 'CREDITO',true,  '2365'),
('2367',  'Impuesto a las ventas retenido',  '2', 4, 'CREDITO',false, '23'),
('236701','ReteIVA',                         '2', 6, 'CREDITO',true,  '2367'),
('2368',  'Impuesto de industria y comercio retenido','2',4,'CREDITO',false,'23'),
('236805','ReteICA',                         '2', 6, 'CREDITO',true,  '2368'),
('2370',  'Retenciones y aportes de nómina', '2', 4, 'CREDITO',false, '23'),
('237005','Aportes a entidades promotoras de salud, EPS','2',6,'CREDITO',true,'2370'),
('237006','Aportes a administradoras de riesgos profesionales, ARP','2',6,'CREDITO',true,'2370'),
('237010','Aportes al ICBF, SENA y cajas de compensación','2',6,'CREDITO',true,'2370'),
('2380',  'Acreedores varios',               '2', 4, 'CREDITO',true,  '23'),
('24',    'Impuestos, gravámenes y tasas',   '2', 2, 'CREDITO',false, '2'),
('2404',  'De renta y complementarios',      '2', 4, 'CREDITO',false, '24'),
('240405','Vigencia fiscal corriente',       '2', 6, 'CREDITO',true,  '2404'),
('240410','Vigencias fiscales anteriores',   '2', 6, 'CREDITO',true,  '2404'),
('2408',  'Impuesto sobre las ventas por pagar','2',4,'CREDITO',false,'24'),
('240805','IVA generado',                    '2', 6, 'CREDITO',true,  '2408'),
('240810','IVA descontable',                 '2', 6, 'DEBITO', true,  '2408'),
('2412',  'De industria y comercio',         '2', 4, 'CREDITO',false, '24'),
('241205','Vigencia fiscal corriente',       '2', 6, 'CREDITO',true,  '2412'),
('241210','Vigencias fiscales anteriores',   '2', 6, 'CREDITO',true,  '2412'),
('25',    'Obligaciones laborales',          '2', 2, 'CREDITO',false, '2'),
('2505',  'Salarios por pagar',              '2', 4, 'CREDITO',true,  '25'),
('2510',  'Cesantías consolidadas',          '2', 4, 'CREDITO',false, '25'),
('251005','Ley laboral anterior',            '2', 6, 'CREDITO',true,  '2510'),
('251010','Ley 50 de 1990 y normas posteriores','2',6,'CREDITO',true, '2510'),
('2515',  'Intereses sobre cesantías',       '2', 4, 'CREDITO',true,  '25'),
('2520',  'Prima de servicios',              '2', 4, 'CREDITO',true,  '25'),
('2525',  'Vacaciones consolidadas',         '2', 4, 'CREDITO',true,  '25'),
('26',    'Pasivos estimados y provisiones', '2', 2, 'CREDITO',false, '2'),
('2605',  'Para costos y gastos',            '2', 4, 'CREDITO',true,  '26'),
('2610',  'Para obligaciones laborales',     '2', 4, 'CREDITO',true,  '26'),
('2615',  'Para obligaciones fiscales',      '2', 4, 'CREDITO',true,  '26'),
('27',    'Diferidos',                       '2', 2, 'CREDITO',false, '2'),
('2705',  'Ingresos recibidos por anticipado','2',4,'CREDITO', true,  '27'),
('28',    'Otros pasivos',                   '2', 2, 'CREDITO',false, '2'),
('2805',  'Anticipos y avances recibidos',   '2', 4, 'CREDITO',true,  '28'),
('29',    'Bonos y papeles comerciales',     '2', 2, 'CREDITO',false, '2'),
('2905',  'Bonos en circulación',            '2', 4, 'CREDITO',true,  '29')
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================================
-- CLASE 3 - PATRIMONIO  (naturaleza CREDITO)
-- =========================================================================
INSERT INTO puc_catalogo (codigo, nombre, clase, nivel, naturaleza, permite_mov, padre_codigo) VALUES
('3',     'Patrimonio',                      '3', 1, 'CREDITO',false, NULL),
('31',    'Capital social',                  '3', 2, 'CREDITO',false, '3'),
('3105',  'Capital suscrito y pagado',       '3', 4, 'CREDITO',false, '31'),
('310505','Capital autorizado',              '3', 6, 'CREDITO',true,  '3105'),
('310510','Capital por suscribir (DB)',      '3', 6, 'DEBITO', true,  '3105'),
('3115',  'Aportes sociales',                '3', 4, 'CREDITO',true,  '31'),
('3120',  'Capital asignado',                '3', 4, 'CREDITO',true,  '31'),
('3130',  'Capital de personas naturales',   '3', 4, 'CREDITO',true,  '31'),
('32',    'Superávit de capital',            '3', 2, 'CREDITO',false, '3'),
('3205',  'Prima en colocación de acciones, cuotas o partes de interés social','3',4,'CREDITO',true,'32'),
('3210',  'Donaciones',                      '3', 4, 'CREDITO',true,  '32'),
('33',    'Reservas',                        '3', 2, 'CREDITO',false, '3'),
('3305',  'Reservas obligatorias',           '3', 4, 'CREDITO',false, '33'),
('330505','Reserva legal',                   '3', 6, 'CREDITO',true,  '3305'),
('3310',  'Reservas estatutarias',           '3', 4, 'CREDITO',true,  '33'),
('3315',  'Reservas ocasionales',            '3', 4, 'CREDITO',true,  '33'),
('34',    'Revalorización del patrimonio',   '3', 2, 'CREDITO',true,  '3'),
('35',    'Dividendos o participaciones decretados','3',2,'CREDITO',true,'3'),
('36',    'Resultados del ejercicio',        '3', 2, 'CREDITO',false, '3'),
('3605',  'Utilidad del ejercicio',          '3', 4, 'CREDITO',true,  '36'),
('360505','Utilidad del ejercicio',          '3', 6, 'CREDITO',true,  '3605'),
('3610',  'Pérdida del ejercicio',           '3', 4, 'DEBITO', true,  '36'),
('361005','Pérdida del ejercicio',           '3', 6, 'DEBITO', true,  '3610'),
('37',    'Resultados de ejercicios anteriores','3',2,'CREDITO',false,'3'),
('3705',  'Utilidades acumuladas',           '3', 4, 'CREDITO',true,  '37'),
('3710',  'Pérdidas acumuladas',             '3', 4, 'DEBITO', true,  '37'),
('38',    'Superávit por valorizaciones',    '3', 2, 'CREDITO',true,  '3')
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================================
-- CLASE 4 - INGRESOS  (naturaleza CREDITO)
-- =========================================================================
INSERT INTO puc_catalogo (codigo, nombre, clase, nivel, naturaleza, permite_mov, padre_codigo) VALUES
('4',     'Ingresos',                        '4', 1, 'CREDITO',false, NULL),
('41',    'Operacionales',                   '4', 2, 'CREDITO',false, '4'),
('4105',  'Agricultura, ganadería, caza y silvicultura','4',4,'CREDITO',true,'41'),
('4115',  'Explotación de minas y canteras', '4', 4, 'CREDITO',true,  '41'),
('4120',  'Industrias manufactureras',       '4', 4, 'CREDITO',true,  '41'),
('4125',  'Suministro de electricidad, gas y agua','4',4,'CREDITO',true,'41'),
('4130',  'Construcción',                    '4', 4, 'CREDITO',true,  '41'),
('4135',  'Comercio al por mayor y al por menor','4',4,'CREDITO',false,'41'),
('413505','Venta de mercancías',             '4', 6, 'CREDITO',true,  '4135'),
('413535','Venta de productos comerciales',  '4', 6, 'CREDITO',true,  '4135'),
('4140',  'Hoteles y restaurantes',          '4', 4, 'CREDITO',false, '41'),
('414005','Hotelería',                       '4', 6, 'CREDITO',true,  '4140'),
('414015','Restaurantes',                    '4', 6, 'CREDITO',true,  '4140'),
('4145',  'Transporte, almacenamiento y comunicaciones','4',4,'CREDITO',true,'41'),
('4150',  'Actividad financiera',            '4', 4, 'CREDITO',true,  '41'),
('4155',  'Actividades inmobiliarias, empresariales y de alquiler','4',4,'CREDITO',true,'41'),
('415505','Arrendamientos de bienes inmuebles','4',6,'CREDITO',true,  '4155'),
('415555','Publicidad',                      '4', 6, 'CREDITO',true,  '4155'),
('4160',  'Enseñanza',                       '4', 4, 'CREDITO',true,  '41'),
('4165',  'Servicios sociales y de salud',   '4', 4, 'CREDITO',true,  '41'),
('416505','Servicio hospitalario',           '4', 6, 'CREDITO',true,  '4165'),
('416510','Servicio médico',                 '4', 6, 'CREDITO',true,  '4165'),
('4175',  'Devoluciones en ventas (DB)',     '4', 4, 'DEBITO', true,  '41'),
('42',    'No operacionales',                '4', 2, 'CREDITO',false, '4'),
('4205',  'Otras ventas',                    '4', 4, 'CREDITO',true,  '42'),
('4210',  'Financieros',                     '4', 4, 'CREDITO',false, '42'),
('421005','Intereses',                       '4', 6, 'CREDITO',true,  '4210'),
('421020','Diferencia en cambio',            '4', 6, 'CREDITO',true,  '4210'),
('4215',  'Dividendos y participaciones',    '4', 4, 'CREDITO',true,  '42'),
('4220',  'Arrendamientos',                  '4', 4, 'CREDITO',true,  '42'),
('4225',  'Comisiones',                      '4', 4, 'CREDITO',true,  '42'),
('4230',  'Honorarios',                      '4', 4, 'CREDITO',true,  '42'),
('4235',  'Servicios',                       '4', 4, 'CREDITO',true,  '42'),
('4240',  'Utilidad en venta de inversiones','4', 4, 'CREDITO',true,  '42'),
('4245',  'Utilidad en venta de propiedades, planta y equipo','4',4,'CREDITO',true,'42'),
('4250',  'Recuperaciones',                  '4', 4, 'CREDITO',true,  '42'),
('4255',  'Indemnizaciones',                 '4', 4, 'CREDITO',true,  '42'),
('4295',  'Diversos',                        '4', 4, 'CREDITO',true,  '42')
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================================
-- CLASE 5 - GASTOS  (naturaleza DEBITO)
-- =========================================================================
INSERT INTO puc_catalogo (codigo, nombre, clase, nivel, naturaleza, permite_mov, padre_codigo) VALUES
('5',     'Gastos',                          '5', 1, 'DEBITO', false, NULL),
('51',    'Operacionales de administración', '5', 2, 'DEBITO', false, '5'),
('5105',  'Gastos de personal',              '5', 4, 'DEBITO', false, '51'),
('510506','Sueldos',                         '5', 6, 'DEBITO', true,  '5105'),
('510515','Horas extras y recargos',         '5', 6, 'DEBITO', true,  '5105'),
('510518','Comisiones',                      '5', 6, 'DEBITO', true,  '5105'),
('510521','Viáticos',                        '5', 6, 'DEBITO', true,  '5105'),
('510527','Auxilio de transporte',           '5', 6, 'DEBITO', true,  '5105'),
('510530','Cesantías',                       '5', 6, 'DEBITO', true,  '5105'),
('510533','Intereses sobre cesantías',       '5', 6, 'DEBITO', true,  '5105'),
('510536','Prima de servicios',              '5', 6, 'DEBITO', true,  '5105'),
('510539','Vacaciones',                      '5', 6, 'DEBITO', true,  '5105'),
('510542','Primas extralegales',             '5', 6, 'DEBITO', true,  '5105'),
('510545','Auxilios',                        '5', 6, 'DEBITO', true,  '5105'),
('510548','Bonificaciones',                  '5', 6, 'DEBITO', true,  '5105'),
('510551','Dotación y suministro a trabajadores','5',6,'DEBITO',true,  '5105'),
('510568','Aportes a administradoras de riesgos profesionales, ARP','5',6,'DEBITO',true,'5105'),
('510569','Aportes a entidades promotoras de salud, EPS','5',6,'DEBITO',true,'5105'),
('510570','Aportes a fondos de pensiones y/o cesantías','5',6,'DEBITO',true,'5105'),
('510572','Aportes cajas de compensación familiar','5',6,'DEBITO',true,'5105'),
('510575','Aportes ICBF',                    '5', 6, 'DEBITO', true,  '5105'),
('510578','SENA',                            '5', 6, 'DEBITO', true,  '5105'),
('5110',  'Honorarios',                      '5', 4, 'DEBITO', false, '51'),
('511005','Junta directiva',                 '5', 6, 'DEBITO', true,  '5110'),
('511010','Revisoría fiscal',                '5', 6, 'DEBITO', true,  '5110'),
('511015','Auditoría externa',               '5', 6, 'DEBITO', true,  '5110'),
('511025','Asesoría jurídica',               '5', 6, 'DEBITO', true,  '5110'),
('511030','Asesoría financiera',             '5', 6, 'DEBITO', true,  '5110'),
('511035','Asesoría técnica',                '5', 6, 'DEBITO', true,  '5110'),
('5115',  'Impuestos',                       '5', 4, 'DEBITO', false, '51'),
('511505','Industria y comercio',            '5', 6, 'DEBITO', true,  '5115'),
('511515','A la propiedad raíz',             '5', 6, 'DEBITO', true,  '5115'),
('511540','De vehículos',                    '5', 6, 'DEBITO', true,  '5115'),
('511570','IVA descontable',                 '5', 6, 'DEBITO', true,  '5115'),
('5120',  'Arrendamientos',                  '5', 4, 'DEBITO', false, '51'),
('512005','Terrenos',                        '5', 6, 'DEBITO', true,  '5120'),
('512010','Construcciones y edificaciones',  '5', 6, 'DEBITO', true,  '5120'),
('512015','Maquinaria y equipo',             '5', 6, 'DEBITO', true,  '5120'),
('512020','Equipo de oficina',               '5', 6, 'DEBITO', true,  '5120'),
('512025','Equipo de computación y comunicación','5',6,'DEBITO',true, '5120'),
('512040','Flota y equipo de transporte',    '5', 6, 'DEBITO', true,  '5120'),
('5125',  'Contribuciones y afiliaciones',   '5', 4, 'DEBITO', true,  '51'),
('5130',  'Seguros',                         '5', 4, 'DEBITO', true,  '51'),
('5135',  'Servicios',                       '5', 4, 'DEBITO', false, '51'),
('513505','Aseo y vigilancia',               '5', 6, 'DEBITO', true,  '5135'),
('513510','Temporales',                      '5', 6, 'DEBITO', true,  '5135'),
('513520','Procesamiento electrónico de datos','5',6,'DEBITO', true,  '5135'),
('513525','Acueducto y alcantarillado',      '5', 6, 'DEBITO', true,  '5135'),
('513530','Energía eléctrica',               '5', 6, 'DEBITO', true,  '5135'),
('513535','Teléfono',                        '5', 6, 'DEBITO', true,  '5135'),
('513540','Correo, portes y telegramas',     '5', 6, 'DEBITO', true,  '5135'),
('513550','Transporte, fletes y acarreos',   '5', 6, 'DEBITO', true,  '5135'),
('513555','Gas',                             '5', 6, 'DEBITO', true,  '5135'),
('5140',  'Gastos legales',                  '5', 4, 'DEBITO', false, '51'),
('514005','Notariales',                      '5', 6, 'DEBITO', true,  '5140'),
('514010','Registro mercantil',              '5', 6, 'DEBITO', true,  '5140'),
('514015','Trámites y licencias',            '5', 6, 'DEBITO', true,  '5140'),
('5145',  'Mantenimiento y reparaciones',    '5', 4, 'DEBITO', true,  '51'),
('5150',  'Adecuación e instalación',        '5', 4, 'DEBITO', true,  '51'),
('5155',  'Gastos de viaje',                 '5', 4, 'DEBITO', false, '51'),
('515505','Alojamiento y manutención',       '5', 6, 'DEBITO', true,  '5155'),
('515515','Pasajes aéreos',                  '5', 6, 'DEBITO', true,  '5155'),
('515520','Pasajes terrestres',              '5', 6, 'DEBITO', true,  '5155'),
('5160',  'Depreciaciones',                  '5', 4, 'DEBITO', true,  '51'),
('5165',  'Amortizaciones',                  '5', 4, 'DEBITO', true,  '51'),
('5195',  'Diversos',                        '5', 4, 'DEBITO', false, '51'),
('519525','Elementos de aseo y cafetería',   '5', 6, 'DEBITO', true,  '5195'),
('519530','Útiles, papelería y fotocopias',  '5', 6, 'DEBITO', true,  '5195'),
('519535','Combustibles y lubricantes',      '5', 6, 'DEBITO', true,  '5195'),
('519545','Taxis y buses',                   '5', 6, 'DEBITO', true,  '5195'),
('519560','Casino y restaurante',            '5', 6, 'DEBITO', true,  '5195'),
('519565','Parqueaderos',                    '5', 6, 'DEBITO', true,  '5195'),
('5199',  'Provisiones',                     '5', 4, 'DEBITO', true,  '51'),
('52',    'Operacionales de ventas',         '5', 2, 'DEBITO', false, '5'),
('5205',  'Gastos de personal',              '5', 4, 'DEBITO', false, '52'),
('520506','Sueldos',                         '5', 6, 'DEBITO', true,  '5205'),
('520518','Comisiones',                      '5', 6, 'DEBITO', true,  '5205'),
('520530','Cesantías',                       '5', 6, 'DEBITO', true,  '5205'),
('5235',  'Servicios',                       '5', 4, 'DEBITO', false, '52'),
('523560','Publicidad, propaganda y promoción','5',6,'DEBITO',true,  '5235'),
('53',    'No operacionales',                '5', 2, 'DEBITO', false, '5'),
('5305',  'Financieros',                     '5', 4, 'DEBITO', false, '53'),
('530505','Gastos bancarios',                '5', 6, 'DEBITO', true,  '5305'),
('530515','Comisiones',                      '5', 6, 'DEBITO', true,  '5305'),
('530520','Intereses',                       '5', 6, 'DEBITO', true,  '5305'),
('530525','Diferencia en cambio',            '5', 6, 'DEBITO', true,  '5305'),
('5310',  'Pérdida en venta y retiro de bienes','5',4,'DEBITO',true,  '53'),
('5315',  'Gastos extraordinarios',          '5', 4, 'DEBITO', false, '53'),
('531515','Costos y gastos de ejercicios anteriores','5',6,'DEBITO',true,'5315'),
('5395',  'Gastos diversos',                 '5', 4, 'DEBITO', false, '53'),
('539520','Multas, sanciones y litigios',    '5', 6, 'DEBITO', true,  '5395'),
('539525','Donaciones',                      '5', 6, 'DEBITO', true,  '5395'),
('54',    'Impuesto de renta y complementarios','5',2,'DEBITO',false, '5'),
('5405',  'Impuesto de renta y complementarios','5',4,'DEBITO',true,  '54'),
('540505','Impuesto de renta y complementarios','5',6,'DEBITO',true,  '5405'),
('59',    'Ganancias y pérdidas',            '5', 2, 'DEBITO', false, '5'),
('5905',  'Ganancias y pérdidas',            '5', 4, 'DEBITO', true,  '59'),
('590505','Ganancias y pérdidas',            '5', 6, 'DEBITO', true,  '5905')
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================================
-- CLASE 6 - COSTOS DE VENTA  (naturaleza DEBITO)
-- =========================================================================
INSERT INTO puc_catalogo (codigo, nombre, clase, nivel, naturaleza, permite_mov, padre_codigo) VALUES
('6',     'Costos de ventas',                '6', 1, 'DEBITO', false, NULL),
('61',    'Costo de ventas y de prestación de servicios','6',2,'DEBITO',false,'6'),
('6105',  'Agricultura, ganadería, caza y silvicultura','6',4,'DEBITO',true,'61'),
('6115',  'Explotación de minas y canteras', '6', 4, 'DEBITO', true,  '61'),
('6120',  'Industrias manufactureras',       '6', 4, 'DEBITO', true,  '61'),
('6135',  'Comercio al por mayor y al por menor','6',4,'DEBITO',false,'61'),
('613535','Costo venta de mercancías',       '6', 6, 'DEBITO', true,  '6135'),
('6140',  'Hoteles y restaurantes',          '6', 4, 'DEBITO', true,  '61'),
('6145',  'Transporte, almacenamiento y comunicaciones','6',4,'DEBITO',true,'61'),
('6155',  'Actividades inmobiliarias, empresariales y de alquiler','6',4,'DEBITO',true,'61'),
('6160',  'Enseñanza',                       '6', 4, 'DEBITO', true,  '61'),
('6165',  'Servicios sociales y de salud',   '6', 4, 'DEBITO', true,  '61'),
('62',    'Compras',                         '6', 2, 'DEBITO', false, '6'),
('6205',  'De mercancías',                   '6', 4, 'DEBITO', true,  '62'),
('6210',  'De materias primas',              '6', 4, 'DEBITO', true,  '62'),
('6215',  'De materiales indirectos',        '6', 4, 'DEBITO', true,  '62'),
('6225',  'Devoluciones en compras (CR)',    '6', 4, 'CREDITO',true,  '62')
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================================
-- CLASE 7 - COSTOS DE PRODUCCIÓN  (naturaleza DEBITO)
-- =========================================================================
INSERT INTO puc_catalogo (codigo, nombre, clase, nivel, naturaleza, permite_mov, padre_codigo) VALUES
('7',     'Costos de producción o de operación','7',1,'DEBITO', false, NULL),
('71',    'Materia prima',                   '7', 2, 'DEBITO', true,  '7'),
('72',    'Mano de obra directa',            '7', 2, 'DEBITO', true,  '7'),
('73',    'Costos indirectos',               '7', 2, 'DEBITO', true,  '7'),
('74',    'Contratos de servicios',          '7', 2, 'DEBITO', true,  '7')
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================================
-- CLASE 8 - CUENTAS DE ORDEN DEUDORAS  (naturaleza DEBITO)
-- =========================================================================
INSERT INTO puc_catalogo (codigo, nombre, clase, nivel, naturaleza, permite_mov, padre_codigo) VALUES
('8',     'Cuentas de orden deudoras',       '8', 1, 'DEBITO', false, NULL),
('81',    'Derechos contingentes',           '8', 2, 'DEBITO', false, '8'),
('8105',  'Bienes y valores entregados en custodia','8',4,'DEBITO',true,'81'),
('8110',  'Bienes y valores entregados en garantía','8',4,'DEBITO',true,'81'),
('8120',  'Litigios y/o demandas',           '8', 4, 'DEBITO', true,  '81'),
('82',    'Deudoras fiscales',               '8', 2, 'DEBITO', true,  '8'),
('83',    'Deudoras de control',             '8', 2, 'DEBITO', false, '8'),
('8305',  'Bienes recibidos en arrendamiento financiero','8',4,'DEBITO',true,'83'),
('8395',  'Otras cuentas deudoras de control','8',4,'DEBITO', true,  '83'),
('84',    'Derechos contingentes por contra (CR)','8',2,'CREDITO',true,'8'),
('85',    'Deudoras fiscales por contra (CR)','8',2,'CREDITO',true, '8'),
('86',    'Deudoras de control por contra (CR)','8',2,'CREDITO',true,'8')
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================================
-- CLASE 9 - CUENTAS DE ORDEN ACREEDORAS  (naturaleza CREDITO)
-- =========================================================================
INSERT INTO puc_catalogo (codigo, nombre, clase, nivel, naturaleza, permite_mov, padre_codigo) VALUES
('9',     'Cuentas de orden acreedoras',     '9', 1, 'CREDITO',false, NULL),
('91',    'Responsabilidades contingentes',  '9', 2, 'CREDITO',false, '9'),
('9105',  'Bienes y valores recibidos en custodia','9',4,'CREDITO',true,'91'),
('9110',  'Bienes y valores recibidos en garantía','9',4,'CREDITO',true,'91'),
('9120',  'Litigios y/o demandas',           '9', 4, 'CREDITO',false, '91'),
('912005','Laborales',                       '9', 6, 'CREDITO',true,  '9120'),
('912010','Civiles',                         '9', 6, 'CREDITO',true,  '9120'),
('912015','Administrativos o arbitrales',    '9', 6, 'CREDITO',true,  '9120'),
('912020','Tributarios',                     '9', 6, 'CREDITO',true,  '9120'),
('92',    'Acreedoras fiscales',             '9', 2, 'CREDITO',true,  '9'),
('93',    'Acreedoras de control',           '9', 2, 'CREDITO',false, '9'),
('9305',  'Contratos de arrendamiento financiero','9',4,'CREDITO',true,'93'),
('94',    'Responsabilidades contingentes por contra (DB)','9',2,'DEBITO',true,'9'),
('95',    'Acreedoras fiscales por contra (DB)','9',2,'DEBITO',true, '9'),
('96',    'Acreedoras de control por contra (DB)','9',2,'DEBITO',true,'9')
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================================
-- Estadísticas finales (informativo)
-- =========================================================================
DO $$
DECLARE
    total INTEGER;
    por_clase RECORD;
BEGIN
    SELECT COUNT(*) INTO total FROM puc_catalogo;
    RAISE NOTICE 'Catálogo PUC sembrado con % cuentas', total;
    FOR por_clase IN (
        SELECT clase, COUNT(*) AS n FROM puc_catalogo GROUP BY clase ORDER BY clase
    ) LOOP
        RAISE NOTICE '  Clase % → % cuentas', por_clase.clase, por_clase.n;
    END LOOP;
END $$;
