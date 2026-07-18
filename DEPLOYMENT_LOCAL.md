# Despliegue local — Manual de prueba

Guía paso a paso para probar el backend SaaS multi-tenant (rama `saas-multitenant`) en tu computador, usando **Anaconda** + **PostgreSQL** + **Uvicorn**.

Al final de la guía habrás:

1. Creado un entorno Python aislado con Anaconda.
2. Creado una base PostgreSQL limpia.
3. Levantado el backend en `http://localhost:8000`.
4. Verificado la carga automática del PUC, configuración de impuestos y superadmin.
5. Ejecutado un test de humo end-to-end (`smoke_test.py`).
6. (Opcional) Levantado el frontend React.

---

## 0. Pre-requisitos

- **Windows 10/11**, macOS o Linux.
- **Anaconda** o **Miniconda** instalado.
  Descarga: https://www.anaconda.com/download
- **PostgreSQL 14+** corriendo localmente.
  Descarga: https://www.postgresql.org/download/
- **Git** con la rama `saas-multitenant` ya chequeada.
- **Node.js 18+** (solo si vas a probar el frontend).

Verifica que todo esté instalado:

```bash
conda --version
psql --version
git --version
node --version   # opcional
```

**Opcionales según qué módulos vayas a probar:**

- **Playwright + Chromium** para el módulo Conciliación DIAN. Se instala
  junto con `pip install -r requirements.txt`, pero necesitas descargar el
  browser una vez:

  ```bash
  cd backend
  playwright install chromium
  ```

  En Windows, además, requiere que el backend use `WindowsProactorEventLoopPolicy`
  (ya configurado en `main.py`). Sin esto, `chromium.launch()` falla con
  `NotImplementedError`.

- **n8n 1.60+** para automatización de correo (opcional). Setup completo
  en [`SETUP_N8N.md`](./SETUP_N8N.md).

---

## 1. Clonar / actualizar el repo y cambiar a la rama

Si ya tienes el repo clonado, solo cambia a la rama:

```bash
cd "C:\Users\dammi\Documents\Empresas\Movaiti\Proyecto Facturación - Reestructurado\facturacion_fortuna"
git fetch origin
git checkout saas-multitenant
git pull origin saas-multitenant
```

Si es clonado fresco:

```bash
git clone https://github.com/alejo0789/facturacion_fortuna.git
cd facturacion_fortuna
git checkout saas-multitenant
```

---

## 2. Crear el entorno Anaconda

Desde la raíz del proyecto:

```bash
conda create -n fortuna-saas python=3.11 -y
conda activate fortuna-saas
```

Instala las dependencias del backend:

```bash
cd backend
pip install -r requirements.txt
```

> **Nota:** `bcrypt==4.0.1` está fijado intencionalmente por compatibilidad con `passlib`. Si pip protesta por Pillow en Windows, instala antes `conda install pillow -y`.

Instala también `httpx` si no está en el entorno (lo usa el smoke test):

```bash
pip install httpx
```

---

## 3. Crear la base PostgreSQL

### Opción A — GUI (pgAdmin)

1. Abre pgAdmin → click derecho en *Databases* → *Create* → *Database*.
2. Nombre: `supplier_db`
3. Dueño: `postgres` (o tu usuario).
4. *Save*.

### Opción B — línea de comandos

```bash
psql -U postgres -c "CREATE DATABASE supplier_db;"
```

Si el usuario `postgres` te pide password y no la recuerdas, créate un usuario nuevo:

```bash
psql -U postgres -c "CREATE USER fortuna WITH PASSWORD 'fortuna';"
psql -U postgres -c "CREATE DATABASE supplier_db OWNER fortuna;"
```

Y luego usa en `DATABASE_URL`: `postgresql+asyncpg://fortuna:fortuna@localhost:5432/supplier_db`.

---

## 4. Configurar el `.env`

