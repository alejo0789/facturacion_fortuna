# Manual de configuración — n8n + Facturación SaaS

Este manual cubre **paso a paso** cómo dejar el n8n listo para:

1. Upload manual de PDF con extracción IA (Google Gemini nativo).
2. Captura de facturas por correo — **Outlook** (Microsoft Graph) o **Gmail** (Gmail API).

> **Ruta probada:** este manual documenta la configuración que efectivamente
> funcionó end-to-end en desarrollo local (Windows 10/11, n8n community 2.12.x,
> Gemini nativo, Outlook OAuth vía Azure Portal, Gmail OAuth vía Google Cloud
> Console). Los tropiezos comunes están consignados en la sección de
> Troubleshooting con el mensaje literal del error.

Hay dos perfiles:

- **Operador del SaaS** (tú, una sola vez al desplegar).
- **Cliente final** (cada tenant que se registra).

---

## Parte 1 — Setup del operador del SaaS

### 1.1 — Levantar la instancia n8n

#### Opción A — Local con `npx` (desarrollo)

```powershell
npx n8n
```

- Arranca en `http://localhost:5678`.
- La primera vez te lleva a un wizard **"Setup Owner Account"** — crea usuario y contraseña. Se guardan en `~/.n8n/` (SQLite).
- Si te aparece `signin?redirect=%2F`, es porque ya existe el owner. Usa las credenciales que definiste; si las olvidaste:
  ```powershell
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
  -e WEBHOOK_URL=https://n8n.tu-dominio.com/ \
  -e GENERIC_TIMEZONE=America/Bogota \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=cambia-esto \
  n8nio/n8n:latest
```

### 1.2 — Importar el workflow único

En `facturacion_fortuna/n8n/` hay **un solo workflow consolidado** que expone
los 3 endpoints necesarios (procesar-factura, procesar-adjunto, buscar-facturas)
en la misma instancia:

| Archivo | Endpoints webhook |
|---------|-------------------|
| `workflow_facturacion_saas.json` | `/webhook/procesar-factura`, `/webhook/procesar-adjunto`, `/webhook/buscar-facturas` |

Pasos:

1. **Workflows → Add workflow → Import from File** → selecciona el JSON.
2. Se importan 3 sub-flujos aislados en el mismo canvas.
3. Toggle **Active** arriba a la derecha.
4. Verifica las Production URLs de los 3 webhooks (deberían coincidir con los paths de arriba).

### 1.3 — Credencial Google Gemini (para los 2 nodos "Analyze document")

> **⚠ n8n community edition NO expone `Settings → Variables`.** Esa opción es
> exclusiva de la edición Enterprise. Además, cualquier expresión que
> referencie `$env.MI_KEY` fallará con `access to env vars denied` porque
> `N8N_BLOCK_ENV_ACCESS_IN_NODE` viene activo por default.
>
> Solución: asigna una **credencial de n8n** al nodo (recomendado).

1. Genera una API key en https://aistudio.google.com/apikey.
   - **NO es lo mismo que tu suscripción Gemini Pro consumer** — el Pro no da
     acceso a la API. Necesitas Google AI Studio, que sí tiene cuota gratuita
     para `gemini-1.5-flash` y `gemini-2.5-flash`.
   - Si te aparece `Quota exceeded ... limit: 0` en un modelo específico,
     habilita billing en el proyecto de Google Cloud vinculado, o usa otro
     modelo del catálogo Flash.
2. En n8n: **Credentials → Add Credential → Google Gemini (PaLM) API**.
3. Pega la API key y guarda con un nombre como `Google Gemini(PaLM) Api account`.
4. Copia el **Credential ID** (aparece en la URL, ej. `…/credentials/AbCd1234XyZ`).
5. Asigna esa credencial en los DOS nodos "Analyze document" del workflow
   (uno en el flujo de upload manual, otro en el flujo de procesar-adjunto).

### 1.4 — Credencial Microsoft Outlook OAuth2 (solo si quieres soportar Outlook)

> **⚠ Si tu cuenta Microsoft es personal (`@outlook.com`, `@hotmail.com`,
> `@live.com`) y NUNCA has usado Azure/Entra:** portal.azure.com y
> entra.microsoft.com te bloquean con `AADSTS16000` (tu cuenta no está en un
> tenant). Para desbloquear, activa una cuenta Azure Free en
> https://azure.microsoft.com/free (requiere verificación con tarjeta pero
> no cobra). Esto crea el tenant automáticamente. Luego sigue los pasos abajo.

