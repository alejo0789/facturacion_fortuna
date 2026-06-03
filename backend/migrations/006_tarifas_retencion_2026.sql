-- =========================================================================
-- Migración 006 — Tarifas de retención en la fuente 2026 (oficial DIAN)
--
-- Fuente: "Tabla de retención en la fuente 2026 Normatividad.pdf"
-- (consultorcontable.com — basada en Decreto 1625/2016 y normatividad
-- fiscal colombiana).
--
-- UVT 2026 = $52.374 (vigente para el año gravable 2026).
--
-- Estructura usada:
--   Reusa TarifaImpuesto.concepto (texto) + tarifa_pct + base_minima (en pesos).
--   No agregamos columna nueva — el concepto es el código DIAN + descripción
--   humana, y la base mínima ya está en pesos pre-calculados.
--
-- Idempotente: borra tarifas no-default existentes y reinserta el set 2026.
--
-- Cómo aplicar:
--   psql -U postgres -d supplier_db -f migrations/006_tarifas_retencion_2026.sql
--
-- =========================================================================

-- 1. Borrar tarifas no-default actuales de RETEFUENTE para evitar duplicados
DELETE FROM tarifa_impuesto
WHERE configuracion_id IN (
    SELECT id FROM configuracion_impuesto WHERE tipo = 'RETEFUENTE'
)
AND es_default = false;

