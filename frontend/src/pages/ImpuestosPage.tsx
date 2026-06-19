/**
 * Configuración de impuestos — IVA, ReteFuente, ReteIVA, ReteICA.
 */
import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, ApiError } from '../utils/apiClient';
import { formatCOP } from '../utils/format';
import type {
    CalcularImpuestosPayload,
    CalcularImpuestosResultado,
    ConfiguracionImpuesto,
    TipoImpuesto,
} from '../types/contabilidad';

const TIPOS: TipoImpuesto[] = ['IVA', 'RETEFUENTE', 'RETEIVA', 'RETEICA'];

const TIPO_TAG: Record<TipoImpuesto, string> = {
    IVA: 'tag-accent',
    RETEFUENTE: 'tag-gold',
    RETEIVA: 'tag',
    RETEICA: 'tag-positive',
};

export default function ImpuestosPage() {
    const [configs, setConfigs] = useState<ConfiguracionImpuesto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showCfgForm, setShowCfgForm] = useState(false);
    const [cfgTipo, setCfgTipo] = useState<TipoImpuesto>('IVA');
    const [cfgCuenta, setCfgCuenta] = useState('');
    const [cfgDescripcion, setCfgDescripcion] = useState('');

    const [tarifaConceptoBy, setTarifaConceptoBy] = useState<Record<number, string>>({});
    const [tarifaPctBy, setTarifaPctBy] = useState<Record<number, string>>({});
    const [tarifaBaseBy, setTarifaBaseBy] = useState<Record<number, string>>({});
    const [tarifaDefaultBy, setTarifaDefaultBy] = useState<Record<number, boolean>>({});

    const [simValor, setSimValor] = useState('1000000');
    const [simTieneIva, setSimTieneIva] = useState(true);
    const [simAplicaRete, setSimAplicaRete] = useState(true);
    const [simResultado, setSimResultado] = useState<CalcularImpuestosResultado | null>(null);
    const [simLoading, setSimLoading] = useState(false);
    const [simError, setSimError] = useState<string | null>(null);

    const cargar = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiGet<ConfiguracionImpuesto[]>('/impuestos/configuraciones');
            setConfigs(data);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error cargando configuraciones');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { cargar(); }, []);

    const crearConfig = async () => {
        try {
            await apiPost<ConfiguracionImpuesto>('/impuestos/configuraciones', {
                tipo: cfgTipo,
                cuenta_puc: cfgCuenta || undefined,
                descripcion: cfgDescripcion || undefined,
            });
            setShowCfgForm(false);
            setCfgCuenta('');
            setCfgDescripcion('');
            await cargar();
        } catch (e) {
            alert(e instanceof ApiError ? e.message : 'Error');
        }
    };

    const agregarTarifa = async (configId: number) => {
        const pct = tarifaPctBy[configId];
        if (!pct) {
            alert('Ingrese la tarifa %');
            return;
        }
        try {
            await apiPost(`/impuestos/configuraciones/${configId}/tarifas`, {
                concepto: tarifaConceptoBy[configId] || null,
                tarifa_pct: pct,
                base_minima: tarifaBaseBy[configId] || '0',
                es_default: !!tarifaDefaultBy[configId],
            });
            setTarifaConceptoBy((p) => ({ ...p, [configId]: '' }));
            setTarifaPctBy((p) => ({ ...p, [configId]: '' }));
            setTarifaBaseBy((p) => ({ ...p, [configId]: '' }));
            setTarifaDefaultBy((p) => ({ ...p, [configId]: false }));
            await cargar();
        } catch (e) {
            alert(e instanceof ApiError ? e.message : 'Error agregando tarifa');
        }
    };

    const eliminarTarifa = async (configId: number, tarifaId: number) => {
        if (!confirm('¿Eliminar tarifa?')) return;
        try {
            await apiDelete(`/impuestos/configuraciones/${configId}/tarifas/${tarifaId}`);
            await cargar();
        } catch (e) {
            alert(e instanceof ApiError ? e.message : 'Error eliminando');
        }
    };

    const simular = async () => {
        setSimLoading(true);
        setSimError(null);
        setSimResultado(null);
        try {
            const payload: CalcularImpuestosPayload = {
                valor_total: simValor,
                tiene_iva: simTieneIva,
                aplica_retefuente: simAplicaRete,
            };
            const data = await apiPost<CalcularImpuestosResultado>('/impuestos/calcular', payload);
            setSimResultado(data);
        } catch (e) {
            setSimError(e instanceof ApiError ? e.message : 'Error en simulación');
        } finally {
            setSimLoading(false);
        }
    };

    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Contabilidad · Configuración fiscal</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Impuestos <em>configurables</em>.
                    </h1>
                    <button onClick={() => setShowCfgForm((v) => !v)} className="btn-accent">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Nueva configuración
                    </button>
                </div>
            </div>

            {showCfgForm && (
                <div className="surface p-5 anim-fade-up">
                    <div className="kicker-accent mb-1">Acción</div>
                    <h2 className="font-display text-[1.3rem] tracking-tight mb-4">Nueva configuración</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <div>
                            <label className="kicker block mb-1.5">Tipo</label>
                            <select value={cfgTipo} onChange={(e) => setCfgTipo(e.target.value as TipoImpuesto)} className="input-field">
                                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="kicker block mb-1.5">Cuenta PUC</label>
                            <input value={cfgCuenta} onChange={(e) => setCfgCuenta(e.target.value)} placeholder="240810" className="input-field font-mono" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="kicker block mb-1.5">Descripción</label>
                            <input value={cfgDescripcion} onChange={(e) => setCfgDescripcion(e.target.value)} className="input-field" />
                        </div>
                        <div className="md:col-span-4 flex justify-end gap-2">
                            <button onClick={() => setShowCfgForm(false)} className="btn-ghost">Cancelar</button>
                            <button onClick={crearConfig} className="btn-accent">Crear</button>
                        </div>
                    </div>
                </div>
            )}

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

            {/* Simulador */}
            <div className="ledger paper-grain p-6">
                <div className="kicker-accent mb-1">Herramienta</div>
                <h2 className="font-display text-[1.5rem] tracking-tight mb-5">Simulador de cálculo</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div>
                        <label className="kicker block mb-1.5">Valor total</label>
                        <input
                            type="number"
                            value={simValor}
                            onChange={(e) => setSimValor(e.target.value)}
                            className="input-field font-mono"
                        />
                    </div>
                    <label className="inline-flex items-center gap-2 text-[13px] pb-2" style={{ color: 'var(--ink-soft)' }}>
                        <input
                            type="checkbox"
                            checked={simTieneIva}
                            onChange={(e) => setSimTieneIva(e.target.checked)}
                            className="h-4 w-4 rounded"
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        Tiene IVA
                    </label>
                    <label className="inline-flex items-center gap-2 text-[13px] pb-2" style={{ color: 'var(--ink-soft)' }}>
                        <input
                            type="checkbox"
                            checked={simAplicaRete}
                            onChange={(e) => setSimAplicaRete(e.target.checked)}
                            className="h-4 w-4 rounded"
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        Aplica ReteFuente
                    </label>
                    <button onClick={simular} disabled={simLoading} className="btn-accent disabled:opacity-50">
                        {simLoading ? 'Calculando…' : 'Calcular'}
                    </button>
                </div>
                {simError && (
                    <div
                        className="mt-3 px-3 py-2 rounded-md text-[12px]"
                        style={{
                            background: 'var(--negative-soft)',
                            border: '1px solid var(--negative)',
                            color: 'var(--negative)',
                        }}
                    >
                        {simError}
                    </div>
                )}
                {simResultado && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                        <Stat label="Base" valor={simResultado.valor_base} />
                        <Stat
                            label={`IVA (${Number(simResultado.iva_rate).toFixed(0)}%)`}
                            valor={simResultado.valor_iva}
                            tone="var(--accent)"
                        />
                        <Stat
                            label={`ReteFuente (${Number(simResultado.retefuente_pct).toFixed(2)}%)`}
                            valor={simResultado.valor_retefuente}
                            tone="var(--gold)"
                        />
                        <Stat label="Valor neto" valor={simResultado.valor_neto} tone="var(--positive)" />
                    </div>
                )}
            </div>

            {/* Listado de configs */}
            {loading ? (
                <div className="p-10 text-center">
                    <div
                        className="h-10 w-10 mx-auto rounded-full border-2 border-t-transparent"
                        style={{
                            borderColor: 'var(--accent)',
                            borderTopColor: 'transparent',
                            animation: 'spin-soft 800ms linear infinite',
                        }}
                    />
                    <div className="kicker mt-3">Cargando configuraciones</div>
                </div>
            ) : configs.length === 0 ? (
                <div className="surface p-16 text-center">
                    <div
                        className="font-display text-[3rem]"
                        style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                    >
                        —
                    </div>
                    <div className="kicker mt-2">No hay configuraciones para esta empresa</div>
                </div>
            ) : (
                <div className="space-y-4">
                    {configs.map((c) => (
                        <div key={c.id} className="surface overflow-hidden">
                            <div
                                className="p-5 flex items-center gap-4"
                                style={{ borderBottom: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                            >
                                <span className={`tag ${TIPO_TAG[c.tipo]}`}>{c.tipo}</span>
                                <div className="flex-1">
                                    <div className="font-display text-[15px]" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                        {c.descripcion || <span className="italic" style={{ color: 'var(--ink-mute)' }}>Sin descripción</span>}
                                    </div>
                                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                                        Cuenta PUC: <span className="font-mono" style={{ color: 'var(--accent)' }}>{c.cuenta_puc || '—'}</span>
                                    </div>
                                </div>
                                <span className={c.activo ? 'tag tag-positive' : 'tag'}>
                                    {c.activo ? 'Activo' : 'Inactivo'}
                                </span>
                            </div>

                            <div className="p-5">
                                <div className="kicker-accent mb-3">Tarifas</div>
                                {c.tarifas.length === 0 ? (
                                    <div className="text-[13px] italic mb-3" style={{ color: 'var(--ink-faint)' }}>
                                        Sin tarifas configuradas.
                                    </div>
                                ) : (
                                    <table className="w-full text-[13px] mb-4">
                                        <thead style={{ background: 'var(--paper-tinted)' }}>
                                            <tr>
                                                <th className="kicker px-3 py-2 text-left" style={{ background: 'var(--paper-tinted)' }}>Concepto</th>
                                                <th className="kicker px-3 py-2 text-right" style={{ background: 'var(--paper-tinted)' }}>Tarifa %</th>
                                                <th className="kicker px-3 py-2 text-right" style={{ background: 'var(--paper-tinted)' }}>Base mínima</th>
                                                <th className="kicker px-3 py-2 text-center" style={{ background: 'var(--paper-tinted)' }}>Default</th>
                                                <th style={{ background: 'var(--paper-tinted)' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {c.tarifas.map((t, idx) => (
                                                <tr
                                                    key={t.id}
                                                    style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                                >
                                                    <td className="px-3 py-2.5">
                                                        {t.concepto || <span className="italic" style={{ color: 'var(--ink-mute)' }}>—</span>}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right font-mono">{Number(t.tarifa_pct).toFixed(2)}%</td>
                                                    <td className="px-3 py-2.5 text-right font-mono text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                                                        {formatCOP(Number(t.base_minima))}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center">
                                                        {t.es_default ? (
                                                            <span className="tag tag-positive">★ Default</span>
                                                        ) : (
                                                            <span style={{ color: 'var(--ink-mute)' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right">
                                                        <button
                                                            onClick={() => eliminarTarifa(c.id, t.id)}
                                                            className="text-[11px] transition-colors"
                                                            style={{ color: 'var(--negative)' }}
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                <div
                                    className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end pt-4"
                                    style={{ borderTop: '1px solid var(--rule-soft)' }}
                                >
                                    <input
                                        placeholder="Concepto"
                                        value={tarifaConceptoBy[c.id] ?? ''}
                                        onChange={(e) => setTarifaConceptoBy((p) => ({ ...p, [c.id]: e.target.value }))}
                                        className="input-field text-[13px]"
                                    />
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="Tarifa %"
                                        value={tarifaPctBy[c.id] ?? ''}
                                        onChange={(e) => setTarifaPctBy((p) => ({ ...p, [c.id]: e.target.value }))}
                                        className="input-field text-[13px] font-mono"
                                    />
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="Base mínima"
                                        value={tarifaBaseBy[c.id] ?? ''}
                                        onChange={(e) => setTarifaBaseBy((p) => ({ ...p, [c.id]: e.target.value }))}
                                        className="input-field text-[13px] font-mono"
                                    />
                                    <label className="inline-flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                                        <input
                                            type="checkbox"
                                            checked={!!tarifaDefaultBy[c.id]}
                                            onChange={(e) => setTarifaDefaultBy((p) => ({ ...p, [c.id]: e.target.checked }))}
                                            className="h-4 w-4 rounded"
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                        Default
                                    </label>
                                    <button onClick={() => agregarTarifa(c.id)} className="btn-secondary text-[12px]">
                                        + Agregar tarifa
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface StatProps {
    label: string;
    valor: string;
    tone?: string;
}
function Stat({ label, valor, tone = 'var(--ink)' }: StatProps) {
    return (
        <div className="surface-flat p-4">
            <div className="kicker mb-1.5">{label}</div>
            <div className="numeral text-[1.2rem] leading-none" style={{ color: tone }}>
                {formatCOP(Number(valor))}
            </div>
        </div>
    );
}
