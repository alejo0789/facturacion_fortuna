-- Database Schema for Supplier Services (PostgreSQL)

-- 1. Proveedores
CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    nit VARCHAR(50) NOT NULL UNIQUE, -- Added UNIQUE to ensure no duplicates
    nombre VARCHAR(255) NOT NULL,
    iva VARCHAR(50)
);

-- 2. Oficinas
CREATE TABLE IF NOT EXISTS oficinas (
    id SERIAL PRIMARY KEY,
    cod_oficina VARCHAR(50),
    nombre VARCHAR(255),
    tipo_sitio VARCHAR(100),
    direccion VARCHAR(255),
    ciudad VARCHAR(100),
    zona VARCHAR(100)
);

-- 3. Contratos (Central Table)
CREATE TABLE IF NOT EXISTS contratos (
    id SERIAL PRIMARY KEY,
    -- Foreign Keys
    proveedor_id INT REFERENCES proveedores(id),
    oficina_id INT REFERENCES oficinas(id),
    
    -- Titular Info
    titular_nombre VARCHAR(255),
    titular_cc_nit VARCHAR(50),
    
    -- Contract Details
    linea VARCHAR(100),
    num_contrato VARCHAR(100),
    fecha_inicio DATE,
    fecha_fin DATE,
    estado VARCHAR(50),
    observaciones TEXT,
    
    -- Service Specifics
    dude VARCHAR(255),
    tipo VARCHAR(100),
    ref_pago VARCHAR(100),
    tipo_plan VARCHAR(100),
    tipo_canal VARCHAR(100),
    valor_mensual DECIMAL(12, 2)
);

-- 4. Pagos
CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    contrato_id INT REFERENCES contratos(id),
    numero_factura VARCHAR(50),
    fecha_pago DATE,
    valor DECIMAL(12, 2),
    periodo VARCHAR(50),
    notas TEXT
);
