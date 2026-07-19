# Seguridad — Facturación SaaS

Checklist y notas de la revisión de seguridad realizada en julio de 2026.
Léelo antes de desplegar a producción, y revísalo periódicamente.

## Modelo de amenazas

**Assets protegidos**:
- Datos de facturación multi-tenant (facturas, proveedores, PUC, asientos).
- Credenciales OAuth (Gmail / Outlook refresh tokens).
- Credenciales DIAN (cédulas, NITs, emails — **nunca** contraseñas).
- Passwords de usuarios (bcrypt cost 13).
- API keys por empresa.

**Adversarios considerados**:
- Otros tenants (aislamiento multi-empresa — cada request valida `empresa_id`).
- Atacante externo con red visibility (rate limiting, security headers, HTTPS).
- Insider con acceso a la BD (todo secreto va encriptado con Fernet).
- Bots (rate limiting en login/register).

**Fuera de scope**:
- Ataques al hardware / hipervisor.
- Compromiso del entorno del cliente (su laptop).
- Ingeniería social.

## Controles implementados

### Autenticación
- JWT HS256 con `JWT_SECRET_KEY` del `.env`. Access token 60 min, refresh 7 días.
- Bcrypt cost=13 para hashes de password (≈500ms/hash en 2026 hardware).
- Complejidad de password: ≥8 chars + al menos 1 dígito + 1 letra, máximo 200.
- Rate limiting login (5/15min por IP) y register (3/30min).
- `X-Forwarded-For` solo se acepta si viene de un proxy en `TRUSTED_PROXIES`.

### Autorización
- `get_current_empresa` valida acceso del user a la empresa activa (fila en `Usuarios_Empresa` o `es_superadmin`).
- Middleware ASGI dual: JWT Bearer + X-API-Key. Rutas públicas por regex estricto (no `endswith`).
- `X-API-Key` valida formato antes de golpear la BD (bloquea garbage).

### Multi-tenancy
- Cada tabla de negocio tiene `empresa_id` (backfilled en migración inicial).
- Todos los endpoints filtran por `empresa.id` obtenida desde el header `X-Empresa-Id` y validada.
- Cambio de empresa activa reinicia el estado del cliente.

### Secretos en reposo
- Encriptados con Fernet (AES-128-CBC + HMAC-SHA256) usando `FERNET_KEY` del `.env`.
- Objetos encriptados: OAuth refresh tokens, DIAN cédulas/NITs/emails, FTP passwords, Gemini API keys por tenant.
- La `FERNET_KEY` **no está en el repo** — se genera con `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.

### Secretos en tránsito
- HTTPS terminado en el reverse proxy (nginx/traefik).
- HSTS activado automáticamente cuando `PRODUCTION_MODE=True`.
- CORS con lista blanca de origins.

### Passwords sensibles NUNCA persistidos
- Contraseñas del portal DIAN (métodos `administrador` y `usuario_autorizado`): viajan del frontend al backend por HTTPS → como argumento del thread de Playwright → se descartan al terminar. Cero puntos de escritura a disco.
- Solo se guarda encriptado el `storage_state` de la sesión Playwright (cookies).

### OAuth
- `state` es one-shot (`_consume_state()` saca del cache al validar).
- TTL 10 min sobre el `state`.
- Cache con hard cap (10k entries) contra abuso.
- Sweep automático de entries expiradas en cada `authorize`.
- El `state` guarda `(empresa_id, initiator_user_id)` — el user_id se loguea en el callback para auditoría.

### PDF serving
- Middleware ya no permite bypass genérico por sufijo `/pdf` (era un IDOR).
- Rutas de PDF son públicas por necesidad (browser no envía JWT al abrir tab), pero cada endpoint verifica:
  1. `?t=` token HMAC firmado con `JWT_SECRET_KEY` (kind + resource_id + empresa_id + exp).
  2. Path traversal — `Path.resolve()` y validación de que sigue debajo del dir base.
- Servicio `services/signed_urls.py` genera/verifica tokens.

### Security headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` restringiendo geolocation, camera, microphone, payment, usb.
- `Strict-Transport-Security` solo cuando `PRODUCTION_MODE=True`.

### Guard de arranque
- `enforce_production_readiness()` corre en el lifespan de FastAPI.
- Si `PRODUCTION_MODE=True` y detecta credenciales por defecto, `FERNET_KEY` faltante, o `JWT_SECRET_KEY` genérica, ABORTA el arranque con `RuntimeError`. Mejor romper el deploy que servir con defaults.

