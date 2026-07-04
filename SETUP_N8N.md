# Manual de configuración — n8n + Facturación SaaS

Este manual cubre **paso a paso** cómo dejar el n8n listo para:

1. Upload manual de PDF con extracción IA (Google Gemini nativo).
2. Captura de facturas por correo (Outlook / Gmail / Yahoo / IMAP).

> **Ruta probada:** este manual documenta la configuración que efectivamente
> funcionó end-to-end en desarrollo local (Windows 10, n8n community 2.12.x,
> Gemini nativo). Los tropiezos comunes están consignados en la sección de
> Troubleshooting con el mensaje literal del error.

Hay dos perfiles:

- **Operador del SaaS** (tú, una sola vez al desplegar).
- **Cliente final** (cada tenant que se registra).

---

## Parte 1 — Setup del operador del SaaS

### 1.1 — Levantar la instancia n8n

#### Opción A — Local con `npx` (desarrollo)

Es la vía más rápida en Windows/Mac/Linux para hacer pruebas.

```powershell
npx n8n
```

- Arranca en `http://localhost:5678`.
- La primera vez te lleva a un wizard **"Setup Owner Account"** — crea usuario y contraseña. Se guardan en `~/.n8n/` (SQLite).
- Si te aparece `signin?redirect=%2F`, es porque ya existe el owner. Usa las credenciales que definiste; si las olvidaste:
  ```powershell
  # Reset completo: borrar la BD local de n8n
  Remove-Item "$env:USERPROFILE\.n8n\database.sqlite"
  ```

#### Opción B — Docker (producción)

```bash
docker run -d \
  --name n8n-saas \
  --restart unless-stopped \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -e N8N_HOST=n8n.tu-dominio.com \
  -e N8N_PROTOCOL=https \
  -e N8N_PORT=5678 \
  -e WEBHOOK_URL=https://n8n.tu-dominio.com/ \
  -e GENERIC_TIMEZONE=America/Bogota \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=cambia-esto \
  n8nio/n8n:latest
```

Si el n8n está detrás de un reverse proxy (Nginx, Caddy, Traefik), expón con
TLS y apunta `https://n8n.tu-dominio.com` al contenedor.

### 1.2 — Workflows del catálogo

En `facturacion_fortuna/n8n/` hay 3 workflows canónicos, todos con **Google
Gemini nativo** como motor IA (el único que se validó end-to-end):

| Archivo | Rol | Estado |
|---------|-----|--------|
| `workflow_procesar_factura_gemini.json` | Upload manual de PDF (endpoint `/app/facturas`) | ✅ Probado end-to-end |
| `workflow_buscar_facturas_template.json` | Fase 2: buscar correos con adjuntos | ⚙️ Configurable, no requiere IA |
| `workflow_procesar_adjunto_template.json` | Fase 2: procesar el adjunto seleccionado (mismo patrón Gemini que el manual) | ⚙️ Listo, pendiente prueba end-to-end |

Si prefieres OpenAI en lugar de Gemini, tendrás que reemplazar manualmente
el nodo "Analyze document" (tipo `@n8n/n8n-nodes-langchain.googleGemini`)
por un nodo `OpenAI Chat` con input `image_url` en tu instancia n8n.

### 1.3 — Importar y activar el workflow

Para **cada** JSON que decidas usar:

1. **Workflows → Add workflow → Import from File** → selecciona el JSON.
2. Pulsa **Save**.
3. **IMPORTANTE**: pulsa el toggle **Active** (arriba a la derecha).
   - El botón "Listen for test event" que aparece en el editor **no cuenta como
     activo** — es solo para debug (URL `.../webhook-test/…`). El backend
     necesita la URL de **Production**.
4. Abre el nodo "Webhook — Recibir Factura" y copia la **Production URL**
   (algo como `http://localhost:5678/webhook/procesar-factura` en local, o
   `https://n8n.tu-dominio.com/webhook/<uuid>` en prod).

Vas a terminar con 2 o 3 URLs de production (una por workflow importado).

### 1.4 — Credencial Google Gemini en el nodo

> **⚠ n8n community edition NO expone `Settings → Variables`.** Esa opción es
> exclusiva de la edición Enterprise. Además, cualquier expresión que
> referencie `$env.MI_KEY` fallará con `access to env vars denied` porque
> `N8N_BLOCK_ENV_ACCESS_IN_NODE` viene activo por default.
>
> Solución: asigna una **credencial de n8n** al nodo (recomendado) o pasa la
> API key como **Fixed value** — no como expresión.