#### 1.4.1 — Registrar la app en Azure

1. https://portal.azure.com → **App registrations** (buscador de la barra superior).
2. **+ New registration**:
   - Name: `Facturacion SaaS n8n`
   - Supported account types: **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts** (3ra opción).
   - Redirect URI: Platform **Web** → `http://localhost:5678/rest/oauth2-credential/callback`
3. Register.
4. Del **Overview** copia:
   - **Application (client) ID** → guarda como `CLIENT_ID`.

#### 1.4.2 — Client Secret

1. Menú lateral → **Certificates & secrets** → tab **Client secrets**.
2. **+ New client secret** → Description: `n8n secret`, Expires: 730 days.
3. **Copia INMEDIATAMENTE la columna "Value"** (no la columna "Secret ID"). Solo se ve una vez.
4. Guarda como `CLIENT_SECRET_VALUE`.

#### 1.4.3 — API permissions

1. Menú lateral → **API permissions**.
2. **+ Add a permission → Microsoft Graph → Delegated permissions**:
   - ✅ `Mail.Read`
   - ✅ `offline_access`
3. **Add permissions**.
4. Si tu cuenta es corporativa: **Grant admin consent**. Si es personal
   `@outlook.com` no aplica — el consent se otorga al firmar en n8n.

#### 1.4.4 — Credencial en n8n

1. n8n → **Credentials → + Create Credential → Microsoft Outlook OAuth2 API**.
2. Grant Type: `Authorization Code` (default).
3. **Client ID**: pega `CLIENT_ID`.
4. **Client Secret**: pega `CLIENT_SECRET_VALUE`.
5. Verifica el cuadro azul con **OAuth Callback URL**: debe ser exactamente
   `http://localhost:5678/rest/oauth2-credential/callback` (si difiere del
   registrado en Azure, ajusta en Azure → Authentication → Redirect URIs).
6. Botón **"Sign in with Microsoft"** → autoriza tu cuenta.
7. Nombre: `Microsoft Outlook account`.
8. Save. Copia el Credential ID.

### 1.5 — Credencial Gmail OAuth2 (solo si quieres soportar Gmail)

#### 1.5.1 — Crear proyecto en Google Cloud

1. https://console.cloud.google.com → dropdown de proyectos → **New Project**.
2. Nombre: `Facturacion SaaS n8n` → Create.
3. Selecciona ese proyecto en el dropdown.

#### 1.5.2 — HABILITAR la Gmail API

> **⚠ Este paso es fácil de olvidar y produce error posterior:**
> `Gmail API has not been used in project XXX before or it is disabled`.

1. Menú lateral (☰) → **APIs & Services → Library**.
2. Buscador: `Gmail API` → click en el resultado.
3. Botón azul **Enable**.
4. Espera 1-2 min a que la habilitación se propague.

#### 1.5.3 — OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User Type: **External** → Create.
3. **App information**:
   - App name: `Facturacion SaaS n8n`
   - User support email: tu correo.
   - Developer contact email: tu correo.
4. Save and Continue.
5. **Scopes** → **Add or Remove Scopes** → busca `gmail.readonly` → marca
   `.../auth/gmail.readonly` → Update → Save and Continue.
6. **Test users** → **+ Add users**.

   > **⚠ Este es el paso crítico que suele causar el error "Acceso bloqueado:
   > facturacion no completó el proceso de verificación de Google"**.
   >
   > Como la app está en modo "Testing" (sin publicar), Google solo permite
   > que se autoricen los correos explícitamente listados aquí. Agrega la
   > cuenta Gmail exacta que vas a conectar (ej. `carroyoherrera@gmail.com`).
   >
   > Si más adelante quieres conectar otra cuenta Gmail, vuelve aquí y
   > agrégala también.

7. Save and Continue → Back to Dashboard.

#### 1.5.4 — Crear el OAuth Client ID

1. **APIs & Services → Credentials**.
2. **+ Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `n8n local`.
5. **Authorized redirect URIs → + Add URI** → pega EXACTAMENTE:
   ```
   http://localhost:5678/rest/oauth2-credential/callback
   ```
6. Create.
7. Popup con **Client ID** y **Client Secret** — copia ambos.

#### 1.5.5 — Credencial en n8n

