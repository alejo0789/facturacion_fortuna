/**
 * API Client tipado.
 *
 * Inyecta Authorization + X-Empresa-Id LEYENDO directamente authStorage,
 * sin depender del fetchInterceptor global. Esto evita el bug en que las
 * páginas que usaban este cliente quedaban sin auth si el interceptor no
 * había cargado o lo sobrescribía otra librería.
 */
import { authStorage } from '../auth/AuthContext';

/**
 * Normaliza VITE_API_URL para que SIEMPRE termine en `/api`.
 * Acepta cualquiera de estas formas:
 *   - VITE_API_URL=http://localhost:8000          → http://localhost:8000/api
 *   - VITE_API_URL=http://localhost:8000/         → http://localhost:8000/api
 *   - VITE_API_URL=http://localhost:8000/api      → http://localhost:8000/api
 *   - VITE_API_URL=http://localhost:8000/api/     → http://localhost:8000/api
 * Esto evita el bug histórico en que el .env tenía la base sin /api y todos
 * los endpoints respondían 404 porque el backend monta los routers en /api/...
 */
function normalizeApiUrl(raw: string): string {
    const trimmed = raw.replace(/\/+$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL || 'http://localhost:8000');
const LEGACY_API_KEY = import.meta.env.VITE_API_KEY || '';

export interface FetchOptions extends RequestInit {
    params?: Record<string, string | number>;
}

export class ApiError extends Error {
    status: number;
    detail: unknown;
    constructor(status: number, detail: unknown, message: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.detail = detail;
    }
}

async function parseError(response: Response): Promise<ApiError> {
    let detail: unknown = null;
    let message = `HTTP ${response.status}`;
    try {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            detail = await response.json();
            // FastAPI devuelve {detail: "..."} o {detail: [{...}]}
            const d = (detail as { detail?: unknown }).detail;
            if (typeof d === 'string') message = d;
            else if (Array.isArray(d) && d.length > 0) {
                message = d.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join('; ');
            }
        } else {
            message = await response.text();
        }
    } catch {
        /* ignore */
    }
    return new ApiError(response.status, detail, message);
}

export async function apiFetch(endpoint: string, options: FetchOptions = {}): Promise<Response> {
    const { params, ...fetchOptions } = options;

    // Idempotente: si el endpoint ya viene con `/api/` (estilo viejo), no lo
    // duplicamos. API_URL ya termina en `/api` después de normalizeApiUrl().
    const cleanEndpoint = endpoint.startsWith('/api/')
        ? endpoint.slice(4)               // '/api/foo' → '/foo'
        : endpoint.startsWith('api/')
            ? endpoint.slice(3)            // 'api/foo' → '/foo' would need a leading slash; handled below
            : endpoint;
    let url = `${API_URL}${cleanEndpoint.startsWith('/') ? cleanEndpoint : '/' + cleanEndpoint}`;
    if (params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            searchParams.append(key, String(value));
        });
        url += `?${searchParams.toString()}`;
    }

    const headers = new Headers(fetchOptions.headers);

    // Authorization: Bearer JWT (si hay sesión)
    const token = authStorage.getAccessToken();
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    // X-Empresa-Id: tenant activo
    const empresaId = authStorage.getEmpresaActivaId();
    if (empresaId && !headers.has('X-Empresa-Id')) {
        headers.set('X-Empresa-Id', String(empresaId));
    }
    // X-API-Key legacy (sólo si no hay JWT)
    if (!token && LEGACY_API_KEY && !headers.has('X-API-Key')) {
        headers.set('X-API-Key', LEGACY_API_KEY);
    }
    // Content-Type cuando hay body JSON (no para FormData)
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    return fetch(url, { ...fetchOptions, headers });
}

export async function apiGet<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
    const response = await apiFetch(endpoint, { method: 'GET', params });
    if (!response.ok) throw await parseError(response);
    return response.json();
}

export async function apiPost<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await apiFetch(endpoint, {
        method: 'POST',
        body: data instanceof FormData ? data : JSON.stringify(data ?? {}),
    });
    if (!response.ok) throw await parseError(response);
    return response.json();
}

export async function apiPut<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await apiFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data ?? {}),
    });
    if (!response.ok) throw await parseError(response);
    return response.json();
}

export async function apiDelete<T>(endpoint: string): Promise<T> {
    const response = await apiFetch(endpoint, { method: 'DELETE' });
    if (!response.ok) throw await parseError(response);
    return response.json();
}

export { API_URL };