Los archivos `.env` **no están en el repo** por seguridad. Créalos a mano.
La plantilla completa con todas las secciones (JWT, Fernet, OAuth Gmail y
Outlook, Gemini, DIAN, seguridad de producción) está en la sección
"Configuración local — archivos `.env`" del [`README.md`](./README.md#4-configuración-local--archivos-env).

Para desarrollo local mínimo, ajusta al menos estos 5 valores en `backend/.env`:

```env
# 1. Base de datos
DATABASE_URL=postgresql+asyncpg://postgres:TU_PASSWORD@localhost:5432/supplier_db

# 2. JWT — genera una clave aleatoria propia
JWT_SECRET_KEY=UNA-CLAVE-LARGA-Y-ALEATORIA-NO-USES-ESTA

# 3. Fernet — genera con Fernet.generate_key()
FERNET_KEY=CAMBIAR_POR_UNA_CLAVE_FERNET

# 4. Superadmin inicial
SUPERADMIN_EMAIL=admin@admin.com
SUPERADMIN_PASSWORD=admin123

# 5. Modo DEBUG habilita fixture endpoints (/dev/*)
DEBUG=True
PRODUCTION_MODE=False
```

Para generar keys aleatorias:

```bash
# JWT_SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(64))"

# FERNET_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

El resto de variables opcionales (CORS_ORIGINS, DEFAULT_*, OAuth, DIAN, n8n,
Gemini) tienen defaults sensatos y se pueden dejar vacías al principio.
Se activan solo cuando uses el módulo correspondiente.

> Si vienes migrando desde el proyecto original de La Fortuna y quieres que
> n8n siga funcionando sin cambios, agrega también:
> `API_KEY=<la_api_key_que_ya_usaba_n8n>`

---

## 5. (Si migras datos existentes) Ejecutar la migración SaaS

Si tu base `supplier_db` ya tiene tablas del proyecto viejo (proveedores con UNIQUE(nit) global, etc.), corre la migración idempotente:

```bash
# desde backend/
psql -U postgres -d supplier_db -f migrations/001_saas_multitenant.sql
```

Si la base está **vacía**, sáltate este paso: el lifespan del backend creará todo desde cero.

---

## 6. Primer arranque del backend

Desde `backend/` con el entorno `fortuna-saas` activo:

```bash
python main.py
```

O con `uvicorn`:

```bash
uvicorn main:application --host 0.0.0.0 --port 8000 --reload
```

**En la consola deberías ver, en orden:**

```
INFO:     Started server process [...]
INFO:     Waiting for application startup.
Seed: Firma por defecto creada (Fortuna)
Seed: Empresa por defecto creada (id=1)
Seed: superadmin creado (admin@admin.com)
Backfill de empresa_id completado para 9 tablas
Seed: PUC cargado (167 cuentas) para empresa 1
Seed: configuración de impuestos por defecto lista
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Abre en el navegador:

- http://localhost:8000/ → `{"message":"Supplier Service API v2.0.0"}`
- http://localhost:8000/docs → Swagger UI

---

## 7. Verificación manual rápida (Swagger)

En http://localhost:8000/docs:

### 7.1 Login

Expande **`POST /api/auth/login`** → *Try it out* → usa:

```json
{
  "email": "admin@admin.com",
  "password": "admin123"
}
```

Copia el `access_token` de la respuesta.

### 7.2 Autorizar

Arriba a la derecha, click en **Authorize** → pega `Bearer <tu_token>` en el campo. Ahora todas las rutas del Swagger van con ese token.

### 7.3 Listar empresas

**`GET /api/auth/empresas`** → debería listarte La Fortuna con `id: 1`.

### 7.4 Consultar el PUC

**`GET /api/contabilidad/puc`** — pero antes agrega el header `X-Empresa-Id: 1` (campo en *Parameters*). Verás las ~167 cuentas.

### 7.5 Calcular impuestos

**`POST /api/impuestos/calcular`** con header `X-Empresa-Id: 1`:

```json
{
  "valor_total": "1190000",
  "tiene_iva": true,
  "aplica_retefuente": true
}
```

Esperado: `valor_base=1000000`, `valor_iva=190000`, `valor_retefuente=40000`, `valor_neto=1150000`.

---

## 8. Smoke test automatizado

En otra terminal (deja el backend corriendo), activa el entorno y ejecuta:

```bash
conda activate fortuna-saas
cd backend
python smoke_test.py
```

Deberías ver **10 secciones**, todas con `[OK ]`, terminando en:

```
=====================================================
 RESULTADO
=====================================================

  ✓ TODOS LOS CHEQUEOS PASARON
```

El test valida:

1. Login con superadmin.
2. `/auth/me` y `/auth/empresas`.
3. PUC cargado con las cuentas clave (`511005`, `240810`, `236540`, `220505`).
4. Cálculo de impuestos con IVA 19% y retefuente 4%.
5. Creación de asiento manual con partida doble (DB=CR).
6. **Rechazo** (422) de un asiento descuadrado.
7. Aprobación del asiento.
8. Consulta del libro mayor.
9. Balance de comprobación.

Si algún paso falla, revisa el log del backend en la terminal donde corrió `python main.py`.

---

## 9. Levantar el frontend SaaS (Iteración 3)

El frontend fue reestructurado como **shell SaaS multi-tenant** con login, registro self-service, selector de empresa activa y gestión de usuarios por rol.

### 9.1 Instalar dependencias

En una tercera terminal:

```bash
cd frontend
npm install
```

### 9.2 Configurar `frontend/.env`

```env
VITE_API_URL=http://localhost:8000
# VITE_API_KEY=<opcional, sólo si aún tienes integraciones legacy con X-API-Key>
```

> La `VITE_API_KEY` ya **no es obligatoria** — el frontend usa JWT. La dejamos
> sólo como fallback para integraciones viejas que todavía no migran a JWT.

### 9.3 Arrancar

```bash
npm run dev
```

### 9.4 Flujo de uso

Abre `http://localhost:5173` (ya **no** lleva el sufijo `/facturacion_ia`).

**Rutas públicas:**
- `/` → Landing page con CTA *Registra tu empresa*
- `/login` → Iniciar sesión
- `/register` → Wizard de 3 pasos (Firma → Usuario ADMIN → Primera Empresa)

**Rutas privadas (requieren JWT válido):** todas bajo `/app/*`
- `/app` → Dashboard
- `/app/contratos`, `/app/facturas`, `/app/pagos`, `/app/oficinas`, `/app/proveedores`, `/app/reportes`, `/app/asistente-buscador`
- `/app/mi-equipo` → Gestión de usuarios y asignación de roles (requiere rol **ADMIN** en la empresa activa)

### 9.5 Cómo probar el flujo multi-tenant

1. **Acceso con superadmin** (creado por el lifespan del backend):
   - Ir a `/login` → `admin@admin.com / admin123`.
   - El sidebar mostrará el selector de empresa activa abajo (por defecto, La Fortuna).

2. **Registro de una empresa nueva desde el navegador**:
   - Click en *Cerrar sesión* → `/register`.
   - Paso 1: nombre y NIT de la firma (p. ej. "Firma Demo", "900000001-1").
   - Paso 2: email + nombre + contraseña (mín. 8 caracteres).
   - Paso 3: (opcional) nombre y NIT de la primera empresa.
   - Al finalizar → JWT emitido → redirige a `/app` con esa nueva empresa como tenant activo.

3. **Invitar un usuario con rol específico**:
   - Desde `/app/mi-equipo` (como ADMIN) → llenar el formulario de alta.
   - Elegir rol: ADMIN, CONTADOR, AUDITOR, FACTURACION, CONTABILIDAD, PRODUCTOS, VENTAS o SOLO_LECTURA.
   - El usuario creado podrá loguearse y verá sólo lo permitido por su rol.

4. **Cambiar entre empresas (multi-tenant)**:
   - En el sidebar, abajo, click en el selector de empresa → elige otra → todas las requests siguientes llevarán el header `X-Empresa-Id` actualizado.

### 9.6 Cómo funciona la autenticación (resumen técnico)

- **Login** → `POST /api/auth/login` devuelve `access_token` + `refresh_token` + `empresas[]`.
- Los tokens y la sesión se guardan en `localStorage` bajo claves `fortuna.*`.
- El `fetchInterceptor.ts` global inyecta automáticamente:
  - `Authorization: Bearer <access_token>`
  - `X-Empresa-Id: <id>` de la empresa activa
- Si el backend responde `401`, el interceptor limpia la sesión y React Router redirige a `/login`.
- Las rutas `/app/*` están envueltas en `<ProtectedRoute>` que redirige a `/login` cuando no hay sesión.

---

## 9.7 Verificar Conciliación DIAN (opcional)

Sirve para probar el módulo sin credenciales reales del portal DIAN.

### 9.7.1 Cargar datos de prueba (fixture)

Con `DEBUG=True` en el `.env` del backend:

1. Log in y ve al empresa por defecto (La Fortuna, empresa_id=1).
2. Navega a `/app/conciliacion-dian` → tab **Sincronizar**.
3. Click **"Cargar datos de prueba"** al final del card Configuración.
4. Deberías ver: `"Fixture cargada: 12 docs DIAN + 9 facturas app + 4 proveedores"`.

### 9.7.2 Verificar los 4 tabs

- **Tab Conciliación** (rango May 1 – Jun 30):
  - COINCIDE: 3
  - DIFERENCIA $: 1 (COM-78300)
  - SOLO EN APP: 1 (SPP-9988)
  - SOLO EN DIAN: 1 (PAP-20455)
- **Tab IVA por período** — año 2026 bimestral: Bim 1-4 con datos, Bim 5-6 en cero.
- **Tab IVA Estratégico** — Bim 3 (May-Jun):
  - IVA generado: $2.850.000
  - IVA descontable app: $1.028.890
  - Saldo declaración: $1.821.110 a pagar
  - IVA sin capturar: $19.000
  - Tasa captura: 80.0%

### 9.7.3 Probar sync real (opcional)

Necesitas registro en el portal DIAN. Configurar en tab Sincronizar:

- **Persona natural**: solo tu cédula.
- **Administrador**: correo + contraseña del portal.
- **Empresa · Rep. Legal**: cédula del rep + NIT empresa.
- **Empresa · Usuario Autorizado**: NIT empresa + cédula usuario + contraseña.

Para métodos con contraseña, el sync te pide la password inline en la UI —
**no se guarda en BD**. Vive en memoria durante el login de Playwright y se descarta.

Chromium abrirá una ventana (headed en dev por default). Si ves el error
`NotImplementedError`, verifica que `main.py` tenga el bloque de
`WindowsProactorEventLoopPolicy` al inicio.

---

## 10. Resetear todo (limpieza)

Si algo salió raro y quieres empezar de cero:

```bash
# 1. Matar el backend (Ctrl+C en su terminal)

# 2. Borrar y recrear la base
psql -U postgres -c "DROP DATABASE IF EXISTS supplier_db;"
psql -U postgres -c "CREATE DATABASE supplier_db;"

# 3. Relanzar — el lifespan recreará todo
python main.py
```

Si quieres solo recargar el PUC de una empresa existente (sin borrar datos):

```bash
python populate_puc.py 1     # empresa_id = 1
```

---

## 11. Troubleshooting

### "asyncpg not found" / error de conexión

- Verifica que PostgreSQL esté corriendo: `pg_isready`.
- Verifica el `DATABASE_URL` en `.env` (prefijo `postgresql+asyncpg://`, no `postgresql://`).

### "bcrypt version error"

```bash
pip install --upgrade "bcrypt==4.0.1" "passlib[bcrypt]"
```

### "Table already exists" en primer arranque

La base tiene tablas viejas incompatibles. Corre la migración:

```bash
psql -U postgres -d supplier_db -f backend/migrations/001_saas_multitenant.sql
```

o bórrala y déjala limpia (sección 10).

### "NameError: name 'models' is not defined" en `routers/facturas.py`

Ya está resuelto en esta rama (`import models, schemas, crud`). Si lo ves, estás en una rama desactualizada.

### CORS / el frontend no se conecta

Agrega tu origen al `.env`:

```env
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

Reinicia el backend.

### El smoke test falla en "asiento descuadrado"

Si el backend responde 200 en vez de 422, la validación Pydantic no se está aplicando. Verifica:

- `schemas_contabilidad.py` tiene el `@field_validator("lineas")`.
- No hay un `schemas_contabilidad.py.bak` u otro archivo sombra.

---

## 12. Siguiente iteración

Una vez verificado todo lo anterior, la **Iteración 3** continuará con:

- Integración de `services.causacion.crear_asiento_causacion_factura` al endpoint de creación de facturas (auto-generación de asientos al recibir una factura).
- Módulo de conciliación bancaria (tablas `ExtractoBancario`, `TransaccionBancaria`, `ReglaConciliacion` ya están listas — falta el router).
- Reportes DIAN (formato 2276, Medios Magnéticos).
- Frontend: nueva pestaña *Contabilidad* con PUC, libro mayor y balance.
