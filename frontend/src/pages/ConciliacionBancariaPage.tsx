/**
 * Conciliación Bancaria — flujo completo.
 *
 *   1. Subir extracto (CSV/XLSX de Bancolombia o Davivienda)
 *   2. Analizar (scoring) → produce SUGERIDO / CONCILIADO automáticos
 *   3. Aprobar/rechazar sugerencias manualmente
 *
 * Consume el router /api/bancario.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost, apiFetch, ApiError } from '../utils/apiClient';

interface CuentaBancaria {
    id: number;
    banco: string;
    numero_cuenta: string;
    cuenta_puc_codigo: string;
    activa: boolean;
}

interface Extracto {
    id: number;
    cuenta_bancaria_id: number;
    fecha_inicio: string;
    fecha_fin: string;
    archivo_origen?: string | null;
    estado: string;
    total_transacciones: number;
    conciliadas: number;
}

interface Transaccion {
    id: number;
    fecha: string;
    descripcion: string;
    referencia?: string | null;
    monto: string;
    naturaleza: 'DEBITO' | 'CREDITO';
    estado_conciliacion: 'NO_CONCILIADO' | 'SUGERIDO' | 'CONCILIADO';
    linea_asiento_id?: number | null;
}

interface Sugerencia {
    transaccion_id: number;
    linea_asiento_id: number;
    asiento_numero: number;
    score: number;
    monto_linea: string;
    fecha_linea: string;
    descripcion_linea?: string | null;
    detalle_match: string;
}

const BADGE: Record<Transaccion['estado_conciliacion'], string> = {
    NO_CONCILIADO: 'bg-slate-100 text-slate-600',
    SUGERIDO: 'bg-amber-100 text-amber-700',
    CONCILIADO: 'bg-emerald-100 text-emerald-700',
};

function fmtMoney(v: string | number): string {
    const n = typeof v === 'string' ? Number(v) : v;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

export default function ConciliacionBancariaPage() {
    const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
    const [cuentaId, setCuentaId] = useState<number | null>(null);
    const [extractos, setExtractos] = useState<Extracto[]>([]);
    const [extractoSel, setExtractoSel] = useState<number | null>(null);
    const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
    const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);

    const [archivo, setArchivo] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [analizando, setAnalizando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const loadCuentas = useCallback(async () => {
        try {
            const data = await apiGet<CuentaBancaria[]>('/api/contabilidad/cuentas-bancarias');
            setCuentas(data);
            if (data.length > 0 && cuentaId === null) setCuentaId(data[0].id);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al cargar cuentas');
        }
    }, [cuentaId]);

    const loadExtractos = useCallback(async () => {
        try {
            const params: Record<string, string | number> = {};
            if (cuentaId) params.cuenta_bancaria_id = cuentaId;
            const data = await apiGet<Extracto[]>('/api/bancario/extractos', params);
            setExtractos(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al cargar extractos');
        }
    }, [cuentaId]);

    const loadDetalle = useCallback(async (extractoId: number) => {
        try {
            const data = await apiGet<{ transacciones: Transaccion[] }>(`/api/bancario/extractos/${extractoId}`);
            setTransacciones(data.transacciones);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al cargar detalle');
        }
    }, []);

    useEffect(() => { void loadCuentas(); }, [loadCuentas]);
    useEffect(() => { void loadExtractos(); }, [loadExtractos]);
    useEffect(() => {
        if (extractoSel) void loadDetalle(extractoSel);
        else setTransacciones([]);
    }, [extractoSel, loadDetalle]);

    const subirExtracto = async (e: FormEvent) => {
        e.preventDefault();
        if (!cuentaId || !archivo) return;
        setUploading(true);
        setError(null);
        setInfo(null);
        try {
            const fd = new FormData();
            fd.append('cuenta_bancaria_id', String(cuentaId));
            fd.append('archivo', archivo);
            const resp = await apiFetch('/api/bancario/extractos/upload', { method: 'POST', body: fd });
            if (!resp.ok) {
                const body = await resp.json().catch(() => ({}));
                throw new ApiError(resp.status, body, body.detail || 'Error al subir');
            }
            const data = await resp.json();
            setInfo(`Extracto #${data.extracto_id}: ${data.total_transacciones} transacciones (${data.duplicadas_omitidas} duplicadas) — banco detectado: ${data.banco}`);
            setArchivo(null);
            await loadExtractos();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al subir extracto');
        } finally {
            setUploading(false);
        }
    };

    const analizar = async () => {
        if (!extractoSel) return;
        setAnalizando(true);
        setError(null);
        setInfo(null);
        try {
            const data = await apiPost<{
                analizadas: number;
                sugerencias: Sugerencia[];
                auto_conciliadas: number;
            }>(`/api/bancario/conciliacion/analizar/${extractoSel}`);
            setSugerencias(data.sugerencias);
            setInfo(`Analizadas ${data.analizadas} — ${data.auto_conciliadas} auto-conciliadas — ${data.sugerencias.length} sugerencias`);
            await loadDetalle(extractoSel);
            await loadExtractos();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al analizar');
        } finally {
            setAnalizando(false);
        }
    };

    const aprobar = async (s: Sugerencia) => {
        try {
            await apiPost('/api/bancario/conciliacion/aprobar', {
                transaccion_id: s.transaccion_id,
                linea_asiento_id: s.linea_asiento_id,
            });
            setInfo(`Transacción ${s.transaccion_id} conciliada con asiento #${s.asiento_numero}`);
            setSugerencias((prev) => prev.filter((x) => x.transaccion_id !== s.transaccion_id));
            if (extractoSel) {
                await loadDetalle(extractoSel);
                await loadExtractos();
            }
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al aprobar');
        }
    };

    const rechazar = async (s: Sugerencia) => {
        try {
            await apiPost(`/api/bancario/conciliacion/rechazar/${s.transaccion_id}`);
            setSugerencias((prev) => prev.filter((x) => x.transaccion_id !== s.transaccion_id));
            if (extractoSel) await loadDetalle(extractoSel);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al rechazar');
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Conciliación Bancaria</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Sube el extracto del banco (CSV/XLSX — Bancolombia o Davivienda) y el motor sugiere
                    correspondencias con el libro mayor. Score ≥ 100 se concilia automáticamente; entre
                    70 y 99 queda como sugerencia para aprobación manual.
                </p>
            </div>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800 text-sm">{error}</div>}
            {info && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 text-sm">{info}</div>}

            {/* Selector + Upload */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border shadow-sm p-5">
                    <h2 className="font-semibold text-slate-900 mb-3">Cuenta bancaria</h2>
                    <select value={cuentaId ?? ''} onChange={(e) => setCuentaId(Number(e.target.value) || null)}
                        className="w-full px-3 py-2 border rounded-lg text-sm">
                        <option value="">Seleccionar...</option>
                        {cuentas.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.banco} — {c.numero_cuenta} (PUC {c.cuenta_puc_codigo})
                            </option>
                        ))}
                    </select>
                    {cuentas.length === 0 && (
                        <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            No tienes cuentas bancarias configuradas. Ve a <span className="font-mono">/app/cuentas-bancarias</span> primero.
                        </p>
                    )}
                </div>

                <form onSubmit={subirExtracto} className="bg-white rounded-xl border shadow-sm p-5">
                    <h2 className="font-semibold text-slate-900 mb-3">Subir extracto</h2>
                    <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                        className="w-full text-sm mb-3" />
                    <button type="submit" disabled={!cuentaId || !archivo || uploading}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {uploading ? 'Subiendo...' : 'Subir e importar'}
                    </button>
                </form>
            </div>

            {/* Extractos */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-900">Extractos importados</h2>
                    {extractoSel && (
                        <button onClick={analizar} disabled={analizando}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                            {analizando ? 'Analizando...' : 'Analizar extracto seleccionado'}
                        </button>
                    )}
                </div>
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                        <tr>
                            <th className="px-4 py-2 text-left">#</th>
                            <th className="px-4 py-2 text-left">Archivo</th>
                            <th className="px-4 py-2 text-left">Rango</th>
                            <th className="px-4 py-2 text-right">Transacciones</th>
                            <th className="px-4 py-2 text-right">Conciliadas</th>
                            <th className="px-4 py-2 text-left">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {extractos.length === 0 && (
                            <tr><td colSpan={6} className="p-6 text-center text-slate-400">Sin extractos.</td></tr>
                        )}
                        {extractos.map((e) => (
                            <tr key={e.id} onClick={() => setExtractoSel(e.id)}
                                className={`border-b last:border-0 cursor-pointer hover:bg-slate-50 ${extractoSel === e.id ? 'bg-blue-50' : ''}`}>
                                <td className="px-4 py-2 font-mono text-xs">{e.id}</td>
                                <td className="px-4 py-2 truncate max-w-[260px]">{e.archivo_origen ?? '—'}</td>
                                <td className="px-4 py-2 text-xs text-slate-600">{e.fecha_inicio} → {e.fecha_fin}</td>
                                <td className="px-4 py-2 text-right">{e.total_transacciones}</td>
                                <td className="px-4 py-2 text-right font-medium text-emerald-700">{e.conciliadas}</td>
                                <td className="px-4 py-2 text-xs">{e.estado}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Sugerencias */}
            {sugerencias.length > 0 && (
                <div className="bg-white rounded-xl border-2 border-amber-300 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b bg-amber-50">
                        <h2 className="font-semibold text-amber-900">Sugerencias pendientes ({sugerencias.length})</h2>
                    </div>
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-4 py-2 text-left">Transacción</th>
                                <th className="px-4 py-2 text-left">Asiento</th>
                                <th className="px-4 py-2 text-right">Score</th>
                                <th className="px-4 py-2 text-left">Match</th>
                                <th className="px-4 py-2 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sugerencias.map((s) => (
                                <tr key={`${s.transaccion_id}-${s.linea_asiento_id}`} className="border-b last:border-0">
                                    <td className="px-4 py-2 font-mono text-xs">#{s.transaccion_id}</td>
                                    <td className="px-4 py-2">
                                        <div className="text-xs">#{s.asiento_numero} · {s.fecha_linea}</div>
                                        <div className="text-xs text-slate-500 truncate max-w-[300px]">{s.descripcion_linea ?? ''}</div>
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold">{s.score}</td>
                                    <td className="px-4 py-2 text-xs text-slate-600">{s.detalle_match}</td>
                                    <td className="px-4 py-2 text-right space-x-2">
                                        <button onClick={() => aprobar(s)}
                                            className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700">
                                            Aprobar
                                        </button>
                                        <button onClick={() => rechazar(s)}
                                            className="px-2 py-1 text-xs rounded bg-rose-50 text-rose-700 hover:bg-rose-100">
                                            Rechazar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Detalle transacciones */}
            {transacciones.length > 0 && (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b bg-slate-50">
                        <h2 className="font-semibold text-slate-900">Transacciones del extracto #{extractoSel}</h2>
                    </div>
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-4 py-2 text-left">Fecha</th>
                                <th className="px-4 py-2 text-left">Descripción</th>
                                <th className="px-4 py-2 text-left">Ref.</th>
                                <th className="px-4 py-2 text-right">Monto</th>
                                <th className="px-4 py-2 text-center">Tipo</th>
                                <th className="px-4 py-2 text-left">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transacciones.map((t) => (
                                <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                                    <td className="px-4 py-2 text-xs font-mono">{t.fecha}</td>
                                    <td className="px-4 py-2 truncate max-w-[360px]">{t.descripcion}</td>
                                    <td className="px-4 py-2 text-xs text-slate-500">{t.referencia ?? '—'}</td>
                                    <td className="px-4 py-2 text-right font-mono">{fmtMoney(t.monto)}</td>
                                    <td className="px-4 py-2 text-center text-xs">{t.naturaleza}</td>
                                    <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${BADGE[t.estado_conciliacion]}`}>
                                            {t.estado_conciliacion}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
