/**
 * Conciliación Bancaria — flujo completo:
 *   1. Subir extracto (CSV/XLSX de Bancolombia o Davivienda)
 *   2. Analizar (scoring) → produce SUGERIDO / CONCILIADO automáticos
 *   3. Aprobar/rechazar sugerencias manualmente
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost, apiFetch, ApiError } from '../utils/apiClient';
import { formatCOP } from '../utils/format';

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

const TAG: Record<Transaccion['estado_conciliacion'], string> = {
    NO_CONCILIADO: 'tag',
    SUGERIDO: 'tag-gold',
    CONCILIADO: 'tag-positive',
};

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
        <div className="max-w-[1480px] mx-auto space-y-8">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Bancario · Importación + scoring</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Conciliación <em>bancaria</em>.
                    </h1>
                    <p className="text-[13px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Sube el extracto (CSV/XLSX — Bancolombia o Davivienda) y el motor sugiere
                        correspondencias con el libro mayor. Score ≥ 100 concilia automáticamente;
                        70–99 queda como sugerencia para aprobación manual.
                    </p>
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
            {info && (
                <div
                    className="px-5 py-4 rounded-lg text-[13px]"
                    style={{
                        background: 'var(--positive-soft)',
                        border: '1px solid var(--positive)',
                        color: 'var(--positive)',
                    }}
                >
                    ✓ {info}
                </div>
            )}

            {/* Selector + Upload */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="surface p-5">
                    <div className="kicker-accent mb-1">Paso 1</div>
                    <h2 className="font-display text-[1.3rem] tracking-tight mb-4">Cuenta bancaria</h2>
                    <select
                        value={cuentaId ?? ''}
                        onChange={(e) => setCuentaId(Number(e.target.value) || null)}
                        className="input-field"
                    >
                        <option value="">Seleccionar…</option>
                        {cuentas.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.banco} — {c.numero_cuenta} (PUC {c.cuenta_puc_codigo})
                            </option>
                        ))}
                    </select>
                    {cuentas.length === 0 && (
                        <div
                            className="mt-3 p-3 rounded-md text-[13px]"
                            style={{ background: 'var(--gold-soft)', border: '1px solid var(--gold)', color: '#7a5e29' }}
                        >
                            No tienes cuentas bancarias configuradas. Ve a{' '}
                            <span className="font-mono" style={{ color: 'var(--accent)' }}>/app/cuentas-bancarias</span>{' '}primero.
                        </div>
                    )}
                </div>

                <form onSubmit={subirExtracto} className="surface p-5">
                    <div className="kicker-accent mb-1">Paso 2</div>
                    <h2 className="font-display text-[1.3rem] tracking-tight mb-4">Subir extracto</h2>
                    <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                        className="block w-full text-[13px] mb-4"
                        style={{ color: 'var(--ink-soft)' }}
                    />
                    <button type="submit" disabled={!cuentaId || !archivo || uploading} className="btn-accent disabled:opacity-50">
                        {uploading ? 'Subiendo…' : 'Subir e importar'}
                    </button>
                </form>
            </div>

            {/* Extractos */}
            <div className="surface-raised overflow-hidden">
                <div
                    className="px-6 py-4 flex items-baseline justify-between"
                    style={{ borderBottom: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                >
                    <div>
                        <div className="kicker-accent">Paso 3</div>
                        <h2 className="font-display text-[1.2rem] tracking-tight mt-1">Extractos importados</h2>
                    </div>
                    {extractoSel && (
                        <button onClick={analizar} disabled={analizando} className="btn-accent text-[12px] disabled:opacity-50">
                            {analizando ? 'Analizando…' : 'Analizar extracto'}
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-[14px]">
                        <thead style={{ background: 'var(--paper-tinted)' }}>
                            <tr>
                                <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>#</th>
                                <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Archivo</th>
                                <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Rango</th>
                                <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Transacciones</th>
                                <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Conciliadas</th>
                                <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {extractos.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-16 text-center">
                                        <div
                                            className="font-display text-[2.5rem]"
                                            style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                        >
                                            —
                                        </div>
                                        <div className="kicker mt-2">Sin extractos importados</div>
                                    </td>
                                </tr>
                            )}
                            {extractos.map((e, idx) => (
                                <tr
                                    key={e.id}
                                    onClick={() => setExtractoSel(e.id)}
                                    style={{
                                        borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none',
                                        background: extractoSel === e.id ? 'var(--accent-soft)' : 'transparent',
                                        cursor: 'pointer',
                                    }}
                                    onMouseEnter={(ev) => {
                                        if (extractoSel !== e.id) ev.currentTarget.style.background = 'var(--paper-tinted)';
                                    }}
                                    onMouseLeave={(ev) => {
                                        if (extractoSel !== e.id) ev.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <td className="px-5 py-3 font-mono text-[12px]" style={{ color: 'var(--accent)' }}>{e.id}</td>
                                    <td className="px-5 py-3 truncate max-w-[260px]">{e.archivo_origen ?? '—'}</td>
                                    <td className="px-5 py-3 font-mono text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                                        {e.fecha_inicio} → {e.fecha_fin}
                                    </td>
                                    <td className="px-5 py-3 text-right font-mono text-[13px]">{e.total_transacciones}</td>
                                    <td className="px-5 py-3 text-right font-mono text-[13px]" style={{ color: 'var(--positive)' }}>
                                        {e.conciliadas}
                                    </td>
                                    <td className="px-5 py-3"><span className="tag">{e.estado}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sugerencias */}
            {sugerencias.length > 0 && (
                <div
                    className="surface-raised overflow-hidden"
                    style={{ borderColor: 'var(--gold)', borderWidth: '2px' }}
                >
                    <div className="px-5 py-3" style={{ background: 'var(--gold-soft)', borderBottom: '1px solid var(--gold)' }}>
                        <div className="kicker-accent" style={{ color: 'var(--gold)' }}>Acción requerida</div>
                        <h2 className="font-display text-[1.2rem] tracking-tight mt-1">
                            Sugerencias pendientes ({sugerencias.length})
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-[14px]">
                            <thead style={{ background: 'var(--paper-tinted)' }}>
                                <tr>
                                    <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Transacción</th>
                                    <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Asiento</th>
                                    <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Score</th>
                                    <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Match</th>
                                    <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sugerencias.map((s, idx) => (
                                    <tr
                                        key={`${s.transaccion_id}-${s.linea_asiento_id}`}
                                        style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                    >
                                        <td className="px-5 py-3 font-mono text-[12px]" style={{ color: 'var(--accent)' }}>#{s.transaccion_id}</td>
                                        <td className="px-5 py-3">
                                            <div className="text-[12px] font-mono">#{s.asiento_numero} · {s.fecha_linea}</div>
                                            <div className="text-[11px] truncate max-w-[300px]" style={{ color: 'var(--ink-faint)' }}>
                                                {s.descripcion_linea ?? ''}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <span className="numeral text-[1.2rem]" style={{ color: 'var(--gold)' }}>{s.score}</span>
                                        </td>
                                        <td className="px-5 py-3 text-[12px]" style={{ color: 'var(--ink-soft)' }}>{s.detalle_match}</td>
                                        <td className="px-5 py-3 text-right space-x-2">
                                            <button onClick={() => aprobar(s)} className="btn-accent text-[11px] py-1.5">
                                                Aprobar
                                            </button>
                                            <button
                                                onClick={() => rechazar(s)}
                                                className="btn-secondary text-[11px] py-1.5"
                                                style={{ color: 'var(--negative)' }}
                                            >
                                                Rechazar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Detalle transacciones */}
            {transacciones.length > 0 && (
                <div className="surface-raised overflow-hidden">
                    <div
                        className="px-5 py-4"
                        style={{ borderBottom: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                    >
                        <div className="kicker-accent">Detalle</div>
                        <h2 className="font-display text-[1.2rem] tracking-tight mt-1">
                            Transacciones del extracto #{extractoSel}
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-[14px]">
                            <thead style={{ background: 'var(--paper-tinted)' }}>
                                <tr>
                                    <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Fecha</th>
                                    <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Descripción</th>
                                    <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Ref.</th>
                                    <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Monto</th>
                                    <th className="kicker px-5 py-3 text-center" style={{ background: 'var(--paper-tinted)' }}>Tipo</th>
                                    <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transacciones.map((t, idx) => (
                                    <tr
                                        key={t.id}
                                        style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                        className="transition-colors"
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <td className="px-5 py-3 font-mono text-[12px]" style={{ color: 'var(--ink-soft)' }}>{t.fecha}</td>
                                        <td className="px-5 py-3 truncate max-w-[360px]">{t.descripcion}</td>
                                        <td className="px-5 py-3 text-[12px] font-mono" style={{ color: 'var(--ink-faint)' }}>
                                            {t.referencia ?? '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono">{formatCOP(t.monto)}</td>
                                        <td className="px-5 py-3 text-center">
                                            <span className="kicker">{t.naturaleza}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`tag ${TAG[t.estado_conciliacion]}`}>{t.estado_conciliacion}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
