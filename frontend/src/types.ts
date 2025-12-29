export interface Proveedor {
    id: number;
    nit: string;
    nombre: string;
    iva?: string;
}

export interface Oficina {
    id: number;
    cod_oficina?: string;
    nombre?: string;
    tipo_sitio?: string;
    dude?: string;
    direccion?: string;
    ciudad?: string;
    zona?: string;
}

export interface Contrato {
    id: number;
    proveedor_id: number;
    oficina_id: number;
    proveedor?: Proveedor;
    oficina?: Oficina;

    titular_nombre?: string;
    titular_cc_nit?: string;
    linea?: string;
    num_contrato?: string;
    fecha_inicio?: string;
    fecha_fin?: string;
    estado?: string;
    observaciones?: string;

    dude?: string;
    tipo?: string;
    ref_pago?: string;
    tipo_plan?: string;
    tipo_canal?: string;
    valor_mensual?: number;
    archivo_contrato?: string;
}

export interface Pago {
    id: number;
    contrato_id: number;
    numero_factura?: string;
    fecha_pago: string;
    valor: number;
    periodo?: string;
    notes?: string;
}

export interface Factura {
    id: number;
    proveedor_id: number;
    oficina_id?: number;  // Legacy single oficina
    contrato_id?: number;  // Legacy single contrato
    proveedor?: Proveedor;
    oficina?: Oficina;  // Legacy
    contrato?: Contrato;  // Legacy

    numero_factura?: string;
    cufe?: string;
    fecha_factura?: string;
    fecha_vencimiento?: string;
    valor?: number;  // Total value
    estado?: string;  // PENDIENTE, ASIGNADA, PAGADA
    url_factura?: string;
    observaciones?: string;
    created_at?: string;  // When invoice was received/uploaded

    // New: multiple oficinas with individual values
    oficinas_asignadas?: FacturaOficina[];
}

// Assignment of an oficina to a factura with individual value
export interface FacturaOficina {
    id: number;
    factura_id: number;
    oficina_id: number;
    contrato_id?: number;
    valor: number;
    estado?: string;  // PENDIENTE, PAGADA
    observaciones?: string;
    oficina?: Oficina;
    contrato?: Contrato;
}

// Oficina with contract info - used for selecting oficina when assigning to factura
export interface OficinaConContrato {
    oficina_id: number;
    oficina_nombre?: string;
    oficina_ciudad?: string;
    oficina_direccion?: string;
    oficina_cod?: string;
    contrato_id: number;
    contrato_num?: string;
    contrato_estado?: string;
    valor_mensual?: number;
}