1. Genera una API key en https://aistudio.google.com/apikey.
   - **NO es lo mismo que tu suscripción Gemini Pro consumer** — el Pro no da
     acceso a la API. Necesitas Google AI Studio, que sí tiene cuota gratuita
     para `gemini-1.5-flash` y `gemini-2.5-flash`.
   - Si te aparece `Quota exceeded ... limit: 0` en un modelo específico,
     habilita billing en el proyecto de Google Cloud vinculado, o usa otro
     modelo del catálogo Flash.
2. En n8n: **Credentials → Add Credential → Google Gemini (PaLM) API**.
3. Pega la API key y guarda con un nombre como `Gemini — [Empresa]`.
4. Copia el **Credential ID** (aparece en la URL de la credencial, ej.
   `https://.../credentials/AbCd1234XyZ` → `AbCd1234XyZ`).
5. Abre el workflow y en el nodo "Analyze document" selecciona esa
   credencial.

### 1.5 — Verificar que el nodo puede leer el PDF

El workflow **no** lee el PDF del filesystem. Lo recibe como base64 dentro
del payload del webhook (`pdf_base64` + `pdf_mime_type`) y lo convierte a
binario dentro del nodo "Base64 a Binary" justo antes de pasarlo al modelo IA.

Esto evita el error:

```
Access to the file is not allowed.
Allowed paths: C:\Users\dammi\.n8n-files
```

Ese error aparece porque n8n activa por defecto `N8N_RESTRICT_FILE_ACCESS_TO`
y solo permite leer de esa carpeta. Con el enfoque base64 no importa dónde
esté el archivo, el backend ya lo mandó embebido en el JSON.

Si por alguna razón editaste el nodo "Base64 a Binary" o "Extraer Contexto
Tenant", verifica que ambos usen `runOnceForEachItem` (modo por-item). Si
usas `runOnceForAllItems`, la expresión `$input.first()` no está permitida y
verás `Can't use .first() here`.

### 1.6 — Config del backend

En `facturacion_fortuna/backend/.env`:

```dotenv
# BD
DATABASE_URL=postgresql+asyncpg://postgres:PalmCoder26@localhost:5432/supplier_db

# Workflows compartidos de n8n. Usa 127.0.0.1 en lugar de localhost:
# en Windows con dual-stack IPv6, "localhost" resuelve a ::1 y el
# backend Python queda escuchando en 127.0.0.1 → connection refused.
N8N_PROCESS_WEBHOOK_URL=http://127.0.0.1:5678/webhook/procesar-factura
N8N_SEARCH_WEBHOOK_URL=http://127.0.0.1:5678/webhook/buscar-facturas
N8N_PROCESS_EMAIL_WEBHOOK_URL=http://127.0.0.1:5678/webhook/procesar-adjunto
```

> **⚠ URL de callback dentro de los workflows n8n:** los nodos "API — Crear
> Factura" y "Extraer Contexto" traen la URL `http://127.0.0.1:8000`
> **hardcoded**. No usan `$env.FACTURACION_API_URL` porque
> `N8N_BLOCK_ENV_ACCESS_IN_NODE` bloquea `$env.*` en expresiones. Si tu
> backend está en otra ubicación, edita el campo `url` del nodo directamente
> después de importar el workflow en n8n.

Y **reinicia el backend** para que tome los cambios:

