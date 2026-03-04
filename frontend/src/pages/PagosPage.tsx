import { useState, useEffect, useCallback } from 'react';
import { formatCOP } from '../utils/format';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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
    proveedor_id: number;
    proveedor_nombre: string;
    proveedor_nit: string;
    oficinas: OficinaEnTramite[];
    documento_contable: string | null;
    cuenta_por_pagar: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PagosPage() {
    const [facturas, setFacturas] = useState<FacturaEnTramite[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [generando, setGenerando] = useState(false);
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [semanaModal, setSemanaModal] = useState(false);
    const [semanaTexto, setSemanaTexto] = useState('');

    // Manager Validation
    const [managerData, setManagerData] = useState<Record<number, any>>({});
    const [loadingManager, setLoadingManager] = useState<Record<number, boolean>>({});

    // ── Fetch ────────────────────────────────────────────────────────────────

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search.trim()) params.append('search', search.trim());
            if (fechaDesde) params.append('fecha_desde', fechaDesde);
            if (fechaHasta) params.append('fecha_hasta', fechaHasta);

            const res = await fetch(`${API_URL}/pagos/facturas-en-tramite?${params}`);
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
            const res = await fetch(`${API_URL}/pagos/consolidado-programacion`, {
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
            const res = await fetch(`${API_URL}/pagos/causacion-manager/${encodeURIComponent(docContable)}`);
            const data = await res.json();
            setManagerData(prev => ({ ...prev, [facturaId]: data }));
        } catch (e) {
            console.error('Error fetching manager details', e);
            setManagerData(prev => ({ ...prev, [facturaId]: { success: false, message: 'Error de red' } }));
        } finally {
            setLoadingManager(prev => ({ ...prev, [facturaId]: false }));
        }
    };

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
        <div style={{ minHeight: '100vh', background: '#f0f4f8', padding: '0' }}>

            {/* ── Header ── */}
            <div style={{
                background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #1d4ed8 100%)',
                padding: '28px 32px 24px',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Decorative circles */}
                <div style={{
                    position: 'absolute', top: -40, right: -40,
                    width: 200, height: 200, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                }} />
                <div style={{
                    position: 'absolute', bottom: -60, right: 120,
                    width: 150, height: 150, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.04)',
                }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: 12,
                            background: 'rgba(255,255,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22,
                        }}>💳</div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#fff' }}>
                                Módulo de Pagos
                            </h1>
                            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
                                Facturas enviadas a Manager · Programación de pagos
                            </p>
                        </div>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
                        {[
                            { label: 'En Trámite', value: facturas.length, icon: '🔄' },
                            { label: 'Seleccionadas', value: selectedIds.size, icon: '✅' },
                            { label: 'Valor Seleccionado', value: formatCOP(totalValor), icon: '💰', wide: true },
                        ].map(stat => (
                            <div key={stat.label} style={{
                                background: 'rgba(255,255,255,0.12)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: 12,
                                padding: '10px 18px',
                                border: '1px solid rgba(255,255,255,0.2)',
                                minWidth: stat.wide ? 180 : 120,
                            }}>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 500, letterSpacing: 0.5 }}>
                                    {stat.icon} {stat.label.toUpperCase()}
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 2 }}>
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
                                                checked={selectedIds.size === facturas.length && facturas.length > 0}
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
                                            'BANCO',
                                            'TIPO CUENTA',
                                            'CUENTA',
                                            'OBSERVACIÓN',
                                            'DOCUMENTO CONTABLE',
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
                                    {facturas.map((f, idx) => {
                                        const isSelected = selectedIds.has(f.id);
                                        const isExpanded = expandedRow === f.id;
                                        const rowBg = isSelected
                                            ? '#eff6ff'
                                            : idx % 2 === 0 ? '#fff' : '#f9fafb';

                                        return (
                                            <>
                                                <tr
                                                    key={f.id}
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
                                                        <span style={{
                                                            background: '#dbeafe', color: '#1d4ed8',
                                                            padding: '2px 8px', borderRadius: 6,
                                                            fontSize: 12, fontWeight: 600,
                                                        }}>
                                                            {f.numero_factura || '—'}
                                                        </span>
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

                                                    {/* BANCO */}
                                                    <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>—</td>

                                                    {/* TIPO CUENTA */}
                                                    <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>—</td>

                                                    {/* CUENTA */}
                                                    <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>—</td>

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
                                                                        {f.documento_contable ? (
                                                                            <button
                                                                                onClick={() => fetchManagerCausation(f.id, f.documento_contable!)}
                                                                                disabled={loadingManager[f.id]}
                                                                                style={{
                                                                                    padding: '6px 14px', borderRadius: 8, background: '#fef3c7',
                                                                                    border: '1px solid #fcd34d', color: '#b45309', fontSize: 12,
                                                                                    fontWeight: 600, cursor: loadingManager[f.id] ? 'wait' : 'pointer'
                                                                                }}
                                                                            >
                                                                                {loadingManager[f.id] ? 'Consultando...' : 'Consultar en Manager'}
                                                                            </button>
                                                                        ) : (
                                                                            <span style={{ fontSize: 12, color: '#ef4444' }}>Sin documento contable para consultar</span>
                                                                        )}
                                                                    </div>

                                                                    {managerData[f.id] && (
                                                                        <div style={{ background: '#fff', border: '1px solid #fcd34d', borderRadius: 10, overflow: 'hidden' }}>
                                                                            {!managerData[f.id].success ? (
                                                                                <div style={{ padding: '12px 16px', color: '#b45309', fontSize: 13, background: '#fef3c7' }}>
                                                                                    ⚠ {managerData[f.id].message}
                                                                                </div>
                                                                            ) : (
                                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                                                    <thead style={{ background: '#fef3c7', color: '#92400e', textAlign: 'left' }}>
                                                                                        <tr>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #fde68a' }}>Cuenta</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #fde68a' }}>Tipo</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #fde68a' }}>C.Costo</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #fde68a' }}>Destino</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #fde68a' }}>Valor</th>
                                                                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #fde68a' }}>Detalle</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody>
                                                                                        {managerData[f.id].data?.map((mRow: any, mIdx: number) => (
                                                                                            <tr key={mIdx} style={{ borderBottom: '1px solid #fef3c7' }}>
                                                                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{mRow.cuenta}</td>
                                                                                                <td style={{ padding: '8px 12px', fontWeight: 600, color: mRow.tipo === 'DEBITO' ? '#15803d' : '#b91c1c' }}>
                                                                                                    {mRow.tipo}
                                                                                                </td>
                                                                                                <td style={{ padding: '8px 12px' }}>{mRow.ccosto || '-'}</td>
                                                                                                <td style={{ padding: '8px 12px' }}>{mRow.destino || '-'}</td>
                                                                                                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{formatCOP(mRow.valor)}</td>
                                                                                                <td style={{ padding: '8px 12px', color: '#4b5563' }}>{mRow.detalle}</td>
                                                                                            </tr>
                                                                                        ))}
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
                                            </>
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
                                {facturas.length} factura(s) en trámite
                                {selectedIds.size > 0 && <> · <b style={{ color: '#2563eb' }}>{selectedIds.size} seleccionadas</b></>}
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
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: 0.5 }}>
                                        TOTAL GENERAL
                                    </div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1e3a5f' }}>
                                        {formatCOP(facturas.reduce((s, f) => s + f.valor, 0))}
                                    </div>
                                </div>
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

            {/* Spin animation */}
            <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