-- 2. Insertar tarifas 2026 oficiales para TODAS las empresas con
--    configuración RETEFUENTE activa.
--    Formato concepto: "CÓDIGO-DIAN Descripción legible" — facilita búsqueda
--    en la UI y se mapea desde el dropdown directamente.
INSERT INTO tarifa_impuesto (configuracion_id, concepto, tarifa_pct, base_minima, es_default)
SELECT ci.id, t.concepto, t.tarifa_pct, t.base_minima, false
FROM configuracion_impuesto ci
CROSS JOIN (VALUES
    -- ===========================================
    -- Adquisición de bienes raíces
    -- ===========================================
    ('5005-A Bienes raíces vivienda (hasta 20.000 UVT)',         1.00,         523740.00),
    ('5005-B Bienes raíces vivienda (exceso 20.000 UVT)',        2.50,       523740000.00),
    ('5005-C Bienes raíces NO-vivienda (P. jurídica)',           2.50,            524000.00),
    ('5005-D Adquisición de vehículos',                          1.00,            524000.00),

    -- ===========================================
    -- Arrendamientos
    -- ===========================================
    ('5004-A Arrendamiento bienes inmuebles',                    3.50,            524000.00),
    ('5004-B Arrendamiento bienes muebles',                      4.00,                 0.00),

    -- ===========================================
    -- Compras (concepto DIAN 5003)
    -- ===========================================
    ('5003-A Compras generales (declarantes renta)',             2.50,            524000.00),
    ('5003-B Compras generales (no declarantes renta)',          3.50,            524000.00),
    ('5003-C Compras agrícolas/pecuarios sin proc. industrial',  1.50,           3666000.00),
    ('5003-D Compras de café pergamino o cereza',                0.50,           3666000.00),
    ('5003-E Compras combustibles derivados petróleo',           0.10,                 0.00),
    ('5003-F Compras de oro',                                    2.50,                 0.00),
    ('5003-G Compras con tarjeta débito o crédito',              1.50,                 0.00),

    -- ===========================================
    -- Honorarios y comisiones (concepto DIAN 5001 / 5006)
    -- ===========================================
    ('5001-A Honorarios y comisiones (personas jurídicas)',     11.00,                 0.00),
    ('5001-B Honorarios y comisiones (PN >3300 UVT año)',       11.00,                 0.00),
    ('5001-C Honorarios y comisiones (no declarantes renta)',   10.00,                 0.00),
    ('5001-D Honorarios profesores extranjeros sin residencia', 7.00,                 0.00),
    ('5006-A Comisiones Bolsa de Valores',                       3.00,                 0.00),
    ('5006-B Comisiones sector financiero',                     11.00,                 0.00),

    -- ===========================================
    -- Servicios (concepto DIAN 5002)
    -- ===========================================
    ('5002-A Servicios generales (declarantes renta)',           4.00,            105000.00),
    ('5002-B Servicios generales (no declarantes renta)',        6.00,            105000.00),
    ('5002-C Servicios PN no decl >3300 UVT año (sobre exceso)', 4.00,            105000.00),
    ('5002-D Servicios hoteles y restaurantes',                  3.50,            105000.00),
    ('5002-E Servicios integrales de salud prestados por IPS',   2.00,            105000.00),
    ('5002-F Servicios empresas temporales (AIU)',               1.00,            105000.00),
    ('5002-G Servicios empresas vigilancia/aseo (AIU)',          2.00,            105000.00),
    ('5002-H Servicios de sísmica',                              6.00,                 0.00),
    ('5002-I Estudios de mercado y encuestas de opinión',        4.00,                 0.00),

    -- ===========================================
    -- Transporte (concepto DIAN 5005)
    -- ===========================================
    ('5005-E Transporte nacional de carga',                      1.00,            105000.00),
    ('5005-F Transporte pasajeros nacional aéreo/marítimo',      1.00,            105000.00),
    ('5005-G Transporte nacional pasajeros terrestre',           3.50,            524000.00),

    -- ===========================================
    -- Software y consultoría tecnológica (5001 / 5002)
    -- ===========================================
    ('5001-E Licenciamiento/derecho uso software (declarante)',  3.50,                 0.00),
    ('5001-F Diseño y desarrollo software (no declarante)',     10.00,                 0.00),
    ('5001-G Diseño y desarrollo software (declarante renta)',   3.50,                 0.00),

    -- ===========================================
    -- Construcción y consultoría (concepto DIAN 5004)
    -- ===========================================
    ('5004-C Contratos de construcción y urbanización',          2.00,            524000.00),
    ('5004-D Contratos consultoría obras públicas',              2.00,                 0.00),
    ('5004-E Consultoría ingeniería P. natural no declarante',  10.00,                 0.00),
    ('5004-F Consultoría ingeniería P. jurídica/declarante',     6.00,                 0.00),

    -- ===========================================
    -- Rendimientos financieros (5007)
    -- ===========================================
    ('5007-A Intereses y rendimientos financieros en general',   7.00,                 0.00),
    ('5007-B Rendimientos financieros títulos renta fija (CDAT)',4.00,                 0.00),

    -- ===========================================
    -- Otros conceptos (5008)
    -- ===========================================
    ('5008-A Otros ingresos tributarios (declarantes)',          2.50,            524000.00),
    ('5008-B Otros ingresos tributarios (no declarantes)',       3.50,            524000.00),
    ('5008-C Por emolumentos eclesiásticos (declarantes)',       4.00,            524000.00),
    ('5008-D Por emolumentos eclesiásticos (no declarantes)',    3.50,            524000.00),
    ('5008-E Colocación independiente juegos suerte y azar',     3.00,            262000.00),
    ('5008-F Loterías, rifas, apuestas y similares',            20.00,           2514000.00),
    ('5008-G Indemnizaciones diferentes a salariales',          20.00,                 0.00),
    ('5008-H Indemnizaciones laborales (>204 UVT)',             20.00,                 0.00),
    ('5008-I Enajenación activos fijos personas naturales',      1.00,                 0.00)
) AS t(concepto, tarifa_pct, base_minima)
WHERE ci.tipo = 'RETEFUENTE'
  AND ci.activo = true;

-- 3. Borrar las tarifas ANTIGUAS del Sprint 003 (concepto sin guion código)
--    para evitar duplicados con las nuevas (que tienen formato "5001-A …").
DELETE FROM tarifa_impuesto
WHERE configuracion_id IN (
    SELECT id FROM configuracion_impuesto WHERE tipo = 'RETEFUENTE'
)
AND es_default = false
AND concepto IN (
    '5001 Honorarios', '5002 Servicios', '5003 Compras',
    '5004 Arrendamientos', '5005 Transporte carga',
    '5006 Comisiones', '5007 Rendimientos fin'
);

-- 4. Estadísticas
DO $$
DECLARE
    n_emp INTEGER;
    n_tar INTEGER;
BEGIN
    SELECT COUNT(DISTINCT ci.empresa_id), COUNT(*) INTO n_emp, n_tar
    FROM tarifa_impuesto ti
    JOIN configuracion_impuesto ci ON ci.id = ti.configuracion_id
    WHERE ci.tipo = 'RETEFUENTE' AND ti.es_default = false;
    RAISE NOTICE 'Tarifas retención 2026 sembradas: % registros para % empresas', n_tar, n_emp;
END $$;