```powershell
# Matar cualquier uvicorn previo colgado en 8000
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Levantar fresco
cd facturacion_fortuna\backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 1.7 — Aplicar la migración 007

```bash
psql -U postgres -d supplier_db -f facturacion_fortuna/backend/migrations/007_integraciones_n8n.sql
```

Verifica:

```sql
\d empresas
-- Debes ver n8n_credential_openai_id, n8n_credential_email_id,
-- n8n_email_provider, n8n_webhook_last_test, n8n_webhook_last_status.
```

### 1.8 — Verificación del operador

1. Entra como superadmin (`admin@admin.com`) al SaaS.
2. Ve a `/app/integraciones`.
3. "URL del workflow procesar factura" debe mostrar la URL compartida.
   - Si aparece vacía → revisa que `N8N_PROCESS_WEBHOOK_URL` esté en `.env`
     y que el backend haya sido reiniciado después de editarlo.
4. Pega el Credential ID de Gemini (paso 1.4) en la sección
   "IDs de tus credenciales" → Guardar.
5. Botón **"Probar conexión"** → debe responder `✓ Conexión exitosa`.

---

## Parte 2 — Onboarding del cliente final

### 2.1 — Crear credencial de Gemini

Igual que en el paso 1.4 pero cada cliente en el mismo panel n8n del SaaS,
con SU propia API key. El costo de la extracción se factura contra su
cuenta de Google AI Studio.

### 2.2 — Pegar el Credential ID en el panel SaaS

1. Login → `/app/integraciones`.
2. Sección "IDs de tus credenciales" → "Credential ID de Gemini" (el campo
   se guarda internamente como `openai_credential_id` por compatibilidad
   histórica).
3. Guardar.
4. "Probar conexión" → `✓`.

### 2.3 — Probar el upload manual

1. `/app/facturas` → "Subir factura".
2. Arrastra un PDF de factura colombiana (o usa los dummy en
   `C:\temp\facturas_demo\` si estás en desarrollo).
3. Espera 5–15 s.
4. Debe extraer: NIT, razón social, número, valor, fechas.

Si falla, mira **Executions** en n8n para ver en qué nodo se cortó.

### 2.4 — Configurar correo (fase 2)

#### Outlook

1. Panel n8n → **Credentials → Add → Microsoft Outlook OAuth2 API**.
2. Pega los datos OAuth que te dio el operador del SaaS (Client ID + Secret).
3. "Sign in with Microsoft" → autoriza tu cuenta corporativa.
4. Save → copia el ID.
5. En `/app/integraciones`: Proveedor **Microsoft Outlook (OAuth2)** →
   Credential ID → Guardar.

#### Gmail

Igual que Outlook pero con **Gmail OAuth2 API**.

#### Yahoo (IMAP)

Yahoo no tiene OAuth para n8n — usa IMAP con app password.

1. https://login.yahoo.com/account/security → **App Password**.
2. n8n → **Credentials → Add → IMAP**:
   - Host: `imap.mail.yahoo.com`
   - Port: `993`, SSL: yes
   - User: tu correo completo
   - Password: el app password
3. Save → copia el ID → pega en `/app/integraciones`.

#### IMAP genérico

Mismo flujo con datos de tu proveedor:

| Proveedor | Host IMAP | Puerto |
|-----------|-----------|--------|
| iCloud | `imap.mail.me.com` | 993 |
| Zoho | `imap.zoho.com` | 993 |
| Custom | tu admin | 993 |

### 2.5 — Probar búsqueda de correo

1. `/app/asistente-buscador`.
2. Banner debe decir "Conectado vía OUTLOOK/GMAIL/YAHOO/IMAP".
3. Rango de fechas con correos que tengan PDFs adjuntos.
4. "Buscar" → aparecen los archivos.
5. Selecciona uno → "Procesar Seleccionados".
6. n8n descarga, procesa con IA, crea la factura.

---

## Parte 3 — Troubleshooting

Errores reales encontrados durante la puesta en marcha:

### Configuración de n8n

| Error visible | Causa | Fix |
|---------------|-------|-----|
| `signin?redirect=%2F` al abrir n8n | Ya existe el owner de un arranque previo | Usa las credenciales; si las olvidaste, `Remove-Item $env:USERPROFILE\.n8n\database.sqlite` |
| Nodo Webhook dice "Listen for test event" y responde 404 en Production URL | El workflow no está **Active** | Toggle Active arriba a la derecha, no confundir con "Execute Workflow" del editor |
| `access to env vars denied` en un nodo | La expresión usa `$env.MI_KEY` | En community edition eso está bloqueado. Pasa el valor como **Fixed value** (no expresión) en el nodo. |
| `Settings → Variables` no existe | Solo Enterprise | Usa Fixed value en el nodo o env var del contenedor Docker |

### Ejecución del workflow

| Error visible | Causa | Fix |
|---------------|-------|-----|
| `Access to the file is not allowed. Allowed paths: C:\Users\dammi\.n8n-files` | El nodo intenta leer un path fuera de la carpeta permitida | El workflow debe usar el nodo "Base64 a Binary" que consume `pdf_base64` del payload, no leer del disco |
| `No llegó pdf_base64 en el payload del webhook` | Backend viejo que aún no envía base64 | Actualiza a la versión con `pdf_bytes=` en `build_upload_payload()` |
| `Can't use .first() here` en un Code node | El nodo está en modo `runOnceForEachItem` pero el código usa `$input.first()` | Usa `$json` directo, o cambia el modo a `runOnceForAllItems` (rara vez conviene) |
| `Quota exceeded ... limit: 0, model: gemini-2.0-flash` | El modelo no está habilitado en tu proyecto de Google AI Studio | Cambia a `gemini-1.5-flash` en el nodo, o habilita billing |
| `The service is receiving too many requests from you` en Gemini | Rate limit de la tier gratuita | Espera o pásate a `1.5-flash` (más cuota) |
| Nodo Gemini devuelve `Quota exceeded ... limit: 0` | Modelo no habilitado en tu proyecto de Google AI Studio | Cambia a `gemini-1.5-flash` o habilita billing en Google Cloud |
| `JSON parameter needs to be valid JSON` en HTTP Request | El body tiene saltos de línea sin escapar | En el nodo, cambia el body a modo expression y usa `={{ JSON.stringify({...}) }}` |
| `text.slice is not a function` en un parser | El campo de respuesta del nodo IA vino como objeto, no como string | El parser debe intentar `response.content ?? response.text ?? response.candidates?.[0]?.content?.parts?.[0]?.text` antes de hacer `.match()` |

