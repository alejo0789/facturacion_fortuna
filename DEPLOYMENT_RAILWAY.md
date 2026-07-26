# Despliegue en Railway — paso a paso

Guía completa para poner Facturación SaaS en producción usando **Railway**
(https://railway.com/), con:

- **Backend** FastAPI + Playwright en un contenedor Docker.
- **Frontend** React/Vite build estático servido por nginx.
- **PostgreSQL** managed por Railway.
- **n8n** ya existente en tu cuenta (solo enlazar).
- **Volumen persistente** para uploads de facturas.

Tiempo estimado: **60–90 minutos** el primer despliegue. Los siguientes son
automáticos con cada push a `saas-multitenant`.

---

## Índice

1. [Arquitectura del deploy](#1-arquitectura-del-deploy)
2. [Pre-requisitos](#2-pre-requisitos)
3. [Generar secretos aleatorios](#3-generar-secretos-aleatorios)
4. [Crear el proyecto en Railway](#4-crear-el-proyecto-en-railway)
5. [Servicio 1 — PostgreSQL](#5-servicio-1--postgresql)
6. [Servicio 2 — Backend](#6-servicio-2--backend)
7. [Servicio 3 — Frontend](#7-servicio-3--frontend)
8. [Servicio 4 — n8n (ya existe: enlazar)](#8-servicio-4--n8n)
9. [Configurar dominios](#9-configurar-dominios)
10. [Primera verificación](#10-primera-verificación)
11. [OAuth Gmail/Outlook y Gemini (opcionales)](#11-oauth-gmailoutlook-y-gemini-opcionales)
12. [Playwright en Railway — verificar Chromium](#12-playwright-en-railway--verificar-chromium)
13. [Automatización: deploys en cada push](#13-automatización-deploys-en-cada-push)
14. [Backups + observabilidad](#14-backups--observabilidad)
15. [Troubleshooting común](#15-troubleshooting-común)

---

## 1. Arquitectura del deploy

```
                       ┌──────────────────────────────────────────┐
   Cliente HTTPS  →    │  Frontend nginx  (React SPA)             │
                       │  https://<frontend>.up.railway.app       │
                       └──────────────────┬───────────────────────┘
                                          │  fetch API + JWT
                                          ▼
                       ┌──────────────────────────────────────────┐
                       │  Backend FastAPI + Playwright            │
                       │  https://<backend>.up.railway.app        │
                       └──────┬────────────────────┬──────────────┘
                              │                    │
                              ▼                    ▼
                    ┌──────────────────┐   ┌──────────────────┐
                    │ PostgreSQL       │   │ n8n (existente)  │
                    │ (Railway)        │   │ https://n8n....  │
                    └──────────────────┘   └──────────────────┘
                              ▲
                              │  Volume persistente
                    ┌──────────────────┐
                    │ /app/storage     │
                    │ (facturas PDFs)  │
                    └──────────────────┘
```

**4 servicios** en un solo Project de Railway:

| Servicio | Rol | Tipo |
|---|---|---|
| `postgres` | Base de datos | Railway managed |
| `backend` | FastAPI + Playwright | Docker (nuestro `backend/Dockerfile`) |
| `frontend` | React SPA con nginx | Docker (nuestro `frontend/Dockerfile`) |
| `n8n` | Automatización | Ya existe — solo enlazamos URLs |

Todos en la misma **private network** (Railway lo pone gratis).

---

## 2. Pre-requisitos

- [ ] Cuenta en https://railway.com/ con tu equipo.
- [ ] Rama `saas-multitenant` pusheada al remoto GitHub.
- [ ] Los 4 archivos siguientes existen en el repo (los creamos en esta pasada):
  - `backend/Dockerfile`
  - `backend/.dockerignore`
  - `frontend/Dockerfile`
  - `frontend/nginx.conf`
  - `frontend/.dockerignore`
- [ ] Acceso a tu instancia n8n actual (URL + credenciales).
- [ ] Un **dominio propio** (opcional pero recomendado — Railway te da subdominios `*.up.railway.app` que sirven mientras).

**Herramientas locales opcionales**:

- [Railway CLI](https://docs.railway.app/develop/cli) — útil para debug, pero
  no obligatoria. Instálala con:
  ```bash
  npm i -g @railway/cli
  railway login
  ```

---

## 3. Generar secretos aleatorios

Antes de tocar Railway, genera los 3 secretos que necesitas y guárdalos en un
gestor de contraseñas (1Password, Bitwarden, LastPass). **No los pongas en el
repo ni los pegues en Slack/email**.

```bash
# JWT_SECRET_KEY — firma los tokens de sesión
python -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_urlsafe(64))"

# FERNET_KEY — encripta OAuth tokens, credenciales DIAN, etc.
python -c "from cryptography.fernet import Fernet; print('FERNET_KEY=' + Fernet.generate_key().decode())"

# SUPERADMIN_PASSWORD — cuenta admin inicial. Usa una passphrase larga:
python -c "import secrets; import string; a=string.ascii_letters+string.digits+'!@#$%^&*'; print('SUPERADMIN_PASSWORD=' + ''.join(secrets.choice(a) for _ in range(20)))"
```

También guarda:

- Tu **SUPERADMIN_EMAIL** (ej. `admin@tuempresa.com`).
- El **password de PostgreSQL** que Railway te dará.

---

## 4. Crear el proyecto en Railway

1. Login en https://railway.com/dashboard.
2. Click **New Project** → **Empty Project**.
3. Nombre: `facturacion-saas` (o el que prefieras).
4. Deja el project vacío por ahora — vamos a agregar servicios uno por uno.

Alternativa más rápida si prefieres el CLI:
```bash
railway init
# → Create new project → nombre → selecciona el team
```

---

## 5. Servicio 1 — PostgreSQL

### 5.1 Provisionar

En tu project:
1. Click **+ New** → **Database** → **Add PostgreSQL**.
2. Railway crea el servicio `Postgres` en ~30s.
3. Click el servicio → tab **Variables**. Ves:
   - `PGDATABASE`, `PGHOST`, `PGPASSWORD`, `PGPORT`, `PGUSER`
   - `DATABASE_URL` (con formato `postgresql://user:pass@host:port/dbname`)
   - `DATABASE_PUBLIC_URL` (mismo pero con host público)

### 5.2 Referenciar la BD desde el backend (más adelante)

Cuando configures el backend, en vez de copiar el valor de `DATABASE_URL`,
usa una **referencia** que Railway resuelve automáticamente:

```
${{Postgres.DATABASE_URL}}
```

Ventaja: si Railway rota la contraseña de la BD, el backend la toma sola. No
tienes que actualizar dos variables.

> ℹ️ Nuestra app convierte automáticamente `postgresql://` → `postgresql+asyncpg://`
> (ver `backend/core/config.py` — validador `_normalize_database_url`). Railway
> provee el primero, asyncpg necesita el segundo.

### 5.3 (Recomendado) Habilitar backups automáticos

En el servicio Postgres → tab **Settings** → **Backups** → schedule diario.
Retención 7 días es un buen default.

---

## 6. Servicio 2 — Backend

### 6.1 Crear el servicio

1. En el project: **+ New** → **GitHub Repo**.
2. Autoriza acceso a tu repo `facturacion_fortuna` si no lo hiciste antes.
3. Selecciona el repo.
4. Railway detecta el `Dockerfile` — te preguntará qué build usar. Selecciona
   **Dockerfile**.
5. Nombre del servicio: `backend`.

### 6.2 Configurar el build

En **Settings** del servicio backend:

| Campo | Valor |
|---|---|
| **Branch** | `saas-multitenant` |
| **Root Directory** | `backend` |
| **Watch Paths** | `backend/**` |
| **Builder** | `Dockerfile` (detección automática) |
| **Dockerfile Path** | `Dockerfile` (relativo al root directory) |

**Watch Paths** = Railway solo redespliega el backend si cambian archivos en
`backend/**`. Sin esto, cualquier commit dispararía redeploys innecesarios.

### 6.3 Variables de entorno del backend

Tab **Variables** del servicio backend → **New Variable** (o **Raw Editor** si
prefieres pegarlas todas):

```bash
# ----- Base de datos (referencia al servicio Postgres) -----
DATABASE_URL=${{Postgres.DATABASE_URL}}

# ----- JWT + Fernet (secretos generados en el paso 3) -----
JWT_SECRET_KEY=<pega el que generaste>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
FERNET_KEY=<pega el que generaste>

# ----- Superadmin inicial -----
SUPERADMIN_EMAIL=admin@tuempresa.com
SUPERADMIN_PASSWORD=<pega el que generaste>

# ----- Empresa y firma por defecto (se crean al arrancar) -----
DEFAULT_FIRMA_NOMBRE=Tu Firma Contable
DEFAULT_FIRMA_NIT=900000000-0
DEFAULT_EMPRESA_NOMBRE=Tu Empresa Demo
DEFAULT_EMPRESA_NIT=900000000-0

# ----- Producción endurecida -----
PRODUCTION_MODE=True
DEBUG=False
REQUIRE_SIGNED_PDF_URLS=True
AV_SCAN_ENABLED=True

# Railway está detrás de su edge; confía en X-Forwarded-For.
# Los deploys en Railway ven al cliente vía proxy interno.
TRUSTED_PROXIES=10.0.0.0/8,172.16.0.0/12,127.0.0.1

# ----- Seguridad de login -----
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
MIN_PASSWORD_LENGTH=12

# ----- Conciliación DIAN -----
# En producción Linux headless, Chromium arranca sin display.
DIAN_HEADLESS=True

# ----- CORS: URL del frontend Railway (la sabrás tras crear el servicio) -----
# Placeholder — actualizar tras el paso 7.
CORS_ORIGINS=https://facturacion-frontend.up.railway.app
```

**No configures OAuth ni Gemini todavía** — esos van en el paso 11.

### 6.4 Volumen persistente para uploads

Los contenedores de Railway tienen filesystem **efímero** — si redespliegas
el backend, los PDFs subidos se pierden. Solución: montar un volume.

**En la UI actual de Railway** (finales 2025+) los Volumes se crean desde el
canvas del project, NO desde Settings del servicio:

1. Vuelve al **Project view** (vista con los cuadros de servicios).
2. Click **`+ Add`** o **`+ Create`** arriba a la derecha (junto a `Deploy`).
3. En el menú → **Volume**.
4. Selecciona a qué servicio adjuntarlo → `backend` (o el nombre que le
   diste, ej. `facturacion_fortuna`).
5. Configura:
   - **Mount Path**: `/app/storage`
   - **Region**: **la misma región que el servicio backend** (para latencia
     baja — Railway te la sugiere por default).
   - **Size**: 10GB (ajustable después, empieza pequeño; se cobra por lo asignado).
   - **Name**: Railway lo autogenera como `<servicio>-volume` — está bien así.

Al confirmar:
- El volume aparece como un pequeño chip debajo del servicio backend en el
  canvas (ícono de disco + nombre).
- Se abre la vista del volume con tabs **Metrics** y **Settings** — desde ahí
  puedes cambiar mount path, tamaño y ver uso.

Ahora en las **Variables del backend** añade:

```
STORAGE_PATH=/app/storage/facturas
TEMPORAL_FILES_PATH=/app/storage/temp
```

**Eso es todo.** No hay que configurar `storage_path` por-empresa a mano —
el helper `services/storage_paths.resolve_storage_path()` deriva
automáticamente `<STORAGE_PATH>/<empresa.id>` para cada tenant. Las
carpetas se crean solas al primer upload:

```
/app/storage/facturas/1/    ← Empresa La Fortuna
/app/storage/facturas/2/    ← Empresa Cliente X
/app/storage/facturas/3/    ← Empresa Cliente Y
...
```

Si algún tenant requiere un path especial (SMB share, /mnt propio, etc.),
se puede sobreescribir editando `empresas.storage_path` directamente en BD
o vía el panel Integraciones — pero es la excepción, no la regla.

> **Aplicar migración 014**: si vienes migrando desde una BD anterior
> (Postgres ya poblada con el default viejo `'./storage/facturas'`), corre
> `migrations/014_storage_paths_auto.sql` para que los tenants existentes
> pasen al modo auto-derivado. En Railway con Postgres fresco (creado en
> este deploy), no hace falta — `Base.metadata.create_all` ya usa el nuevo
> default `NULL`.

> ⚠️ Los volumes de Railway están vinculados a un solo servicio y **no
> escalan a múltiples réplicas**. Si más adelante escalas horizontalmente,
> migra a S3/R2/GCS. Ver sección [Backups + observabilidad](#14-backups--observabilidad).

> **UI variations**: si estás en una versión antigua del dashboard, el
> Volume puede aparecer directamente en `Settings → Volumes` del servicio,
> o al hacer click sobre el servicio en el canvas y ver un botón `+ Add Volume`
> en el panel lateral. El flujo del canvas (`+ Add` global) descrito arriba
> es el que funciona con la UI actual.

### 6.5 Health check

Tab **Settings** → sección **Health Check**:

- **Health Check Path**: `/`
- **Health Check Timeout**: 30s

El endpoint `/` de la app devuelve `{"message": "..."}` → 200 OK.

### 6.6 Exponer HTTPS público

Tab **Settings** → sección **Networking** → **Generate Domain**.

Railway te asigna algo como `facturacion-backend-production.up.railway.app`.

**Guarda esa URL** — la necesitas para CORS y para configurar el frontend.

### 6.7 Trigger el primer deploy

Con las variables listas, click **Deploy** (o push a `saas-multitenant` en
GitHub — auto-trigger).

Mira los logs en tiempo real:
- Build takes ~4–7 min la primera vez (descarga la imagen de Playwright).
- Luego arranca el uvicorn:
  ```
  INFO:     Uvicorn running on http://0.0.0.0:8080
  Seed: Firma por defecto creada (Tu Firma Contable)
  Seed: Empresa por defecto creada (id=1)
  Seed: superadmin creado (admin@tuempresa.com)
  ...
  ```
- Si sale `PRODUCTION_MODE=True pero la configuración tiene problemas`,
  **corrige las variables** — el guard aborta el arranque por diseño.

---

## 7. Servicio 3 — Frontend

### 7.1 Crear el servicio

1. Project → **+ New** → **GitHub Repo** → mismo repo.
2. Nombre: `frontend`.
3. **Settings**:
   - **Branch**: `saas-multitenant`
   - **Root Directory**: `frontend`
   - **Watch Paths**: `frontend/**`
   - **Builder**: `Dockerfile`

### 7.2 Variables de build

**Importante**: como Vite hornea `import.meta.env.VITE_*` en el bundle al
hacer build, estas variables se deben inyectar como **Build Args**, no como
runtime env. Nuestro Dockerfile ya está preparado.

**Railway auto-detecta variables** `VITE_*` en el código y las sugiere. Vas
a ver 3 en "Suggested Variables" — hay que decidir qué hacer con cada una:

| Variable sugerida | Acción | Por qué |
|---|---|---|
| `VITE_API_URL` | ✅ **Mantener** con la URL del backend | La que necesitas para que el frontend hable con la API |
| `VITE_API_KEY` | ⚠️ **Eliminar** (click la X) | Es `LEGACY_API_KEY` — solo se usaba con el n8n antiguo de La Fortuna. En Railway los usuarios se autentican por JWT normal. El placeholder por default es INSEGURO |
| `VITE_AUTHORIZED_EMAILS` | 🗑️ **Eliminar** (click la X) | Código muerto — no está referenciado en ningún lado del frontend actual. Vestigio de un feature descartado |

Configuración final — **solo estas 2 variables** en el frontend:

```bash
# URL del backend (la que copiaste en el paso 6.6). SIN slash al final —
# evita que otros callers hagan concat y generen `//api/`.
VITE_API_URL=https://facturacion-backend-production.up.railway.app

# Base path — en Railway se sirve en la raíz del dominio.
# CRÍTICA: sin esta variable el frontend usa `/facturacion_ia/` como base
# y las rutas dan 404. Es el default del vite.config.ts para el deploy
# Apache legacy.
VITE_BASE_PATH=/
```

Railway pasa esas variables automáticamente como build-args al Docker build
(gracias a `ARG VITE_API_URL` y `ARG VITE_BASE_PATH` en nuestro Dockerfile).

### 7.3 Exponer dominio + healthcheck

- **Networking** → **Generate Domain** → guarda la URL (ej.
  `facturacion-frontend-production.up.railway.app`).
- **Health Check Path**: `/health` (nuestra `nginx.conf` lo expone).

### 7.4 Actualizar CORS del backend

Vuelve al servicio backend → **Variables** → edita `CORS_ORIGINS`:

```
CORS_ORIGINS=https://facturacion-frontend-production.up.railway.app
```

Si vas a tener dominio custom (siguiente paso), añade también:
```
CORS_ORIGINS=https://facturacion-frontend-production.up.railway.app,https://app.tuempresa.com
```

Redespliega el backend (**Deploy** o push).

---

## 8. Servicio 4 — n8n dedicado (recomendado)

**Recomendación**: crear un servicio n8n **dentro del mismo project** en vez
de reusar uno de otro proyecto. Aislamiento operativo, private networking,
credenciales OAuth de clientes no mezcladas con otros proyectos del equipo.

Costo extra: ~$5-8/mes por el contenedor + volumen.

### 8.1 Generar secretos locales

Antes de tocar Railway, genera los 2 secretos que necesitas y guárdalos en
tu gestor de contraseñas. **Si pierdes `N8N_ENCRYPTION_KEY`, todas las
credenciales OAuth guardadas en n8n quedan inutilizables e irrecuperables.**

```powershell
# Password del panel n8n
python -c "import secrets, string; alfabeto = string.ascii_letters + string.digits + '!@#$%^&*'; print('N8N_BASIC_AUTH_PASSWORD=' + ''.join(secrets.choice(alfabeto) for _ in range(24)))"

# Encryption key (64 chars hex)
python -c "import secrets; print('N8N_ENCRYPTION_KEY=' + secrets.token_hex(32))"
```

### 8.2 Crear el servicio n8n

1. En el project → **+ Add** → **Docker Image**.
2. **Image Name**: `n8nio/n8n:latest`.
3. Nombre del servicio: `n8n`.
4. Mantén la misma **Region** que tu backend.

### 8.3 Adjuntar volumen

Mismo flow que el paso 6.4 (volume del backend):

1. Canvas del project → **+ Add** → **Volume**.
2. Adjuntar a `n8n`.
3. **Mount Path**: `/home/node/.n8n`
4. **Size**: 5 GB

### 8.4 Generar dominio (y copiarlo)

Servicio `n8n` → **Settings → Networking → Generate Domain**.

Railway te asigna algo como `n8n-production-e4a2.up.railway.app`.

**Cópialo — lo vas a pegar 3 veces en las variables.**

### 8.5 Configurar variables del n8n

Tab **Variables** → **Raw Editor** → pega:

```bash
# Auth básica del panel (protege el UI)
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<pega el generado en 8.1>

# Encriptación de credenciales internas de n8n
N8N_ENCRYPTION_KEY=<pega el generado en 8.1>

# Host y protocolo — el subdominio del paso 8.4
N8N_HOST=<subdominio-del-8.4>
N8N_PROTOCOL=https
N8N_PORT=5678
WEBHOOK_URL=https://<subdominio-del-8.4>/

# Timezone Colombia
GENERIC_TIMEZONE=America/Bogota
TZ=America/Bogota

# Ejecuciones — retención 7 días (evita que el volumen crezca sin control)
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168
```

**Save** → Railway redespliega el n8n con las variables. ~2 min.

### 8.6 Setup inicial de n8n

1. Abre `https://<tu-subdominio>.up.railway.app` en el navegador.
2. Prompt **Basic Auth** → user `admin`, password del 8.1.
3. Wizard **Setup Owner Account** — crea la cuenta owner con tu email real
   (distinta del basic auth; esta es la que administra los workflows).

### 8.7 Importar el workflow

1. Panel n8n → menú lateral **Workflows** → **Import from File**.
2. Sube `n8n/workflow_facturacion_saas.json` desde tu clon local del repo.
3. **Activa el workflow** (toggle arriba a la derecha).
4. Click en cada nodo webhook → tab **Node** → copia la **Production URL**:
   - **Webhook - Procesar Factura** → `/webhook/procesar-factura`
   - **Webhook - Buscar Facturas** → `/webhook/buscar-facturas`
   - **Webhook - Procesar Adjunto** → `/webhook/procesar-adjunto`

### 8.8 Enlazar al backend

Backend service → **Variables** → añade:

```bash
N8N_PROCESS_WEBHOOK_URL=https://<subdominio>/webhook/procesar-factura
N8N_SEARCH_WEBHOOK_URL=https://<subdominio>/webhook/buscar-facturas
N8N_PROCESS_EMAIL_WEBHOOK_URL=https://<subdominio>/webhook/procesar-adjunto
```

**Deploy** para que el backend recargue.

### Comunicación n8n → backend

n8n necesita saber la URL del backend para el callback. NO se configura
estáticamente — el backend inyecta `callback_url` en el payload que envía
al webhook, y los nodos HTTP Request lo leen con `{{$json.callback_url}}`.
Nada que hacer manual.

### Alternativa — reusar un n8n existente

Si prefieres saltarte 8.1-8.6 y usar un n8n que ya tenías corriendo (en
otro project de Railway o self-hosted):

- Salta directo a 8.7 (importar workflow) en tu n8n existente.
- Continúa con 8.8 con las URLs de ese n8n.

Trade-offs: más barato (no otro contenedor) pero acoplamiento entre
proyectos + latencia HTTP pública. Ver documento adjunto sobre esta
decisión en el chat de deploy.

---

## 9. Configurar dominios (opcional pero recomendado)

Los subdominios `*.up.railway.app` funcionan pero:
- Son largos y feos.
- Cambian si renombras el servicio.
- El plan Free tiene rate limits en esos subdominios.

### Dominio custom en 3 pasos

Para cada servicio (backend + frontend):

1. **Networking** → **Custom Domain** → añade el nombre (ej. `api.tuempresa.com`
   para el backend, `app.tuempresa.com` para el frontend).
2. Railway te da un **CNAME target** (ej. `abc123.up.railway.app`).
3. En tu proveedor DNS (Cloudflare, Route 53, Namecheap…):
   - Crea un registro **CNAME** apuntando al target de Railway.
   - Deshabilita el proxy de Cloudflare (nube gris, no naranja) al principio
     — evita conflictos SSL. Puedes activarlo después.

Certificate SSL se renueva automáticamente (Let's Encrypt).

**Actualiza CORS y `VITE_API_URL`** tras cambiar dominios (paso 6.3 y 7.2).

---

## 10. Primera verificación

Con backend + frontend + Postgres arriba, abre en el navegador:

```
https://<frontend-url>/login
```

Login como superadmin con:
- `SUPERADMIN_EMAIL` (el que pusiste en variables)
- `SUPERADMIN_PASSWORD` (el que generaste)

Debes ver la landing autenticada con:
- Sidebar completo (todos los módulos).
- Empresa activa: la default que configuraste en `DEFAULT_EMPRESA_*`.
- 23 páginas navegables.

### Smoke checks manuales

1. **`/app/puc`** → 167 cuentas del PUC cargadas.
2. **`/app/impuestos`** → tarifas 2026 visibles.
3. **`/app/seguridad`** → activa 2FA para tu cuenta admin **primera cosa**.
4. **`/app/auditoria`** → debe haber ya varias entradas (`auth.login`, `auth.2fa_enabled`, etc.).

### Verificar el guard de producción

Los logs del backend deben mostrar (al inicio):

```
Seed: Firma por defecto creada
Seed: Empresa por defecto creada (id=1)
Seed: superadmin creado
...
```

**Sin ningún warning** de "JWT_SECRET_KEY está en su valor por defecto" —
si sale, es que olvidaste una variable.

---

## 11. OAuth Gmail/Outlook y Gemini (opcionales)

Solo si vas a usar la captura automática por correo.

### 11.1 Registrar la app OAuth Google (Gmail)

Ver [`SETUP_N8N.md`](./SETUP_N8N.md) sección 1.5 para el paso a paso completo
en Google Cloud Console. Al terminar tendrás Client ID + Secret + Redirect URI.

**Redirect URI**: debe ser exactamente
`https://<backend-url>/api/oauth/gmail/callback` (con la URL de tu backend
Railway o el dominio custom).

Variables Railway backend:

```bash
GOOGLE_OAUTH_CLIENT_ID=<client-id>.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=<secret>
GOOGLE_OAUTH_REDIRECT_URI=https://api.tuempresa.com/api/oauth/gmail/callback
```

### 11.2 Registrar la app OAuth Microsoft (Outlook)

Ver [`SETUP_N8N.md`](./SETUP_N8N.md) sección 1.4 para Azure Portal.

**Redirect URI**: `https://api.tuempresa.com/api/oauth/outlook/callback`.

Variables Railway backend:

```bash
MICROSOFT_OAUTH_CLIENT_ID=<client-id>
MICROSOFT_OAUTH_CLIENT_SECRET=<secret>
MICROSOFT_OAUTH_REDIRECT_URI=https://api.tuempresa.com/api/oauth/outlook/callback
MICROSOFT_OAUTH_TENANT_ID=common
```

### 11.3 Gemini (Google AI Studio)

Genera una API key en https://aistudio.google.com/apikey.

Variable Railway backend:

```bash
GEMINI_API_KEY_GLOBAL=<tu-api-key>
```

Redespliega el backend después de añadir cualquier bloque de estas.

---

## 12. Playwright en Railway — verificar Chromium

Nuestro `backend/Dockerfile` usa `mcr.microsoft.com/playwright/python:v1.48.0-jammy`
que trae Chromium preinstalado, así que no requieres pasos adicionales.

### Test rápido de que Playwright arranca

En la app, ve a **`/app/conciliacion-dian`** → tab **Sincronizar** →
**Cargar datos de prueba** (con `DEBUG=False` esto está deshabilitado — para
probar activa temporalmente `DEBUG=True`, prueba, y vuelve a `False`).

Alternativa sin `DEBUG=True`: dispara un sync real con tu cédula DIAN. Chromium
arranca en headless (no ves ventana). Si el job pasa a `pending_magic_link`,
Playwright arrancó correctamente. Si falla con `NotImplementedError` o
`BrowserType.launch: Executable doesn't exist`, la imagen de Playwright no
cargó — revisa que el Dockerfile use la imagen correcta.

### DIAN_HEADLESS en producción

Ya está en `True` en las variables — Chromium no requiere display server.

---

## 13. Automatización: deploys en cada push

Con la configuración anterior, **cada push a `saas-multitenant`** dispara:

1. Railway detecta el push a la rama que sigue el servicio.
2. Chequea `Watch Paths` — solo despliega el servicio afectado.
3. Ejecuta el build del Dockerfile.
4. Al terminar, hace un **cutover atómico** — el tráfico va al nuevo container
   solo cuando el health check pasa.
5. Si el health check falla, el deploy se cancela y sigues sirviendo la
   versión anterior.

### Rollback manual

Servicio → tab **Deployments** → click el deploy previo → **Redeploy**.

### Preview environments (opcional, plan Pro)

Railway puede crear un environment por cada PR de GitHub. Útil para QA.
Habilitar en **Settings** → **Environments** → **Preview Environments**.

---

## 14. Backups + observabilidad

### Backups de Postgres

Ya cubierto en 5.3. Adicionalmente, para backup fuera de Railway:

```bash
# Via Railway CLI (dump remoto → local)
railway run --service postgres pg_dump -Fc > backup_$(date +%Y%m%d).dump
```

Encripta antes de subir a S3/Google Drive:
```bash
gpg --symmetric --cipher-algo AES256 backup_20260718.dump
```

### Backups de uploads (Volume)

Los volumes de Railway **no se backupean automáticamente**. Opciones:

- **Manual**: `railway run --service backend tar czf /tmp/uploads.tgz /app/storage`
  → descargar → subir a S3/Drive.
- **Automático**: script en cron que corre `pg_dump + tar` + upload a S3.
- **Alternativa robusta**: migrar de Volume a **Cloudflare R2** (S3-compat,
  10GB gratis, mucho más resiliente). Cambio de código pequeño en
  `services/integraciones_n8n.py`.

### Métricas

Railway muestra CPU/RAM/red por servicio en el tab **Metrics**. Suficiente
para MVP. Para producción seria integrar con Sentry (backend + frontend) —
`pip install sentry-sdk[fastapi]`.

### Logs

- Cada servicio → tab **Deployments** → click un deploy → **View Logs**.
- CLI: `railway logs --service backend --tail 100`.

Los `logger.info()`/`logger.warning()` del backend y los `console.log` del
frontend nginx aparecen aquí.

---

## 15. Troubleshooting común

### `PRODUCTION_MODE=True pero la configuración tiene problemas de seguridad`

El backend aborta con lista específica. Cada línea dice qué falta:
- `JWT_SECRET_KEY tiene el valor por defecto` → genera y setea la variable.
- `FERNET_KEY no configurada` → idem.
- `SUPERADMIN_PASSWORD es débil` → cambia a passphrase ≥12 chars.

**Es la protección diseñada** — no lo desactives, corrige el `.env`.

### `Error: could not translate host name "postgres.railway.internal"`

El servicio backend no está en el mismo project que el Postgres, o la
variable `DATABASE_URL` no usa la referencia `${{Postgres.DATABASE_URL}}`.
Fix: en las variables del backend, cambia `DATABASE_URL` para que sea la
referencia (Railway resuelve internamente).

### `CORS: origin not allowed`

`CORS_ORIGINS` del backend no incluye la URL del frontend. Añádela.
Recuerda: sin espacios, separado por comas, con `https://`.

### `NotImplementedError` o `Executable doesn't exist` en Playwright

La imagen Docker no es la de Playwright. Verifica en `backend/Dockerfile`
que la primera línea sea `FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy`.

### Frontend en blanco / rutas /app/* dan 404 en refresh

Probablemente `VITE_BASE_PATH=/` no está seteado en el frontend, o `nginx.conf`
no está incluido en el Dockerfile. Verifica los logs del deploy frontend
(el `try_files ... /index.html` debe aparecer en la config nginx).

### Los uploads desaparecen tras redeploy

No configuraste el Volume, o `STORAGE_PATH` apunta a un path fuera del mount
point. Verifica que `/app/storage` esté montado como Volume y que
`storage_path` de la empresa apunte adentro.

### Backend arranca pero devuelve 401 a todo

Puede ser la migración `token_blacklist` o el jti nuevo. Revisa logs de
arranque — debe decir `Seed: superadmin creado`. Si aparece pero login sigue
fallando, verifica que el password del `.env` coincide EXACTAMENTE con lo que
tipeas (sin espacios ocultos).

### Rate limiter demasiado agresivo

Con múltiples usuarios detrás del mismo NAT/oficina, todos pueden compartir
IP y saturar el bucket. Ajusta `MAX_LOGIN_ATTEMPTS` a un valor más alto en
las variables Railway (default 5).

### Playwright timeout al abrir el portal DIAN

Cloudflare Turnstile puede bloquear a IPs de datacenter (Railway usa AWS/GCP).
Si notas esto seguido, la solución larga es usar un residential proxy o
correr Playwright en un servidor dedicado con IP residencial.

---

## Checklist final antes de anunciar el deploy

- [ ] `PRODUCTION_MODE=True` en backend.
- [ ] `DEBUG=False`.
- [ ] Los 3 secretos rotados vs los defaults (JWT, Fernet, SUPERADMIN_PASSWORD).
- [ ] 2FA activo en la cuenta superadmin.
- [ ] `CORS_ORIGINS` con el dominio real del frontend.
- [ ] Volume montado + `STORAGE_PATH` configurado.
- [ ] Backup diario de Postgres habilitado.
- [ ] Dominios custom con HTTPS (Let's Encrypt verificado).
- [ ] Redirect URIs de OAuth apuntan al dominio de producción.
- [ ] N8N webhook URLs configuradas y probadas end-to-end.
- [ ] `/app/auditoria` muestra el `auth.login` del superadmin.
- [ ] Un usuario adicional (no admin) creado y probado.

Después de esto, comparte la URL del frontend con tu equipo. Cada push a
`saas-multitenant` despliega en producción automáticamente. Si necesitas
un ambiente separado para QA, crea un environment nuevo en Railway y linkéalo
a otra rama (ej. `staging`).

---

## Costos aproximados (referencia)

Plan **Hobby** de Railway (~$5/mes en crédito, buena para MVP):

| Servicio | RAM | Estimado /mes |
|---|---|---|
| Postgres | 512MB | $2–3 |
| Backend (Playwright) | 1GB | $8–12 |
| Frontend nginx | 256MB | $1–2 |
| n8n | 512MB | $3–5 |
| Volume 10GB | — | $2.5 |
| **Total** | | **$16–25** |

Plan **Pro** ($20/mes fijo + uso) escala mejor y da autoscaling, replicas,
preview environments.

Playwright en producción es lo más caro (Chromium consume ~500–800MB). Si el
uso de DIAN es esporádico, puedes:

- Mantener el backend delgado (sin Playwright).
- Meter Playwright en un servicio worker separado que arranque bajo demanda
  (cambio de arquitectura, no MVP).