1. n8n → **Credentials → + Create Credential → Gmail OAuth2 API**.
2. Client ID: pega el del paso anterior.
3. Client Secret: pega el del paso anterior.
4. Verifica OAuth Callback URL (debe coincidir con la registrada en Google Cloud).
5. **Sign in with Google** → escoge la cuenta Gmail listada en Test users.
6. Google muestra "Google hasn't verified this app" — click **Advanced → Go to
   Facturacion SaaS n8n (unsafe)**. Es seguro; sale porque no publicaste la app.
7. Autoriza el scope de leer correos.
8. Vuelves a n8n con "Account connected" ✓.
9. Nombre: `Gmail account`.
10. Save. Copia el Credential ID.

### 1.6 — Asignar credenciales a los nodos del workflow

Con las credenciales creadas, entra al workflow y asigna:

| Nodo | Credencial a asignar |
|------|---------------------|
| `Analyze document` (flujo upload manual) | Google Gemini(PaLM) Api account |
| `Analyze document Adjunto` (flujo procesar-adjunto) | Google Gemini(PaLM) Api account |
| `Outlook · Buscar` (flujo buscar-facturas) | Microsoft Outlook account — en el campo "Predefined Credential Type" |
| `Gmail · Buscar` (flujo buscar-facturas) | Gmail account |

Save el workflow y verifica que **Active** siga encendido.

### 1.7 — Config del backend

En `facturacion_fortuna/backend/.env`:

```dotenv
# BD
DATABASE_URL=postgresql+asyncpg://postgres:PalmCoder26@localhost:5432/supplier_db

# Workflows compartidos de n8n. Usa 127.0.0.1 en lugar de localhost:
# en Windows con dual-stack IPv6, "localhost" resuelve a ::1 y el
# backend queda escuchando en 127.0.0.1 → connection refused.
N8N_PROCESS_WEBHOOK_URL=http://127.0.0.1:5678/webhook/procesar-factura
N8N_SEARCH_WEBHOOK_URL=http://127.0.0.1:5678/webhook/buscar-facturas
N8N_PROCESS_EMAIL_WEBHOOK_URL=http://127.0.0.1:5678/webhook/procesar-adjunto
```

> **⚠ URL de callback dentro del workflow n8n:** los nodos "API — Crear
> Factura" y el Code node "Extraer Contexto" traen la URL `http://127.0.0.1:8000`
> **hardcoded**. No usan `$env.FACTURACION_API_URL` porque
> `N8N_BLOCK_ENV_ACCESS_IN_NODE` bloquea `$env.*` en expresiones. Si tu
> backend está en otra ubicación, edita esos campos directamente después de
> importar el workflow.

Reinicia el backend:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

cd facturacion_fortuna\backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 1.8 — Aplicar migración 007

```bash
psql -U postgres -d supplier_db -f facturacion_fortuna/backend/migrations/007_integraciones_n8n.sql
```

### 1.9 — Verificación del operador

1. Entra como superadmin (`admin@admin.com`) al SaaS.
2. Ve a `/app/integraciones`.
3. Las 3 URLs de webhook deben aparecer pobladas (SaaS-managed).
4. Pega el Credential ID de Gemini en "Credential ID de OpenAI / Gemini".
5. **"Probar conexión"** → `✓ Conexión exitosa`.

---

## Parte 2 — Onboarding del cliente final

### 2.1 — Credencial Gemini (mismo procedimiento que 1.3, con SU key)

### 2.2 — Credencial de correo (Outlook 1.4 o Gmail 1.5)

- Si su buzón es `@outlook.com` / `@hotmail.com` / M365: Outlook (1.4).
- Si su buzón es `@gmail.com` o Google Workspace: Gmail (1.5).

### 2.3 — Pegar IDs en el panel SaaS

1. `/app/integraciones`.
2. "Credential ID de Gemini" → el ID del paso 2.1.
3. "Credential ID del correo" → el ID del paso 2.2.
4. "Proveedor de correo" → escoge Outlook o Gmail según el paso 2.2.
5. Guardar.

### 2.4 — Probar upload manual

1. `/app/facturas` → "Subir factura" → arrastra un PDF.
2. En 5–15 s debe extraer NIT, razón social, número, valor, fechas.

### 2.5 — Probar buscador de correo

