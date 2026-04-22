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
export function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    try {
        const stored = localStorage.getItem('identity');
        if (stored) {
            const identity = JSON.parse(stored);
            // Support both 'usuario' (manager) and 'user' (others)
            const userObj = identity.usuario || identity.user || identity;
            
            if (userObj.id) headers['X-User-Id'] = String(userObj.id);
            
            const rolId = userObj.rol_id ?? userObj.rol?.id;
            if (rolId) headers['X-User-Rol-Id'] = String(rolId);
            
            const name = userObj.name || userObj.primer_nombre ? `${userObj.primer_nombre || ''} ${userObj.primer_apellido || ''}`.trim() : '';
            if (name) headers['X-User-Name'] = name;
            
            const email = userObj.notificaciones?.data || userObj.email;
            if (email) headers['X-User-Email'] = email;
            
            // Failsafe: if we have a partial "identity" object (like a dummy dev identity)
            // that lacks an email and id, we manually inject our Super Admin values (ONLY IN DEV).
            if (!headers['X-User-Id'] && !headers['X-User-Email'] && import.meta.env.DEV) {
                headers['X-User-Id'] = import.meta.env.VITE_DEV_USER_ID || '725';
                headers['X-User-Name'] = userObj.nombre || 'Dev Super Admin';
                headers['X-User-Email'] = 'ingenieroia@acertemos.com';
            }
            
        } else {
            // No identity found - fallback for standalone testing (ONLY IN DEV)
            if (import.meta.env.DEV) {
                headers['X-User-Id'] = import.meta.env.VITE_DEV_USER_ID || '725';
                headers['X-User-Name'] = 'Dev Super Admin';
                headers['X-User-Email'] = 'ingenieroia@acertemos.com';
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

