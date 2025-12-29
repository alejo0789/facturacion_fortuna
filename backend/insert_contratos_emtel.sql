-- Step 1: Delete all existing contracts
DELETE FROM contratos;

-- Step 2: Verify the provider exists
-- You should see EMTEL in the output
SELECT id, nombre FROM proveedores WHERE nombre = 'EMTEL';

-- Step 3: Insert contracts matching offices by cod_oficina
INSERT INTO contratos (proveedor_id, oficina_id, num_contrato, tipo, ref_pago, tipo_plan, tipo_canal, valor_mensual, titular_nombre, estado)
SELECT 
    (SELECT id FROM proveedores WHERE nombre = 'EMTEL' LIMIT 1) as proveedor_id,
    o.id as oficina_id,
    c.num_contrato,
    c.tipo,
    c.ref_pago,
    c.tipo_plan,
    c.tipo_canal,
    c.valor_mensual,
    c.titular_nombre,
    'ACTIVO' as estado
FROM oficinas o
CROSS JOIN (VALUES
    ('145036', '119005', 'FIJO', '119005', '100 megas', 'BANDA ANCHA', 69900.0, 'LA FORTUNA S.A'),
    ('101108', '120848', 'FIJO', '120848', '100 megas', 'BANDA ANCHA', 72000.0, 'LA FORTUNA S.A'),
    ('145022', '120353', 'FIJO', '120353', NULL, 'BANDA ANCHA', NULL, 'LA FORTUNA S.A'),
    ('163015', '99959', 'FIJO', '99959', '30 MEGAS', 'BANDA ANCHA', 97050.0, 'LA FORTUNA S.A'),
    ('129050', '102379', 'FIJO', '102379', '100 megas', 'FIBRA OPTICA', 74900.0, 'LA FORTUNA S.A'),
    ('128007', '103364', 'FIJO', '103364', '30 MEGAS', 'BANDA ANCHA', 59900.0, 'LA FORTUNA S.A'),
    ('154004', '92897', 'FIJO', '92897', '100 megas', 'BANDA ANCHA', 51990.0, 'LA FORTUNA S.A'),
    ('145013', '92896', 'FIJO', '92896', '100 megas', 'BANDA ANCHA', 38480.0, 'LA FORTUNA S.A'),
    ('136001', '98716', 'FIJO', '98716', 'DEDICADO FIBRA 100 MBY PLAN 325 MINUTOS', 'BANDA ANCHA', 536520.0, 'LA FORTUNA S.A'),
    ('128001', '102814', 'FIJO', '102814', '30 MEGAS', 'BANDA ANCHA', 59900.0, 'LA FORTUNA S.A'),
    ('145001', '102817', 'FIJO', '102817', '100 megas', 'BANDA ANCHA', 59900.0, 'LA FORTUNA S.A'),
    ('136020', '102815', 'FIJO', '102815', '100 megas', 'BANDA ANCHA', 59900.0, 'LA FORTUNA S.A'),
    ('136017', '108455', 'FIJO', '108455', '100 megas', 'BANDA ANCHA', 59900.0, 'LA FORTUNA S.A'),
    ('149001', '115357', 'FIJO', '115357', '150 MEGAS', 'BANDA ANCHA', NULL, 'LA FORTUNA S.A'),
    ('165007', '115358', 'FIJO', '115358', '30 MEGAS', 'BANDA ANCHA', NULL, 'LA FORTUNA S.A'),
    ('149006', '113036', 'FIJO', '113036', '100 megas', 'BANDA ANCHA', 73900.0, 'LA FORTUNA S.A'),
    ('145027', '115359', 'FIJO', '115359', '30 MEGAS', 'BANDA ANCHA', NULL, 'LA FORTUNA S.A'),
    ('165008', '118640', 'FIJO', '118640', '100 megas', 'BANDA ANCHA', 69900.0, 'LA FORTUNA S.A'),
    ('134034', '121516', 'FIJO', '121516', '100 megas', 'BANDA ANCHA', 76000.0, 'LA FORTUNA S.A'),
    ('154013', '122365', 'FIJO', '122365', '100 megas', 'BANDA ANCHA', 70000.0, 'LA FORTUNA S.A'),
    ('179002', '122507', 'FIJO', '122507', '100 megas', 'BANDA ANCHA', 70000.0, 'LA FORTUNA S.A'),
    ('138022', '118827', 'FIJO', '118827', '100 megas', 'BANDA ANCHA', 69900.0, 'LA FORTUNA S.A')
) AS c(cod_oficina, num_contrato, tipo, ref_pago, tipo_plan, tipo_canal, valor_mensual, titular_nombre)
WHERE o.cod_oficina = c.cod_oficina;

-- Step 4: Verify contracts were created
SELECT COUNT(*) as total_contratos FROM contratos WHERE proveedor_id = (SELECT id FROM proveedores WHERE nombre = 'EMTEL');
