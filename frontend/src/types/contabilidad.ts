/**
 * Tipos TypeScript espejo de backend/schemas_contabilidad.py
 * Los montos monetarios vienen como string (Decimal serializado).
 */

export type Naturaleza = 'DEBITO' | 'CREDITO';
export type NivelCuenta = 'CLASE' | 'GRUPO' | 'CUENTA' | 'SUBCUENTA' | 'AUXILIAR';
export type EstadoAsiento = 'BORRADOR' | 'APROBADO' | 'ANULADO';
export type TipoAsiento = 'CAUSACION' | 'PAGO' | 'AJUSTE' | 'APERTURA' | 'CIERRE' | 'MANUAL';
export type EstadoPeriodo = 'ABIERTO' | 'CERRADO';
export type TipoImpuesto = 'IVA' | 'RETEFUENTE' | 'RETEIVA' | 'RETEICA';

export interface CuentaPUC {
    id: number;
    empresa_id?: number | null;
    codigo: string;
    nombre: string;
    naturaleza: Naturaleza;
    nivel: NivelCuenta;
    padre_codigo?: string | null;
    permite_movimiento: boolean;
    requiere_tercero: boolean;
    activa: boolean;
}

export interface Periodo {
    id: number;
    empresa_id?: number | null;
    anio: number;
    mes: number;
    estado: EstadoPeriodo;
    cerrado_en?: string | null;
}

export interface LineaAsiento {
    id?: number;
    cuenta_codigo: string;
    nit_tercero?: string | null;
    centro_costo?: string | null;
    debito: string;
    credito: string;
    base_impuesto?: string | null;
    detalle?: string | null;
}

export interface Asiento {
    id: number;
    empresa_id?: number | null;
    periodo_id: number;
    numero: number;
    fecha: string;
    descripcion?: string | null;
    tipo: TipoAsiento;
    estado: EstadoAsiento;
    factura_id?: number | null;
    pago_id?: number | null;
    total_debito: string;
    total_credito: string;
    lineas: LineaAsiento[];
}

export interface AsientoCreatePayload {
    fecha: string;
    descripcion?: string;
    tipo: TipoAsiento;
    factura_id?: number;
    pago_id?: number;
    lineas: Array<{
        cuenta_codigo: string;
        nit_tercero?: string;
        centro_costo?: string;
        debito: string;
        credito: string;
        base_impuesto?: string;
        detalle?: string;
    }>;
}

export interface MovimientoMayor {
    fecha: string;
    asiento_numero: number;
    descripcion?: string | null;
    debito: string;
    credito: string;
    saldo: string;
}

export interface LibroMayor {
    cuenta_codigo: string;
    cuenta_nombre: string;
    saldo_inicial: string;
    total_debito: string;
    total_credito: string;
    saldo_final: string;
    movimientos: MovimientoMayor[];
}

export interface BalanceClase {
    codigo: string;
    nombre: string;
    total_debito: string;
    total_credito: string;
    saldo: string;
}

export interface Balance {
    anio: number;
    mes: number;
    clases: BalanceClase[];
    total_activos: string;
    total_pasivos: string;
    total_patrimonio: string;
    total_ingresos: string;
    total_gastos: string;
    total_costos: string;
    utilidad_neta: string;
}

export interface TarifaImpuesto {
    id: number;
    concepto?: string | null;
    tarifa_pct: string;
    base_minima: string;
    es_default: boolean;
}

export interface ConfiguracionImpuesto {
    id: number;
    empresa_id?: number | null;
    tipo: TipoImpuesto;
    cuenta_puc?: string | null;
    activo: boolean;
    descripcion?: string | null;
    tarifas: TarifaImpuesto[];
}

export interface CalcularImpuestosPayload {
    valor_total: string;
    proveedor_nit?: string;
    tiene_iva?: boolean;
    aplica_retefuente?: boolean;
    iva_rate_override?: string;
    retefuente_rate_override?: string;
}

export interface CalcularImpuestosResultado {
    valor_total: string;
    valor_base: string;
    iva_rate: string;
    valor_iva: string;
    retefuente_pct: string;
    valor_retefuente: string;
    valor_neto: string;
}