## Checklist pre-producción

Antes de hacer `PRODUCTION_MODE=True` en el `.env`:

- [ ] `JWT_SECRET_KEY` generada con `python -c "import secrets; print(secrets.token_urlsafe(64))"` y ≥ 64 chars.
- [ ] `FERNET_KEY` generada con `Fernet.generate_key()` y guardada fuera del repo.
- [ ] `SUPERADMIN_EMAIL` cambiado de `admin@admin.com`.
- [ ] `SUPERADMIN_PASSWORD` reemplazado por una passphrase ≥ 16 chars.
- [ ] Password de PostgreSQL rotado (el default `PalmCoder26` era de dev).
- [ ] `CORS_ORIGINS` restringido al dominio real de producción (quitar localhosts).
- [ ] `API_KEY` legada eliminada del `.env` si ya no se usa (o rotada si sí).
- [ ] `TRUSTED_PROXIES` seteado a la IP del reverse proxy (nginx/traefik/cloudflare).
- [ ] `REQUIRE_SIGNED_PDF_URLS=True` cuando el frontend esté migrado a usar los signed URLs.
- [ ] `DEBUG=False` (deshabilita `/dev/seed-fixture` etc.).
- [ ] Firewall permitiendo solo puertos 443 / 80. PostgreSQL NO expuesto.
- [ ] Backups de la BD encriptados + fuera del server.
- [ ] Logs sin PII sensible (verificar con `grep -E "password|cedula" server.log`).
- [ ] Rotación de logs (logrotate/journald).
- [ ] Dependencias actualizadas: `pip list --outdated`, `pip-audit`.
- [ ] Instalar Playwright browser en el server: `playwright install chromium`.

## Segunda pasada — controles añadidos

La revisión de julio 2026 añadió:

### Rate limiter multi-worker (Postgres-backed)

- `services/rate_limit_db.py` reemplaza el limiter in-memory.
- Buckets por IP + email en `/login`, por IP en `/register`, por empresa en `/dian/sync/start`.
- Ventana deslizante en tabla `rate_limit_events`, con GC lazy (2% de requests).
- Sobrevive a restarts y funciona con N workers.

### JWT revocation (jti + blacklist)

- Cada token trae `jti` (32 hex chars) generado con `secrets.token_hex(16)`.
- `services/token_blacklist.py` con cache in-memory de 30s TTL para no golpear Postgres cada request.
- Endpoint `POST /api/auth/logout` (autenticado) revoca el token del usuario.
- Cache invalida automáticamente cuando el token expira de todas formas.
- Escala: 1 lookup a Postgres por token cada ≤30s.

### File upload validation por magic bytes

- `services/upload_validation.py` valida por PDF/JPEG/PNG magic bytes.
- Aplicado en `POST /contratos/{id}/upload-pdf`.
- Rechaza archivos vacíos, demasiado grandes (20MB default), o de tipo no permitido.
- El header `Content-Type` sigue siendo informativo — se ignora.

### Audit log estructurado

- Tabla `audit_log` con: `ts`, `empresa_id`, `user_id`, `action`, `resource_type/id`, `ip`, `user_agent`, `result`, `details` (JSONB).
- `services/audit.py` con `log_action()` helper — nunca falla, si Postgres se cae solo loguea a stderr.
- Hooks:
  - `auth.login`, `auth.login_failed`, `auth.logout`, `auth.register`
  - `dian.config_update`, `dian.sync_start`
- Pendiente hookear: `oauth.*.connect/disconnect`, `usuario.role_change`, `empresa.api_key_rotated`.

### Signed URLs — migración completa del frontend

- Endpoints nuevos: `GET /api/facturas/{id}/pdf-url` y `GET /api/contratos/{id}/pdf-url` (autenticados, devuelven URL firmada con TTL 5min).
- Helper frontend `utils/pdfUrl.ts` centraliza las llamadas.
- Migrados 5 sitios: `FacturasPage` (dos), `PagosPage`, `Dashboard`, `ContractModal`.
- Cuando confirmes que todo funciona, activa `REQUIRE_SIGNED_PDF_URLS=True` en prod para exigir el token siempre.

### API_KEY legada — warning al arrancar

- Si `settings.API_KEY` está seteada, el startup emite un warning explícito recomendando migrar a api_key por empresa.

### Script CI `scripts/security-audit.sh`