1. `/app/asistente-buscador`.
2. Banner: "Conectado vía OUTLOOK" o "GMAIL".
3. Rango de fechas + (opcional) filtro remitente.
4. Buscar → aparecen los PDFs.
5. Selecciona uno → "Procesar Seleccionados" → factura creada.

---

## Parte 3 — Troubleshooting

Errores reales encontrados durante la puesta en marcha:

### Configuración de n8n

| Error visible | Causa | Fix |
|---------------|-------|-----|
| `signin?redirect=%2F` al abrir n8n | Ya existe el owner | Usa tus credenciales; si las olvidaste borra `~/.n8n/database.sqlite` |
| Nodo Webhook dice "Listen for test event" y responde 404 | Workflow no **Active** | Toggle Active arriba a la derecha |
| `access to env vars denied` en un nodo | Expresión usa `$env.MI_KEY` | Bloqueado en community. Pasa el valor como Fixed value o credential |
| `Settings → Variables` no existe | Solo Enterprise | Usa Fixed value en el nodo |

### Ejecución del workflow

| Error visible | Causa | Fix |
|---------------|-------|-----|
| `Access to the file is not allowed. Allowed paths: C:\Users\dammi\.n8n-files` | El nodo intenta leer un path fuera de la carpeta permitida | El workflow usa el nodo "Base64 a Binary" que consume `pdf_base64` del payload, no lee del disco |
| `No llegó pdf_base64 en el payload del webhook` | Backend viejo sin `pdf_bytes=` en `build_upload_payload()` | Actualiza el backend |
| `Can't use .first() here` en un Code node | Modo `runOnceForEachItem` con `$input.first()` | Usa `$json` directo |
| `Quota exceeded ... limit: 0, model: gemini-2.0-flash` | Modelo no habilitado en el proyecto | Cambia a `gemini-1.5-flash` o `gemini-2.5-flash`, o habilita billing |

### Microsoft Outlook / Azure

| Error visible | Causa | Fix |
|---------------|-------|-----|
| `AADSTS16000: User account from identity provider 'live.com' does not exist in tenant 'Microsoft Services'` al entrar a portal.azure.com o entra.microsoft.com | Cuenta personal sin tenant Azure | Activa Azure Free en https://azure.microsoft.com/free (verificación por tarjeta pero no cobra). Crea el tenant automáticamente |
| `ErrorLoadingExtensionAndDefinition` con status 404 en entra.microsoft.com | Mismo problema — no hay tenant asociado | Azure Free como arriba |
| `AADSTS50011: The redirect URI does not match` | El URI de Azure no coincide con el de n8n | Copia el URI EXACTO que muestra n8n en el formulario de credencial y pégalo en Azure → App → Authentication → Redirect URIs |
| `AADSTS7000215: Invalid client secret provided` | Copiaste el "Secret ID" en vez del "Value" | Vuelve a Certificates & secrets → borra el secret → crea nuevo → copia la columna **Value** |
| `AADSTS50194: Application is not configured as a multi-tenant application` | Escogiste "Single tenant" en el registro | Azure → tu app → Authentication → cambia a "Multitenant + personal accounts" |
| Outlook devuelve mensajes pero sin `attachments[]` — el buscador no encuentra PDFs | El nodo Microsoft Outlook nativo de n8n ignora `additionalFields.attachments: true` en algunas versiones | El workflow usa un HTTP Request directo a Graph con `$expand=attachments` — más confiable. Ya viene así en `workflow_facturacion_saas.json` |

### Gmail / Google Cloud

| Error visible | Causa | Fix |
|---------------|-------|-----|
| `Acceso bloqueado: facturacion no completó el proceso de verificación de Google` | Estado de publicación = Testing, y tu correo no está en Test users | Google Cloud Console → APIs & Services → OAuth consent screen → **Test users → + Add users** → agrega tu correo exacto → Save. Luego reintenta la conexión en n8n y da "Advanced → Go to Facturacion SaaS n8n (unsafe)" |
| `Forbidden - perhaps check your credentials? (item 0) Gmail API has not been used in project XXX before or it is disabled` | Gmail API no habilitada | Google Cloud Console → APIs & Services → Library → busca "Gmail API" → **Enable**. Espera 1-2 min a que se propague y reintenta |
| `Google hasn't verified this app` en el consent | App en modo Testing, comportamiento esperado | Click **Advanced → Go to Facturacion SaaS n8n (unsafe)** — es seguro |
| `redirect_uri_mismatch` en el consent | El redirect URI de Google Cloud no coincide con el de n8n | Google Cloud → Credentials → OAuth client ID → editar → agrega el URI EXACTO que muestra n8n |

