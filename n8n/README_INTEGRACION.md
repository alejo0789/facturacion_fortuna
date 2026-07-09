# Integración con n8n — Facturación SaaS

Arquitectura: **un solo workflow compartido + credenciales dinámicas**.

El SaaS opera una instancia n8n con **un único workflow consolidado**
(`workflow_facturacion_saas.json`) que expone 3 endpoints webhook y atiende
a todos los tenants. Cada cliente registra sus propias credenciales (Google
Gemini + Outlook/Gmail) en esa instancia y pega los IDs en su panel
`/app/integraciones`. El backend inyecta esos IDs en cada payload y el
workflow los usa como `credentialId` dinámico (soportado por n8n v1.x).

```
                         ┌──────────────────────────────────────────┐
Frontend SaaS ─► Backend ┼─► /webhook/procesar-factura              │
                         ├─► /webhook/procesar-adjunto              │
                         ├─► /webhook/buscar-facturas               │
                         │           │                              │
                         │           ├─ Lee apiKey + empresaId del body
                         │           ├─ Usa credential_id de Gemini/Outlook/Gmail
                         │           ├─ Extrae datos con Gemini nativo
                         └◄── Crea factura ─┴─ Devuelve resultado al backend
```

## Un solo workflow para 3 endpoints

En `n8n/workflow_facturacion_saas.json` conviven 3 sub-flujos aislados:

| Sub-flujo | Webhook path | Rol | Estado |
|-----------|--------------|-----|--------|
| Procesar Factura | `/webhook/procesar-factura` | Upload manual de PDF desde el frontend | ✅ Probado end-to-end |
| Buscar Facturas | `/webhook/buscar-facturas` | Buscar correos con adjuntos (Outlook o Gmail) | ✅ Probado con Outlook end-to-end |
| Procesar Adjunto | `/webhook/procesar-adjunto` | Procesar el adjunto seleccionado desde el buscador | ⚙️ Listo, mismo patrón Gemini que el manual |

Todos usan **Google Gemini nativo** para la extracción IA. La API key se
obtiene en https://aistudio.google.com/apikey.

**Providers de correo soportados actualmente**: Outlook (Microsoft Graph vía
HTTP directo con `$expand=attachments`) y Gmail (nodo nativo n8n).

## Modos de operación

### Modo SaaS-managed (default)

El SaaS opera la instancia n8n. El cliente solo necesita:

1. Acceso al panel n8n del SaaS (con permisos solo de Credentials).
2. Crear sus credenciales Gemini + Outlook/Gmail ahí.
3. Pegar los IDs en su panel del SaaS.

**Ventajas:** cero infra propia, cero mantenimiento, actualizaciones
automáticas del workflow para todos.

### Modo self-hosted (avanzado)

Cliente enterprise con su propia instancia n8n:

1. Importa el workflow en su n8n.
2. Crea sus credenciales ahí.
3. Activa el workflow y copia las Production URLs de los 3 webhooks.
4. En `/app/integraciones` del SaaS: cambia a "modo self-hosted" y pega
   URLs + Credential IDs.

## Setup del proveedor del SaaS (una sola vez)

Ver **`../SETUP_N8N.md`** para el paso a paso completo con todos los
tropiezos comunes documentados (particularmente Azure/Entra para Outlook
y "Test users" + habilitar Gmail API para Gmail).

Resumen ejecutivo:

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

### 2. Importar el workflow

1. Workflows → Import from File → `workflow_facturacion_saas.json`.
2. Se importan 3 sub-flujos aislados en el mismo canvas.
3. Toggle **Active**.

### 3. Backend

En `facturacion_fortuna/backend/.env`:

```
# Usa 127.0.0.1 en Windows (dual-stack IPv6 rompe "localhost")
N8N_PROCESS_WEBHOOK_URL=http://127.0.0.1:5678/webhook/procesar-factura
N8N_SEARCH_WEBHOOK_URL=http://127.0.0.1:5678/webhook/buscar-facturas
N8N_PROCESS_EMAIL_WEBHOOK_URL=http://127.0.0.1:5678/webhook/procesar-adjunto
```

Reinicia el backend después de editar `.env`.

> **Nota — URL de callback dentro del workflow:** los nodos que hacen POST
> de vuelta al backend tienen la URL `http://127.0.0.1:8000` **hardcoded**
> (no leen `$env.FACTURACION_API_URL` porque `N8N_BLOCK_ENV_ACCESS_IN_NODE`
> está activo). Si tu backend corre en otro host o puerto, edita el campo
> `url` de los nodos "API — Crear Factura" tras importar, y el fallback del
> `callbackUrl` en el Code node "Extraer Contexto" del sub-flujo de búsqueda.

