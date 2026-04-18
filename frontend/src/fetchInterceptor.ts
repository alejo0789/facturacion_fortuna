/**
 * Interceptor global de fetch para el SaaS multi-tenant.
 *
 * Inyecta automáticamente:
 *  - Authorization: Bearer <access_token>   (si hay sesión)
 *  - X-Empresa-Id: <id>                     (si hay empresa activa)
 *  - X-API-Key: <api_key>                   (fallback legacy, si está configurada
 *                                            y no hay token — preserva compatibilidad
 *                                            con integraciones viejas de n8n, etc.)
 *
 * Si el backend responde 401 a una request autenticada, dispara `fortuna:logout`
 * para que AuthContext limpie la sesión y el router mande a /login.
 */
import { authStorage } from './auth/AuthContext';

const LEGACY_API_KEY = import.meta.env.VITE_API_KEY || '';

const originalFetch = window.fetch;

window.fetch = async function (...args) {
    let [resource, config] = args as [RequestInfo | URL, RequestInit | undefined];

    if (!config) config = {};
    if (!config.headers) config.headers = {};

    // Normalizar headers a objeto plano
    if (config.headers instanceof Headers) {
        const headersObj: Record<string, string> = {};
        (config.headers as Headers).forEach((value, key) => {
            headersObj[key] = value;
        });
        config.headers = headersObj;
    } else if (Array.isArray(config.headers)) {
        const headersObj: Record<string, string> = {};
        for (const [k, v] of config.headers as [string, string][]) {
            headersObj[k] = v;
        }
        config.headers = headersObj;
    }

    const headers = config.headers as Record<string, string>;

    // ---- JWT Bearer ----
    const token = authStorage.getAccessToken();
    if (token && !headers['Authorization'] && !headers['authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // ---- X-Empresa-Id (tenant activo) ----
    const empresaId = authStorage.getEmpresaActivaId();
    if (empresaId && !headers['X-Empresa-Id'] && !headers['x-empresa-id']) {
        headers['X-Empresa-Id'] = String(empresaId);
    }

    // ---- X-API-Key legacy (sólo si NO hay JWT) ----
    if (!token && LEGACY_API_KEY && !headers['X-API-Key'] && !headers['x-api-key']) {
        headers['X-API-Key'] = LEGACY_API_KEY;
    }

    const response = await originalFetch(resource, { ...config, headers });

    // ---- Auto-logout en 401 cuando había token ----
    if (response.status === 401 && token) {
        // Evitar loop: sólo limpiar + avisar si era una request de API
        const urlStr = typeof resource === 'string'
            ? resource
            : resource instanceof URL ? resource.toString() : resource.url;
        if (urlStr.includes('/api/')) {
            authStorage.clear();
            window.dispatchEvent(new CustomEvent('fortuna:logout'));
            // No redirigimos aquí — ProtectedRoute detecta !isAuthenticated y
            // hace el redirect dentro del árbol React.
        }
    }

    return response;
};

console.log('✅ fetchInterceptor SaaS: JWT + X-Empresa-Id activos');