- `pip-audit` sobre `requirements.txt`.
- `npm audit --production --audit-level=high` sobre frontend.
- `git grep` de patrones sensibles + `git ls-files` de `.env`.
- Exit code 0/1 para uso en pipelines.

---

## Tercera pasada — controles añadidos (migración 013)

### 2FA (TOTP)

- Endpoints en `routers/auth.py`:
  - `GET /api/auth/2fa/status`
  - `POST /api/auth/2fa/setup` (genera secret base32 + provisioning URI)
  - `POST /api/auth/2fa/verify-setup` (confirma con TOTP; solo entonces activa)
  - `POST /api/auth/2fa/disable` (exige password + código actual)
- Integrado en `/login`: si `two_factor_enabled`, exige `totp_code`. Backend devuelve 401 con `code: "2fa_required"` para que el UI pida el campo.
- Secret guardado encriptado (Fernet) en `usuarios.two_factor_secret_enc`.
- Frontend `/app/seguridad` con setup guiado (QR + verificación).
- Ventana de tolerancia: ±30s por desincronización de reloj.
- Sin códigos de recuperación aún (pendiente — implica UX de "guarda estos códigos").

### AV scan (heurística inline)

- `services/av_scan.py` con marcadores comunes en PDFs maliciosos: `/JavaScript`, `/Launch`, `/EmbeddedFile`, `/RichMedia`, `/SubmitForm`.
- Se ejecuta desde `services/upload_validation.py` solo cuando `settings.AV_SCAN_ENABLED=True`.
- **NO es un antivirus** — es defensa en profundidad contra PDFs con acciones ejecutables.
- Extension point: reemplazar `_heuristic_pdf_scan` con ClamAV vía `clamd` o VirusTotal API cuando se necesite.

### Audit log — endpoint y hooks completos

- `GET /api/audit-log` (ADMIN-only) con filtros por fecha, action prefix, user, resource, result. Paginado 50/página.
- `GET /api/audit-log/actions` devuelve las acciones únicas con conteo (para poblar dropdown UI).
- Página `/app/auditoria` en el frontend con tabla, filtros y detalle expandible.
- Hooks agregados en:
  - `auth.login`, `auth.login_failed`, `auth.logout`, `auth.register`, `auth.2fa_enabled`, `auth.2fa_disabled`
  - `oauth.gmail.connect/disconnect`, `oauth.outlook.connect/disconnect`
  - `usuario.create`, `usuario.update`, `usuario.deactivate`, `usuario.role_change`
  - `empresa.api_key_rotated`
  - `dian.config_update`, `dian.sync_start`

### Cleanup periódico

- Background task en el `lifespan` de FastAPI cada 6 horas (`services/security_cleanup.py`).
- Standalone script `scripts/cleanup_security.py` para cron (Linux) o Task Scheduler (Windows).
- Limpia: `rate_limit_events` con antigüedad > 2h, `token_blacklist` cuyo `expires_at` ya pasó.
- `audit_log` **NUNCA** se limpia (append-only por diseño).

---

## Amenazas conocidas pendientes

Ver `docs/security-backlog.md` (por crear) para el detalle. Lo restante requiere infra externa o decisión de producto:

### AV scan real (ClamAV / VirusTotal)

**Impacto**: la heurística de `av_scan.py` bloquea PDFs con acciones ejecutables comunes, pero no detecta payloads sofisticados dentro del PDF (fuentes malformadas, exploits en el parser del cliente).

**Mitigación**: integrar ClamAV vía `clamd` (Linux, socket local) o VirusTotal Public API. La interfaz `scan_bytes(kind, contents) -> ScanResult` ya está lista — solo cambia la implementación.

### Códigos de recuperación 2FA

**Impacto**: si el usuario pierde el authenticator + no configuró backup, queda bloqueado.

**Mitigación futura**: generar 10 códigos one-shot al activar 2FA, guardarlos hasheados (bcrypt), permitir uso en login como alternativa al TOTP.

### Rate limiter — futuro Redis

**Impacto**: la implementación Postgres funciona bien hasta ~5k req/min. Para picos más altos o para revocación instantánea de JWTs entre workers, Redis con pub/sub es más eficiente.

**Mitigación**: la interfaz `check_rate_limit()` y `is_revoked()` ya están abstractas, solo cambia el backend.

## Reporte de vulnerabilidades

Si encuentras un bug de seguridad, **no** lo publiques en un issue. Escribe a
security@[dominio-empresa].com con detalles y esperamos 90 días de disclosure
responsable.