### 4. Credenciales

- **Google Gemini (PaLM) API**: 1 credencial → asignar en los 2 nodos "Analyze document".
- **Microsoft Outlook OAuth2 API** (si vas a soportar Outlook): 1 credencial → asignar en el nodo `Outlook · Buscar` como **Predefined Credential Type**.
- **Gmail OAuth2 API** (si vas a soportar Gmail): 1 credencial → asignar en el nodo `Gmail · Buscar`.

Ver SETUP_N8N.md para el paso a paso de cada una, incluyendo cómo evitar los
errores comunes (`AADSTS16000` con cuentas personales Microsoft, "Acceso
bloqueado" de Google por Test users, Gmail API deshabilitada).

## Onboarding del cliente final

### Modo SaaS-managed

1. Soporte le da credenciales al n8n del SaaS (solo Credentials).
2. Crea su credencial Gemini + Outlook o Gmail ahí.
3. `/app/integraciones` → pega los IDs y escoge provider → Guardar → Probar
   conexión → `✓`.

### Modo self-hosted

1. Importa el workflow en su n8n.
2. Crea sus 2-3 credenciales ahí y activa el workflow.
3. `/app/integraciones` → cambia a modo self-hosted → pega URLs + IDs.

## Payload de referencia

### Webhook `/webhook/procesar-factura` (POST desde backend)

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

El `pdf_base64` fue añadido para evitar
`Access to the file is not allowed. Allowed paths: ~/.n8n-files` que impone
`N8N_RESTRICT_FILE_ACCESS_TO`.

### Webhook `/webhook/buscar-facturas` (POST desde backend)

```json
{
  "requestId": "8ae12b3f-116d-4bcf-9bf6-8efed088ba58",
  "apiKey": "<uuid>",
  "empresaId": 1,
  "startDate": "2026-07-04",
  "endDate": "2026-07-06",
  "email": "christiandanilo26@gmail.com",
  "email_provider": "outlook",
  "credential_email_id": "<outlook o gmail credential id>"
}
```

El workflow responde inmediatamente (Response Mode: onReceived) y hace
callback al backend con la lista de PDFs encontrados:

`POST /api/asistente/callback/search-results` con:

```json
{
  "requestId": "8ae12b3f-...",
  "files": [
    {
      "filename": "FAC-2026-101.pdf",
      "size": 3284,
      "date": "2026-07-04T19:20:25Z",
      "sender": "christiandanilo26@gmail.com",
      "subject": "Facturas para saas-multitenant",
      "messageId": "AAMkAD...",
      "attachmentId": "AAMkAD...",
      "provider": "outlook",
      "content_base64": "JVBERi0xLjQK..."
    }
  ]
}
```

### Webhook `/webhook/procesar-adjunto` (POST desde backend)

Mismo formato que `/procesar-factura` — el backend embebe el PDF como
`pdf_base64` antes de disparar el webhook.

## FAQ

**¿Por qué un solo workflow para todos los tenants?**
Menos mantenimiento. Si mejoramos el prompt de extracción, lo cambiamos en
un lugar y todos los clientes reciben la mejora automáticamente.

**¿Mi API key de Gemini viaja por la red?**
No. Solo viaja el `credential_id` (un UUID que solo es válido dentro del
n8n del SaaS).

**¿Puedo usar OpenAI en lugar de Gemini?**
Sí, pero requiere adaptar el workflow: reemplaza los nodos "Analyze
document" (tipo `@n8n/n8n-nodes-langchain.googleGemini`) por nodos OpenAI
Chat con input `image_url`. En la versión actual del catálogo mantenemos
solo la ruta Gemini porque fue la que se validó end-to-end.

**¿Por qué se quitó Yahoo/IMAP?**
Yahoo requiere app passwords que muchos usuarios no tienen habilitados, y
IMAP genérico es tan variable que rara vez funciona sin configuración
manual. Outlook y Gmail cubren >90% de los casos. Yahoo/IMAP se pueden
agregar de vuelta editando el Switch node y creando su rama de nodo.

**¿Qué versión de n8n se probó?**
n8n community 2.12.3 (`npx` local en Windows). Nodos usados:
`webhook`, `code` (v2), `googleGemini` (v1.1), `if`, `httpRequest` (v4.2),
`respondToWebhook` (v1), `set` (v3), `switch` (v2), `gmail` (v2).
