/**
 * Formatea un valor como pesos colombianos.
 *
 * Acepta number, string o null/undefined.
 * - Si es string, se convierte con Number() (útil cuando el backend manda
 *   Decimal serializado como string).
 * - null/undefined/NaN → "$0".
 *
 * Ejemplo: 900000 -> "$900.000"
 */
export function formatCOP(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return '$0';
    const n = typeof value === 'string' ? Number(value) : value;
    if (isNaN(n)) return '$0';

    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(n);
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
