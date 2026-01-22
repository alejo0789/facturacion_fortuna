# Integración con Manager ERP (Oracle)

## 📋 Descripción General

El sistema se integra con Manager ERP a través de conexión directa a la base de datos Oracle para consultar información maestra de oficinas, centros de costos, proveedores y consecutivos contables.

## 🔌 Configuración de Conexión

### Parámetros de Conexión
```python
ORACLE_HOST = "172.18.114.70"
ORACLE_PORT = 1521
ORACLE_SERVICE = "MANAMED"
ORACLE_USER = "WMENDEZ"
ORACLE_PASSWORD = "***"  # Configurado en .env
```

### Modo de Conexión
- **Thin Mode:** No requiere Oracle Instant Client
- **Biblioteca:** `oracledb` (Python)
- **Tipo de acceso:** Solo lectura

## 📊 Tablas Consultadas

### 1. MANAGER.MNGDNO (Oficinas/Dependencias)

**Propósito:** Obtener información de oficinas de la empresa

| Campo | Descripción | Tipo |
|-------|-------------|------|
| DNOCODIGO | Código de oficina | VARCHAR |
| DNONOMBRE | Nombre de la oficina | VARCHAR |
| DNOCCOSTO | Código del centro de costo | VARCHAR |

**Consulta típica:**
```sql
SELECT 
    d.DNOCODIGO AS CODIGO_OFICINA,
    d.DNONOMBRE AS NOMBRE_OFICINA,
    d.DNOCCOSTO AS CODIGO_CCOSTO,
    c.CCONOMBRE AS NOMBRE_CCOSTO
FROM 
    MANAGER.MNGDNO d
LEFT JOIN 
    MANAGER.MNGCCO c ON d.DNOCCOSTO = c.CCOCODIGO
WHERE 
    TRIM(d.DNOCODIGO) = :codigo
```

### 2. MANAGER.MNGCCO (Centros de Costo)

**Propósito:** Obtener información de centros de costo

| Campo | Descripción | Tipo |
|-------|-------------|------|
| CCOCODIGO | Código del centro de costo | VARCHAR |
| CCONOMBRE | Nombre del centro de costo | VARCHAR |

### 3. MANAGER.VINCULADO (Proveedores)

**Propósito:** Consultar información de proveedores/vinculados

| Campo | Descripción | Tipo |
|-------|-------------|------|
| VINCEDULA | NIT del proveedor | VARCHAR |
| VINNOMBRE | Nombre del proveedor | VARCHAR |

**Consulta típica:**
```sql
SELECT 
    TRIM(VINNOMBRE)
FROM 
    MANAGER.VINCULADO
WHERE 
    TRIM(VINCEDULA) = :nit
```

### 4. MANAGER.MNGMCN (Movimientos Contables)

**Propósito:** Obtener consecutivos de documentos contables

| Campo | Descripción | Tipo |
|-------|-------------|------|
| MCNTIPODOC | Tipo de documento | VARCHAR |
| MCNNUMEDOC | Número de documento | NUMBER |

**Consulta típica:**
```sql
SELECT 
    MAX(MCNNUMEDOC) AS ULTIMO_ASIENTO_MOV
FROM 
    MANAGER.MNGMCN 
WHERE 
    MCNTIPODOC = :tipo_documento
```

## 🔧 Funciones Implementadas

### 1. Consulta de Oficina por Código

**Endpoint:** `GET /api/oficinas-oracle/{codigo}`

**Función Python:**
```python
def get_oficina_by_codigo(codigo: str) -> Optional[Dict[str, Any]]
```

**Retorna:**
```json
{
    "codigo_oficina": "OF-001",
    "nombre_oficina": "Oficina Principal",
    "codigo_ccosto": "CC-100",
    "nombre_ccosto": "Centro Costo Principal"
}
```

**Uso:** Validar códigos de oficina al asignar facturas

### 2. Listar Todas las Oficinas

**Endpoint:** `GET /api/oficinas-oracle/`

**Función Python:**
```python
def get_all_oficinas() -> List[Dict[str, Any]]
```

**Uso:** Poblar selectores de oficinas en el frontend

### 3. Consultar Proveedor por NIT

**Endpoint:** `GET /api/oficinas-oracle/proveedor/{nit}`

**Función Python:**
```python
def get_proveedor_by_nit_oracle(nit: str) -> Optional[Dict[str, Any]]
```

**Retorna:**
```json
{
    "nit": "890123456",
    "nombre": "PROVEEDOR EJEMPLO S.A.S"
}
```

**Uso:** Validar y autocompletar nombre de proveedor

### 4. Obtener Consecutivo de Documento

**Endpoint:** `GET /api/oficinas-oracle/consecutivo/{tipo_documento}`

**Función Python:**
```python
def get_consecutivo_documento(tipo_documento: str, clase_documento: str = "0000") -> Optional[Dict[str, Any]]
```

**Parámetros:**
- `tipo_documento`: Código del tipo de documento (ej: "DC07")
- `clase_documento`: Clase del documento (default: "0000")

**Retorna:**
```json
{
    "clase": "0000",
    "tipo": "DC07",
    "nombre_documento": "Ultimo asiento movimiento DC07",
    "consecutivo_actual": 12345
}
```

**Uso:** Generar archivos planos con consecutivos correctos

## 🔄 Flujo de Integración

### Escenario 1: Asignación de Oficina a Factura

