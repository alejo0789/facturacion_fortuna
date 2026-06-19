import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { formatCOP } from '../utils/format';

import { apiFetch } from '../utils/apiClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * Drop-in replacement de window.fetch para este archivo.
 * Convierte `${API_URL}/x` -> apiFetch('/x') que inyecta auth desde authStorage.
 */
const authFetch = (url: string, options?: RequestInit): Promise<Response> => {
    const endpoint = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
    return apiFetch(endpoint, options as never);
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface OficinaEnTramite {
    oficina_id: number;
    oficina_nombre: string;
    oficina_cod: string;
    valor: number;
    num_contrato: string | null;
    estado: string;
    observaciones: string | null;
}

interface FacturaEnTramite {
    id: number;
    numero_factura: string | null;
    fecha_factura: string | null;
    fecha_vencimiento: string | null;
    valor: number;
    estado: string;
    status_updated_at: string | null;
    observaciones: string | null;
    url_factura: string | null;
    proveedor_id: number;
    proveedor_nombre: string;
    proveedor_nit: string;
    oficinas: OficinaEnTramite[];
    documento_contable: string | null;
    cuenta_por_pagar: number;
    es_aprobado_manager?: boolean;
    es_pagada_manager?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PagosPage() {
    const [facturas, setFacturas] = useState<FacturaEnTramite[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    // Mes actual como default
    const now0 = new Date();
    const primerDiaMes = `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, '0')}-01`;
    const ultimoDiaMes = new Date(now0.getFullYear(), now0.getMonth() + 1, 0);
    const ultimoDiaMesStr = `${ultimoDiaMes.getFullYear()}-${String(ultimoDiaMes.getMonth() + 1).padStart(2, '0')}-${String(ultimoDiaMes.getDate()).padStart(2, '0')}`;

    const [fechaDesde, setFechaDesde] = useState(primerDiaMes);
    const [fechaHasta, setFechaHasta] = useState(ultimoDiaMesStr);
    const [filtroEstado, setFiltroEstado] = useState<'PENDIENTE' | 'APROBADA' | 'PAGADA' | 'TODAS'>('PENDIENTE');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [generando, setGenerando] = useState(false);
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [semanaModal, setSemanaModal] = useState(false);
    const [semanaTexto, setSemanaTexto] = useState('');

    // PDF Viewer State
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');

    // Manager Validation
    const [managerData, setManagerData] = useState<Record<number, any>>({});
    const [loadingManager, setLoadingManager] = useState<Record<number, boolean>>({});
    const [loadingApproval, setLoadingApproval] = useState<Record<number, boolean>>({});

    // Facturas Filtradas
    const facturasFiltradas = useMemo(() => {
        return facturas.filter(f => {
            if (filtroEstado === 'TODAS') return true;

            const mData = managerData[f.id] || {};
            const isPagada = f.estado === 'PAGADA' || f.es_pagada_manager || !!mData.pagado;
            const isAprobada = f.es_aprobado_manager || mData.es_aprobado;

            if (filtroEstado === 'PAGADA') return isPagada;
            if (filtroEstado === 'APROBADA') return isAprobada && !isPagada;
            if (filtroEstado === 'PENDIENTE') return !isAprobada && !isPagada;

            return true;
        });
    }, [facturas, filtroEstado, managerData]);

    // Ver Nota Bancaria (Solo visualización)
    const [nbViewModal, setNbViewModal] = useState<{ open: boolean, data: any[], documento: string }>({ open: false, data: [], documento: '' });

    // Nota Bancaria State (factura individual)
    const [nbModal, setNbModal] = useState<{
        open: boolean;
        facturaId: number | null;
        documento_contable: string | null;
        valorAPagar: number;
    }>({ open: false, facturaId: null, documento_contable: null, valorAPagar: 0 });

    // Nota Bancaria Masiva (varias facturas aprobadas)
    const [nbMasivoModal, setNbMasivoModal] = useState<{ open: boolean; items: FacturaEnTramite[] }>({
        open: false, items: []
    });
    const [nbMasivoForm, setNbMasivoForm] = useState({
        cuenta_banco: '', banco: '',
        ccosto: '04        ', destino: '001       ', detalle: ''
    });
    const [nbMasivoCreating, setNbMasivoCreating] = useState(false);

    // Comprobante de pago post-creación NB
    const [nbComprobante, setNbComprobante] = useState<{
        open: boolean;
        nb_numero: string;
        fecha: string;
        detalle: string;
        cuenta_banco: string;
        nombre_banco: string;
        valor_total: number;
        movimientos: { cuenta: string; nombre: string; vinculado: string; nit: string; debito: number; credito: number; doc_contable: string; }[];
    } | null>(null);

    const [nbParams, setNbParams] = useState<{ cuentas: any[], ccostos: any[], destinos: any[] }>({ cuentas: [], ccostos: [], destinos: [] });
    const [nbLoadingParams, setNbLoadingParams] = useState(false);
    const [nbForm, setNbForm] = useState({
        cuenta_banco: '',
        banco: '', // Added for bank selection
        ccosto: '04        ', // pre-cargado
        destino: '001       ', // pre-cargado
        detalle: ''
    });
    const [nbCreating, setNbCreating] = useState(false);

    // ── Fetch ────────────────────────────────────────────────────────────────

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search.trim()) params.append('search', search.trim());
            if (fechaDesde) params.append('fecha_desde', fechaDesde);
            if (fechaHasta) params.append('fecha_hasta', fechaHasta);

            const res = await authFetch(`${API_URL}/pagos/facturas-en-tramite?${params}`);
            if (res.ok) {
                setFacturas(await res.json());
            }
        } catch (e) {
            console.error('Error fetching facturas en trámite', e);
        } finally {
            setLoading(false);
        }
    }, [search, fechaDesde, fechaHasta]);

    useEffect(() => {
        const t = setTimeout(() => fetchData(), 300);
        return () => clearTimeout(t);
    }, [fetchData]);

    // ── Selection ────────────────────────────────────────────────────────────

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === facturas.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(facturas.map(f => f.id)));
        }
    };

    const clearSelection = () => setSelectedIds(new Set());

    // ── helper: cargar params NB si no están cargados ─────────────────────────
    const ensureNbParams = async () => {
        if (nbParams.cuentas.length === 0) {
            setNbLoadingParams(true);
            try {
                const res = await authFetch(`${API_URL}/pagos/parametros-nota-bancaria`);
                if (res.ok) setNbParams(await res.json());
            } catch (e) { console.error(e); }
            finally { setNbLoadingParams(false); }
        }
    };

    // ── Abrir modal NB masivo ─────────────────────────────────────────────────
    const openNbMasivoModal = async () => {
        const aprobadas = facturasFiltradas.filter(f =>
            selectedIds.has(f.id) &&
            (f.es_aprobado_manager || managerData[f.id]?.es_aprobado) &&
            !(f.es_pagada_manager || managerData[f.id]?.pagado) &&
            !!f.documento_contable
        );
        if (aprobadas.length === 0) {
            alert('Selecciona al menos una factura APROBADA (con documento contable) para crear la NB01.');
            return;
        }
        await ensureNbParams();
        setNbMasivoForm({ cuenta_banco: '', banco: '', ccosto: '04        ', destino: '001       ', detalle: 'Pago Programacion Facturas' });
        setNbMasivoModal({ open: true, items: aprobadas });
    };

    // ── Crear NB01 masiva ─────────────────────────────────────────────────────
    const createNotaBancariaMasiva = async () => {
        if (!nbMasivoForm.cuenta_banco) { alert('Seleccione una cuenta bancaria'); return; }
        setNbMasivoCreating(true);
        try {
            const items = nbMasivoModal.items.map(f => ({
                factura_id: f.id,
                documento_contable: f.documento_contable!,
                valor_pagar: f.valor
            }));
            const res = await authFetch(`${API_URL}/pagos/crear-nota-bancaria`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cuenta_banco: nbMasivoForm.cuenta_banco,
                    ccosto: nbMasivoForm.ccosto,
                    destino: nbMasivoForm.destino,
                    detalle: nbMasivoForm.detalle.substring(0, 100),
                    items
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const itemsProcessed = nbMasivoModal.items;
                const formSnap = { ...nbMasivoForm };

                // Construir movimientos para el comprobante visual
                const nombreBanco = nbParams.cuentas.find(c => c.codigo === formSnap.cuenta_banco)?.nombre || formSnap.cuenta_banco;
                const movimientos: { cuenta: string; nombre: string; vinculado: string; nit: string; debito: number; credito: number; doc_contable: string }[] = [];
                itemsProcessed.forEach(f => {
                    movimientos.push({ cuenta: '23355002', nombre: 'SERVICIOS PUBLICOS', vinculado: f.proveedor_nombre, nit: f.proveedor_nit, debito: f.valor, credito: 0, doc_contable: f.documento_contable || '' });
                    movimientos.push({ cuenta: formSnap.cuenta_banco, nombre: nombreBanco, vinculado: f.proveedor_nombre, nit: f.proveedor_nit, debito: 0, credito: f.valor, doc_contable: f.documento_contable || '' });
                });

                setNbComprobante({
                    open: true,
                    nb_numero: data.nb_numero,
                    fecha: new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }),
                    detalle: formSnap.detalle,
                    cuenta_banco: formSnap.cuenta_banco,
                    nombre_banco: nombreBanco,
                    valor_total: data.valor_total,
                    movimientos,
                });

                setNbMasivoModal({ open: false, items: [] });
                clearSelection();
                await fetchData();
                itemsProcessed.forEach(f => {
                    if (f.documento_contable) fetchManagerCausation(f.id, f.documento_contable);
                });
            } else {
                alert(`Error: ${data.detail || data.message}`);
            }
        } catch (e) {
            console.error(e);
            alert('Falló la creación de la Nota Bancaria');
        } finally {
            setNbMasivoCreating(false);
        }
    };

    // ── Generate consolidado ──────────────────────────────────────────────────

    const openConsolidadoModal = () => {
        const now = new Date();
        const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        setSemanaTexto(`${now.getDate()} DE ${meses[now.getMonth()]} DE ${now.getFullYear()}`);
        setSemanaModal(true);
    };

    const generateConsolidado = async () => {
        if (selectedIds.size === 0) return;
        setSemanaModal(false);
        setGenerando(true);
        try {
            const res = await authFetch(`${API_URL}/pagos/consolidado-programacion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    factura_ids: Array.from(selectedIds),
                    semana_pago: semanaTexto,
                }),
            });

            if (res.ok) {
                const cd = res.headers.get('Content-Disposition');
                let filename = 'programacion_pagos.xlsx';
                if (cd) {
                    const utf8 = cd.match(/filename\*=UTF-8''(.+)/);
                    if (utf8) filename = decodeURIComponent(utf8[1]);
                    else {
                        const std = cd.match(/filename="?([^"]+)"?/);
                        if (std) filename = std[1];
                    }
                }
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                clearSelection();
            } else {
                alert('Error al generar el consolidado');
            }
        } catch (e) {
            console.error(e);
            alert('Error al generar el consolidado');
        } finally {
            setGenerando(false);
        }
    };

    // ── Fetch Manager Causation ───────────────────────────────────────────────

    const fetchManagerCausation = async (facturaId: number, docContable: string) => {
        setLoadingManager(prev => ({ ...prev, [facturaId]: true }));
        try {
            const res = await authFetch(`${API_URL}/pagos/causacion-manager/${encodeURIComponent(docContable)}`);
            const data = await res.json();
            setManagerData(prev => ({ ...prev, [facturaId]: data }));
        } catch (e) {
            console.error('Error fetching manager details', e);
            setManagerData(prev => ({ ...prev, [facturaId]: { success: false, message: 'Error de red' } }));
        } finally {
            setLoadingManager(prev => ({ ...prev, [facturaId]: false }));
        }
    };

    const aprobarManagerCausacion = async (facturaId: number, docContable: string) => {
        if (!confirm(`¿Estás seguro de que quieres aprobar la factura en Manager (${docContable})?`)) return;
        setLoadingApproval(prev => ({ ...prev, [facturaId]: true }));
        try {
            const res = await authFetch(`${API_URL}/pagos/causacion-manager/${encodeURIComponent(docContable)}/aprobar`, {
                method: 'PUT'
            });
            const result = await res.json();
            if (res.ok && result.success) {
                // Actualizar estado local a aprobado
                setManagerData(prev => {
                    const current = prev[facturaId];
                    if (current) {
                        return {
                            ...prev,
                            [facturaId]: { ...current, es_aprobado: true }
                        };
                    }
                    return prev;
                });
                alert('¡Causación aprobada en Manager!');
            } else {
                alert(`Error: ${result.detail || result.message}`);
            }
        } catch (e) {
            console.error(e);
            alert('Error al intentar aprobar la causación en Manager');
        } finally {
            setLoadingApproval(prev => ({ ...prev, [facturaId]: false }));
        }
    };

    // ── Generate Nota Bancaria ────────────────────────────────────────────────

    const openNbModal = async (f: FacturaEnTramite) => {
        if (!f.documento_contable) {
            alert('Esta factura no tiene documento contable asignado.');
            return;
        }
        setNbModal({
            open: true,
            facturaId: f.id,
            documento_contable: f.documento_contable,
            valorAPagar: f.valor
        });

        let detalleManager = f.observaciones || 'Pago Factura';
        // Extraer el detalle directamente desde lo que reportó Manager en la primera fila del documento
        if (managerData[f.id] && managerData[f.id].data?.length > 0) {
            const prefijoDoc = f.documento_contable.split('-')[0];
            const rowManager = managerData[f.id].data.find((r: any) => r.tipo_doc === prefijoDoc);
            if (rowManager?.detalle) {
                detalleManager = rowManager.detalle;
            } else if (managerData[f.id].data[0].detalle) {
                detalleManager = managerData[f.id].data[0].detalle;
            }
        }

        setNbForm(prev => ({ ...prev, detalle: detalleManager, cuenta_banco: '', banco: '' }));

        if (nbParams.cuentas.length === 0) {
            setNbLoadingParams(true);
            try {
                const res = await authFetch(`${API_URL}/pagos/parametros-nota-bancaria`);
                if (res.ok) {
                    const data = await res.json();
                    setNbParams(data);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setNbLoadingParams(false);
            }
        }
    };

    const createNotaBancaria = async () => {
        if (!nbForm.cuenta_banco) {
            alert('Seleccione una cuenta bancaria');
            return;
        }
        if (!nbForm.ccosto || !nbForm.destino) {
            alert('Complete Centro de Costo y Destino');
            return;
        }

        setNbCreating(true);
        try {
            const res = await authFetch(`${API_URL}/pagos/crear-nota-bancaria`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    factura_id: nbModal.facturaId,
                    documento_contable: nbModal.documento_contable,
                    cuenta_banco: nbForm.cuenta_banco,
                    ccosto: nbForm.ccosto,
                    destino: nbForm.destino,
                    valor_pagar: nbModal.valorAPagar,
                    detalle: nbForm.detalle.substring(0, 100) // Oracle char limits
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                alert(`¡Éxito! ${data.message} (${data.nb_numero})`);

                // Volemos a cargar directamente de manager la consulta para este documento!
                if (nbModal.facturaId && nbModal.documento_contable) {
                    fetchManagerCausation(nbModal.facturaId, nbModal.documento_contable);
                }

                setNbModal({ open: false, facturaId: null, documento_contable: null, valorAPagar: 0 });
                fetchData(); // Refresh list to show payment status if any
            } else {
                alert(`Error: ${data.detail || data.message}`);
            }
        } catch (e) {
            console.error(e);
            alert('Falló la creación de Nota Bancaria');
        } finally {
            setNbCreating(false);
        }
    };

    // ── Bank Logic ────────────────────────────────────────────────────────────
    const listaBancos = useMemo(() => {
        const cuentasBancarias = nbParams.cuentas.filter(c => c.codigo.startsWith('1110') || c.codigo.startsWith('1120'));
        const bancosSet = new Set<string>();

        cuentasBancarias.forEach(c => {
            // Heuristic: take the first word of the name as the bank, or handle some known ones
            const upperName = c.nombre.toUpperCase();
            if (upperName.includes('BANCOLOMBIA')) bancosSet.add('BANCOLOMBIA');
            else if (upperName.includes('DAVIVIENDA')) bancosSet.add('DAVIVIENDA');
            else if (upperName.includes('BOGOTA')) bancosSet.add('BANCO DE BOGOTÁ');
            else if (upperName.includes('BBVA')) bancosSet.add('BBVA');
            else if (upperName.includes('OCCIDENTE')) bancosSet.add('BANCO DE OCCIDENTE');
            else if (upperName.includes('POPULAR')) bancosSet.add('BANCO POPULAR');
            else if (upperName.includes('AV VILLAS')) bancosSet.add('AV VILLAS');
            else if (upperName.includes('SUDAMERIS')) bancosSet.add('GNB SUDAMERIS');
            else if (upperName.includes('SCOTIA')) bancosSet.add('SCOTIABANK');
            else if (upperName.includes('ITAU')) bancosSet.add('ITAÚ');
            else {
                const firstWord = upperName.split(' ')[0];
                if (firstWord.length > 2) bancosSet.add(firstWord);
            }
        });

        return Array.from(bancosSet).sort();
    }, [nbParams.cuentas]);

    const cuentasFiltradas = useMemo(() => {
        const cuentasBancarias = nbParams.cuentas.filter(c => c.codigo.startsWith('1110') || c.codigo.startsWith('1120'));
        if (!nbForm.banco || nbForm.banco === 'OTRO') return cuentasBancarias;

        const bancoNormalizado = nbForm.banco.toUpperCase();
        return cuentasBancarias.filter(c => {
            const nombreNormalizado = c.nombre.toUpperCase();
            // Si el banco es BANCO DE BOGOTÁ, busco BOGOTA
            const bancoBusqueda = bancoNormalizado.replace('BANCO DE ', '').replace('BANCO ', '');
            return nombreNormalizado.includes(bancoBusqueda);
        });
    }, [nbParams.cuentas, nbForm.banco]);

    // ── Computed ──────────────────────────────────────────────────────────────

    const totalValor = facturas
        .filter(f => selectedIds.has(f.id))
        .reduce((sum, f) => sum + f.valor, 0);

    const formatDate = (d: string | null) => {
        if (!d) return '—';
        const dt = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
        return dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={{ minHeight: '100vh', background: 'var(--canvas)', padding: '0' }}>

            {/* ── Header — Ledger Modern editorial ── */}
            <div
                className="relative overflow-hidden anim-fade-up"
                style={{
                    background: 'linear-gradient(135deg, var(--ink) 0%, #1a2238 60%, var(--accent-deep) 100%)',
                    padding: '36px 32px 32px',
                    color: 'var(--paper)',
                }}
            >
                {/* Oversized decorative ƒ */}
                <div
                    aria-hidden
                    className="absolute font-display-wonk select-none pointer-events-none"
                    style={{
                        top: '-4rem',
                        right: '-2rem',
                        fontSize: '20rem',
                        lineHeight: 1,
                        color: 'rgba(255, 255, 255, 0.04)',
                        fontWeight: 300,
                    }}
                >
                    ƒ
                </div>

                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div className="eyebrow mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        Operación · Tesorería
                    </div>
                    <h1
                        className="font-display tracking-tight"
                        style={{
                            margin: 0,
                            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
                            color: 'var(--paper)',
                            fontVariationSettings: "'SOFT' 30",
                            lineHeight: 1.05,
                        }}
                    >
                        Pagos a <em style={{ fontStyle: 'italic', color: 'var(--sidebar-accent)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}>proveedores</em>.
                    </h1>
                    <p style={{ margin: '10px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                        Facturas enviadas a Manager · Programación de pagos
                    </p>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
                        {[
                            { label: 'En trámite', value: facturas.length },
                            { label: 'Seleccionadas', value: selectedIds.size },
                            { label: 'Valor seleccionado', value: formatCOP(totalValor), wide: true },
                        ].map((stat) => (
                            <div
                                key={stat.label}
                                style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    borderRadius: 10,
                                    padding: '12px 18px',
                                    minWidth: stat.wide ? 220 : 140,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: 'rgba(255,255,255,0.5)',
                                        fontWeight: 600,
                                        letterSpacing: '0.18em',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {stat.label}
                                </div>
                                <div
                                    className="font-display"
                                    style={{
                                        fontSize: 24,
                                        fontWeight: 400,
                                        color: 'var(--paper)',
                                        marginTop: 4,
                                        letterSpacing: '-0.02em',
                                        fontVariationSettings: "'SOFT' 30",
                                    }}
                                >
                                    {stat.value}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Toolbar ── */}
            <div style={{
                background: '#fff',
                borderBottom: '1px solid #e5e7eb',
                padding: '14px 32px',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
            }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
                    <input
                        type="text"
                        placeholder="Buscar proveedor, factura, NIT..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '9px 14px 9px 38px',
                            border: '1.5px solid #e5e7eb', borderRadius: 10,
                            fontSize: 14, outline: 'none',
                            transition: 'border-color 0.2s',
                            boxSizing: 'border-box',
                        }}
                        onFocus={e => (e.target.style.borderColor = '#2563eb')}
                        onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                    />
                    <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
                        width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                {/* Date filters */}
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                    title="Fecha desde"
                    style={{
                        padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10,
                        fontSize: 13, outline: 'none', color: '#374151', cursor: 'pointer',
                    }} />
                <span style={{ color: '#9ca3af', fontSize: 13 }}>–</span>
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                    title="Fecha hasta"
                    style={{
                        padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10,
                        fontSize: 13, outline: 'none', color: '#374151', cursor: 'pointer',
                    }} />

                {/* Selector rápido de mes */}
                <select
                    onChange={e => {
                        if (!e.target.value) return;
                        const [y, m] = e.target.value.split('-').map(Number);
                        const ultimo = new Date(y, m, 0);
                        setFechaDesde(`${y}-${String(m).padStart(2, '0')}-01`);
                        setFechaHasta(`${y}-${String(m).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`);
                    }}
                    style={{
                        padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 10,
                        fontSize: 13, color: '#374151', background: '#fff', cursor: 'pointer',
                    }}
                    title="Saltar al mes"
                >
                    <option value="">📅 Mes rápido</option>
                    {Array.from({ length: 12 }, (_, i) => {
                        const d = new Date();
                        d.setMonth(d.getMonth() - i);
                        const y = d.getFullYear();
                        const m = d.getMonth() + 1;
                        const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
                        return <option key={`${y}-${m}`} value={`${y}-${m}`}>{label}</option>;
                    })}
                </select>


                <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3, marginLeft: 10 }}>
                    {[
                        { id: 'PENDIENTE', label: '⏳ Pendientes' },
                        { id: 'APROBADA', label: '✅ Aprobadas' },
                        { id: 'PAGADA', label: '💰 Pagadas' },
                        { id: 'TODAS', label: 'Todas' }
                    ].map(st => (
                        <button
                            key={st.id}
                            onClick={() => setFiltroEstado(st.id as any)}
                            style={{
                                padding: '6px 12px',
                                background: filtroEstado === st.id ? '#fff' : 'transparent',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: filtroEstado === st.id ? 600 : 500,
                                color: filtroEstado === st.id ? '#111827' : '#6b7280',
                                boxShadow: filtroEstado === st.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            {st.label}
                        </button>
                    ))}
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                    {selectedIds.size > 0 && (
                        <button
                            onClick={clearSelection}
                            style={{
                                padding: '9px 16px', border: '1.5px solid #e5e7eb', borderRadius: 10,
                                background: '#fff', fontSize: 13, cursor: 'pointer', color: '#6b7280',
                                fontWeight: 500,
                            }}>
                            Limpiar selección
                        </button>
                    )}

                    {/* Botón NB01 — visible cuando hay seleccionadas en filtro APROBADA o TODAS */}
                    {selectedIds.size > 0 && (filtroEstado === 'APROBADA' || filtroEstado === 'TODAS') && (
                        <button
                            onClick={openNbMasivoModal}
                            style={{
                                padding: '9px 20px', borderRadius: 10, border: 'none',
                                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                color: '#fff', fontSize: 14, fontWeight: 600,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                boxShadow: '0 2px 8px rgba(124,58,237,0.35)',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={e => (e.currentTarget.style.opacity = '0.88')}
                            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                        >
                            <span>🏦</span>
                            Crear NB01 ({selectedIds.size})
                        </button>
                    )}

                    <button
                        onClick={openConsolidadoModal}
                        disabled={selectedIds.size === 0 || generando}
                        style={{
                            padding: '9px 20px',
                            borderRadius: 10,
                            border: 'none',
                            background: selectedIds.size === 0
                                ? '#e5e7eb'
                                : 'linear-gradient(135deg, #059669, #10b981)',
                            color: selectedIds.size === 0 ? '#9ca3af' : '#fff',
                            fontSize: 14, fontWeight: 600,
                            cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                            boxShadow: selectedIds.size > 0 ? '0 2px 8px rgba(16,185,129,0.3)' : 'none',
                            transition: 'all 0.2s',
                        }}>
                        {generando ? (
                            <>
                                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                                Generando...
                            </>
                        ) : (
                            <>
                                <span>📊</span>
                                Generar Programación Excel
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Table ── */}
            <div style={{ padding: '24px 32px' }}>
                {loading ? (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 80, gap: 16, color: '#6b7280',
                    }}>
                        <svg style={{ animation: 'spin 1s linear infinite' }} width="28" height="28" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="#e5e7eb" strokeWidth="3" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        <span style={{ fontSize: 15 }}>Cargando facturas en trámite...</span>
                    </div>
                ) : facturas.length === 0 ? (
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: '60px 40px',
                        textAlign: 'center', border: '1px solid #e5e7eb',
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#374151' }}>
                            No hay facturas en trámite
                        </h3>
                        <p style={{ margin: '8px 0 0', color: '#9ca3af', fontSize: 14 }}>
                            Las facturas enviadas a Manager aparecerán aquí con estado EN_TRAMITE.
                        </p>
                    </div>
                ) : (
                    <div style={{
                        background: '#fff', borderRadius: 16, overflow: 'hidden',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#1e3a5f' }}>
                                        {/* Checkbox all */}
                                        <th style={{ padding: '12px 14px', textAlign: 'center', width: 44 }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.size === facturasFiltradas.length && facturasFiltradas.length > 0}
                                                onChange={toggleAll}
                                                style={{ accentColor: '#2563eb', width: 16, height: 16, cursor: 'pointer' }}
                                            />
                                        </th>
                                        {[
                                            'ÍTEM',
                                            'VALOR NETO A PAGAR',
                                            'No. FACTURA / CUENTA COBRO',
                                            'CUENTA POR PAGAR',
                                            'CC / NIT',
                                            'BENEFICIARIO',
                                            'OBSERVACIÓN',
                                            'DOCUMENTO CONTABLE',
                                            'ESTADO MANAGER',
                                        ].map(h => (
                                            <th key={h} style={{
                                                padding: '12px 14px',
                                                color: '#fff',
                                                fontWeight: 600,
                                                textAlign: 'left',
                                                fontSize: 11,
                                                letterSpacing: 0.5,
                                                whiteSpace: 'nowrap',
                                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                            }}>
                                                {h}
                                            </th>
                                        ))}
                                        <th style={{ padding: '12px 10px', color: '#fff', fontSize: 11, width: 50 }}>DETALLE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {facturasFiltradas.map((f, idx) => {
                                        const isSelected = selectedIds.has(f.id);
                                        const isExpanded = expandedRow === f.id;
                                        const rowBg = isSelected
                                            ? '#eff6ff'
                                            : idx % 2 === 0 ? '#fff' : '#f9fafb';

                                        return (
                                            <React.Fragment key={f.id}>
                                                <tr
                                                    style={{
                                                        background: rowBg,
                                                        transition: 'background 0.15s',
                                                        cursor: 'pointer',
                                                        borderBottom: isExpanded ? 'none' : '1px solid #f3f4f6',
                                                    }}
                                                    onClick={() => toggleSelect(f.id)}
                                                >
                                                    {/* Checkbox */}
                                                    <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelect(f.id)}
                                                            style={{ accentColor: '#2563eb', width: 16, height: 16, cursor: 'pointer' }}
                                                        />
                                                    </td>

                                                    {/* ÍTEM */}
                                                    <td style={{ padding: '10px 14px', color: '#6b7280', fontWeight: 500, textAlign: 'center' }}>
                                                        {idx + 1}
                                                    </td>

                                                    {/* VALOR NETO */}
                                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#065f46', whiteSpace: 'nowrap' }}>
                                                        {formatCOP(f.valor)}
                                                    </td>

                                                    {/* No. FACTURA */}
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                                                            <span style={{
                                                                background: '#dbeafe', color: '#1d4ed8',
                                                                padding: '2px 8px', borderRadius: 6,
                                                                fontSize: 12, fontWeight: 600,
                                                            }}>
                                                                {f.numero_factura || '—'}
                                                            </span>
                                                            {f.url_factura && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setPdfUrl(`${API_URL}/facturas/${f.id}/ver`);
                                                                        setIsPdfModalOpen(true);
                                                                    }}
                                                                    style={{
                                                                        display: 'flex', alignItems: 'center', gap: '4px',
                                                                        fontSize: '11px', color: '#2563eb', fontWeight: 600,
                                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                                        padding: '2px 4px', borderRadius: '4px'
                                                                    }}
                                                                    onMouseOver={(e) => e.currentTarget.style.background = '#eff6ff'}
                                                                    onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                                                                >
                                                                    <svg style={{ width: 14, height: 14 }} fill="currentColor" viewBox="0 0 20 20">
                                                                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                                                    </svg>
                                                                    Ver PDF
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* CUENTA POR PAGAR */}
                                                    <td style={{ padding: '10px 14px', color: '#374151', fontFamily: 'monospace' }}>
                                                        {f.cuenta_por_pagar}
                                                    </td>

                                                    {/* CC/NIT */}
                                                    <td style={{ padding: '10px 14px', color: '#374151', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                                        {f.proveedor_nit || '—'}
                                                    </td>

                                                    {/* BENEFICIARIO */}
                                                    <td style={{ padding: '10px 14px', maxWidth: 200 }}>
                                                        <div style={{
                                                            fontWeight: 600, color: '#1e293b',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            maxWidth: 180,
                                                        }}
                                                            title={f.proveedor_nombre}>
                                                            {f.proveedor_nombre || '—'}
                                                        </div>
                                                    </td>


                                                    {/* OBSERVACIÓN */}
                                                    <td style={{ padding: '10px 14px', maxWidth: 260 }}>
                                                        <div style={{
                                                            color: '#4b5563', fontSize: 12,
                                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                            maxWidth: 240,
                                                        }}
                                                            title={f.observaciones || ''}>
                                                            {f.observaciones || '—'}
                                                        </div>
                                                    </td>

                                                    {/* DOC CONTABLE */}
                                                    <td style={{ padding: '10px 14px' }}>
                                                        {f.documento_contable ? (
                                                            <span style={{
                                                                background: '#f0fdf4', border: '1px solid #bbf7d0',
                                                                color: '#15803d', padding: '2px 8px', borderRadius: 6,
                                                                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                                                            }}>
                                                                {f.documento_contable}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#d1d5db' }}>—</span>
                                                        )}
                                                    </td>

                                                    {/* ESTADO MANAGER (Quick view) */}
                                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                        {f.documento_contable ? (
                                                            (f.es_pagada_manager || managerData[f.id]?.pagado) ? (
                                                                <span style={{
                                                                    background: '#dcfce7', border: '1px solid #16a34a',
                                                                    color: '#15803d', padding: '3px 8px', borderRadius: 8,
                                                                    fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                                                    boxShadow: '0 1px 2px rgba(21, 128, 61, 0.1)'
                                                                }} title="Nota Bancaria Creada (Saldo 0) en Manager">
                                                                    💰 Pagada (NB01)
                                                                </span>
                                                            ) : (f.es_aprobado_manager || managerData[f.id]?.es_aprobado) ? (
                                                                <span style={{
                                                                    background: '#f0fdf4', border: '1px solid #86efac',
                                                                    color: '#166534', padding: '3px 8px', borderRadius: 8,
                                                                    fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                                                }} title="Aprobado en la cuenta 23355002 de Manager">
                                                                    ✅ Aprobado
                                                                </span>
                                                            ) : (
                                                                <span style={{
                                                                    background: '#fef3c7', border: '1px solid #fde68a',
                                                                    color: '#b45309', padding: '3px 8px', borderRadius: 8,
                                                                    fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                                                                }}>
                                                                    ⏳ Falta Aprobar
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span style={{ color: '#d1d5db' }}>—</span>
                                                        )}
                                                    </td>

                                                    {/* Expand button */}
                                                    <td style={{ padding: '10px 10px', textAlign: 'center' }}
                                                        onClick={e => { e.stopPropagation(); setExpandedRow(isExpanded ? null : f.id); }}>
                                                        <button style={{
                                                            background: 'none', border: '1px solid #e5e7eb', borderRadius: 6,
                                                            width: 28, height: 28, cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: 14, color: '#6b7280',
                                                            transition: 'all 0.15s',
                                                        }}>
                                                            {isExpanded ? '▲' : '▼'}
                                                        </button>
                                                    </td>
                                                </tr>

                                                {/* Expanded row: oficinas detail */}
                                                {isExpanded && (
                                                    <tr key={`${f.id}-expanded`}
                                                        style={{ background: '#f0f7ff', borderBottom: '2px solid #bfdbfe' }}>
                                                        <td colSpan={13} style={{ padding: '0 14px 14px 60px' }}>
                                                            <div style={{ paddingTop: 12 }}>
                                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 8, letterSpacing: 0.5 }}>
                                                                    📋 DETALLE VALORES EN DB LOCAL (SISTEMA)
                                                                </div>
                                                                {f.oficinas.length === 0 ? (
                                                                    <p style={{ color: '#9ca3af', fontSize: 13 }}>Sin oficinas asignadas</p>
                                                                ) : (
                                                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                                        {f.oficinas.map((o, i) => (
                                                                            <div key={i} style={{
                                                                                background: '#fff', border: '1px solid #bfdbfe',
                                                                                borderRadius: 10, padding: '10px 14px',
                                                                                minWidth: 200,
                                                                            }}>
                                                                                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>
                                                                                    {o.oficina_nombre || o.oficina_cod || '—'}
                                                                                </div>
                                                                                <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
                                                                                    Código: <b>{o.oficina_cod}</b>
                                                                                    {o.num_contrato && <> · Contrato: <b>{o.num_contrato}</b></>}
                                                                                </div>
                                                                                <div style={{
                                                                                    marginTop: 6, fontSize: 14, fontWeight: 700, color: '#059669',
                                                                                }}>
                                                                                    {formatCOP(o.valor)}
                                                                                </div>
                                                                                {o.observaciones && (
                                                                                    <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af' }}>
                                                                                        {o.observaciones}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* MANAGER VALIDATION SECTION */}
                                                                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed #bfdbfe' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', letterSpacing: 0.5 }}>
                                                                            🔄 VALIDACIÓN DIRECTAMENTE EN MANAGER ORACLE
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                                            {f.documento_contable ? (
                                                                                <>
                                                                                    {managerData[f.id]?.success && (
                                                                                        managerData[f.id].es_aprobado ? (
                                                                                            <span style={{ padding: '6px 14px', borderRadius: 8, background: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: 12, fontWeight: 700 }}>
                                                                                                ✅ Aprobado en Manager
                                                                                            </span>
                                                                                        ) : (
                                                                                            <button
                                                                                                onClick={() => aprobarManagerCausacion(f.id, f.documento_contable!)}
                                                                                                disabled={loadingApproval[f.id]}
                                                                                                style={{
                                                                                                    padding: '6px 14px', borderRadius: 8, background: '#10b981',
                                                                                                    border: '1px solid #059669', color: '#fff', fontSize: 12,
                                                                                                    fontWeight: 600, cursor: loadingApproval[f.id] ? 'wait' : 'pointer'
                                                                                                }}
                                                                                            >
                                                                                                {loadingApproval[f.id] ? 'Aprobando...' : 'Aprobar Pago'}
                                                                                            </button>
                                                                                        )
                                                                                    )}
                                                                                    <button
                                                                                        onClick={() => fetchManagerCausation(f.id, f.documento_contable!)}
                                                                                        disabled={loadingManager[f.id]}
                                                                                        style={{
                                                                                            padding: '6px 14px', borderRadius: 8, background: '#fef3c7',
                                                                                            border: '1px solid #fcd34d', color: '#b45309', fontSize: 12,
                                                                                            fontWeight: 600, cursor: loadingManager[f.id] ? 'wait' : 'pointer'
                                                                                        }}
                                                                                    >
                                                                                        {loadingManager[f.id] ? 'Consultando...' : 'Consultar'}
                                                                                    </button>
                                                                                    {(managerData[f.id]?.es_aprobado && !managerData[f.id]?.pagado && !f.es_pagada_manager) && (
                                                                                        <button
                                                                                            onClick={() => openNbModal(f)}
                                                                                            style={{
                                                                                                padding: '6px 14px', borderRadius: 8, background: '#1e3a5f',
                                                                                                border: '1px solid #1e3a5f', color: '#fff', fontSize: 12,
                                                                                                fontWeight: 600, cursor: 'pointer'
                                                                                            }}
                                                                                        >
                                                                                            💳 Pagar (Crear NB01)
                                                                                        </button>
                                                                                    )}
                                                                                    {managerData[f.id]?.pagado && (
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                const nbs = managerData[f.id].data.filter((r: any) => r.tipo_doc.startsWith('NB01'));
                                                                                                setNbViewModal({ open: true, data: nbs, documento: f.documento_contable || '' });
                                                                                            }}
                                                                                            style={{ padding: '6px 14px', borderRadius: 8, background: '#16a34a', border: '1px solid #15803d', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)' }}
                                                                                        >
                                                                                            💰 Ver NB01 Pagada
                                                                                        </button>
                                                                                    )}
                                                                                </>
                                                                            ) : (
                                                                                <span style={{ fontSize: 12, color: '#ef4444' }}>Sin documento contable para consultar</span>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {managerData[f.id] && (
                                                                        <div style={{ background: managerData[f.id].es_aprobado ? '#f0fdf4' : '#fff', border: managerData[f.id].es_aprobado ? '1px solid #86efac' : '1px solid #fcd34d', borderRadius: 10, overflow: 'hidden' }}>
                                                                            {!managerData[f.id].success ? (
                                                                                <div style={{ padding: '12px 16px', color: '#b45309', fontSize: 13, background: '#fef3c7' }}>
                                                                                    ⚠ {managerData[f.id].message}
                                                                                </div>
                                                                            ) : (
                                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                                                    <thead style={{ background: managerData[f.id].es_aprobado ? '#dcfce7' : '#fef3c7', color: managerData[f.id].es_aprobado ? '#166534' : '#92400e', textAlign: 'left' }}>
                                                                                        <tr>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: managerData[f.id].es_aprobado ? '1px solid #86efac' : '1px solid #fde68a' }}>Documento</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: managerData[f.id].es_aprobado ? '1px solid #86efac' : '1px solid #fde68a' }}>Cuenta</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: managerData[f.id].es_aprobado ? '1px solid #86efac' : '1px solid #fde68a' }}>Tipo</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: managerData[f.id].es_aprobado ? '1px solid #86efac' : '1px solid #fde68a' }}>C.Costo</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: managerData[f.id].es_aprobado ? '1px solid #86efac' : '1px solid #fde68a' }}>Destino</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: managerData[f.id].es_aprobado ? '1px solid #86efac' : '1px solid #fde68a', textAlign: 'right' }}>Débito</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: managerData[f.id].es_aprobado ? '1px solid #86efac' : '1px solid #fde68a', textAlign: 'right' }}>Crédito</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: managerData[f.id].es_aprobado ? '1px solid #86efac' : '1px solid #fde68a' }}>Detalle</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody>
                                                                                        {managerData[f.id].data?.filter((r: any) => !r.tipo_doc.startsWith('NB01')).map((mRow: any, mIdx: number) => {
                                                                                            const isGreen = managerData[f.id].es_aprobado;
                                                                                            return (
                                                                                                <tr key={mIdx} style={{ borderBottom: isGreen ? '1px solid #bbf7d0' : '1px solid #fef3c7' }}>
                                                                                                    <td style={{ padding: '8px 12px', fontWeight: 700, color: isGreen ? '#166534' : 'inherit' }}>{mRow.tipo_doc}</td>
                                                                                                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: isGreen ? '#166534' : 'inherit' }}>{mRow.cuenta}</td>
                                                                                                    <td style={{ padding: '8px 12px', fontWeight: 600, color: isGreen ? '#15803d' : (mRow.tipo === 'DEBITO' ? '#15803d' : '#b91c1c') }}>
                                                                                                        {mRow.tipo}
                                                                                                    </td>
                                                                                                    <td style={{ padding: '8px 12px', color: isGreen ? '#166534' : 'inherit' }}>{mRow.ccosto || '-'}</td>
                                                                                                    <td style={{ padding: '8px 12px', color: isGreen ? '#166534' : 'inherit' }}>{mRow.destino || '-'}</td>
                                                                                                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#15803d', textAlign: 'right' }}>
                                                                                                        {mRow.tipo === 'DEBITO' ? formatCOP(mRow.valor) : ''}
                                                                                                    </td>
                                                                                                    <td style={{ padding: '8px 12px', fontWeight: 700, color: isGreen ? '#15803d' : '#b91c1c', textAlign: 'right' }}>
                                                                                                        {mRow.tipo === 'CREDITO' ? formatCOP(mRow.valor) : ''}
                                                                                                    </td>
                                                                                                    <td style={{ padding: '8px 12px', color: isGreen ? '#166534' : '#4b5563' }}>{mRow.detalle}</td>
                                                                                                </tr>
                                                                                            );
                                                                                        })}
                                                                                        <tr style={{ background: managerData[f.id].es_aprobado ? '#dcfce7' : '#fef3c7', borderTop: managerData[f.id].es_aprobado ? '2px solid #86efac' : '2px solid #fde68a' }}>
                                                                                            <td colSpan={5} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: managerData[f.id].es_aprobado ? '#166534' : '#92400e' }}>TOTALES CAUSACIÓN</td>

                                                                                            <td style={{ padding: '8px 12px', fontWeight: 800, color: '#15803d', textAlign: 'right' }}>
                                                                                                {formatCOP(managerData[f.id].data?.filter((r: any) => !r.tipo_doc.startsWith('NB01')).reduce((sum: number, r: any) => r.tipo === 'DEBITO' ? sum + r.valor : sum, 0))}
                                                                                            </td>
                                                                                            <td style={{ padding: '8px 12px', fontWeight: 800, color: managerData[f.id].es_aprobado ? '#15803d' : '#b91c1c', textAlign: 'right' }}>
                                                                                                {formatCOP(managerData[f.id].data?.filter((r: any) => !r.tipo_doc.startsWith('NB01')).reduce((sum: number, r: any) => r.tipo === 'CREDITO' ? sum + r.valor : sum, 0))}
                                                                                            </td>
                                                                                            <td></td>
                                                                                        </tr>
                                                                                    </tbody>
                                                                                </table>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div style={{ marginTop: 14, fontSize: 12, color: '#6b7280' }}>
                                                                    Fecha factura: <b>{formatDate(f.fecha_factura)}</b>
                                                                    {f.fecha_vencimiento && <> · Vence: <b>{formatDate(f.fecha_vencimiento)}</b></>}
                                                                    {f.status_updated_at && <> · Enviado a Manager local: <b>{formatDate(f.status_updated_at)}</b></>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer totals */}
                        <div style={{
                            padding: '14px 24px',
                            borderTop: '2px solid #e5e7eb',
                            background: '#f9fafb',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <span style={{ color: '#6b7280', fontSize: 13 }}>
                                {String(facturasFiltradas.length).padStart(2, '0')} factura(s) {
                                    filtroEstado === 'PENDIENTE' ? 'pendientes' :
                                        filtroEstado === 'APROBADA' ? 'aprobadas' :
                                            filtroEstado === 'PAGADA' ? 'pagadas' : 'en trámite'
                                }
                                {selectedIds.size > 0 && <> · <b style={{ color: '#2563eb' }}>{String(selectedIds.size).padStart(2, '0')} seleccionadas</b></>}
                            </span>
                            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                                {selectedIds.size > 0 && (
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: 0.5 }}>
                                            TOTAL SELECCIONADO
                                        </div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>
                                            {formatCOP(totalValor)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Modal: Semana de Pago ── */}
            {semanaModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                    onClick={() => setSemanaModal(false)}>
                    <div style={{
                        background: '#fff', borderRadius: 20, padding: 32, width: 460,
                        maxWidth: '90vw',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                    }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 12,
                                background: 'linear-gradient(135deg, #059669, #10b981)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 22,
                            }}>📊</div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                                    Generar Programación de Pagos
                                </h2>
                                <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                                    {selectedIds.size} factura(s) seleccionada(s) · {formatCOP(totalValor)}
                                </p>
                            </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                                Semana / Fecha de Pago
                            </label>
                            <input
                                type="text"
                                value={semanaTexto}
                                onChange={e => setSemanaTexto(e.target.value)}
                                placeholder="Ej: 12 DE FEBRERO DE 2025"
                                style={{
                                    width: '100%', padding: '11px 14px',
                                    border: '1.5px solid #e5e7eb', borderRadius: 10,
                                    fontSize: 14, outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                                onFocus={e => (e.target.style.borderColor = '#059669')}
                                onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                            />
                            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9ca3af' }}>
                                Este texto aparecerá en el encabezado del Excel junto a "PROGRAMACIÓN DE PAGOS:"
                            </p>
                        </div>

                        <div style={{ fontSize: 13, color: '#374151', background: '#f0fdf4', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
                            <b>Columnas del Excel:</b> Ítem · Valor Neto · No. Factura · Cuenta por Pagar · CC/NIT · Beneficiario · Banco · Tipo Cuenta · Cuenta · Observación · Documento Contable
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button onClick={() => setSemanaModal(false)}
                                style={{
                                    padding: '10px 20px', borderRadius: 10,
                                    border: '1.5px solid #e5e7eb', background: '#fff',
                                    fontSize: 14, cursor: 'pointer', color: '#6b7280', fontWeight: 500,
                                }}>
                                Cancelar
                            </button>
                            <button onClick={generateConsolidado}
                                style={{
                                    padding: '10px 24px', borderRadius: 10,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #059669, #10b981)',
                                    color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 700,
                                    boxShadow: '0 2px 8px rgba(16,185,129,0.35)',
                                }}>
                                📥 Descargar Excel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Crear Nota Bancaria ── */}
            {nbModal.open && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => setNbModal({ ...nbModal, open: false })}>
                    <div style={{
                        background: '#fff', borderRadius: 20, padding: 32, width: 480, maxWidth: '90vw',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                    }} onClick={e => e.stopPropagation()}>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                            }}>💳</div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                                    Crear Nota Bancaria de Pago
                                </h2>
                                <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                                    Cruzando Fra. contable: <b>{nbModal.documento_contable}</b>
                                </p>
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, marginBottom: 20, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>MONTO A DEBITAR (23355002)</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{formatCOP(nbModal.valorAPagar)}</div>
                        </div>

                        {nbLoadingParams ? (
                            <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Cargando parámetros de Oracle...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                                            Banco Origen <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <select
                                            value={nbForm.banco}
                                            onChange={e => {
                                                const b = e.target.value;
                                                setNbForm(prev => ({ ...prev, banco: b, cuenta_banco: '' }));
                                            }}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', background: '#fff' }}
                                        >
                                            <option value="">-- Seleccionar Banco --</option>
                                            {listaBancos.map(b => (
                                                <option key={b} value={b}>{b}</option>
                                            ))}
                                            <option value="OTRO">OTRO / MANUAL</option>
                                        </select>
                                    </div>

                                    <div style={{ flex: 1.5 }}>
                                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                                            Cuenta Contable <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            list="cuentas-bancarias-list"
                                            value={nbForm.cuenta_banco}
                                            onChange={e => setNbForm({ ...nbForm, cuenta_banco: e.target.value })}
                                            placeholder="Ej: 111005..."
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                        <datalist id="cuentas-bancarias-list">
                                            {cuentasFiltradas.map(c => (
                                                <option key={c.codigo} value={c.codigo}>
                                                    {c.codigo} - {c.nombre}
                                                </option>
                                            ))}
                                        </datalist>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Centro de Costo</label>
                                        <select
                                            value={nbForm.ccosto}
                                            onChange={e => setNbForm({ ...nbForm, ccosto: e.target.value })}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                                        >
                                            <option value="">-- C.C --</option>
                                            {nbParams.ccostos.map(c => (
                                                <option key={c.codigo} value={c.codigo}>{c.codigo}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Destino</label>
                                        <select
                                            value={nbForm.destino}
                                            onChange={e => setNbForm({ ...nbForm, destino: e.target.value })}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                                        >
                                            <option value="">-- Destino --</option>
                                            {nbParams.destinos.map(c => (
                                                <option key={c.codigo} value={c.codigo}>{c.codigo}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                                        Detalle de Movimiento
                                    </label>
                                    <input
                                        type="text"
                                        value={nbForm.detalle}
                                        onChange={e => setNbForm({ ...nbForm, detalle: e.target.value })}
                                        placeholder="Ej: Pago de factura DC07-1666"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Max 100 caracteres. Aparecerá en el comprobante contable.</p>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                            <button onClick={() => setNbModal({ ...nbModal, open: false })}
                                style={{
                                    padding: '10px 20px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
                                    fontSize: 14, cursor: 'pointer', color: '#64748b', fontWeight: 600,
                                }}>
                                Cancelar
                            </button>
                            <button onClick={createNotaBancaria} disabled={nbCreating || nbLoadingParams}
                                style={{
                                    padding: '10px 24px', borderRadius: 8, border: 'none',
                                    background: 'linear-gradient(135deg, #1e40af, #3b82f6)', color: '#fff', fontSize: 14,
                                    cursor: nbCreating || nbLoadingParams ? 'not-allowed' : 'pointer', fontWeight: 600,
                                    boxShadow: '0 4px 12px rgba(59,130,246,0.3)', opacity: nbCreating ? 0.7 : 1
                                }}>
                                {nbCreating ? 'Generando...' : 'Generar NB01'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View PDF Modal */}
            {isPdfModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div
                        style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)'
                        }}
                        onClick={() => setIsPdfModalOpen(false)}
                    />
                    <div style={{
                        position: 'relative', zIndex: 10000,
                        width: '100%', maxWidth: 1024, height: '85vh',
                        background: '#fff', borderRadius: 16, display: 'flex', flexDirection: 'column',
                        overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px 24px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb'
                        }}>
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>Visor de Factura</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <a
                                    href={pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        padding: '8px 16px', fontSize: 13, background: '#2563eb', color: '#fff',
                                        borderRadius: 8, textDecoration: 'none', fontWeight: 500
                                    }}
                                >
                                    Abrir en nueva pestaña
                                </a>
                                <button
                                    onClick={() => setIsPdfModalOpen(false)}
                                    style={{
                                        border: 'none', background: 'transparent', padding: 8, cursor: 'pointer',
                                        color: '#9ca3af', borderRadius: 8
                                    }}
                                >
                                    <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        {/* Iframe */}
                        <div style={{ flex: 1, padding: 16, background: '#f3f4f6' }}>
                            <iframe
                                src={pdfUrl}
                                title="Visor de PDF"
                                style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12, background: '#fff' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Spin animation */}
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>

            {/* Modal de Re-Visualización Nota Bancaria */}
            {nbViewModal.open && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#fff', padding: 30, borderRadius: 16, width: '100%', maxWidth: 800, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 15, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 24 }}>📄</span>
                                    <span>Nota Bancaria <span style={{ color: '#2563eb' }}>{nbViewModal.data[0]?.tipo_doc || 'NB01'}</span></span>
                                </h2>
                                <span style={{ color: '#64748b', fontSize: 13 }}>Soporte de pago correspondiente al documento {nbViewModal.documento}</span>
                            </div>
                            <button onClick={() => setNbViewModal({ open: false, data: [], documento: '' })} style={{ border: 'none', cursor: 'pointer', padding: 5, borderRadius: 4, background: '#f1f5f9' }}>
                                ✖
                            </button>
                        </div>

                        <div style={{ overflowX: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead style={{ background: '#eff6ff', color: '#1e3a8a', textAlign: 'left' }}>
                                    <tr>
                                        <th style={{ padding: '10px 12px', borderBottom: '2px solid #bfdbfe' }}>Cuenta</th>
                                        <th style={{ padding: '10px 12px', borderBottom: '2px solid #bfdbfe' }}>Tipo</th>
                                        <th style={{ padding: '10px 12px', borderBottom: '2px solid #bfdbfe' }}>C.Costo</th>
                                        <th style={{ padding: '10px 12px', borderBottom: '2px solid #bfdbfe' }}>Destino</th>
                                        <th style={{ padding: '10px 12px', borderBottom: '2px solid #bfdbfe', textAlign: 'right' }}>Débito</th>
                                        <th style={{ padding: '10px 12px', borderBottom: '2px solid #bfdbfe', textAlign: 'right' }}>Crédito</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {nbViewModal.data.map((r: any, idx: number) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: r.tipo_doc === 'NB01' ? '#f8fafc' : '#fff' }}>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#334155' }}>{r.cuenta}</td>
                                            <td style={{ padding: '10px 12px', fontWeight: 600, color: r.tipo === 'DEBITO' ? '#15803d' : '#b91c1c' }}>{r.tipo}</td>
                                            <td style={{ padding: '10px 12px', color: '#475569' }}>{r.ccosto}</td>
                                            <td style={{ padding: '10px 12px', color: '#475569' }}>{r.destino}</td>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#15803d', textAlign: 'right' }}>
                                                {r.tipo === 'DEBITO' ? formatCOP(r.valor) : ''}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#b91c1c', textAlign: 'right' }}>
                                                {r.tipo === 'CREDITO' ? formatCOP(r.valor) : ''}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                                        <td colSpan={4} style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#334155' }}>TOTAL EMITIDO</td>
                                        <td style={{ padding: '12px', fontWeight: 800, color: '#15803d', textAlign: 'right' }}>
                                            {formatCOP(nbViewModal.data.reduce((sum: number, r: any) => sum + (r.tipo === 'DEBITO' ? r.valor : 0), 0))}
                                        </td>
                                        <td style={{ padding: '12px', fontWeight: 800, color: '#b91c1c', textAlign: 'right' }}>
                                            {formatCOP(nbViewModal.data.reduce((sum: number, r: any) => sum + (r.tipo === 'CREDITO' ? r.valor : 0), 0))}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style={{ marginTop: 20, padding: '12px 16px', background: '#f8fafc', borderLeft: '4px solid #3b82f6', borderRadius: '0 8px 8px 0' }}>
                                <strong style={{ color: '#1e40af', fontSize: 13, display: 'block', marginBottom: 5 }}>Detalle de Causación Original:</strong>
                                <span style={{ color: '#475569', fontSize: 13 }}>{nbViewModal.data[0]?.detalle || 'Soporte procesado'}</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
                            <button
                                onClick={() => {
                                    if (nbViewModal.data.length > 0) {
                                        const docText = nbViewModal.data[0].tipo_doc;

                                        const docCleaned = docText.replace(/\s+/g, '');
                                        let [t, n] = ['NB01', '0'];
                                        if (docCleaned.includes('-')) {
                                            [t, n] = docCleaned.split('-');
                                        }

                                        setPdfUrl(`${API_URL}/pagos/nota-bancaria/${t}/${n}/pdf`);
                                        setIsPdfModalOpen(true);
                                    }
                                }}
                                style={{ padding: '10px 20px', borderRadius: 8, background: '#2563eb', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)' }}
                            >
                                📄 Generar PDF (NIIF)
                            </button>
                            <button
                                onClick={() => setNbViewModal({ open: false, data: [], documento: '' })}
                                style={{ padding: '10px 20px', borderRadius: 8, background: '#1e293b', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s', boxShadow: '0 2px 4px rgba(30, 41, 59, 0.2)' }}
                            >
                                Cerrar Soporte
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal NB01 Masiva ── */}
            {nbMasivoModal.open && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
                    zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                }} onClick={() => setNbMasivoModal({ open: false, items: [] })}>
                    <div style={{
                        background: '#fff', borderRadius: 20, padding: 32, width: '92%', maxWidth: 820,
                        maxHeight: '90vh', overflowY: 'auto',
                        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
                    }} onClick={e => e.stopPropagation()}>

                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14,
                                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                            }}>🏦</div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e1b4b' }}>
                                    Crear Nota Bancaria NB01
                                </h2>
                                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#7c3aed' }}>
                                    {nbMasivoModal.items.length} factura(s) aprobada(s) · Salida de banco por cada una
                                </p>
                            </div>
                        </div>

                        {/* Tabla de facturas */}
                        <div style={{ background: '#f8f7ff', borderRadius: 12, padding: 16, marginBottom: 24 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9', marginBottom: 10, letterSpacing: 0.5 }}>
                                FACTURAS A INCLUIR EN LA NB01
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#ede9fe', color: '#5b21b6' }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Proveedor</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Factura</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Doc. Contable</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {nbMasivoModal.items.map((f, i) => (
                                        <tr key={f.id} style={{ borderBottom: '1px solid #ede9fe', background: i % 2 === 0 ? '#fff' : '#faf5ff' }}>
                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>
                                                <div style={{ fontSize: 11, color: '#6b7280' }}>{f.proveedor_nit}</div>
                                                <div>{f.proveedor_nombre}</div>
                                            </td>
                                            <td style={{ padding: '8px 12px', color: '#374151' }}>{f.numero_factura || '—'}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                                                    {f.documento_contable}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#065f46', textAlign: 'right' }}>
                                                {formatCOP(f.valor)}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr style={{ background: '#ede9fe', borderTop: '2px solid #c4b5fd' }}>
                                        <td colSpan={3} style={{ padding: '10px 12px', fontWeight: 700, color: '#5b21b6', textAlign: 'right' }}>TOTAL</td>
                                        <td style={{ padding: '10px 12px', fontWeight: 800, color: '#065f46', textAlign: 'right', fontSize: 15 }}>
                                            {formatCOP(nbMasivoModal.items.reduce((s, f) => s + f.valor, 0))}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Formulario */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Banco</label>
                                <select value={nbMasivoForm.banco}
                                    onChange={e => setNbMasivoForm(p => ({ ...p, banco: e.target.value, cuenta_banco: '' }))}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13 }}>
                                    <option value="">-- Seleccione Banco --</option>
                                    {nbParams.cuentas
                                        .filter(c => c.codigo.startsWith('1110') || c.codigo.startsWith('1120'))
                                        .reduce((banks: string[], c) => {
                                            const n = c.nombre.toUpperCase();
                                            const bank = n.includes('BANCOLOMBIA') ? 'BANCOLOMBIA' : n.includes('DAVIVIENDA') ? 'DAVIVIENDA' :
                                                n.includes('BOGOTA') ? 'BOGOTÁ' : n.includes('BBVA') ? 'BBVA' :
                                                    n.includes('OCCIDENTE') ? 'OCCIDENTE' : n.split(' ')[0];
                                            if (!banks.includes(bank)) banks.push(bank);
                                            return banks;
                                        }, [])
                                        .map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Cuenta Bancaria *</label>
                                <select value={nbMasivoForm.cuenta_banco}
                                    onChange={e => setNbMasivoForm(p => ({ ...p, cuenta_banco: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #c4b5fd', fontSize: 13 }}>
                                    <option value="">-- Seleccione Cuenta --</option>
                                    {nbParams.cuentas
                                        .filter(c => (c.codigo.startsWith('1110') || c.codigo.startsWith('1120')) &&
                                            (!nbMasivoForm.banco || c.nombre.toUpperCase().includes(nbMasivoForm.banco.replace('BOGOTÁ', 'BOGOTA'))))
                                        .map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>C. Costo (línea banco)</label>
                                <input
                                    type="text"
                                    value={nbMasivoForm.ccosto}
                                    onChange={e => setNbMasivoForm(p => ({ ...p, ccosto: e.target.value }))}
                                    placeholder="04"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }}
                                />
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>Por defecto: 04</span>
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Destino (línea banco)</label>
                                <select value={nbMasivoForm.destino}
                                    onChange={e => setNbMasivoForm(p => ({ ...p, destino: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13 }}>
                                    {nbParams.destinos.map(d => <option key={d.codigo} value={d.codigo}>{d.codigo} — {d.nombre}</option>)}
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                                    Detalle / Descripción <span style={{ color: '#9ca3af', fontWeight: 400 }}>(aparecerá en todas las líneas)</span>
                                </label>
                                <input type="text" maxLength={100}
                                    value={nbMasivoForm.detalle}
                                    onChange={e => setNbMasivoForm(p => ({ ...p, detalle: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }}
                                    placeholder="Ej: Pago Programacion Facturas Internet Feb 2026"
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>{nbMasivoForm.detalle.length}/100</span>
                            </div>
                        </div>

                        {/* Botones */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                            <button onClick={() => setNbMasivoModal({ open: false, items: [] })}
                                style={{ padding: '11px 24px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                                Cancelar
                            </button>
                            <button onClick={createNotaBancariaMasiva}
                                disabled={nbMasivoCreating || !nbMasivoForm.cuenta_banco}
                                style={{
                                    padding: '11px 28px', borderRadius: 10, border: 'none',
                                    background: (nbMasivoCreating || !nbMasivoForm.cuenta_banco)
                                        ? '#e5e7eb' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                    color: (nbMasivoCreating || !nbMasivoForm.cuenta_banco) ? '#9ca3af' : '#fff',
                                    fontSize: 14, fontWeight: 700,
                                    cursor: (nbMasivoCreating || !nbMasivoForm.cuenta_banco) ? 'not-allowed' : 'pointer',
                                    boxShadow: nbMasivoForm.cuenta_banco ? '0 4px 14px rgba(124,58,237,0.4)' : 'none',
                                    transition: 'all 0.2s',
                                }}>
                                {nbMasivoCreating ? '⏳ Creando NB01...' : `🏦 Confirmar · ${nbMasivoModal.items.length} facturas`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Comprobante de Pago NB01 ── */}
            {nbComprobante?.open && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(30,58,95,0.35)',
                    zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(3px)',
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 16, width: '96%', maxWidth: 940,
                        maxHeight: '92vh', overflowY: 'auto',
                        boxShadow: '0 8px 40px rgba(30,58,95,0.18)',
                        border: '1px solid #e2e8f0',
                    }}>
                        {/* Header del sistema */}
                        <div style={{
                            background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                            borderRadius: '16px 16px 0 0', padding: '22px 28px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🏦</div>
                                    <div>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 2, fontWeight: 600, marginBottom: 2 }}>COMPROBANTE DE PAGO · NOTA BANCARIA</div>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{nbComprobante.nb_numero}</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>Fecha</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{nbComprobante.fecha}</div>
                                    <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.15)', textAlign: 'right' }}>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>TOTAL PAGADO</div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#e0f2fe' }}>{formatCOP(nbComprobante.valor_total)}</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.8)', borderLeft: '3px solid rgba(255,255,255,0.25)' }}>
                                {nbComprobante.detalle}
                            </div>
                        </div>

                        {/* Info banco — banda gris muy suave */}
                        <div style={{ padding: '12px 28px', background: '#f8fafc', borderBottom: '1px solid #e9edf2', display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
                            {[
                                { label: 'CUENTA BANCARIA', value: nbComprobante.cuenta_banco },
                                { label: 'BANCO', value: nbComprobante.nombre_banco },
                                { label: 'MOVIMIENTOS', value: `${nbComprobante.movimientos.length} registros` },
                            ].map(item => (
                                <div key={item.label}>
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.8, marginBottom: 2 }}>{item.label}</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f' }}>{item.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Tabla de movimientos — paleta clara */}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ background: '#eef2f7', borderBottom: '2px solid #d1dbe8' }}>
                                        {['Cuenta', 'Nombre Cuenta', 'Proveedor / Vinculado', 'CC / NIT', 'Doc. Cruce', 'Débito', 'Crédito'].map(h => (
                                            <th key={h} style={{
                                                padding: '9px 13px', color: '#1e3a5f',
                                                fontWeight: 700, textAlign: h === 'Débito' || h === 'Crédito' ? 'right' : 'left',
                                                fontSize: 11, letterSpacing: 0.3, whiteSpace: 'nowrap',
                                                borderRight: '1px solid #d1dbe8',
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {nbComprobante.movimientos.map((m, i) => (
                                        <tr key={i} style={{
                                            background: i % 2 === 0 ? '#fff' : '#f8fafc',
                                            borderBottom: (i + 1) % 2 === 0 ? '1px solid #e9edf2' : '1px solid #f1f5f9',
                                        }}>
                                            <td style={{ padding: '8px 13px', fontFamily: 'monospace', fontWeight: 600, color: '#374151', fontSize: 12 }}>{m.cuenta}</td>
                                            <td style={{ padding: '8px 13px', color: '#4b5563', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.nombre}>{m.nombre}</td>
                                            <td style={{ padding: '8px 13px', fontWeight: 600, color: '#1e293b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.vinculado}>{m.vinculado}</td>
                                            <td style={{ padding: '8px 13px', fontFamily: 'monospace', color: '#6b7280', fontSize: 11.5 }}>{m.nit}</td>
                                            <td style={{ padding: '8px 13px' }}>
                                                {m.doc_contable && (
                                                    <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{m.doc_contable}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 13px', textAlign: 'right', fontWeight: 600, color: m.debito > 0 ? '#1e3a5f' : '#c9d3de', fontFamily: 'monospace' }}>
                                                {m.debito > 0 ? formatCOP(m.debito) : '—'}
                                            </td>
                                            <td style={{ padding: '8px 13px', textAlign: 'right', fontWeight: 600, color: m.credito > 0 ? '#374151' : '#c9d3de', fontFamily: 'monospace' }}>
                                                {m.credito > 0 ? formatCOP(m.credito) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#eef2f7', borderTop: '2px solid #d1dbe8' }}>
                                        <td colSpan={5} style={{ padding: '10px 13px', fontWeight: 700, color: '#1e3a5f', fontSize: 12, textAlign: 'right' }}>TOTAL</td>
                                        <td style={{ padding: '10px 13px', textAlign: 'right', fontWeight: 800, color: '#1e3a5f', fontFamily: 'monospace', fontSize: 13 }}>
                                            {formatCOP(nbComprobante.movimientos.reduce((s, m) => s + m.debito, 0))}
                                        </td>
                                        <td style={{ padding: '10px 13px', textAlign: 'right', fontWeight: 800, color: '#374151', fontFamily: 'monospace', fontSize: 13 }}>
                                            {formatCOP(nbComprobante.movimientos.reduce((s, m) => s + m.credito, 0))}
                                        </td>
                                    </tr>
                                    <tr style={{ background: '#f8fafc', borderTop: '1px solid #e9edf2' }}>
                                        <td colSpan={5} style={{ padding: '6px 13px', color: '#94a3b8', fontSize: 11.5, textAlign: 'right' }}>Descuadre</td>
                                        <td colSpan={2} style={{ padding: '6px 13px', textAlign: 'right', fontWeight: 600, color: '#059669', fontSize: 12, fontFamily: 'monospace' }}>
                                            0.00
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Acciones */}
                        <div style={{ padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e9edf2', background: '#fcfdfe' }}>
                            <div style={{ fontSize: 11.5, color: '#9ca3af' }}>
                                Generado el {nbComprobante.fecha} · Facturación SaaS
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    onClick={() => {
                                        const [, num] = nbComprobante.nb_numero.split('-');
                                        window.open(`${API_URL}/pagos/nota-bancaria/NB01/${num}/pdf`, '_blank');
                                    }}
                                    style={{
                                        padding: '9px 20px', borderRadius: 9, border: '1.5px solid #2563eb',
                                        background: '#fff', color: '#2563eb',
                                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 7,
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.background = '#eff6ff'; }}
                                    onMouseOut={e => { e.currentTarget.style.background = '#fff'; }}
                                >
                                    📄 Imprimir / PDF
                                </button>
                                <button
                                    onClick={() => setNbComprobante(null)}
                                    style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
