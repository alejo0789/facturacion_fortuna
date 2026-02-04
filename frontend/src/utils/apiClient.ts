/**
 * API Client con autenticación automática
 * Agrega el header X-API-Key y headers de usuario a todas las peticiones
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const API_KEY = import.meta.env.VITE_API_KEY || '';

export interface FetchOptions extends RequestInit {
    params?: Record<string, string | number>;
}

/**
 * Get user identity from localStorage for auth headers
 */
function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    try {
        const stored = localStorage.getItem('identity');
        if (stored) {
            const identity = JSON.parse(stored);
            if (identity.id) {
                headers['X-User-Id'] = String(identity.id);
            }
            const rolId = identity.rol_id ?? identity.rol?.id;
            if (rolId) {
                headers['X-User-Rol-Id'] = String(rolId);
            }
            if (identity.primer_nombre) {
                headers['X-User-Name'] = `${identity.primer_nombre} ${identity.primer_apellido || ''}`.trim();
            }
        } else {
            // Localhost development fallback - use super admin ID from env or default
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (isLocalhost) {
                // Use a default super admin ID for development (should match SUPER_ADMIN_USER_IDS in backend .env)
                headers['X-User-Id'] = import.meta.env.VITE_DEV_USER_ID || '725';
                headers['X-User-Name'] = 'Dev Super Admin';
            }
        }
    } catch (e) {
        console.error('Error reading identity from localStorage:', e);
    }
    return headers;
}

/**
 * Wrapper de fetch que agrega automáticamente la API Key y headers de autenticación
 */
export async function apiFetch(endpoint: string, options: FetchOptions = {}): Promise<Response> {
    const { params, ...fetchOptions } = options;

    // Construir URL con parámetros si existen
    let url = `${API_URL}${endpoint}`;
    if (params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            searchParams.append(key, String(value));
        });
        url += `?${searchParams.toString()}`;
    }

    // Agregar headers de autenticación
    const headers = new Headers(fetchOptions.headers);
    headers.set('X-API-Key', API_KEY);

    // Add user auth headers for role-based filtering
    const authHeaders = getAuthHeaders();
    Object.entries(authHeaders).forEach(([key, value]) => {
        headers.set(key, value);
    });

    // Si hay body y no es FormData, agregar Content-Type
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }

    // Realizar la petición
    const response = await fetch(url, {
        ...fetchOptions,
        headers
    });

    return response;
}

/**
 * Helper para peticiones GET
 */
export async function apiGet<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
    const response = await apiFetch(endpoint, { method: 'GET', params });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

/**
 * Helper para peticiones POST
 */
export async function apiPost<T>(endpoint: string, data?: any): Promise<T> {
    const response = await apiFetch(endpoint, {
        method: 'POST',
        body: data instanceof FormData ? data : JSON.stringify(data)
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

/**
 * Helper para peticiones PUT
 */
export async function apiPut<T>(endpoint: string, data?: any): Promise<T> {
    const response = await apiFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

/**
 * Helper para peticiones DELETE
 */
export async function apiDelete<T>(endpoint: string): Promise<T> {
    const response = await apiFetch(endpoint, { method: 'DELETE' });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

// Exportar también la URL base para casos especiales
export { API_URL };

