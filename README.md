# Facturación Fortuna — SaaS Contable Multi-Tenant

Plataforma web para **firmas contables** y **empresas** colombianas que
cubre, en un solo producto, el ciclo completo de:

- **Facturación de proveedores** con extracción automática desde correo
  (Gmail + Outlook + n8n + Google Gemini) o carga manual.
- **Contabilización** en PUC colombiano (Decreto 2649/2650) con asientos
  de partida doble y motor de impuestos (IVA 19%, Retefuente, ReteIVA,
  ReteICA) actualizados a UVT 2026.
- **Pagos** a proveedores y conciliación contra extractos bancarios
  (Bancolombia, Davivienda, genérico) mediante un motor de scoring.
- **Cumplimiento DIAN — Medios Magnéticos**: generación de formatos
  **1001** (pagos + retenciones), **1007** (ingresos) y **1008**
  (cuentas por cobrar).
- **Conciliación DIAN electrónica**: descarga automatizada del histórico
  oficial de facturación electrónica del portal `catalogo-vpfe.dian.gov.co`
  (Playwright) y cruce contra las facturas procesadas en la app. Cuatro
  métodos de autenticación al portal (Persona, Administrador, Rep. Legal,
  Usuario Autorizado). Dashboard estratégico de IVA con recomendaciones.
- **Multi-tenant** real: una firma puede administrar N empresas-cliente,
  cada usuario puede tener roles distintos por empresa. Aislamiento por
  `empresa_id` verificado en cada endpoint.
- **Seguridad**: guard de arranque, security headers, signed URLs, JWT +
  bcrypt cost 13, secrets encriptados con Fernet. Ver
  [`SECURITY.md`](./SECURITY.md).

