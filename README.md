# Facturación Fortuna — SaaS Multi-Tenant

Sistema de gestión de facturación, contratos y pagos, pensado para ser
ofrecido como servicio web a múltiples empresas.

> **Rama**: `saas-multitenant`
> Esta rama añade, sobre el sistema original de La Fortuna, una capa de
> identidad multi-tenant (Firma → Empresa → Usuario con roles por empresa)
> sin romper el flujo actual en producción.

---

## Índice
1. [Stack](#stack)
2. [Estado del desarrollo](#estado-del-desarrollo)
3. [Arquitectura](#arquitectura)
4. [Requisitos previos](#requisitos-previos)
5. [Instalación con Anaconda](#instalación-con-anaconda)
6. [Configuración (.env)](#configuración-env)
7. [Base de datos](#base-de-datos)
8. [Primer arranque y datos semilla](#primer-arranque-y-datos-semilla)
9. [Ejecutar backend y frontend](#ejecutar-backend-y-frontend)
10. [Autenticación — JWT y API Key](#autenticación--jwt-y-api-key)
11. [Flujo n8n](#flujo-n8n)
12. [Probar la API](#probar-la-api)
13. [Despliegue en producción](#despliegue-en-producción)
14. [Roadmap de iteraciones restantes](#roadmap-de-iteraciones-restantes)
15. [Estructura del repositorio](#estructura-del-repositorio)

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2.x (async), asyncpg |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| DB | PostgreSQL 14+ |
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS |
| Automatización | n8n (extracción desde Outlook + FTP) |
| ERP externo | Oracle MANAMED (opcional, por empresa) |
| Despliegue | Apache 2 como reverse proxy (HTTPS) |

---

## Estado del desarrollo

Esta rama implementa la **Iteración 1** de un plan de 5 iteraciones.

| Iteración | Contenido | Estado |
|---|---|---|
| 1 | Multi-tenant (Firma / Empresa / Usuario / UsuarioEmpresa), JWT, roles, middleware dual JWT+API Key, README | ✅ en esta rama |
| 2 | Contabilidad: PUC colombiano, asientos, impuestos, causación, períodos | ⏳ siguiente |
| 3 | Extractos bancarios + motor de conciliación (Bancolombia, Davivienda) | ⏳ |
| 4 | Reportes DIAN (Balance General, P&L, Formato 1001) | ⏳ |
| 5 | Frontend multi-tenant + n8n parametrizado por empresa + Manager ERP | ⏳ |

**Toda la funcionalidad original sigue disponible** (facturas, pagos,
reportes, oficinas Oracle, archivo plano, asistente). Lo que cambia es
que cada fila ahora pertenece a una `empresa_id`.

---

## Arquitectura

```
                 ┌─────────────────────────────────────────────┐
                 │                Firma (SaaS)                 │
                 │   ej: "Fortuna" / "Contable XYZ SAS"        │
                 │                                             │
                 │   ┌──────────────┐   ┌──────────────┐       │
                 │   │  Empresa A   │   │  Empresa B   │  ...  │
                 │   │  (tenant)    │   │  (tenant)    │       │
                 │   └──────┬───────┘   └──────┬───────┘       │
                 │          │                  │               │
                 │   Proveedores, Oficinas, Contratos, Facturas│
                 │   Pagos, FacturaOficina, Feedback           │
                 └──────────┬──────────────────┬───────────────┘
                            │                  │
                         JWT Bearer      X-API-Key (n8n)
                            │                  │
                            └──────┬───────────┘
                                   ▼
                          FastAPI (backend)
                                   ▼
                            PostgreSQL
```

- **Firma**: cliente SaaS (ej. una firma de contadores o la propia
  empresa que contrata el servicio).
- **Empresa**: tenant aislado. Sus datos (facturas, oficinas, etc.) se
  filtran por `empresa_id`.
- **Usuario**: persona que inicia sesión. Puede tener acceso a N empresas
  con distinto rol en cada una vía la tabla `usuario_empresa`.
- **Roles**: `ADMIN`, `CONTADOR`, `AUDITOR`, `FACTURACION`,
  `CONTABILIDAD`, `PRODUCTOS`, `VENTAS`, `SOLO_LECTURA`.

---

## Requisitos previos

| Herramienta | Versión recomendada |
|---|---|
| Anaconda / Miniconda | 2024.x |
| Python | 3.11 |
| Node.js | 20+ (con npm o pnpm) |
| PostgreSQL | 14+ |
| n8n | 1.60+ (opcional, para el flujo de correo) |

> En Windows, Anaconda viene con Python. Si no, instala
> [Miniconda](https://docs.conda.io/en/latest/miniconda.html).

---

## Instalación con Anaconda

Todos los comandos se ejecutan desde la raíz del proyecto.

### 1) Clonar el repositorio y cambiar a la rama

```bash
git clone https://github.com/alejo0789/facturacion_fortuna.git
cd facturacion_fortuna
git checkout saas-multitenant
```

### 2) Crear entorno conda para el backend

```bash
conda create -n facturacion python=3.11 -y
conda activate facturacion
```

### 3) Instalar dependencias Python

```bash
cd backend
pip install -r requirements.txt
```

> `pip install` dentro de un entorno conda está soportado oficialmente.
> Si prefieres conda-forge para paquetes como `pandas`, `openpyxl`,
> `reportlab`, puedes hacer `conda install -c conda-forge pandas openpyxl reportlab`
> antes de `pip install -r requirements.txt`.

### 4) Instalar dependencias del frontend

```bash
cd ../frontend
npm install
```

### 5) PostgreSQL

Crea la base de datos (desde `psql`):

```sql
CREATE DATABASE supplier_db;
-- Opcional: crear usuario específico
CREATE USER facturacion_user WITH PASSWORD 'cambiar-en-prod';
GRANT ALL PRIVILEGES ON DATABASE supplier_db TO facturacion_user;
```

---

## Configuración (.env)

En `backend/` copia la plantilla y edita:

```bash
cd backend
cp .env.example .env         # Linux/Mac
# o en Windows PowerShell:
# Copy-Item .env.example .env
```

**Variables críticas a revisar:**

| Variable | Cómo generarla |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://usuario:pass@host:5432/supplier_db` |
| `JWT_SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | tu cuenta inicial de superadmin |
| `API_KEY` | (solo si estás migrando desde Fortuna) la misma que usa n8n hoy; si es despliegue nuevo déjala vacía |

Para el **frontend**, crea `frontend/.env.development`:

```env
VITE_API_URL=http://localhost:8000/api
```

Y para producción `frontend/.env.production` (ya viene con valores de
Fortuna; actualízalos a tu dominio).

---

## Base de datos

### Escenario A — Despliegue nuevo (desde cero)

No necesitas correr migraciones manualmente. Al arrancar el backend por
primera vez, SQLAlchemy crea todas las tablas (`create_all`).

### Escenario B — Migrando la base de Fortuna en producción

1. **Haz backup** de `supplier_db` antes de nada:
   ```bash
   pg_dump -U postgres supplier_db > backup_pre_saas.sql
   ```
2. Aplica la migración SQL:
   ```bash
   psql -U postgres -d supplier_db -f backend/migrations/001_saas_multitenant.sql
   ```
3. Arranca el backend — el resto (crear nuevas tablas, backfill de
   `empresa_id`) lo hace `lifespan` automáticamente.

La migración SQL `001_saas_multitenant.sql` es **idempotente** y se
puede reejecutar sin efectos secundarios.

---

## Primer arranque y datos semilla

Cuando el backend arranca por primera vez:

1. Crea las tablas nuevas (`firmas`, `empresas`, `usuarios`, `usuario_empresa`).
2. Añade la columna `empresa_id` a las tablas existentes (si no existe).
3. Crea:
   - **Firma por defecto** (`DEFAULT_FIRMA_NOMBRE`, `DEFAULT_FIRMA_NIT`).
   - **Empresa por defecto** (`DEFAULT_EMPRESA_NOMBRE`, `DEFAULT_EMPRESA_NIT`)
     — por defecto "La Fortuna".
   - **Superadmin** con las credenciales del `.env`.
4. Ejecuta el **backfill**: todas las filas preexistentes (facturas,
   oficinas, etc.) reciben la `empresa_id` de la empresa por defecto.
5. La nueva `empresa_id` se guarda también en la columna `api_key` de
   `empresas`, que se puede usar desde n8n.

---

## Ejecutar backend y frontend

### Backend

```bash
conda activate facturacion
cd backend
# Opción 1: directo
python main.py
# Opción 2: uvicorn con recarga
uvicorn main:application --host 0.0.0.0 --port 8000 --reload
```

> **Importante**: el módulo ASGI es `main:application` (no `main:app`),
> porque la app va envuelta en `AuthDualMiddleware`.

La API queda en:
- Raíz: http://localhost:8000/
- Docs Swagger: http://localhost:8000/docs
- Redoc: http://localhost:8000/redoc

### Frontend

```bash
cd frontend
npm run dev
```
El frontend queda en http://localhost:5173/

---

## Autenticación — JWT y API Key

El middleware `AuthDualMiddleware` acepta tres formas de autenticación:

1. **JWT Bearer** — flujo normal del frontend.
   ```http
   Authorization: Bearer eyJhbGciOiJ...
   ```
2. **X-API-Key por empresa** — para n8n / integraciones por cliente.
   Cada `Empresa` tiene una `api_key` única (UUID) que se puede rotar
   desde `POST /api/empresas/{id}/rotate-api-key`.
   ```http
   X-API-Key: 550e8400-e29b-41d4-a716-446655440000
   ```
3. **X-API-Key global (legada)** — soporte para el n8n actual de
   La Fortuna. Se configura con la variable `API_KEY` del `.env`.
   Cuando se usa, el usuario virtual queda como ADMIN sobre la empresa
   por defecto.

### Endpoints de autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Registra una Firma + primer usuario admin (+ empresa opcional) |
| POST | `/api/auth/login` | Login con email + password; devuelve access+refresh tokens |
| POST | `/api/auth/refresh` | Renueva access token |
| GET  | `/api/auth/me` | Info del usuario actual |
| GET  | `/api/auth/empresas` | Lista las empresas accesibles por el usuario |

### Header `X-Empresa-Id`

Para todos los endpoints que dependen de un tenant, el frontend debe
enviar además:
```http
X-Empresa-Id: 3
```
indicando sobre qué empresa se está operando. Si el usuario no tiene
acceso a esa empresa, la API devuelve 403.

---

## Flujo n8n

En esta iteración **el flujo n8n sigue funcionando igual**:
- El n8n de Fortuna sigue usando `X-API-Key` con la llave global
  (`.env/API_KEY`).
- La llamada cae sobre la Empresa por defecto ("La Fortuna") y todo
  opera como antes.

En la **Iteración 5** se parametriza el flujo n8n para que cualquier
empresa pueda tener su propia llave y webhook — ver sección
[Roadmap](#roadmap-de-iteraciones-restantes).

---

## Probar la API

Ejemplos con `curl`:

### Login como superadmin

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@admin.com","password":"admin123"}'
```

Guarda el `access_token` que devuelve.

### Listar empresas accesibles

```bash
curl http://localhost:8000/api/auth/empresas \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### Crear una nueva empresa (requiere rol ADMIN)

```bash
curl -X POST http://localhost:8000/api/empresas/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre":"Empresa Demo",
    "nit":"900123456-7",
    "ciudad":"Bogotá",
    "regimen_tributario":"Regimen Ordinario"
  }'
```

### Llamar un endpoint de negocio indicando tenant

```bash
curl http://localhost:8000/api/facturas \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "X-Empresa-Id: 1"
```

### Registrar una nueva firma desde cero

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firma_nombre":"Contadores XYZ SAS",
    "firma_nit":"901234567-8",
    "email":"contador@xyz.com",
    "nombre":"Juan Pérez",
    "password":"contraseña-segura-123",
    "empresa_nombre":"Cliente Uno SAS",
    "empresa_nit":"800111222-3"
  }'
```

---

## Despliegue en producción

El proyecto ya trae `apache_config_production.conf` con la configuración
actual de Fortuna. Al migrar a SaaS:

1. En la VM de producción, actualizar a la rama `saas-multitenant` y
   correr la migración SQL (ver [Base de datos](#base-de-datos)).
2. Asegurarse de que el `.env` tiene `API_KEY` igual al valor actual
   (para no romper el n8n existente).
3. El servicio systemd / script que lance `uvicorn` debe apuntar a
   `main:application` (no `main:app`).
4. Reiniciar Apache + backend.

> El `apache_config_production.conf` **no requiere cambios** porque el
> reverse proxy sigue exponiendo `/api/` al backend.

---

## Roadmap de iteraciones restantes

| # | Objetivo | Entregables |
|---|---|---|
| 2 | Motor contable | `models_contabilidad.py` (CuentaPUC, AsientoContable, LineaAsiento, PeriodoContable), `populate_puc.py` con PUC Decreto 2649, `services/causacion.py`, `services/impuestos.py` (IVA, Retefuente, ReteIVA, ReteICA), routers `/contabilidad`, `/periodos`. Validación `Σ(DB)=Σ(CR)` |
| 3 | Bancario + conciliación | Parsers CSV/Excel (Bancolombia, Davivienda, BBVA), `services/conciliacion.py` con motor de scoring, router `/bancario` |
| 4 | Reportes DIAN | Balance General, Estado de Resultados, Reporte de Retenciones, Formato 1001 Medios Magnéticos |
| 5 | Frontend + n8n + Manager ERP | Páginas contabilidad, selector de empresa, paginación por `X-Empresa-Id`, n8n con variables por empresa, adaptador Manager ERP (diccionario de datos PDF) |

---

## Estructura del repositorio

```
facturacion_fortuna/
├── backend/
│   ├── core/
│   │   ├── config.py              # Settings con pydantic-settings
│   │   ├── security.py            # JWT + bcrypt
│   │   └── dependencies.py        # get_current_user, get_current_empresa, require_role
│   ├── middleware/
│   │   ├── auth.py                # APIKeyMiddleware (legado, ya NO se usa en main)
│   │   ├── auth_dual.py           # NUEVO: JWT + X-API-Key (ASGI puro)
│   │   └── rate_limiter.py        # NUEVO: rate-limit para auth
│   ├── migrations/
│   │   └── 001_saas_multitenant.sql
│   ├── routers/
│   │   ├── auth.py                # NUEVO: login / register / refresh / me
│   │   ├── empresas.py            # NUEVO: CRUD tenants
│   │   ├── usuarios.py            # NUEVO: admin de usuarios + roles
│   │   └── ... (contracts, facturas, pagos, reportes, etc. preservados)
│   ├── models.py                  # Modelos existentes (+ empresa_id nullable)
│   ├── models_tenant.py           # NUEVO: Firma, Empresa, Usuario, UsuarioEmpresa
│   ├── schemas.py                 # Schemas existentes
│   ├── schemas_auth.py            # NUEVO
│   ├── schemas_empresa.py         # NUEVO
│   ├── crud.py                    # Preservado
│   ├── database.py                # Preservado
│   ├── main.py                    # Modificado: seed + nuevos routers + AuthDualMiddleware
│   ├── requirements.txt           # + python-jose, passlib, pydantic-settings, email-validator
│   └── .env.example               # Plantilla de configuración
├── frontend/                      # Sin cambios en Iteración 1 (se tocará en 5)
├── n8n_flujo_fact.json            # Flujo actual (se generaliza en Iteración 5)
├── apache_config_production.conf  # Sin cambios
└── README.md                      # ← este archivo
```

---

## Soporte y contribución

- Problemas o ideas: abre un issue en el repositorio GitHub.
- Rama activa de desarrollo SaaS: `saas-multitenant`.
- Las siguientes iteraciones se irán sumando a esta misma rama o a
  sub-ramas (`saas-multitenant-fase2`, etc.) según se acuerde con el
  equipo.
