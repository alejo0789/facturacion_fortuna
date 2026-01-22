# Arquitectura y Tecnologías del Sistema

## 🏛️ Arquitectura General

El sistema está diseñado con una arquitectura de tres capas (Frontend, Backend, Base de Datos) con integraciones externas para automatización y procesamiento inteligente.

## 🛠️ Stack Tecnológico

### Frontend
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **React** | 19.2.0 | Framework UI principal |
| **TypeScript** | 5.9.3 | Tipado estático |
| **Vite** | 7.2.4 | Build tool y dev server |
| **React Router** | 7.11.0 | Enrutamiento SPA |
| **Recharts** | 3.6.0 | Gráficos y visualizaciones |
| **TailwindCSS** | 3.4.17 | Framework CSS |

### Backend
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **FastAPI** | Latest | Framework API REST |
| **Python** | 3.x | Lenguaje principal |
| **SQLAlchemy** | Latest | ORM para PostgreSQL |
| **Uvicorn** | Latest | Servidor ASGI |
| **Pydantic** | Latest | Validación de datos |
| **AsyncPG** | Latest | Driver PostgreSQL asíncrono |
| **OracleDB** | Latest | Conexión a Manager ERP |
| **Pandas** | Latest | Procesamiento de datos |
| **OpenPyXL** | Latest | Generación de Excel |
| **HTTPX** | Latest | Cliente HTTP asíncrono |
| **Pillow** | Latest | Procesamiento de imágenes |

### Bases de Datos

#### PostgreSQL (Base de Datos Principal)
- **Propósito:** Almacenamiento de facturas, contratos, pagos
- **Tablas principales:**
  - `proveedores` - Información de proveedores
  - `oficinas` - Oficinas de la empresa
  - `contratos` - Contratos con proveedores
  - `facturas` - Facturas recibidas
  - `factura_oficinas` - Asignación múltiple de oficinas
  - `pagos` - Registro de pagos
  - `factura_uploads` - Tracking de uploads

#### Oracle Database (Manager ERP)
- **Propósito:** Consulta de datos maestros
- **Conexión:** Solo lectura
- **Tablas consultadas:**
  - `MANAGER.MNGDNO` - Oficinas (Dependencias)
  - `MANAGER.MNGCCO` - Centros de Costo
  - `MANAGER.VINCULADO` - Proveedores
  - `MANAGER.MNGMCN` - Movimientos contables (consecutivos)

### Integraciones Externas

#### n8n (Automatización)
- **Webhook URL:** `https://saman.lafortuna.com.co/n8n/webhook/...`
- **Funciones:**
  - Procesamiento de facturas PDF
  - Extracción de datos con IA
  - Notificaciones automáticas
  - Orquestación de flujos

#### IA / OCR
- **Integrado vía n8n**
- **Funciones:**
  - Extracción de texto de PDFs
  - Identificación de campos clave
  - Validación de formato
  - Corrección de errores

## 📐 Modelo de Datos

### Diagrama Entidad-Relación

```mermaid
erDiagram
    PROVEEDOR ||--o{ CONTRATO : tiene
    PROVEEDOR ||--o{ FACTURA : emite
    OFICINA ||--o{ CONTRATO : tiene
    OFICINA ||--o{ FACTURA_OFICINA : asignada
    CONTRATO ||--o{ PAGO : registra
    CONTRATO ||--o{ FACTURA_OFICINA : relaciona
    FACTURA ||--o{ FACTURA_OFICINA : distribuye
    FACTURA ||--o{ FACTURA_UPLOAD : tracking
    
    PROVEEDOR {
        int id PK
        string nit UK
        string nombre
        string nombre_comercial
    }
    
    OFICINA {
        int id PK
        string cod_oficina
        string nombre
        string ciudad
        string dude
    }
    
    CONTRATO {
        int id PK
        int proveedor_id FK
        int oficina_id FK
        string num_contrato
        date fecha_inicio
        date fecha_fin
        decimal valor_mensual
        string estado
        string tiene_iva
        decimal retefuente_pct
    }
    
    FACTURA {
        int id PK
        int proveedor_id FK
        string numero_factura
        string cufe
        date fecha_factura
        decimal valor
        string estado
        string url_factura
        datetime created_at
    }
    
    FACTURA_OFICINA {
        int id PK
        int factura_id FK
        int oficina_id FK
        int contrato_id FK
        decimal valor
        string estado
    }
```

## 🔄 Flujo de Datos

### 1. Recepción de Factura

