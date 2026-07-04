# Integración con n8n — Facturación SaaS

Arquitectura: **un solo workflow compartido + credenciales dinámicas**.

El SaaS opera una instancia n8n con los workflows compartidos que atienden a
todos los tenants. Cada cliente registra sus propias credenciales (Google
Gemini, cuenta de correo) en esa instancia n8n y pega los IDs en su panel
**/app/integraciones**. El backend inyecta esos IDs en cada payload y el
workflow los usa como `credentialId` dinámico (soportado por n8n v1.x).

```
                         ┌─────────────────────────────────┐
Frontend SaaS ─► Backend ┼─► Webhook compartido (n8n SaaS) │
                         │           │                     │
                         │           ├─ Lee apiKey + empresaId del body
                         │           ├─ Usa credential_id de Gemini dinámico
                         │           ├─ Extrae datos con Gemini
                         └◄── Crea factura ─┴─ Devuelve resultado al backend
```

Sin clonar workflows por tenant. El aislamiento queda en las **credenciales**,
no en la lógica.

## Catálogo de workflows

Estos son los 3 workflows canónicos que se importan en n8n. Todos usan
**Google Gemini nativo** — es el motor IA que validamos end-to-end. La API
key se obtiene en https://aistudio.google.com/apikey (Google AI Studio, con
cuota gratuita para `gemini-1.5-flash` y `gemini-2.5-flash`).

| Archivo | Rol | Estado |
|---------|-----|--------|
| `workflow_procesar_factura_gemini.json` | Upload manual de PDF (endpoint `/app/facturas` → botón "Subir factura") | ✅ Probado end-to-end |
| `workflow_buscar_facturas_template.json` | Fase 2: buscar correos con adjuntos (Outlook/Gmail/Yahoo/IMAP genérico) | ⚙️ Configurable, no requiere IA |
| `workflow_procesar_adjunto_template.json` | Fase 2: procesar el adjunto seleccionado (mismo patrón Gemini que el manual) | ⚙️ Listo, pendiente de prueba end-to-end |

## Modos de operación

### Modo SaaS-managed (default)

El SaaS opera la instancia n8n. El cliente solo necesita:

1. Acceso al panel n8n del SaaS (con permisos solo de Credentials).
2. Crear su credencial Gemini ahí.
3. Pegar el Credential ID en su panel del SaaS.

**Ventajas:** cero infra propia, cero mantenimiento, actualizaciones
automáticas del workflow para todos.

### Modo self-hosted (avanzado)

Cliente enterprise con su propia instancia n8n:

1. Importa los 3 workflows en su n8n.
2. Crea sus credenciales ahí.
3. Activa los workflows y copia las Production URLs.
4. En `/app/integraciones` del SaaS: cambia a "modo self-hosted" y pega URLs
   + Credential IDs.

## Setup del proveedor del SaaS (una sola vez)

Ver `../SETUP_N8N.md` para el paso a paso completo. Aquí un resumen
ejecutivo:

### 1. Levantar n8n

```bash
# Producción
docker run -d --name n8n-saas \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -e N8N_HOST=n8n.tu-saas.com \
  -e N8N_PROTOCOL=https \
  -e WEBHOOK_URL=https://n8n.tu-saas.com/ \
  n8nio/n8n

# Desarrollo local
npx n8n
```

### 2. Importar los workflows

En la UI de n8n:

1. Workflows → Import from File → escoge el JSON.
2. Asigna la credencial Google Gemini al nodo "Analyze document".
3. **Activa** el workflow (toggle Active arriba a la derecha).
4. Copia la Production URL del nodo Webhook.

Repite para los 3 archivos.

### 3. Backend

En `facturacion_fortuna/backend/.env`:

```
# Usa 127.0.0.1 en Windows (dual-stack IPv6 rompe "localhost")
N8N_PROCESS_WEBHOOK_URL=http://127.0.0.1:5678/webhook/procesar-factura
N8N_SEARCH_WEBHOOK_URL=http://127.0.0.1:5678/webhook/buscar-facturas
N8N_PROCESS_EMAIL_WEBHOOK_URL=http://127.0.0.1:5678/webhook/procesar-adjunto
```

Reinicia el backend después de editar `.env`.

> **Nota — URL de callback dentro de los workflows:** los nodos de n8n que
> hacen POST de vuelta al backend tienen la URL `http://127.0.0.1:8000`
> **hardcoded** (no leen `$env.FACTURACION_API_URL` porque
> `N8N_BLOCK_ENV_ACCESS_IN_NODE` está activo). Si tu backend corre en otro
> host o puerto, edita el campo `url` del nodo "API — Crear Factura" tras
> importar el workflow, y el fallback del `callbackUrl` en el Code node
> "Extraer Contexto" del workflow de búsqueda.

### 4. Credencial de Gemini (en el nodo)

**No uses `$env.MI_KEY` en expresiones** — está bloqueado por
`N8N_BLOCK_ENV_ACCESS_IN_NODE` en community. Asigna una credencial de n8n al
nodo (recomendado) o pasa la key como **Fixed value**.