### Comunicación n8n ↔ backend

| Error visible | Causa | Fix |
|---------------|-------|-----|
| `The service refused the connection` al llamar al backend desde n8n | URL usa `localhost` pero el backend escucha en IPv4 | Usa `http://127.0.0.1:8000` en el workflow y en `.env` |
| `Authorization failed - please check your credentials` en "API — Crear Factura" | Falta X-Empresa-Id o X-API-Key en el header | Verifica los headerParameters, incluyendo Content-Type: application/json |
| `X-Empresa-Id: null` | El valor no propagó entre nodos | Léelo directamente de `$('Webhook — Recibir Factura').item.json.empresaId` |
| `"Esta empresa no tiene configurado el webhook n8n de búsqueda de correos"` en el buscador | El backend leía `os.getenv("N8N_SEARCH_WEBHOOK")` (sin sufijo `_URL`) | Ya corregido: `asistente.py` ahora consulta `settings.N8N_SEARCH_WEBHOOK_URL`. Verifica que tu `.env` tenga las 3 URLs con sufijo `_URL` |
| `greenlet_spawn has not been called` en /crear-con-oficina | FK violation al usar `user_id=0` deja la sesión inutilizable | Ya solucionado: `safe_user_id = raw_user_id if raw_user_id > 0 else None` |

### Comandos útiles

```powershell
# Ver últimas ejecuciones de n8n (local)
Get-Content "$env:USERPROFILE\.n8n\n8nEventLog.log" -Tail 50

# Probar webhook directamente
curl -X POST http://127.0.0.1:5678/webhook/procesar-factura `
  -H "Content-Type: application/json" `
  -d '{\"event\":\"ping\",\"empresaId\":1}'

# Probar endpoint del backend
curl -X GET http://127.0.0.1:8000/api/empresas/me/integraciones `
  -H "Authorization: Bearer <jwt>" `
  -H "X-Empresa-Id: 1"

# Puerto 8000 ocupado
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## Parte 4 — Mantenimiento

### Cambiar el modelo Gemini

Edita los dos nodos "Analyze document" y "Analyze document Adjunto" → `modelId`
(ej. `models/gemini-2.5-flash` → `models/gemini-1.5-pro` para más precisión).

### Publicar la app de Google (sacarla de Testing)

Solo necesario si quieres que cualquier Gmail se pueda conectar sin agregar
Test users:

1. Google Cloud → OAuth consent screen → **Publish App**.
2. Requiere verificación de Google (puede tardar días o semanas).
3. Para desarrollo local, es más práctico dejar Testing y agregar los correos
   uno por uno.

### Agregar más Test users a Gmail

Google Cloud → OAuth consent screen → Test users → + Add users → pega el correo.

### Rotar API keys del tenant

```bash
POST /api/empresas/<empresa_id>/rotate-api-key
```

---

## Checklist final

- [ ] n8n levantado y accesible en `:5678`.
- [ ] Owner account creado.
- [ ] Workflow único (`workflow_facturacion_saas.json`) importado y **Active**.
- [ ] Credencial Gemini creada y asignada a los 2 nodos "Analyze document".
- [ ] (Outlook) App registrada en Azure con Redirect URI = URI de n8n, y credencial Outlook creada + asignada al nodo `Outlook · Buscar`.
- [ ] (Gmail) Proyecto en Google Cloud, **Gmail API habilitada**, correo en **Test users**, y credencial Gmail creada + asignada al nodo `Gmail · Buscar`.
- [ ] `.env` del backend con las 3 URLs `N8N_*_WEBHOOK_URL` en `127.0.0.1`.
- [ ] Migración 007 aplicada.
- [ ] Backend reiniciado.
- [ ] `/app/integraciones` muestra las 3 URLs y "Probar conexión" ✓.
- [ ] Subir un PDF crea factura + asiento CAUSACION.
- [ ] Marcar factura como PAGADA crea asiento PAGO.
- [ ] Buscar en correo devuelve la lista de PDFs (Outlook o Gmail).
- [ ] Procesar un adjunto seleccionado crea la factura.

Cuando todo esté ✓, la integración está lista.
