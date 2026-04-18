/**
 * API Client tipado.
 *
 * El fetchInterceptor global ya inyecta Authorization/X-Empresa-Id/X-API-Key,
 * así que aquí sólo nos encargamos de construir URLs, manejar JSON/FormData
 * y lanzar errores legibles al consumidor.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

    let url = `${API_URL}${endpoint}`;
    if (params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            searchParams.append(key, String(value));
        });
        url += `?${searchParams.toString()}`;
    }

    const headers = new Headers(fetchOptions.headers);
    // El interceptor se encarga de Authorization/X-Empresa-Id.
    // Sólo ponemos Content-Type cuando no es FormData.
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