### Comunicación n8n ↔ backend

| Error visible | Causa | Fix |
|---------------|-------|-----|
| `The service refused the connection - perhaps it is offline` al llamar al backend desde n8n | URL usa `localhost` pero el backend escucha en IPv4 (Windows dual-stack IPv6) | Cambia la URL en el nodo a `http://127.0.0.1:8000` |
| `Authorization failed - please check your credentials` en el nodo "API — Crear Factura" | Falta X-Empresa-Id o X-API-Key en el header | Verifica los headerParameters, incluyendo Content-Type: application/json |
| `X-Empresa-Id: null` | El valor no propagó entre nodos | Léelo directamente de `$('Webhook — Recibir Factura').item.json.empresaId` en lugar de confiar en el flow |
| "n8n respondió pero sin JSON válido" en el frontend | El nodo Respond usa `allIncomingItems` y devuelve array | El backend ya sabe destrabar arrays desde el fix del 2026-06; asegúrate de tener la versión actualizada de `facturas.py` |
| `greenlet_spawn has not been called` en /crear-con-oficina | FK violation al usar `user_id=0` (auth por X-API-Key) deja la sesión inutilizable | Ya solucionado en el backend: `safe_user_id = raw_user_id if raw_user_id > 0 else None`. Verifica que tienes la versión actualizada |
| Al marcar factura como PAGADA no se crea asiento PAGO | Mismo bug de user_id=0 en `/facturas/{id}/estado` | Mismo fix, ya aplicado |

### Comandos útiles

```powershell
# Ver últimas ejecuciones de n8n (local)
Get-Content "$env:USERPROFILE\.n8n\n8nEventLog.log" -Tail 50

# Probar el webhook directamente
curl -X POST http://127.0.0.1:5678/webhook/procesar-factura `
  -H "Content-Type: application/json" `
  -d '{\"event\":\"ping\",\"empresaId\":1}'

# Probar el endpoint del backend
curl -X GET http://127.0.0.1:8000/api/empresas/me/integraciones `
  -H "Authorization: Bearer <jwt>" `
  -H "X-Empresa-Id: 1"

# Puerto 8000 ocupado por proceso zombie
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## Parte 4 — Mantenimiento

### Actualizar el workflow para todos los tenants

1. Editar en n8n → Save.
2. Todos los tenants reciben el cambio en la siguiente petición.

Si cambias la **estructura del payload** (nuevos campos), actualiza también
`services/integraciones_n8n.py` para que envíe los nuevos campos.

### Cambiar el modelo Gemini

Edita el nodo "Analyze document" y cambia `modelId` (ej.
`models/gemini-1.5-flash` → `models/gemini-1.5-pro` para mayor precisión, o
`models/gemini-2.5-flash` que ya está por default en la plantilla).

### Migrar de Gemini a OpenAI

En el catálogo actual mantenemos solo la ruta Gemini. Si necesitas OpenAI,
duplica `workflow_procesar_factura_gemini.json` en n8n, reemplaza el nodo
"Analyze document" (tipo `@n8n/n8n-nodes-langchain.googleGemini`) por un
nodo `OpenAI Chat` con input `image_url`, y ajusta el "Parsear Respuesta
IA" para leer `response.message.content` o `response.choices[0].message.content`.
No requiere migrar datos.

### Rotar API keys del tenant

Endpoint admin (solo superadmin):

```bash
POST /api/empresas/<empresa_id>/rotate-api-key
```

Genera nueva UUID y la asigna como `api_key` de la empresa. El tenant debe
actualizar las credenciales de callback si las tenía cacheadas.

---

## Checklist final

- [ ] n8n levantado y accesible en `:5678`.
- [ ] Owner account creado (o resetead si perdiste la contraseña).
- [ ] Workflow de procesamiento importado y **Active** (production URL, no
      test URL).
- [ ] Credencial Gemini creada (Google AI Studio) y asignada al nodo
      en modo **Fixed value** (no `$env`).
- [ ] `N8N_PROCESS_WEBHOOK_URL` con `127.0.0.1` (no `localhost`) en `.env`
      del backend.
- [ ] Migración 007 aplicada en BD.
- [ ] Backend reiniciado después del cambio de `.env`.
- [ ] Login al SaaS → `/app/integraciones` muestra la URL compartida.
- [ ] "Probar conexión" responde `✓`.
- [ ] Subir un PDF dummy crea la factura y genera el asiento CAUSACION.
- [ ] Cambiar la factura a PAGADA genera el asiento PAGO en `/app/asientos`.

Cuando todo lo anterior está OK, la integración está completa.
