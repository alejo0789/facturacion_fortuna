/**
 * Formatea un número como pesos colombianos
 * Ejemplo: 900000 -> "$900.000"
 */
export function formatCOP(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) {
        return '$0';
    }

    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}

/**
 * Formatea un número con separadores de miles (sin símbolo de moneda)
 * Ejemplo: 900000 -> "900.000"
 */
export function formatNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) {
        return '0';
    }

    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}