Genera la key en https://aistudio.google.com/apikey. **NO es tu suscripción
Gemini Pro consumer** — necesitas Google AI Studio, que sí tiene cuota
gratuita para `gemini-1.5-flash` y `gemini-2.5-flash`.

## Onboarding del cliente final

Lo que ve el cliente en `/app/integraciones`:

### Modo SaaS-managed (default)

1. Soporte le da credenciales al n8n del SaaS (solo Credentials).
2. Crea su credencial Gemini ahí y guarda.
3. Copia el Credential ID de la URL.
4. `/app/integraciones` → pega el ID → Guardar.
5. Botón "Probar conexión" → `✓`.

### Modo self-hosted

1. Importa los 3 workflows en su n8n.
2. Crea credenciales ahí y activa los workflows.
3. `/app/integraciones` → cambia a modo self-hosted → pega URLs + IDs.

## Multi-provider de correo (fase 2)

El workflow `buscar_facturas_template` ramifica según `n8n_email_provider`:

| `n8n_email_provider` | Credencial en n8n |
|----------------------|-------------------|
| `outlook` | Microsoft Outlook OAuth2 |
| `gmail` | Gmail OAuth2 |
| `yahoo` | IMAP genérico con app password |
| `imap` | IMAP genérico |

## Detalles técnicos

### Payload que el backend envía al webhook `procesar-factura`

```json
{
  "event": "invoice_uploaded",
  "empresaId": 1,
  "apiKey": "<uuid>",
  "openai_credential_id": "<gemini credential id>",
  "file_path": "\\\\server\\Facturas\\<archivo>.pdf",
  "file_url": "file:////server/Facturas/<archivo>.pdf",
  "filename": "20260620_101746_845d9329_FAC-2026-101.pdf",
  "original_filename": "FAC-2026-101_honorarios_garcia.pdf",
  "uploaded_at": "2026-06-20T10:17:46",
  "pdf_base64": "JVBERi0xLjQKJdPr6eEK...",
  "pdf_mime_type": "application/pdf"
}
```

> **Nota:** el campo se sigue llamando `openai_credential_id` por
> compatibilidad histórica — hoy contiene el ID de la credencial Gemini.
> El workflow lo lee como "credencial IA" indistintamente.

El `pdf_base64` fue añadido para evitar el error
`Access to the file is not allowed. Allowed paths: ~/.n8n-files` que impone
`N8N_RESTRICT_FILE_ACCESS_TO`. El workflow lo convierte a binary con un Code
node y lo pasa al nodo IA como `binaryPropertyName: "data"`.

El workflow `procesar-adjunto` recibe el mismo payload (el backend embebe el
PDF descargado del correo antes de disparar el webhook).

### Callback del workflow al backend

El nodo "API — Crear Factura" hace `POST /api/facturas/crear-con-oficina`
con los datos extraídos por la IA. Headers:

- `X-API-Key: {{ apiKey del webhook }}`
- `X-Empresa-Id: {{ empresaId del webhook }}`
- `Content-Type: application/json`

El body se construye con `={{ JSON.stringify({ ...campos }) }}` en modo
expression — el modo raw string se rompe con `\n` en `observaciones`.

### Modelo de respuesta

El nodo final "Respond OK" devuelve el output del backend con el
`factura_id` recién creado. El backend acepta arrays de items, strings con
JSON embebido, y valida `success` como bool o string.

## FAQ

**¿Por qué un solo workflow para todos los tenants?**
Menos mantenimiento. Si mejoramos el prompt de extracción, lo cambiamos en
un lugar y todos los clientes reciben la mejora automáticamente. El
aislamiento queda en las credenciales, no en la lógica.

**¿Mi API key de Gemini viaja por la red?**
No. Solo viaja el `credential_id` (un UUID que solo es válido dentro del
n8n del SaaS). La key real nunca sale del vault de n8n.

**¿Qué pasa si me equivoco al pegar el credential ID?**
El workflow falla con `Credential not found` y el backend lo reporta como
error en el panel de Integraciones. Corrige el ID y vuelve a probar.

**¿Puedo usar OpenAI en lugar de Gemini?**
Sí, pero requiere adaptar el workflow: reemplaza el nodo "Analyze document"
(tipo `@n8n/n8n-nodes-langchain.googleGemini`) por un nodo OpenAI Chat con
input `image_url` que apunte al binary del PDF. En la versión actual del
catálogo mantenemos solo la ruta Gemini porque fue la que se validó
end-to-end.

**¿Puedo cambiar de modelo Gemini sin migrar datos?**
Sí. Edita el nodo "Analyze document" y cambia el campo `modelId`
(`gemini-1.5-flash`, `gemini-2.5-flash`, `gemini-1.5-pro`). Afecta a todos
los tenants inmediatamente.

**¿Qué versión de n8n se probó?**
n8n community 2.12.3 (`npx` local en Windows) y n8n 1.68+ (Docker). Nodos
usados: `webhook`, `code` (typeVersion 2), `googleGemini` (typeVersion 1.1),
`if`, `httpRequest` (typeVersion 4.2), `respondToWebhook` (typeVersion 1),
`set` (typeVersion 3).
