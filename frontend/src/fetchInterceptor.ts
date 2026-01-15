/**
 * Interceptor global de fetch que agrega automáticamente la API Key
 * Este archivo debe importarse en main.tsx ANTES de cualquier otro componente
 */

const API_KEY = import.meta.env.VITE_API_KEY || '';

// Guardar la función fetch original
const originalFetch = window.fetch;

// Sobrescribir fetch global
window.fetch = function (...args) {
    let [resource, config] = args;

    // Agregar header X-API-Key si no existe
    if (!config) {
        config = {};
    }

    if (!config.headers) {
        config.headers = {};
    }

    // Convertir headers a objeto si es Headers
    if (config.headers instanceof Headers) {
        const headersObj: Record<string, string> = {};
        config.headers.forEach((value, key) => {
            headersObj[key] = value;
        });
        config.headers = headersObj;
    }

    // Agregar API Key si no está presente
    const headers = config.headers as Record<string, string>;
    if (!headers['X-API-Key'] && !headers['x-api-key']) {
        headers['X-API-Key'] = API_KEY;
    }

    // Llamar a fetch original con los headers modificados
    return originalFetch(resource, { ...config, headers });
};

console.log('✅ Interceptor de API Key configurado');
