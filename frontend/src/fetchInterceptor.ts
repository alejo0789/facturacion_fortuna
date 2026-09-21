/**
 * Interceptor global de fetch para el SaaS multi-tenant.
 *
 * Inyecta automáticamente:
 *  - Authorization: Bearer <access_token>   (si hay sesión)
 *  - X-Empresa-Id: <id>                     (si hay empresa activa)
 *  - X-API-Key: <api_key>                   (fallback legacy)
 *
 * Manejo de 401 en request autenticada:
 *  1. Si hay refresh_token guardado y no venimos ya del propio /auth/refresh,
 *     se llama a POST /api/auth/refresh (una sola vez a la vez, aunque N
 *     requests reciban 401 en paralelo — deduplicamos con un promise cache).
 *  2. Si el refresh devuelve un access_token nuevo, se guarda y se
 *     reintenta la request original con el Bearer nuevo — el usuario no ve
 *     nada, la página sigue viva sin re-loguear.
 *  3. Si el refresh falla (refresh_token expiró, backend caído, etc.), ahí
 *     sí limpiamos storage y disparamos `fortuna:logout` para que el router
 *     mande a /login.
 */
import { authStorage } from './auth/AuthContext';

const LEGACY_API_KEY = import.meta.env.VITE_API_KEY || '';
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

const originalFetch = window.fetch;

// Deduplica llamadas concurrentes al endpoint /auth/refresh: si 10 requests
// reciben 401 a la vez, solo se dispara 1 refresh. Todas esperan la misma
// promesa y siguen con el token nuevo.
let refreshPromise: Promise<string | null> | null = null;

function requestUrl(resource: RequestInfo | URL): string {
    if (typeof resource === 'string') return resource;
    if (resource instanceof URL) return resource.toString();
    return resource.url;
}

async function refreshAccessToken(): Promise<string | null> {
    if (refreshPromise) return refreshPromise;

    const refreshToken = authStorage.getRefreshToken();
    if (!refreshToken) return null;

    refreshPromise = (async () => {
        try {
            const res = await originalFetch(`${API_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (typeof data?.access_token === 'string') {
                authStorage.setAccessToken(data.access_token);
                return data.access_token;
            }
            return null;
        } catch {
            return null;
        } finally {
            // Liberar el lock en el siguiente tick para que requests que
            // llegaron mientras corría el refresh también agarren el resultado.
            setTimeout(() => { refreshPromise = null; }, 0);
        }
    })();

    return refreshPromise;
}

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

    const urlStr = requestUrl(resource);
    const isApiCall = urlStr.includes('/api/');
    // Evitar loop: no intentar refresh sobre el propio /auth/refresh ni /auth/login
    const isAuthEndpoint = urlStr.includes('/api/auth/refresh')
        || urlStr.includes('/api/auth/login');

    let response = await originalFetch(resource, { ...config, headers });

    // ---- 401 con token: intentar refresh + retry silencioso ----
    if (response.status === 401 && token && isApiCall && !isAuthEndpoint) {
        const newToken = await refreshAccessToken();
        if (newToken) {
            // Reintentar la request original con el Bearer nuevo. Los otros
            // headers (incluyendo X-Empresa-Id) se conservan tal cual.
            headers['Authorization'] = `Bearer ${newToken}`;
            response = await originalFetch(resource, { ...config, headers });
            // Si el retry sigue en 401, entonces sí caemos al auto-logout.
        }
        if (response.status === 401) {
            authStorage.clear();
            window.dispatchEvent(new CustomEvent('fortuna:logout'));
        }
    }

    return response;
};

if (import.meta.env.DEV) {
    console.log('✅ fetchInterceptor SaaS: JWT + X-Empresa-Id + auto-refresh activos');
}