> **Rama activa**: `saas-multitenant`
> **Versión**: 2.x — ver sección *[Cumplimiento de requerimientos](#cumplimiento-de-requerimientos)*
> para el estado exacto de cada fase del plan.

---

## Índice

1. [Qué es Facturación Fortuna](#qué-es-facturación-fortuna)
2. [Arquitectura multi-tenant](#arquitectura-multi-tenant)
3. [Módulos del sistema](#módulos-del-sistema)
4. [Roles y permisos](#roles-y-permisos)
5. [Integraciones](#integraciones)
6. [Stack tecnológico](#stack-tecnológico)
7. [Cumplimiento de requerimientos](#cumplimiento-de-requerimientos)
8. [Despliegue local — paso a paso](#despliegue-local--paso-a-paso)
   1. [Pre-requisitos](#0-pre-requisitos)
   2. [Clonar el repositorio](#1-clonar--actualizar-el-repo)
   3. [Entorno Anaconda](#2-crear-el-entorno-anaconda)
   4. [Base de datos PostgreSQL](#3-crear-la-base-postgresql)
   5. [Archivo `.env`](#4-configurar-el-env)
   6. [Migración SaaS](#5-si-migras-datos-existentes-ejecutar-la-migración-saas)
   7. [Primer arranque del backend](#6-primer-arranque-del-backend)
   8. [Verificación con Swagger](#7-verificación-manual-rápida-swagger)
   9. [Smoke test automatizado](#8-smoke-test-automatizado)
   10. [Frontend SaaS](#9-levantar-el-frontend-saas)
   11. [Reset y limpieza](#10-resetear-todo-limpieza)
   12. [Troubleshooting](#11-troubleshooting)
9. [Despliegue en producción](#despliegue-en-producción)
   - Railway: ver [`DEPLOYMENT_RAILWAY.md`](./DEPLOYMENT_RAILWAY.md)
   - Apache tradicional: ver [`DEPLOYMENT_LOCAL.md`](./DEPLOYMENT_LOCAL.md)
10. [Seguridad](#seguridad)
11. [Autenticación — JWT y API Key](#autenticación--jwt-y-api-key)
12. [Estructura del repositorio](#estructura-del-repositorio)

---

## Qué es Facturación Fortuna

Es un **SaaS contable** pensado para vender a varias empresas con
mínimo ajuste. Nació de la operación de La Fortuna (sede Colombia), pero
su arquitectura multi-tenant permite que una **firma contadora**
administre decenas de empresas-cliente desde la misma instancia, o que
una empresa individual lo use para su propia operación.

### Público objetivo

- **Firmas contables** que manejan múltiples clientes (PYMEs,
  profesionales independientes).
- **Empresas medianas** que quieren centralizar facturación +
  contabilidad + pagos en una sola herramienta.
- **Equipos operativos** (auxiliares de facturación, contadores,
  auditores, ventas, almacén) con permisos diferenciados.

### Qué resuelve

| Dolor típico | Solución en Fortuna |
|---|---|
| Contador gasta horas tipeando facturas desde correo | n8n + IA extrae y sube la factura automáticamente |
| Cada factura requiere generar asiento manual | Motor de causación genera el asiento aprobado |
| Balance y libro mayor en Excel | `/contabilidad/balance` y `/contabilidad/libro-mayor` |
| Conciliación bancaria manual línea por línea | Motor de scoring sugiere y auto-concilia |
| Medios Magnéticos DIAN armados a mano | Formatos 1001/1007/1008 generados desde los asientos aprobados |
| Un solo cliente por instalación | Multi-tenant: N empresas por firma, aislamiento por `empresa_id` |

---

## Arquitectura multi-tenant

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
                 │   Pagos, Asientos, PUC, Extractos bancarios │
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

- **Firma**: cliente SaaS. Agrupa a todas las empresas que maneja.
- **Empresa**: **tenant** aislado. Toda fila lleva `empresa_id` como
  discriminador (`TenantMixin`). Un usuario no puede leer datos de una
  empresa a la que no tiene acceso.
- **Usuario**: persona que inicia sesión. Puede tener acceso a N
  empresas con rol distinto vía la tabla `usuario_empresa`.
- **Aislamiento**: el middleware `AuthDualMiddleware` resuelve la
  `empresa_activa` a partir del header `X-Empresa-Id` o de la
  `X-API-Key` de la empresa. Todos los endpoints validan acceso con
  `Depends(get_current_empresa)`.

---

## Módulos del sistema

### 1. Facturación

- **Proveedores**: CRUD por empresa. NIT único por tenant (no global).
- **Facturas**: carga manual o vía n8n (webhook autenticado con
  `X-API-Key` de empresa). Soporta PDF adjunto.
- **Estados**: `PENDIENTE → APROBADA → PAGADA` (flujo clásico).
- **Pagos**: generación de documento contable al marcar PAGADA, con
  selección de banco (cuenta PUC 1110*).
- **Oficinas / Centros de costo**: asignación de facturas a uno o
  varios centros con porcentaje de distribución.
- **Contratos**: seguimiento de contratos recurrentes de servicios.
- **Facturas Pendientes por Llegar**: control de facturas esperadas.
- **Asistente Buscador**: búsqueda cross-módulo (facturas, proveedores,
  contratos).
- **Reportes**: facturación mensual, top proveedores, estado de cartera.

### 2. Contabilidad

- **PUC Colombiano Decreto 2649/2650** (~167 cuentas base) clonado por
  empresa al crear un tenant nuevo.
- **Periodos contables**: mes/año con cierre bloqueante. Endpoints
  `/api/contabilidad/periodos` (listar, crear, cerrar).
- **Asientos contables**: partida doble validada (`Σ débitos = Σ
  créditos`, rechazo HTTP 422 si descuadra).
- **Estados de asiento**: `BORRADOR → APROBADO → ANULADO`. Sólo los
  **APROBADOS** alimentan reportes y DIAN.
- **Causación automática** (`services/causacion.py`) al aprobar una
  factura:
  - DB Gasto (511005 por defecto) / DB IVA descontable (240810)
  - CR Retefuente (236540) / CR ReteIVA (236701) / CR ReteICA (236805)
  - CR Proveedores (220505)
- **Pago a proveedor** (`services/pago.py`): DB Proveedor / CR Banco
  (1110*).
- **Libro mayor** por cuenta PUC con saldo progresivo.
- **Balance de comprobación** por periodo.

### 3. Impuestos

- Motor configurable en `services/impuestos.py`.
- **IVA** 19% (configurable por producto/servicio).
- **Retefuente** (tarifas por concepto: compras 2.5%, servicios 4%,
  honorarios 10-11%).
- **ReteIVA** 15% del IVA (para grandes contribuyentes).
- **ReteICA** por municipio (Bogotá, Medellín, Cali, etc.).
- Endpoint `/api/impuestos/calcular` devuelve desglose completo.

### 4. Bancos y conciliación

- **Cuentas bancarias**: CRUD bajo `/app/cuentas-bancarias`. Cada
  cuenta se mapea a una subcuenta PUC del grupo **1110 – Bancos**.
- **Carga de extractos**: upload de CSV/XLSX (auto-detecta Bancolombia,
  Davivienda, formato genérico). Encoding tolerante (utf-8-sig, utf-8,
  latin-1, cp1252) y separador `;` o `,`.
- **Dedupe**: hash SHA1 de `fecha|monto|ref|desc[:80]` previene
  duplicados al re-subir el mismo extracto.
- **Motor de conciliación** con scoring:

  | Condición | Puntos |
  |---|---|
  | Monto exactamente igual | +50 |
  | Diferencia monto ≤ 1 % | +20 |
  | Diferencia fecha ≤ 3 días | +30 |
  | Diferencia fecha ≤ 7 días | +15 |
  | NIT match en referencia | +20 |
  | Palabra (nombre proveedor) en descripción | +10 |

  - Score **≥ 100** → auto-conciliado.
  - Score **70-99** → sugerido, requiere aprobación humana.
  - Score **< 70** → no-sugerencia.

- **Reglas de conciliación** configurables: patrones → cuenta PUC
  automática para transacciones recurrentes (nómina, servicios
  públicos).

### 5. Cumplimiento DIAN — Medios Magnéticos (información exógena)

- **Formato 1001** — Pagos y retenciones por tercero.
- **Formato 1007** — Ingresos por tercero.
- **Formato 1008** — Saldo de cuentas por cobrar por tercero.
- **Resumen anual** con totales de los 3 formatos.
- Descarga **JSON o CSV** (multipart `?formato=csv`).
- Se construyen dinámicamente desde los asientos en estado
  **APROBADO** del año fiscal. Nunca se guardan archivos pre-generados:
  siempre reflejan el estado actual de la contabilidad.
- Endpoints en [`backend/routers/dian.py`](./backend/routers/dian.py).

### 6. Conciliación DIAN electrónica (factura electrónica)

Vertical separada de Medios Magnéticos — cruza factura electrónica DIAN con
lo procesado en la app.

- **Descarga automatizada del portal**
  [`catalogo-vpfe.dian.gov.co`](https://catalogo-vpfe.dian.gov.co/) vía
  **Playwright** headless. Corre mes a mes en background y persiste en la
  tabla `documentos_dian` con dedup por CUFE.
- **Cuatro métodos de autenticación** al portal — el usuario elige el que
  aplique según cómo esté registrada su empresa:

  | Método | Credenciales | Segundo factor |
  |---|---|---|
  | Persona natural | Cédula + tipo doc | Magic link al correo |
  | Administrador | Email + contraseña | Ninguno (automatizable) |
  | Empresa · Rep. Legal | Cédula rep + NIT empresa + tipo doc | Magic link al correo |
  | Empresa · Usuario Autorizado | NIT empresa + tipo doc + cédula usuario + contraseña | Ninguno (automatizable) |

  **Las contraseñas del portal NUNCA se persisten**. Viven en memoria del
  thread de sync durante el login y se descartan. Solo se guarda el
  `storage_state` de la sesión Playwright (encriptado Fernet, ~30 min de
  vigencia).
- **Cuatro pestañas en la UI** (`/app/conciliacion-dian`):
  1. **Sincronizar** — configurar método + disparar job + pegar magic link.
  2. **Conciliación** — cruce facturas app ↔ documentos DIAN con estados
     `coincide` / `diferencia_valor` / `solo_en_app` / `solo_en_dian`.
  3. **IVA por período** — bimestral / cuatrimestral / anual, con saldos.
  4. **IVA Estratégico** — dashboard analítico:
     KPIs (IVA generado / descontable / no capturado), ratio de captura,
     tendencia por período (Recharts), top 10 proveedores, facturas
     huérfanas y **recomendaciones** heurísticas (adelantar compras, ratio
     bajo, saldo a favor con Art. 850 ET, tendencia creciente, etc.).
     Toggle COP / UVT.
- Endpoints en [`backend/routers/dian_conciliacion.py`](./backend/routers/dian_conciliacion.py).
- Setup completo del portal DIAN + Playwright en la sección de despliegue.
- Sin credenciales DIAN, hay un **fixture** de prueba disponible con `DEBUG=True`:
  `POST /api/conciliacion-dian/dev/seed-fixture` siembra un escenario
  contable realista (12 docs DIAN + 9 facturas app + 4 proveedores).

---

## Roles y permisos

Cada usuario tiene un rol por empresa. Los endpoints sensibles usan
`Depends(require_role("ADMIN", "CONTADOR", ...))`:

| Rol | Acceso típico |
|---|---|
| `ADMIN` | Todo: usuarios, empresas, contabilidad, DIAN |
| `CONTADOR` | Contabilidad completa (PUC, asientos, balance, DIAN) |
| `CONTABILIDAD` | Operativo contable (asientos, conciliación) |
| `AUDITOR` | Lectura completa, sin capacidad de modificación |
| `FACTURACION` | Alta de facturas, pagos, proveedores |
| `PRODUCTOS` | Catálogo de productos/servicios |
| `VENTAS` | Facturación de venta y clientes |
| `SOLO_LECTURA` | Lectura básica del dashboard y reportes |

El rol se valida **por empresa** — un usuario puede ser `ADMIN` en la
empresa A y `SOLO_LECTURA` en la empresa B.

---

## Integraciones

### OAuth Gmail + Outlook — multi-tenant

Arquitectura **Modelo A (SaaS-managed) + Modelo B (BYO) opcional**:

- **Modelo A (default)**: el operador del SaaS registra UNA app OAuth por
  proveedor (Google Cloud + Azure Portal), pega las credenciales en el
  `.env` del backend (`GOOGLE_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_ID`,
  etc.). Cada empresa autoriza con 1 click en `/app/integraciones`. El
  backend guarda el `refresh_token` por-tenant en `empresas` (encriptado
  con Fernet). Cliente nunca ve estos secretos.
- **Modelo B (avanzado)**: la empresa registra su propia OAuth app (por
  privacidad de datos o volumen). Pega Client ID + Secret en el panel
  Integraciones. Se guardan en `gmail_client_id_enc` / `outlook_client_id_enc`.

Flujo:

1. `GET /api/oauth/{gmail,outlook}/authorize` (autenticado JWT + `X-Empresa-Id`)
   → devuelve la URL del proveedor a la que abrir un popup.
2. Google/Microsoft redirige a `/api/oauth/{gmail,outlook}/callback?code&state`.
   El `state` es un token opaco firmado que ata `(empresa_id, user_id)` con TTL 10 min.
3. Backend intercambia `code` por `refresh_token` y lo guarda encriptado.
4. Panel muestra "✓ Conectado como usuario@empresa.com".

Scopes usados:

- Gmail: `https://www.googleapis.com/auth/gmail.readonly`
- Outlook (Microsoft Graph): `Mail.Read`, `offline_access`, `User.Read`

Documentación operativa: [`SETUP_N8N.md`](./SETUP_N8N.md) tiene los pasos
del setup del operador (Azure App registrations, Google Cloud Console).

### Google Gemini — servicio del SaaS

- **Key global** del SaaS (`GEMINI_API_KEY_GLOBAL` en `.env`) atiende a todos
  los tenants por defecto.
- **Fallback per-tenant**: si una empresa provee su propia key en el panel
  Integraciones, se guarda encriptada en `gemini_api_key_enc` y sobrescribe
  la global para esa empresa.
- El nodo Gemini nativo del workflow n8n usa `credentialId` dinámico,
  inyectado por el backend en el payload del webhook.

### n8n — orquestación (un workflow, todos los tenants)

Arquitectura **un solo workflow compartido + credenciales dinámicas**: el
SaaS opera una instancia n8n con el workflow que atiende a todos los tenants.

Workflow único en `n8n/`:

| Archivo | Endpoints webhook |
|---------|-------------------|
| `workflow_facturacion_saas.json` | `/webhook/procesar-factura`, `/webhook/buscar-facturas`, `/webhook/procesar-adjunto` |

Un solo import en n8n crea los 3 sub-flujos aislados: upload manual con IA,
buscador de correo Outlook/Gmail, y procesamiento del adjunto seleccionado.

Autenticación del callback del workflow al backend:

- `X-API-Key: <api_key de la empresa>` — UUID rotable vía
  `POST /api/empresas/{id}/rotate-api-key`.
- `X-Empresa-Id: <id>` — identifica el tenant destino.
- Bearer **dinámico** al proveedor de correo — el backend inyecta el
  `refresh_token` desencriptado en el payload del webhook.

El PDF viaja embebido como `pdf_base64` (no se lee del filesystem — evita
`N8N_RESTRICT_FILE_ACCESS_TO`).

Paso a paso completo con tropiezos comunes en
[`SETUP_N8N.md`](./SETUP_N8N.md) y
[`n8n/README_INTEGRACION.md`](./n8n/README_INTEGRACION.md).

### Conciliación DIAN (portal catalogo-vpfe)

Playwright + Chromium se lanza en un thread aislado con ProactorEventLoop
propio (Windows). Ver Módulo 6 arriba.

### Oracle ManagerERP / MANAMED

- Generación de documento contable **NB01** (bank note) al pagar una
  factura — compatible con el formato que MANAMED consume para
  registrar pagos en su contabilidad paralela.
- Sincronización opcional de catálogo de proveedores.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.x (async), asyncpg |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Base de datos | PostgreSQL 14+ |
| Frontend | React 19 + Vite + TypeScript + TailwindCSS |
| Rutas | React Router 7 con `lazy()` + `Suspense` |
| Gráficos | Recharts |
| Parseo de extractos | pandas, openpyxl |
| PDF | ReportLab / WeasyPrint |
| Automatización | n8n 1.60+ |
| ERP externo | Oracle MANAMED (opcional) |
| Despliegue | Apache 2 (reverse proxy HTTPS), systemd, Uvicorn |

---

## Cumplimiento de requerimientos

### `Trabajo futuro - Facturación.txt`

| Requerimiento | Estado | Dónde |
|---|---|---|
| Generalizar el software para vender a varias empresas | ✅ | `models_tenant.py` (Firma/Empresa/Usuario/UsuarioEmpresa) + `TenantMixin` en todos los modelos |
| Sistema de login con roles (admin, facturación, productos, ventas) | ✅ | `core/security.py` + `routers/auth.py` + `require_role()` (8 roles implementados) |
| Consulta de proveedores por empresa (no global) | ✅ | `models.py` → `Proveedor.empresa_id` + UNIQUE `(empresa_id, nit)` |
| Oficinas generalizadas (una o varias por factura) | ✅ | `FacturaOficina` con `porcentaje` de distribución |
| Facturas con imágenes / adjuntos | ✅ | Campo `archivo_url` + soporte multipart en router de facturas |
| Contabilidad: gastos por rubros, sistema contable profesional | ✅ | PUC completo + `services/causacion.py` + balance + libro mayor |
| Compatibilidad con ManagerERP | ✅ | Documento NB01 generado en `services/pago.py` |
| n8n adaptable a cualquier empresa | ✅ | `X-API-Key` por empresa; una llave → una empresa |

### `implementation_plan.md`

| Fase | Descripción | Estado |
|---|---|---|
| **Fase 0** | Modelos base contables (CuentaPUC, Asiento, Movimiento, Cuentas bancarias) | ✅ Completo en `models_contabilidad.py` |
| **Fase 1** | Fundación multi-tenant + PUC completo | ✅ Completo: `models_tenant.py`, `routers/auth.py`, `routers/empresas.py`, `populate_puc.py` con 167 cuentas, clonación automática al crear empresa |
| **Fase 2** | Motor contable core | ✅ Completo: `services/causacion.py`, `services/impuestos.py`, periodos dentro de `routers/contabilidad.py` (crear, listar, cerrar) |
| **Fase 3** | Extractos bancarios y conciliación | ✅ Completo: `routers/bancario.py` con 10 endpoints, parsers CSV/XLSX Bancolombia/Davivienda/genérico, scoring +50/+30/+20, dedupe SHA1, reglas configurables |
| **Fase 4** | Reportes + cumplimiento DIAN | ✅ Completo: Balance General, Estado de Resultados y Retenciones dentro de `/api/contabilidad/balance`; Medios Magnéticos 1001/1007/1008 en `routers/dian.py` con JSON + CSV |
| **Fase 5** | Frontend SaaS | ✅ Completo: shell autenticado en `/app/*`, 23 páginas (Dashboard, PUC, Asientos, Libro Mayor, Balance, Impuestos, Cuentas Bancarias, Conciliación Bancaria, Medios Magnéticos, Integraciones, Conciliación DIAN, etc.), lazy-loading con Suspense, selector de empresa activa |
| **Fase 6** | PUC completo + tarifas 2026 | ✅ Completo: catálogo `puc_catalogo` con clases 1-9 (Decreto 2650), tarifas retención UVT $52.374 2026, autocompletes reusables, agregado desde catálogo por endpoint |
| **Fase 7** | OAuth multi-tenant (Gmail + Outlook) + Gemini SaaS | ✅ Completo: `routers/oauth.py`, `services/google_oauth.py`, `services/microsoft_oauth.py`, `services/gemini.py`, panel `/app/integraciones` con SaaS-managed + BYO |
| **Fase 8** | Conciliación DIAN + IVA Estratégico | ✅ Completo: Playwright multi-método auth (4 flujos), thread ProactorEventLoop, encriptación de sesión Fernet, dashboard estratégico con 4 tabs (Sincronizar, Conciliación, IVA por período, IVA Estratégico), Recharts + recomendaciones |
| **Fase 9** | Hardening de seguridad | ✅ Completo: signed URLs HMAC, security headers, guard de arranque, rate limit por IP real, OAuth state binding, path traversal defense, password complexity, bcrypt cost 13, sanitización de errores. Ver [`SECURITY.md`](./SECURITY.md) |

### Plan de verificación

- ✅ Asiento descuadrado → **HTTP 422** (validación Pydantic
  `@field_validator("lineas")` en `schemas_contabilidad.py`).
- ✅ Aislamiento multi-tenant (usuarios de empresas distintas no ven
  datos cruzados) → `Depends(get_current_empresa)` en todos los
  endpoints.
- ✅ Re-subir el mismo extracto no duplica transacciones → hash SHA1.
- ✅ Factura aprobada genera asiento de causación automáticamente →
  `services/causacion.crear_asiento_causacion_factura`.
- ✅ Balance General cumple `Activos = Pasivos + Patrimonio` →
  `/api/contabilidad/balance`.

---

## Despliegue local — paso a paso

Guía completa para tener el backend + frontend corriendo en tu
máquina. Al final tendrás:

1. Un entorno Anaconda aislado.
2. Una base PostgreSQL limpia con PUC cargado.
3. Backend en `http://localhost:8000`.
4. Frontend en `http://localhost:5173`.
5. Smoke test automatizado pasando al 100 %.

### 0. Pre-requisitos

- **Windows 10/11, macOS o Linux**.
- **Anaconda / Miniconda**: https://www.anaconda.com/download
- **PostgreSQL 14+**: https://www.postgresql.org/download/
- **Git**.
- **Node.js 18+** (para el frontend).

Verifica:

```bash
conda --version
psql --version
git --version
node --version
```

**Opcionales** (según qué módulos vayas a usar):

- **n8n 1.60+** — para captura automática por correo. Setup en
  [`SETUP_N8N.md`](./SETUP_N8N.md).
- **Google Cloud + Azure Portal** — para OAuth Gmail / Outlook (Modelo A).
- **Playwright Chromium** — para Conciliación DIAN (portal scraping).
  Se instala automáticamente al instalar la dependencia `playwright`
  del backend, pero necesitas descargar el browser una vez:

  ```bash
  cd backend
  playwright install chromium
  ```

### 1. Clonar / actualizar el repo

```bash
cd "C:\Users\dammi\Documents\Empresas\Movaiti\Proyecto Facturación - Reestructurado\facturacion_fortuna"
git fetch origin
git checkout saas-multitenant
git pull origin saas-multitenant
```

Clonado fresco:

```bash
git clone https://github.com/alejo0789/facturacion_fortuna.git
cd facturacion_fortuna
git checkout saas-multitenant
```

### 2. Crear el entorno Anaconda

```bash
conda create -n fortuna-saas python=3.11 -y
conda activate fortuna-saas
```

Instala dependencias del backend:

```bash
cd backend
pip install -r requirements.txt
pip install httpx     # necesario para el smoke test
```

> **Nota:** `bcrypt==4.0.1` está fijado por compatibilidad con
> `passlib`. Si `pip` protesta con Pillow en Windows, ejecuta antes
> `conda install pillow -y`.

### 3. Crear la base PostgreSQL

#### Opción A — pgAdmin (GUI)

1. Abre pgAdmin → click derecho en *Databases* → *Create* → *Database*.
2. Nombre: `supplier_db`.
3. Dueño: `postgres` (o tu usuario).
4. *Save*.

#### Opción B — línea de comandos

```bash
psql -U postgres -c "CREATE DATABASE supplier_db;"
```

Con usuario dedicado:

```bash
psql -U postgres -c "CREATE USER fortuna WITH PASSWORD 'fortuna';"
psql -U postgres -c "CREATE DATABASE supplier_db OWNER fortuna;"
```

Y usa en `.env`:
`DATABASE_URL=postgresql+asyncpg://fortuna:fortuna@localhost:5432/supplier_db`.

### 4. Configuración local — archivos `.env`

> ⚠️ **Seguridad**: los archivos `.env`, `.env.example` y `.env.production`
> **NO están en el repositorio** (contienen credenciales y secretos). Cada
> desarrollador debe crearlos a mano siguiendo las plantillas de abajo.
> El `.gitignore` los bloquea automáticamente.

#### 4.1 `backend/.env` — secretos del backend

Crea el archivo `backend/.env` con este contenido **exacto**, reemplazando
los valores marcados con `CAMBIAR`:

```env
# ==========================================================
# Base de datos PostgreSQL
# ==========================================================
DATABASE_URL=postgresql+asyncpg://postgres:CAMBIAR_PASSWORD@localhost:5432/supplier_db

# ==========================================================
# JWT — autenticación de usuarios (CRÍTICO en producción)
# ==========================================================
# Genera una clave nueva con:
#   python -c "import secrets; print(secrets.token_urlsafe(64))"
JWT_SECRET_KEY=CAMBIAR_POR_UNA_CLAVE_ALEATORIA_LARGA
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# ==========================================================
# Fernet — encriptación simétrica de secretos en BD
# ==========================================================
# (OAuth refresh_tokens, credenciales DIAN, FTP passwords, Gemini keys por tenant)
# Genera una nueva con:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
FERNET_KEY=CAMBIAR_POR_UNA_CLAVE_FERNET

# ==========================================================
# CORS — dominios autorizados a llamar al backend
# ==========================================================
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://192.168.2.91:5173,https://saman.lafortuna.com.co,http://saman.lafortuna.com.co

# ==========================================================
# Superadmin inicial (se crea en el primer arranque)
# ==========================================================
SUPERADMIN_EMAIL=admin@admin.com
SUPERADMIN_PASSWORD=CAMBIAR_PASSWORD_FUERTE

# ==========================================================
# Empresa y firma por defecto (se crean al hacer seed)
# ==========================================================
DEFAULT_FIRMA_NOMBRE=Fortuna
DEFAULT_FIRMA_NIT=000000000-0
DEFAULT_EMPRESA_NOMBRE=La Fortuna
DEFAULT_EMPRESA_NIT=000000000-0

# ==========================================================
# Seguridad
# ==========================================================
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
MIN_PASSWORD_LENGTH=8

# Cuando True: aborta arranque si detecta credenciales por defecto,
# FERNET_KEY faltante o JWT_SECRET_KEY genérica. Activa en prod.
# Además dispara HSTS en las respuestas.
PRODUCTION_MODE=False

# Reverse proxies confiables — solo si corres detrás de nginx/traefik.
# Sin esto, el rate limiter usa la IP real del socket (no X-Forwarded-For)
# para evitar spoofing.
TRUSTED_PROXIES=

# Forzar tokens firmados en URLs de PDF. Ver SECURITY.md.
# Recomendado True en prod. Durante migración: False.
REQUIRE_SIGNED_PDF_URLS=False

# Modo DEBUG — habilita endpoints /dev/* como el fixture de DIAN.
# NUNCA True en prod (incompatible con PRODUCTION_MODE=True).
DEBUG=True

# ==========================================================
# n8n — workflow compartido del SaaS (opcional)
# ==========================================================
N8N_PROCESS_WEBHOOK_URL=
N8N_SEARCH_WEBHOOK_URL=
N8N_PROCESS_EMAIL_WEBHOOK_URL=

# ==========================================================
# OAuth Multi-tenant — Modelo A (SaaS-managed)
# ==========================================================
# Google Cloud → OAuth 2.0 Client IDs
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:8000/api/oauth/gmail/callback

# Azure Portal → App registrations
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_REDIRECT_URI=http://127.0.0.1:8000/api/oauth/outlook/callback
MICROSOFT_OAUTH_TENANT_ID=common

# ==========================================================
# Google Gemini — key global del SaaS (fallback si tenant no tiene la suya)
# ==========================================================
GEMINI_API_KEY_GLOBAL=

# ==========================================================
# Conciliación DIAN — Playwright
# ==========================================================
# En dev conviene False (headed) para sortear Cloudflare Turnstile con UI real.
# En prod (Linux headless): True + user-agent apropiado.
DIAN_HEADLESS=False

# ==========================================================
# Opcional — API_KEY legada (n8n antiguo de La Fortuna)
# ==========================================================
# Si no usas el n8n legacy, deja esto vacío.
# API_KEY=la_api_key_que_usa_n8n
```

#### 4.2 `frontend/.env` — config local del frontend (dev)

```env
VITE_API_URL=http://localhost:8000
```

Es lo mínimo. Si tu n8n local llama directamente al frontend con X-API-Key,
agrega también `VITE_API_KEY=...` (opcional).

#### 4.3 `frontend/.env.production` — sólo si vas a hacer `npm run build`

```env
VITE_API_URL=https://saman.lafortuna.com.co/api
```

Ajusta el dominio al que corresponda tu deploy.

#### 4.4 Verificación

```bash
# desde la raíz del repo
ls backend/.env frontend/.env       # deben existir
git status                          # NO deben aparecer en "untracked" ni "modified"
```

Si ves `backend/.env` en `git status`, algo anda mal con el `.gitignore` —
revisa que el bloque `.env` esté presente en la raíz `.gitignore`.

### 5. (Si migras datos existentes) Ejecutar las migraciones

Si la base `supplier_db` ya tiene tablas del proyecto viejo, aplica
las migraciones idempotentes **en orden**:

```bash
cd backend
for f in migrations/*.sql; do
    echo "Aplicando $f"
    psql -U postgres -d supplier_db -f "$f"
done
```

O una por una (Windows PowerShell):

```powershell
Get-ChildItem migrations/*.sql | Sort-Object Name | ForEach-Object {
    psql -U postgres -d supplier_db -f $_.FullName
}
```

Migraciones actuales:

| Archivo | Contenido |
|---|---|
| `001_saas_multitenant.sql` | Base multi-tenant: Firma, Empresa, Usuario, UsuarioEmpresa + backfill de `empresa_id` |
| `002_conciliacion_unique.sql` | Índices únicos en conciliación bancaria |
| `003_concepto_dian.sql` | Campo `concepto_dian` en asientos (mapping a Medios Magnéticos) |
| `004_iva_factura.sql` | Columna `iva` en `facturas` (extraído por n8n) |
| `005_puc_catalogo_completo.sql` | `puc_catalogo` con clases 1-9 del Decreto 2650 |
| `006_tarifas_retencion_2026.sql` | 50+ conceptos con UVT $52.374 vigente 2026 |
| `007_integraciones_n8n.sql` | Campos `n8n_webhook_url`, `gemini_credential_id` etc. |
| `008_oauth_gmail_multitenant.sql` | OAuth Gmail: refresh_token encriptado, email conectado, modo SaaS-managed vs BYO |
| `009_oauth_outlook_multitenant.sql` | Idem para Outlook (Microsoft Graph) |
| `010_conciliacion_dian.sql` | `documentos_dian` + `dian_sync_jobs` para Conciliación DIAN |
| `011_dian_multi_metodo_auth.sql` | Método de auth DIAN + credenciales por método (encriptadas) |
| `012_security_hardening.sql` | `rate_limit_events`, `token_blacklist`, `audit_log` |
| `013_two_factor_auth.sql` | `two_factor_secret_enc` + `two_factor_enabled` en `usuarios` |

Si la base está vacía, sáltate este paso — el `lifespan` del backend
crea todo desde cero con `Base.metadata.create_all` (equivalente a aplicar
todas las migraciones).

### 6. Primer arranque del backend

```bash
cd backend
python main.py
```

O con recarga automática:

```bash
uvicorn main:application --host 0.0.0.0 --port 8000 --reload
```

> **Importante**: el módulo ASGI es `main:application` (no
> `main:app`), porque la app va envuelta en `AuthDualMiddleware`.

Verás en consola:

```
Seed: Firma por defecto creada (Fortuna)
Seed: Empresa por defecto creada (id=1)
Seed: superadmin creado (admin@admin.com)
Backfill de empresa_id completado para 9 tablas
Seed: PUC cargado (167 cuentas) para empresa 1
Seed: configuración de impuestos por defecto lista
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Abre:

- http://localhost:8000/ → `{"message":"Supplier Service API v2.0.0"}`
- http://localhost:8000/docs → Swagger UI

### 7. Verificación manual rápida (Swagger)

#### 7.1 Login

`POST /api/auth/login`:

```json
{ "email": "admin@admin.com", "password": "admin123" }
```

Copia el `access_token`.

#### 7.2 Autorizar

Click en **Authorize** → pega `Bearer <tu_token>`.

#### 7.3 Listar empresas

`GET /api/auth/empresas` → debe listar La Fortuna con `id: 1`.

#### 7.4 Consultar el PUC

`GET /api/contabilidad/puc` con header `X-Empresa-Id: 1`. Ves ~167
cuentas.

#### 7.5 Calcular impuestos

`POST /api/impuestos/calcular` con header `X-Empresa-Id: 1`:

```json
{ "valor_total": "1190000", "tiene_iva": true, "aplica_retefuente": true }
```

Esperado: `valor_base=1000000`, `valor_iva=190000`,
`valor_retefuente=40000`, `valor_neto=1150000`.

### 8. Smoke test automatizado

Con el backend corriendo, en otra terminal:

```bash
conda activate fortuna-saas
cd backend
python smoke_test.py
```

Valida:

1. Login superadmin.
2. `/auth/me` y `/auth/empresas`.
3. PUC con cuentas clave (`511005`, `240810`, `236540`, `220505`).
4. Cálculo de impuestos IVA 19 % + retefuente 4 %.
5. Asiento manual con partida doble (DB = CR).
6. **Rechazo** 422 de asiento descuadrado.
7. Aprobación del asiento.
8. Libro mayor.
9. Balance de comprobación.

Salida esperada:

```
✓ TODOS LOS CHEQUEOS PASARON
```

### 9. Levantar el frontend SaaS

#### 9.1 Instalar dependencias

```bash
cd frontend
npm install
```

#### 9.2 Crear `.env` del frontend

Si todavía no creaste `frontend/.env`, hazlo ahora (ver
[Sección 4.2](#42-frontendenv--config-local-del-frontend-dev)):

```env
VITE_API_URL=http://localhost:8000
```

#### 9.3 Arrancar

```bash
npm run dev
```

Abre `http://localhost:5173/`.

#### 9.3 Rutas

**Públicas:**

- `/` → Landing page.
- `/login` → Iniciar sesión.
- `/register` → Wizard de 3 pasos (Firma → Usuario ADMIN → primera
  Empresa).

**Privadas (JWT válido):** todas bajo `/app/*`

Operación:

- `/app` → Dashboard.
- `/app/contratos`, `/app/facturas`, `/app/facturas/pendientes`,
  `/app/pagos`, `/app/oficinas`, `/app/proveedores`.
- `/app/reportes`, `/app/asistente-buscador`.

Contabilidad:

- `/app/puc`, `/app/asientos`, `/app/libro-mayor`, `/app/balance`,
  `/app/impuestos`.
- `/app/cuentas-bancarias`, `/app/conciliacion` (bancaria).

Cumplimiento DIAN:

- `/app/medios-magneticos` — Formatos 1001, 1007, 1008 (información exógena).
- `/app/conciliacion-dian` — cross-check factura electrónica DIAN + IVA Estratégico.

Administración:

- `/app/integraciones` — OAuth Gmail + Outlook + Gemini + webhook n8n.
- `/app/mi-equipo` — invitación de usuarios (solo rol **ADMIN**).
- `/app/auditoria` — audit log (solo rol **ADMIN**).
- `/app/seguridad` — configuración de 2FA (TOTP) del usuario actual.

#### 9.4 Flujo de uso

1. **Login como superadmin** → `admin@admin.com / admin123`.
2. **Sidebar** → selector de empresa activa en la parte inferior.
3. **Registro nuevo** → `/register` → wizard → JWT emitido → `/app`.
4. **Mi Equipo** → invitar usuarios con rol específico.
5. **Cambiar empresa** → todas las requests siguientes llevan el
   header `X-Empresa-Id` actualizado.

#### 9.5 Autenticación en el frontend

- `POST /api/auth/login` devuelve `access_token` + `refresh_token` +
  `empresas[]`.
- Se guarda en `localStorage` bajo `fortuna.*`.
- `fetchInterceptor.ts` inyecta automáticamente
  `Authorization: Bearer <token>` y `X-Empresa-Id: <id>`.
- En 401, el interceptor limpia sesión y React Router redirige a
  `/login`.
- Rutas `/app/*` envueltas en `<ProtectedRoute>`.

### 10. Resetear todo (limpieza)

```bash
# 1. Matar el backend (Ctrl+C)

# 2. Recrear la base
psql -U postgres -c "DROP DATABASE IF EXISTS supplier_db;"
psql -U postgres -c "CREATE DATABASE supplier_db;"

# 3. Relanzar — el lifespan recreará todo
python main.py
```

Recargar PUC de una empresa existente sin borrar datos:

```bash
python populate_puc.py 1     # empresa_id = 1
```

### 11. Troubleshooting

#### "asyncpg not found" / error de conexión

- `pg_isready` para verificar PostgreSQL.
- Prefijo del URL: `postgresql+asyncpg://`, **no** `postgresql://`.

#### "bcrypt version error"

```bash
pip install --upgrade "bcrypt==4.0.1" "passlib[bcrypt]"
```

#### "Table already exists" en primer arranque

La base tiene tablas viejas. Ejecuta la migración:

```bash
psql -U postgres -d supplier_db -f backend/migrations/001_saas_multitenant.sql
```

O usa el reset de la sección 10.

#### CORS / el frontend no se conecta

Agrega al `.env`:

```env
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

Reinicia el backend.

#### El smoke test falla en "asiento descuadrado"

Si responde 200 en vez de 422:

- `schemas_contabilidad.py` debe tener `@field_validator("lineas")`.
- Verifica que no haya un `schemas_contabilidad.py.bak` sombra.

---

## Despliegue en producción

El proyecto trae `apache_config_production.conf` listo.

1. En la VM, actualizar a la rama `saas-multitenant` y correr la
   migración SQL (sección 5).
2. En `.env`, mantener `API_KEY` igual al valor legado (para no romper
   el n8n existente).
3. El `systemd`/script que lanza Uvicorn apunta a `main:application`.
4. Reiniciar backend + Apache.

> `apache_config_production.conf` **no requiere cambios**: el reverse
> proxy sigue exponiendo `/api/` al backend.

---

## Seguridad

Ver [`SECURITY.md`](./SECURITY.md) para el modelo de amenazas, controles
implementados y checklist pre-producción. Puntos clave:

- **Guard de arranque**: si `PRODUCTION_MODE=True` y detecta credenciales por
  defecto (JWT_SECRET_KEY genérica, SUPERADMIN_PASSWORD débil, FERNET_KEY
  vacía), el backend **aborta** con `RuntimeError` en el lifespan. Mejor
  romper el deploy que servir con defaults.
- **Security headers**: `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` en todas las respuestas.
  `Strict-Transport-Security` solo cuando `PRODUCTION_MODE=True`.
- **Signed URLs para PDFs**: rutas públicas (que el navegador abre inline)
  se protegen con tokens HMAC firmados (`?t=<token>`) que atan
  `(empresa_id, resource_id, exp)` a la firma con la `JWT_SECRET_KEY`.
- **Contraseñas del portal DIAN NO se persisten**: para métodos que las
  requieren (Administrador, Usuario Autorizado) viajan en memoria del
  thread de Playwright y se descartan tras el login. Solo se guarda la
  sesión encriptada.
- **Rate limiter con IP real**: el header `X-Forwarded-For` solo se
  respeta si viene de un proxy listado en `TRUSTED_PROXIES`. Sin eso,
  cualquiera podría saltar el límite spoofeando el header.
- **Bcrypt cost 13** — ~500ms/hash en 2026 hardware.

Antes de un deploy productivo:

1. Genera secrets con:
   ```bash
   python -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_urlsafe(64))"
   python -c "from cryptography.fernet import Fernet; print('FERNET_KEY=' + Fernet.generate_key().decode())"
   ```
2. Setea `PRODUCTION_MODE=True` y `DEBUG=False` en el `.env`.
3. Cambia `SUPERADMIN_PASSWORD` a una passphrase ≥ 16 chars.
4. Rota la password de PostgreSQL.
5. Setea `TRUSTED_PROXIES=<ip-nginx>` si corres detrás de reverse proxy.
6. Cuando el frontend esté migrado a `?t=` (signed URLs), activa
   `REQUIRE_SIGNED_PDF_URLS=True`.

---

## Autenticación — JWT y API Key

`AuthDualMiddleware` acepta tres formas:

1. **JWT Bearer** (frontend):

   ```
   Authorization: Bearer eyJhbGciOiJ...
   ```

2. **X-API-Key por empresa** (n8n / integraciones):

   ```
   X-API-Key: 550e8400-e29b-41d4-a716-446655440000
   ```

   Cada `Empresa` tiene su UUID rotable en
   `POST /api/empresas/{id}/rotate-api-key`.

3. **X-API-Key global (legado)**: definido en `.env` como `API_KEY`.
   Cae sobre la empresa por defecto con rol ADMIN.

### Endpoints de auth

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Registra Firma + primer admin + empresa opcional |
| POST | `/api/auth/login` | email + password → access + refresh |
| POST | `/api/auth/refresh` | Renueva access token |
| GET | `/api/auth/me` | Usuario actual |
| GET | `/api/auth/empresas` | Empresas accesibles |

### Header `X-Empresa-Id`

Para endpoints dependientes de tenant, el frontend envía además:

```
X-Empresa-Id: 3
```

Si el usuario no tiene acceso a esa empresa → HTTP 403.

---

## Estructura del repositorio

```
facturacion_fortuna/
├── backend/
│   ├── core/
│   │   ├── config.py              # Settings + enforce_production_readiness()
│   │   ├── security.py            # JWT + bcrypt cost 13
│   │   └── dependencies.py        # get_current_user, get_current_empresa, require_role
│   ├── middleware/
│   │   ├── auth_dual.py           # JWT + X-API-Key (ASGI puro, regex estricto para public routes)
│   │   ├── security_headers.py    # X-Frame, X-Content-Type, Referrer, Permissions, HSTS
│   │   └── rate_limiter.py        # Rate-limit para auth
│   ├── migrations/                # 001 → 011 (ver sección 5)
│   ├── routers/
│   │   ├── auth.py                # login / register / refresh / me + rate limit
│   │   ├── empresas.py            # CRUD tenants + rotate-api-key
│   │   ├── usuarios.py            # Admin de usuarios + roles
│   │   ├── contabilidad.py        # PUC, periodos, asientos, libro mayor, balance
│   │   ├── impuestos.py           # IVA / Retefuente / ReteIVA / ReteICA (UVT 2026)
│   │   ├── bancario.py            # Extractos + conciliación bancaria
│   │   ├── dian.py                # Medios Magnéticos 1001/1007/1008
│   │   ├── dian_conciliacion.py   # Conciliación DIAN electrónica + IVA Estratégico
│   │   ├── oauth.py               # OAuth Gmail + Outlook (multi-tenant)
│   │   ├── contracts.py           # PDFs con signed URLs + path traversal defense
│   │   ├── facturas.py, pagos.py, proveedores.py, oficinas.py, reportes.py, ...
│   ├── services/
│   │   ├── causacion.py           # Asientos automáticos al aprobar factura
│   │   ├── pago.py                # Asiento pago + documento NB01 (MANAMED)
│   │   ├── impuestos.py           # Motor de retenciones
│   │   ├── credentials_encryption.py  # Fernet encrypt_str/decrypt_str
│   │   ├── signed_urls.py         # HMAC PDF tokens
│   │   ├── google_oauth.py        # Google OAuth + Gmail flow
│   │   ├── microsoft_oauth.py     # Microsoft OAuth + Graph flow
│   │   ├── gemini.py              # Google Gemini AI Studio
│   │   ├── dian_sync.py           # Playwright multi-método + thread ProactorEventLoop
│   │   ├── dian_conciliacion.py   # Match facturas ↔ documentos DIAN
│   │   ├── dian_analisis_iva.py   # Dashboard IVA Estratégico
│   │   └── dian_admin/            # Subpaquete portal DIAN (auth, documentos, exportar, iva)
│   ├── models.py                  # Modelos negocio (con empresa_id)
│   ├── models_tenant.py           # Firma, Empresa (con OAuth + DIAN fields), Usuario, UsuarioEmpresa
│   ├── models_contabilidad.py     # PUC, Asientos, Extractos, Transacciones, Reglas
│   ├── models_impuestos.py        # Configuración de impuestos por empresa
│   ├── models_dian.py             # DocumentoDian + DianSyncJob
│   ├── schemas*.py                # Pydantic schemas (auth, dian, contabilidad, ...)
│   ├── populate_puc.py            # PUC Decreto 2649/2650 ~167 cuentas
│   ├── smoke_test.py              # Test end-to-end
│   ├── main.py                    # App + lifespan (seed + guard prod + backfill)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── auth/                  # JWT store, ProtectedRoute, PublicRoute
│   │   ├── components/            # Sidebar, modales, selectores
│   │   ├── pages/                 # 23 páginas (ver sección 9.3)
│   │   ├── utils/
│   │   │   ├── apiClient.ts       # apiGet/apiPost/apiPut/apiDelete tipados
│   │   │   ├── fetchInterceptor.ts # Inyección JWT + X-Empresa-Id
│   │   │   └── format.ts          # formatCOP + helpers
│   │   ├── types/                 # Tipos compartidos
│   │   └── App.tsx                # Router con lazy() + Suspense
│   ├── vite.config.ts
│   └── package.json
├── n8n/                           # Workflow único consolidado + README de integración
│   ├── workflow_facturacion_saas.json  # 3 sub-flujos: procesar-factura + buscar + procesar-adjunto
│   └── README_INTEGRACION.md
├── apache_config_production.conf  # Reverse proxy HTTPS
├── SECURITY.md                    # Auditoría de seguridad + checklist pre-producción
├── SETUP_N8N.md                   # Guía end-to-end del setup de n8n + OAuth
├── DEPLOYMENT_LOCAL.md            # Versión extendida del despliegue
└── README.md                      # ← este archivo
```

---

## Soporte y contribución

- Issues: abre uno en GitHub.
- Rama activa: `saas-multitenant`.
- Convención de commits: **Conventional Commits 1.0.0**
  (`feat:`, `fix:`, `docs:`, `perf:`, `refactor:`, `test:`, `chore:`).