```
┌─────────────┐
│   Usuario   │
│  o n8n      │
└──────┬──────┘
       │ Upload PDF / API Call
       ▼
┌─────────────────────┐
│  Backend FastAPI    │
│  /api/facturas/     │
└──────┬──────────────┘
       │
       ├─► Guarda en red compartida
       │   \\192.168.2.20\Facturas\
       │
       ├─► Crea registro en PostgreSQL
       │   Estado: PENDIENTE
       │
       └─► Notifica webhook n8n
           (si es upload manual)
```

### 2. Procesamiento con IA (vía n8n)

```
┌──────────────┐
│     n8n      │
│   Webhook    │
└──────┬───────┘
       │
       ├─► Lee PDF de red compartida
       │
       ├─► Extrae datos con IA/OCR
       │   - NIT proveedor
       │   - Número factura
       │   - Fecha
       │   - Valor
       │   - CUFE
       │
       └─► Llama API backend
           POST /api/facturas/crear-con-oficina
```

### 3. Asignación de Oficinas

```
┌──────────────┐
│   Usuario    │
│   Frontend   │
└──────┬───────┘
       │
       ├─► Selecciona oficinas
       │   (consulta desde Oracle)
       │
       ├─► Distribuye valores
       │
       └─► PUT /api/facturas/{id}/oficinas-multiples
           
           Backend:
           ├─► Busca contratos relacionados
           ├─► Asigna automáticamente
           └─► Estado: ASIGNADA
```

### 4. Generación de Reportes

```
┌──────────────┐
│   Usuario    │
└──────┬───────┘
       │
       ├─► Solicita consolidado
       │   GET /api/consolidado/generar
       │
       └─► Solicita archivo plano
           GET /api/archivo-plano/generar
           
           Backend:
           ├─► Consulta PostgreSQL
           ├─► Consulta Oracle (centros costo)
           ├─► Genera Excel con Pandas
           └─► Retorna archivo
```

## 🌐 Arquitectura de Red

### Producción
- **Frontend:** `https://saman.lafortuna.com.co/facturacion_ia/`
- **Backend:** `https://saman.lafortuna.com.co/api/`
- **n8n:** `https://saman.lafortuna.com.co/n8n/`
- **Servidor Apache:** Reverse proxy
- **Red compartida:** `\\192.168.2.20\Facturas\`

### Desarrollo
- **Frontend:** `http://localhost:5173`
- **Backend:** `http://localhost:8000`
- **PostgreSQL:** `localhost:5432`
- **Oracle:** `172.18.114.70:1521`

## 🔒 Seguridad

### Autenticación
- **API Key Middleware:** Valida `X-API-Key` en headers
- **Rutas protegidas:** Todas excepto `/` y `/docs`
- **CORS:** Configurado para dominios específicos

### Acceso a Datos
- **PostgreSQL:** Credenciales en `.env`
- **Oracle:** Usuario de solo lectura
- **Red compartida:** Autenticación Windows

## 📦 Estructura de Proyecto

```
langextract_ocr/
├── backend/
│   ├── main.py              # Aplicación FastAPI
│   ├── models.py            # Modelos SQLAlchemy
│   ├── schemas.py           # Schemas Pydantic
│   ├── crud.py              # Operaciones CRUD
│   ├── database.py          # Conexión PostgreSQL
│   ├── oracle_database.py   # Conexión Oracle
│   ├── middleware/
│   │   └── auth.py          # API Key middleware
│   └── routers/
│       ├── facturas.py      # Endpoints facturas
│       ├── contracts.py     # Endpoints contratos
│       ├── consolidado.py   # Generación consolidados
│       ├── archivo_plano.py # Archivos planos
│       ├── reportes.py      # Reportes y dashboard
│       └── oficinas_oracle.py # Consultas Oracle
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Componente principal
│   │   ├── pages/           # Páginas de la app
│   │   ├── components/      # Componentes reutilizables
│   │   └── lib/
│   │       └── api.ts       # Cliente API
│   └── public/
└── Docs/                    # Esta documentación
```

## 🔧 Variables de Entorno

### Backend (.env)
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host/db
ORACLE_HOST=172.18.114.70
ORACLE_PORT=1521
ORACLE_SERVICE=MANAMED
ORACLE_USER=WMENDEZ
ORACLE_PASSWORD=***
API_KEY=***
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:8000/api
```

## 📊 Métricas de Rendimiento

- **Tiempo de respuesta API:** < 200ms (promedio)
- **Procesamiento IA:** 5-15 segundos por factura
- **Generación Excel:** < 3 segundos (hasta 1000 registros)
- **Consultas Oracle:** < 500ms

## 🔄 Ciclo de Vida de una Factura

```
PENDIENTE → ASIGNADA → PAGADA
    ↓           ↓          ↓
  Sin       Con         Pago
 oficina   oficina    registrado
```

---

**Próximo:** [Integración con Manager ERP](../02_Integracion_Manager/README.md)
