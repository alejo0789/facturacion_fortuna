/**
 * Configuración de impuestos — IVA, ReteFuente, ReteIVA, ReteICA.
 * Permite crear configuraciones, agregar/quitar tarifas y simular cálculo.
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

const TIPO_COLOR: Record<TipoImpuesto, string> = {
    IVA: 'bg-blue-100 text-blue-700',
    RETEFUENTE: 'bg-amber-100 text-amber-700',
    RETEIVA: 'bg-purple-100 text-purple-700',
    RETEICA: 'bg-teal-100 text-teal-700',
};

export default function ImpuestosPage() {
    const [configs, setConfigs] = useState<ConfiguracionImpuesto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Nueva configuración
    const [showCfgForm, setShowCfgForm] = useState(false);
    const [cfgTipo, setCfgTipo] = useState<TipoImpuesto>('IVA');
    const [cfgCuenta, setCfgCuenta] = useState('');
    const [cfgDescripcion, setCfgDescripcion] = useState('');

    // Nueva tarifa por config
    const [tarifaConceptoBy, setTarifaConceptoBy] = useState<Record<number, string>>({});
    const [tarifaPctBy, setTarifaPctBy] = useState<Record<number, string>>({});
    const [tarifaBaseBy, setTarifaBaseBy] = useState<Record<number, string>>({});
    const [tarifaDefaultBy, setTarifaDefaultBy] = useState<Record<number, boolean>>({});

    // Simulador
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

    useEffect(() => {
        cargar();
    }, []);

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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Configuración de impuestos</h1>
                    <p className="text-gray-500 mt-1">IVA, ReteFuente, ReteIVA y ReteICA por empresa.</p>
                </div>
                <button
                    onClick={() => setShowCfgForm((v) => !v)}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nueva configuración
                </button>
            </div>

            {showCfgForm && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                        <select
                            value={cfgTipo}
                            onChange={(e) => setCfgTipo(e.target.value as TipoImpuesto)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                        >
                            {TIPOS.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Cuenta PUC</label>
                        <input
                            value={cfgCuenta}
                            onChange={(e) => setCfgCuenta(e.target.value)}
                            placeholder="240810"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
                        <input
                            value={cfgDescripcion}
                            onChange={(e) => setCfgDescripcion(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                        />
                    </div>
                    <div className="md:col-span-4 flex justify-end gap-2">
                        <button
                            onClick={() => setShowCfgForm(false)}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={crearConfig}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm"
                        >
                            Crear
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* Simulador */}
            <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-5 rounded-xl border border-indigo-100">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Simulador de cálculo</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Valor total</label>
                        <input
                            type="number"
                            value={simValor}
                            onChange={(e) => setSimValor(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono"
                        />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={simTieneIva}
                            onChange={(e) => setSimTieneIva(e.target.checked)}
                            className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                        />
                        Tiene IVA
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={simAplicaRete}
                            onChange={(e) => setSimAplicaRete(e.target.checked)}
                            className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                        />
                        Aplica ReteFuente
                    </label>
                    <button
                        onClick={simular}
                        disabled={simLoading}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                    >
                        {simLoading ? 'Calculando...' : 'Calcular'}
                    </button>
                </div>
                {simError && (
                    <div className="mt-3 p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded text-sm">
                        {simError}
                    </div>
                )}
                {simResultado && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                        <Stat label="Base" valor={simResultado.valor_base} />
                        <Stat
                            label={`IVA (${Number(simResultado.iva_rate).toFixed(0)}%)`}
                            valor={simResultado.valor_iva}
                            color="text-sky-700"
                        />
                        <Stat
                            label={`ReteFuente (${Number(simResultado.retefuente_pct).toFixed(2)}%)`}
                            valor={simResultado.valor_retefuente}
                            color="text-amber-700"
                        />
                        <Stat label="Valor neto a pagar" valor={simResultado.valor_neto} color="text-emerald-700 font-bold" />
                    </div>
                )}
            </div>

            {/* Listado de configs */}
            {loading ? (
                <div className="p-10 text-center">
                    <div className="inline-block animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
                </div>
            ) : configs.length === 0 ? (
                <div className="bg-white p-10 rounded-xl border border-gray-100 text-center text-gray-500 italic">
                    No hay configuraciones de impuestos para esta empresa.
                </div>
            ) : (
                <div className="space-y-4">
                    {configs.map((c) => (
                        <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                                <span
                                    className={`text-xs font-bold px-3 py-1 rounded-full ${TIPO_COLOR[c.tipo]}`}
                                >
                                    {c.tipo}
                                </span>
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-gray-800">
                                        {c.descripcion || <span className="italic text-gray-400">Sin descripción</span>}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Cuenta PUC: <span className="font-mono">{c.cuenta_puc || '—'}</span>
                                    </div>
                                </div>
                                <span
                                    className={`text-xs px-2 py-0.5 rounded ${
                                        c.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                    }`}
                                >
                                    {c.activo ? 'Activo' : 'Inactivo'}
                                </span>
                            </div>

                            <div className="p-4">
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">Tarifas</h3>
                                {c.tarifas.length === 0 ? (
                                    <div className="text-sm text-gray-500 italic mb-3">Sin tarifas configuradas.</div>
                                ) : (
                                    <table className="w-full text-sm mb-3">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100">
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                                                    Concepto
                                                </th>
                                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
                                                    Tarifa %
                                                </th>
                                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
                                                    Base mínima
                                                </th>
                                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">
                                                    Default
                                                </th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {c.tarifas.map((t) => (
                                                <tr key={t.id} className="border-b border-gray-50">
                                                    <td className="px-3 py-2">
                                                        {t.concepto || <span className="italic text-gray-400">—</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono">
                                                        {Number(t.tarifa_pct).toFixed(2)}%
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono text-gray-600">
                                                        {formatCOP(Number(t.base_minima))}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {t.es_default ? (
                                                            <span className="text-xs font-semibold text-emerald-700">
                                                                ★ Default
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        <button
                                                            onClick={() => eliminarTarifa(c.id, t.id)}
                                                            className="text-xs px-2 py-1 text-rose-600 hover:bg-rose-50 rounded"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end border-t border-gray-100 pt-3">
                                    <input
                                        placeholder="Concepto"
                                        value={tarifaConceptoBy[c.id] ?? ''}
                                        onChange={(e) =>
                                            setTarifaConceptoBy((p) => ({ ...p, [c.id]: e.target.value }))
                                        }
                                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                    />
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="Tarifa %"
                                        value={tarifaPctBy[c.id] ?? ''}
                                        onChange={(e) =>
                                            setTarifaPctBy((p) => ({ ...p, [c.id]: e.target.value }))
                                        }
                                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                                    />
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="Base mínima"
                                        value={tarifaBaseBy[c.id] ?? ''}
                                        onChange={(e) =>
                                            setTarifaBaseBy((p) => ({ ...p, [c.id]: e.target.value }))
                                        }
                                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                                    />
                                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={!!tarifaDefaultBy[c.id]}
                                            onChange={(e) =>
                                                setTarifaDefaultBy((p) => ({ ...p, [c.id]: e.target.checked }))
                                            }
                                            className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                                        />
                                        Default
                                    </label>
                                    <button
                                        onClick={() => agregarTarifa(c.id)}
                                        className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm"
                                    >
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
    color?: string;
}
function Stat({ label, valor, color = 'text-slate-800' }: StatProps) {
    return (
        <div className="bg-white p-3 rounded-lg border border-indigo-100">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
            <div className={`text-lg font-mono ${color}`}>{formatCOP(Number(valor))}</div>
        </div>
    );
}