```
┌──────────────┐
│   Usuario    │
│   Frontend   │
└──────┬───────┘
       │
       │ 1. Solicita lista de oficinas
       ├──► GET /api/oficinas-oracle/
       │
       │ 2. Selecciona oficina
       │
       │ 3. Asigna a factura
       └──► PUT /api/facturas/{id}/oficinas-multiples
            
            Backend:
            ├─► Valida código en Oracle
            ├─► Busca centro de costo
            └─► Guarda en PostgreSQL
```

### Escenario 2: Generación de Archivo Plano

```
┌──────────────┐
│   Usuario    │
└──────┬───────┘
       │
       │ 1. Solicita archivo plano
       └──► GET /api/archivo-plano/generar
            
            Backend:
            ├─► Consulta facturas (PostgreSQL)
            ├─► Obtiene centros de costo (Oracle)
            ├─► Obtiene consecutivo (Oracle)
            ├─► Genera Excel
            └─► Retorna archivo
```

### Escenario 3: Validación de Proveedor

```
┌──────────────┐
│     n8n      │
│  (IA OCR)    │
└──────┬───────┘
       │
       │ Extrae NIT de factura
       │
       └──► POST /api/facturas/crear-con-oficina
            {
              "proveedor_nit": "890123456",
              "proveedor_nombre": null
            }
            
            Backend:
            ├─► Busca en PostgreSQL
            ├─► Si no existe, consulta Oracle
            ├─► Crea proveedor si se encuentra
            └─► Crea factura
```

## 📝 Mapeo de Datos

### Oficinas: Oracle → PostgreSQL

| Oracle (MNGDNO) | PostgreSQL (oficinas) |
|-----------------|----------------------|
| DNOCODIGO | cod_oficina |
| DNONOMBRE | nombre |
| - | tipo_sitio |
| - | dude |
| - | direccion |
| - | ciudad |
| - | zona |

**Nota:** Algunos campos en PostgreSQL se llenan desde otras fuentes o manualmente.

### Centros de Costo

Los centros de costo se consultan en tiempo real desde Oracle y **no se almacenan** en PostgreSQL. Se utilizan directamente en la generación de reportes.

## ⚠️ Consideraciones Importantes

### Rendimiento
- **Cache:** No implementado actualmente
- **Tiempo de respuesta:** < 500ms por consulta
- **Conexiones:** Se abren y cierran por cada consulta
- **Optimización:** Usar índices en Oracle

### Seguridad
- **Usuario de solo lectura:** No puede modificar datos en Manager
- **Credenciales:** Almacenadas en variables de entorno
- **Red:** Acceso solo desde servidor de aplicación

### Sincronización
- **Oficinas:** Se sincronizan manualmente cuando es necesario
- **Proveedores:** Se crean bajo demanda al recibir facturas
- **Centros de costo:** Siempre se consultan en tiempo real

### Manejo de Errores

```python
try:
    connection = get_oracle_connection()
    cursor = connection.cursor()
    # ... consulta ...
except oracledb.Error as e:
    print(f"Error connecting to Oracle: {e}")
    raise HTTPException(status_code=500, detail="Error de conexión con Manager ERP")
finally:
    if cursor:
        cursor.close()
    if connection:
        connection.close()
```

## 🔍 Búsqueda de Consecutivos

### Tipos de Documentos Comunes

| Código | Descripción |
|--------|-------------|
| DC07 | Comprobante de Egreso |
| DC01 | Factura de Venta |
| DC02 | Nota Débito |
| DC03 | Nota Crédito |

### Uso en Archivo Plano

El consecutivo se obtiene automáticamente al generar el archivo plano:

```python
# Obtener último consecutivo usado
consecutivo_info = get_consecutivo_documento("DC07")
siguiente_consecutivo = consecutivo_info["consecutivo_actual"] + 1

# Usar en archivo plano
for factura in facturas:
    row["CONSECUTIVO"] = siguiente_consecutivo
    siguiente_consecutivo += 1
```

## 📊 Ejemplos de Uso

### Ejemplo 1: Validar Oficina

```bash
curl -X GET "http://localhost:8000/api/oficinas-oracle/OF-001" \
  -H "X-API-Key: your-api-key"
```

**Respuesta:**
```json
{
  "codigo_oficina": "OF-001",
  "nombre_oficina": "Oficina Bogotá",
  "codigo_ccosto": "CC-100",
  "nombre_ccosto": "Administración"
}
```

### Ejemplo 2: Buscar Proveedor

```bash
curl -X GET "http://localhost:8000/api/oficinas-oracle/proveedor/890123456" \
  -H "X-API-Key: your-api-key"
```

**Respuesta:**
```json
{
  "nit": "890123456",
  "nombre": "CLARO COLOMBIA S.A."
}
```

### Ejemplo 3: Obtener Consecutivo

```bash
curl -X GET "http://localhost:8000/api/oficinas-oracle/consecutivo/DC07" \
  -H "X-API-Key: your-api-key"
```

**Respuesta:**
```json
{
  "clase": "0000",
  "tipo": "DC07",
  "nombre_documento": "Ultimo asiento movimiento DC07",
  "consecutivo_actual": 12345
}
```

## 🛠️ Troubleshooting

### Error: "Cannot connect to Oracle"
- Verificar conectividad de red al servidor Oracle
- Validar credenciales en `.env`
- Confirmar que el servicio Oracle está activo

### Error: "Table or view does not exist"
- Verificar permisos del usuario en Oracle
- Confirmar nombres de tablas (sensibles a mayúsculas)
- Validar que el esquema sea `MANAGER`

### Datos desactualizados
- Los datos se consultan en tiempo real
- Si hay inconsistencias, verificar en Manager ERP directamente
- Considerar implementar cache si es necesario

---

**Próximo:** [Automatización con n8n](../03_Integracion_N8N/README.md)
