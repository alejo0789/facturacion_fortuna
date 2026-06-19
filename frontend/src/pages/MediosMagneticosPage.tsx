/**
 * Medios Magnéticos DIAN — formatos 1001, 1007 y 1008.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiFetch, ApiError } from '../utils/apiClient';
import { formatCOP } from '../utils/format';

interface Resumen {
    anio: number;
    f1001_registros: number;
    f1001_total_pagos: string;
    f1001_lineas_omitidas_sin_nit?: number;
    f1001_valor_omitido_sin_nit?: string;
    f1007_registros: number;
    f1007_total_ingresos: string;
    f1008_registros: number;
    f1008_total_cxc: string;
}

interface FilaGenerica {
    numero_identificacion: string;
    nombre_tercero?: string | null;
    [k: string]: unknown;
}

type FormatoActivo = '1001' | '1007' | '1008';

const FORMATO_META: Record<FormatoActivo, { label: string; desc: string }> = {
    '1001': { label: 'Pagos a terceros', desc: 'Retefuente practicada, ReteIVA, ReteICA, IVA descontable' },
    '1007': { label: 'Ingresos recibidos', desc: 'Total facturado por tercero + IVA generado' },
    '1008': { label: 'Cuentas por cobrar', desc: 'Saldos pendientes al cierre del año' },
};

export default function MediosMagneticosPage() {
    const currentYear = new Date().getFullYear();
    const [anio, setAnio] = useState(currentYear - 1);
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [formato, setFormato] = useState<FormatoActivo>('1001');
    const [filas, setFilas] = useState<FilaGenerica[]>([]);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadResumen = useCallback(async () => {
        setError(null);
        try {
            const data = await apiGet<Resumen>('/api/dian/medios-magneticos/resumen', { anio });
            setResumen(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al cargar resumen');
            setResumen(null);
        }
    }, [anio]);

    const loadFormato = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const data = await apiGet<{ filas: FilaGenerica[] }>(`/api/dian/medios-magneticos/${formato}`, { anio });
            setFilas(data.filas);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al cargar formato');
            setFilas([]);
        } finally {
            setCargando(false);
        }
    }, [formato, anio]);

    useEffect(() => { void loadResumen(); }, [loadResumen]);
    useEffect(() => { void loadFormato(); }, [loadFormato]);

    const descargarCSV = async () => {
        const resp = await apiFetch(`/api/dian/medios-magneticos/${formato}`, {
            method: 'GET',
            params: { anio, formato: 'csv' },
        });
        if (!resp.ok) {
            setError(`Error ${resp.status} al descargar CSV`);
            return;
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `formato_${formato}_${anio}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const columnas: Record<FormatoActivo, { key: string; label: string; money?: boolean }[]> = {
        '1001': [
            { key: 'numero_identificacion', label: 'NIT' },
            { key: 'valor_pago', label: 'Pagos', money: true },
            { key: 'iva_descontable', label: 'IVA desc.', money: true },
            { key: 'retefuente_practicada', label: 'Retefuente', money: true },
            { key: 'reteiva_practicada', label: 'ReteIVA', money: true },
            { key: 'reteica_practicada', label: 'ReteICA', money: true },
        ],
        '1007': [
            { key: 'numero_identificacion', label: 'NIT' },
            { key: 'valor_ingreso', label: 'Ingresos', money: true },
            { key: 'valor_iva_generado', label: 'IVA generado', money: true },
        ],
        '1008': [
            { key: 'numero_identificacion', label: 'NIT' },
            { key: 'saldo', label: 'Saldo CxC', money: true },
        ],
    };

    return (
        <div className="max-w-[1480px] mx-auto space-y-8">
            {/* Masthead */}
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Cumplimiento DIAN · Año fiscal {anio}</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Medios <em>magnéticos</em>.
                    </h1>
                    <p className="text-[14px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Formatos 1001, 1007 y 1008 exigidos por la Resolución anual de la DIAN.
                        Construidos a partir de los asientos aprobados del año seleccionado.
                    </p>
                </div>
            </div>

            {/* Año picker */}
            <div className="surface p-4 flex items-end gap-3">
                <div>
                    <label className="kicker block mb-1.5">Año fiscal</label>
                    <input
                        type="number"
                        min={2000}
                        max={2100}
                        value={anio}
                        onChange={(e) => setAnio(Number(e.target.value) || currentYear)}
                        className="input-field font-mono w-28 text-[14px]"
                    />
                </div>
            </div>

            {error && (
                <div
                    className="px-5 py-4 rounded-lg text-[13px]"
                    style={{
                        background: 'var(--negative-soft)',
                        border: '1px solid var(--negative)',
                        color: 'var(--negative)',
                    }}
                >
                    {error}
                </div>
            )}

            {/* Aviso de integridad */}
            {resumen && (resumen.f1001_lineas_omitidas_sin_nit ?? 0) > 0 && (
                <div
                    className="rounded-lg px-5 py-4 text-[13px]"
                    style={{
                        background: 'var(--gold-soft)',
                        border: '1px solid var(--gold)',
                        color: '#7a5e29',
                    }}
                >
                    <div className="kicker-accent mb-1" style={{ color: 'var(--gold)' }}>
                        Atención — Formato 1001 incompleto
                    </div>
                    {resumen.f1001_lineas_omitidas_sin_nit} línea(s) contable(s) por{' '}
                    <strong>{formatCOP(resumen.f1001_valor_omitido_sin_nit ?? '0')}</strong> se
                    omitieron por falta de NIT del tercero. Complete esos NITs en los asientos
                    para que el reporte DIAN quede íntegro.
                </div>
            )}

            {/* Resumen — 3 ledger cards */}
            {resumen && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 anim-stagger">
                    <FormatoCard
                        codigo="1001"
                        label="Pagos a terceros"
                        valor={resumen.f1001_total_pagos}
                        registros={resumen.f1001_registros}
                        tone="var(--accent)"
                    />
                    <FormatoCard
                        codigo="1007"
                        label="Ingresos"
                        valor={resumen.f1007_total_ingresos}
                        registros={resumen.f1007_registros}
                        tone="var(--positive)"
                    />
                    <FormatoCard
                        codigo="1008"
                        label="CxC pendientes"
                        valor={resumen.f1008_total_cxc}
                        registros={resumen.f1008_registros}
                        tone="var(--gold)"
                    />
                </div>
            )}

            {/* Tabs + Tabla */}
            <div className="surface-raised overflow-hidden">
                <div
                    className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                    style={{ borderBottom: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                >
                    <div className="flex items-center gap-2 flex-wrap">
                        {(['1001', '1007', '1008'] as const).map((f) => {
                            const active = formato === f;
                            return (
                                <button
                                    key={f}
                                    onClick={() => setFormato(f)}
                                    className="relative px-4 py-2 rounded-md text-[13px] font-medium transition-all"
                                    style={
                                        active
                                            ? {
                                                  background: 'var(--ink)',
                                                  color: 'var(--paper)',
                                                  borderBottom: '2px solid var(--accent)',
                                              }
                                            : {
                                                  background: 'transparent',
                                                  color: 'var(--ink-soft)',
                                              }
                                    }
                                    onMouseEnter={(e) => {
                                        if (!active) e.currentTarget.style.background = 'var(--canvas-2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!active) e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <span className="font-mono text-[11px] mr-2" style={{ opacity: 0.7 }}>
                                        F
                                    </span>
                                    {f}
                                    <span className="ml-1.5 text-[10px] opacity-70 hidden md:inline">
                                        · {FORMATO_META[f].label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={descargarCSV}
                        disabled={filas.length === 0}
                        className="btn-accent text-[13px] disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Descargar CSV
                    </button>
                </div>

                <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                    <div className="kicker-accent">Formato {formato}</div>
                    <div className="font-display text-[1.2rem] tracking-tight mt-1">
                        {FORMATO_META[formato].label}
                    </div>
                    <div className="text-[12px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                        {FORMATO_META[formato].desc}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-[14px]">
                        <thead style={{ background: 'var(--paper-tinted)' }}>
                            <tr>
                                {columnas[formato].map((c) => (
                                    <th
                                        key={c.key}
                                        className={`kicker px-5 py-3 ${c.money ? 'text-right' : 'text-left'}`}
                                        style={{ background: 'var(--paper-tinted)' }}
                                    >
                                        {c.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {cargando && (
                                <tr>
                                    <td colSpan={columnas[formato].length} className="p-10 text-center">
                                        <div
                                            className="h-8 w-8 mx-auto rounded-full border-2 border-t-transparent"
                                            style={{
                                                borderColor: 'var(--accent)',
                                                borderTopColor: 'transparent',
                                                animation: 'spin-soft 800ms linear infinite',
                                            }}
                                        />
                                        <div className="kicker mt-3">Cargando</div>
                                    </td>
                                </tr>
                            )}
                            {!cargando && filas.length === 0 && (
                                <tr>
                                    <td colSpan={columnas[formato].length} className="p-16 text-center">
                                        <div
                                            className="font-display text-[3rem]"
                                            style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                        >
                                            —
                                        </div>
                                        <div className="kicker mt-2">Sin registros para {anio}</div>
                                    </td>
                                </tr>
                            )}
                            {filas.map((f, idx) => (
                                <tr
                                    key={idx}
                                    style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                    className="transition-colors"
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {columnas[formato].map((c) => {
                                        const v = f[c.key];
                                        return (
                                            <td
                                                key={c.key}
                                                className={`px-5 py-3 ${c.money ? 'text-right font-mono text-[13px]' : ''}`}
                                                style={{ color: c.money ? 'var(--ink-soft)' : 'var(--ink)' }}
                                            >
                                                {c.money ? formatCOP(v as string) : (v as string)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

interface FormatoCardProps {
    codigo: string;
    label: string;
    valor: string;
    registros: number;
    tone: string;
}

function FormatoCard({ codigo, label, valor, registros, tone }: FormatoCardProps) {
    return (
        <div className="surface p-6 transition-all hover:-translate-y-px">
            <div className="flex items-baseline justify-between mb-3">
                <div className="kicker">{label}</div>
                <span
                    className="font-display-wonk text-[1.4rem] leading-none"
                    style={{ color: tone }}
                >
                    F·{codigo}
                </span>
            </div>
            <div className="numeral text-[1.8rem] leading-none">
                {formatCOP(valor)}
            </div>
            <div className="kicker mt-3">{registros} terceros</div>
        </div>
    );
}
