/**
 * Asientos contables — libro diario con validación de partida doble (DB == CR).
 */
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, ApiError } from '../utils/apiClient';
import { formatCOP } from '../utils/format';
import type {
    Asiento,
    AsientoCreatePayload,
    CuentaPUC,
    EstadoAsiento,
    TipoAsiento,
} from '../types/contabilidad';

const TIPOS: TipoAsiento[] = ['MANUAL', 'CAUSACION', 'PAGO', 'AJUSTE', 'APERTURA', 'CIERRE'];
const ESTADOS: EstadoAsiento[] = ['BORRADOR', 'APROBADO', 'ANULADO'];

const ESTADO_TAG: Record<EstadoAsiento, string> = {
    BORRADOR: 'tag-gold',
    APROBADO: 'tag-positive',
    ANULADO: 'tag-negative',
};

interface LineaForm {
    cuenta_codigo: string;
    nit_tercero: string;
    centro_costo: string;
    debito: string;
    credito: string;
    detalle: string;
}

function emptyLinea(): LineaForm {
    return {
        cuenta_codigo: '',
        nit_tercero: '',
        centro_costo: '',
        debito: '0',
        credito: '0',
        detalle: '',
    };
}

export default function AsientosPage() {
    const hoy = new Date();
    const [asientos, setAsientos] = useState<Asiento[]>([]);
    const [cuentas, setCuentas] = useState<CuentaPUC[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [filtroAnio, setFiltroAnio] = useState<number>(hoy.getFullYear());
    const [filtroMes, setFiltroMes] = useState<number>(hoy.getMonth() + 1);
    const [filtroEstado, setFiltroEstado] = useState<string>('');
    const [filtroTipo, setFiltroTipo] = useState<string>('');

    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [selectedAsiento, setSelectedAsiento] = useState<Asiento | null>(null);

    const [fecha, setFecha] = useState(hoy.toISOString().substring(0, 10));
    const [descripcion, setDescripcion] = useState('');
    const [tipo, setTipo] = useState<TipoAsiento>('MANUAL');
    const [lineas, setLineas] = useState<LineaForm[]>([emptyLinea(), emptyLinea()]);

    const cargarAsientos = async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = {
                anio: filtroAnio,
                mes: filtroMes,
            };
            if (filtroEstado) params.estado = filtroEstado;
            if (filtroTipo) params.tipo = filtroTipo;
            const data = await apiGet<Asiento[]>('/contabilidad/asientos', params);
            setAsientos(data);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error cargando asientos');
        } finally {
            setLoading(false);
        }
    };

    const cargarCuentas = async () => {
        try {
            const data = await apiGet<CuentaPUC[]>('/contabilidad/puc', { solo_movimiento: 'true' });
            setCuentas(data);
        } catch { /* silenciar */ }
    };

    useEffect(() => { cargarCuentas(); }, []);

    useEffect(() => {
        cargarAsientos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtroAnio, filtroMes, filtroEstado, filtroTipo]);

    const totalDebito = useMemo(() => lineas.reduce((s, l) => s + (parseFloat(l.debito) || 0), 0), [lineas]);
    const totalCredito = useMemo(() => lineas.reduce((s, l) => s + (parseFloat(l.credito) || 0), 0), [lineas]);
    const diferencia = totalDebito - totalCredito;
    const cuadrado = Math.abs(diferencia) < 0.005;

    const actualizarLinea = (idx: number, campo: keyof LineaForm, valor: string) => {
        setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));
    };

    const agregarLinea = () => setLineas((prev) => [...prev, emptyLinea()]);
    const quitarLinea = (idx: number) =>
        setLineas((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)));

    const resetForm = () => {
        setFecha(hoy.toISOString().substring(0, 10));
        setDescripcion('');
        setTipo('MANUAL');
        setLineas([emptyLinea(), emptyLinea()]);
        setFormError(null);
    };

    const guardar = async () => {
        setFormError(null);
        if (!cuadrado) {
            setFormError(`Asiento descuadrado: DB ${formatCOP(totalDebito)} vs CR ${formatCOP(totalCredito)}`);
            return;
        }
        const lineasLimpias = lineas.filter(
            (l) => l.cuenta_codigo.trim() !== '' && (parseFloat(l.debito) > 0 || parseFloat(l.credito) > 0),
        );
        if (lineasLimpias.length < 2) {
            setFormError('El asiento debe tener al menos 2 líneas con cuenta y valor.');
            return;
        }

        const payload: AsientoCreatePayload = {
            fecha,
            descripcion: descripcion || undefined,
            tipo,
            lineas: lineasLimpias.map((l) => ({
                cuenta_codigo: l.cuenta_codigo.trim(),
                nit_tercero: l.nit_tercero.trim() || undefined,
                centro_costo: l.centro_costo.trim() || undefined,
                debito: l.debito || '0',
                credito: l.credito || '0',
                detalle: l.detalle.trim() || undefined,
            })),
        };

        setSaving(true);
        try {
            await apiPost<Asiento>('/contabilidad/asientos', payload);
            setShowForm(false);
            resetForm();
            await cargarAsientos();
        } catch (e) {
            setFormError(e instanceof ApiError ? e.message : 'Error creando asiento');
        } finally {
            setSaving(false);
        }
    };

    const aprobar = async (id: number) => {
        try {
            await apiPost(`/contabilidad/asientos/${id}/aprobar`);
            await cargarAsientos();
            if (selectedAsiento?.id === id) setSelectedAsiento(null);
        } catch (e) {
            alert(e instanceof ApiError ? e.message : 'Error al aprobar');
        }
    };

    const anular = async (id: number) => {
        if (!confirm('¿Anular este asiento? Esta acción es definitiva.')) return;
        try {
            await apiPost(`/contabilidad/asientos/${id}/anular`);
            await cargarAsientos();
            if (selectedAsiento?.id === id) setSelectedAsiento(null);
        } catch (e) {
            alert(e instanceof ApiError ? e.message : 'Error al anular');
        }
    };

    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Contabilidad · Libro diario</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Asientos <em>contables</em>.
                    </h1>
                    <button
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="btn-accent"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Nuevo asiento
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="surface p-4 flex flex-wrap items-end gap-3">
                <div>
                    <label className="kicker block mb-1.5">Año</label>
                    <input
                        type="number"
                        value={filtroAnio}
                        onChange={(e) => setFiltroAnio(parseInt(e.target.value) || hoy.getFullYear())}
                        className="input-field font-mono w-24"
                    />
                </div>
                <div>
                    <label className="kicker block mb-1.5">Mes</label>
                    <input
                        type="number"
                        min={1}
                        max={12}
                        value={filtroMes}
                        onChange={(e) => setFiltroMes(parseInt(e.target.value) || 1)}
                        className="input-field font-mono w-20"
                    />
                </div>
                <div>
                    <label className="kicker block mb-1.5">Tipo</label>
                    <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="input-field">
                        <option value="">Todos</option>
                        {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label className="kicker block mb-1.5">Estado</label>
                    <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="input-field">
                        <option value="">Todos</option>
                        {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                </div>
                <div className="ml-auto kicker pb-2">
                    <span className="numeral text-[1.4rem]" style={{ color: 'var(--accent)' }}>{asientos.length}</span> asientos
                </div>
            </div>

            {/* Tabla */}
            <div className="surface-raised overflow-hidden">
                <table className="w-full text-left">
                    <thead style={{ background: 'var(--paper-tinted)' }}>
                        <tr>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>#</th>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>Fecha</th>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>Tipo</th>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>Descripción</th>
                            <th className="kicker px-6 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>DB</th>
                            <th className="kicker px-6 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>CR</th>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>Estado</th>
                            <th style={{ background: 'var(--paper-tinted)' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-10 text-center">
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
                        ) : error ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-10 text-center" style={{ color: 'var(--negative)' }}>{error}</td>
                            </tr>
                        ) : asientos.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-16 text-center">
                                    <div
                                        className="font-display text-[2.5rem]"
                                        style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                    >
                                        —
                                    </div>
                                    <div className="kicker mt-2">Sin asientos con los filtros</div>
                                </td>
                            </tr>
                        ) : (
                            asientos.map((a, idx) => (
                                <tr
                                    key={a.id}
                                    style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                    className="transition-colors"
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <td className="px-6 py-3 font-mono text-[12px]" style={{ color: 'var(--accent)' }}>{a.numero}</td>
                                    <td className="px-6 py-3 font-mono text-[12px]" style={{ color: 'var(--ink-soft)' }}>{a.fecha}</td>
                                    <td className="px-6 py-3"><span className="kicker-accent">{a.tipo}</span></td>
                                    <td className="px-6 py-3 text-[13.5px]">
                                        {a.descripcion || <span className="italic" style={{ color: 'var(--ink-mute)' }}>Sin descripción</span>}
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono text-[13px]" style={{ color: 'var(--accent)' }}>
                                        {formatCOP(Number(a.total_debito))}
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono text-[13px]" style={{ color: 'var(--negative)' }}>
                                        {formatCOP(Number(a.total_credito))}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`tag ${ESTADO_TAG[a.estado]}`}>{a.estado}</span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <button onClick={() => setSelectedAsiento(a)} className="btn-ghost text-[12px]">
                                            Ver
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Detalle */}
            {selectedAsiento && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 anim-fade-in"
                    style={{ background: 'rgba(11, 15, 25, 0.55)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setSelectedAsiento(null)}
                >
                    <div
                        className="surface-raised max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col anim-fade-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="p-5 flex items-center justify-between"
                            style={{ borderBottom: '1px solid var(--rule)' }}
                        >
                            <div>
                                <div className="kicker-accent mb-1">Detalle de asiento</div>
                                <h2 className="font-display text-[1.4rem] tracking-tight" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                    Asiento № <span className="font-mono">{selectedAsiento.numero}</span>
                                </h2>
                                <p className="text-[12px] mt-1 flex items-center gap-2" style={{ color: 'var(--ink-faint)' }}>
                                    <span className="font-mono">{selectedAsiento.fecha}</span>
                                    <span>·</span>
                                    <span>{selectedAsiento.tipo}</span>
                                    <span>·</span>
                                    <span className={`tag ${ESTADO_TAG[selectedAsiento.estado]}`}>
                                        {selectedAsiento.estado}
                                    </span>
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedAsiento(null)}
                                className="text-2xl transition-colors"
                                style={{ color: 'var(--ink-mute)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-mute)')}
                            >
                                ×
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto">
                            {selectedAsiento.descripcion && (
                                <div className="mb-4 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
                                    {selectedAsiento.descripcion}
                                </div>
                            )}
                            <table className="w-full text-[13px]">
                                <thead style={{ background: 'var(--paper-tinted)' }}>
                                    <tr>
                                        <th className="kicker px-3 py-2 text-left" style={{ background: 'var(--paper-tinted)' }}>Cuenta</th>
                                        <th className="kicker px-3 py-2 text-left" style={{ background: 'var(--paper-tinted)' }}>Tercero</th>
                                        <th className="kicker px-3 py-2 text-left" style={{ background: 'var(--paper-tinted)' }}>Detalle</th>
                                        <th className="kicker px-3 py-2 text-right" style={{ background: 'var(--paper-tinted)' }}>Débito</th>
                                        <th className="kicker px-3 py-2 text-right" style={{ background: 'var(--paper-tinted)' }}>Crédito</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedAsiento.lineas.map((l, i) => (
                                        <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--rule-soft)' : 'none' }}>
                                            <td className="px-3 py-2.5 font-mono text-[12px]" style={{ color: 'var(--accent)' }}>{l.cuenta_codigo}</td>
                                            <td className="px-3 py-2.5 font-mono text-[12px]" style={{ color: 'var(--ink-soft)' }}>{l.nit_tercero || '—'}</td>
                                            <td className="px-3 py-2.5">{l.detalle || <span style={{ color: 'var(--ink-mute)' }}>—</span>}</td>
                                            <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--accent)' }}>
                                                {formatCOP(Number(l.debito))}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--negative)' }}>
                                                {formatCOP(Number(l.credito))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: 'var(--paper-tinted)', borderTop: '2px solid var(--ink)' }}>
                                        <td colSpan={3} className="px-3 py-2.5 text-right kicker">Totales</td>
                                        <td className="px-3 py-2.5 text-right">
                                            <span className="numeral text-[1.05rem]" style={{ color: 'var(--accent)' }}>
                                                {formatCOP(Number(selectedAsiento.total_debito))}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <span className="numeral text-[1.05rem]" style={{ color: 'var(--negative)' }}>
                                                {formatCOP(Number(selectedAsiento.total_credito))}
                                            </span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <div
                            className="p-5 flex items-center justify-end gap-2"
                            style={{ borderTop: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                        >
                            {selectedAsiento.estado === 'BORRADOR' && (
                                <button onClick={() => aprobar(selectedAsiento.id)} className="btn-accent">
                                    Aprobar
                                </button>
                            )}
                            {selectedAsiento.estado !== 'ANULADO' && (
                                <button
                                    onClick={() => anular(selectedAsiento.id)}
                                    className="btn-secondary"
                                    style={{ color: 'var(--negative)' }}
                                >
                                    Anular
                                </button>
                            )}
                            <button onClick={() => setSelectedAsiento(null)} className="btn-ghost">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Nuevo Asiento */}
            {showForm && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 anim-fade-in"
                    style={{ background: 'rgba(11, 15, 25, 0.55)', backdropFilter: 'blur(4px)' }}
                    onClick={() => !saving && setShowForm(false)}
                >
                    <div
                        className="surface-raised max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col anim-fade-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5" style={{ borderBottom: '1px solid var(--rule)' }}>
                            <div className="kicker-accent mb-1">Acción</div>
                            <h2 className="font-display text-[1.4rem] tracking-tight" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                Nuevo asiento manual
                            </h2>
                        </div>
                        <div className="p-5 overflow-y-auto space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="kicker block mb-1.5">Fecha</label>
                                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input-field" />
                                </div>
                                <div>
                                    <label className="kicker block mb-1.5">Tipo</label>
                                    <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAsiento)} className="input-field">
                                        {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-3">
                                    <label className="kicker block mb-1.5">Descripción</label>
                                    <input
                                        type="text"
                                        value={descripcion}
                                        onChange={(e) => setDescripcion(e.target.value)}
                                        placeholder="Concepto general del asiento"
                                        className="input-field"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="kicker-accent">Líneas</div>
                                    <button onClick={agregarLinea} className="btn-secondary text-[12px]">
                                        + Agregar línea
                                    </button>
                                </div>
                                <div className="surface overflow-hidden">
                                    <table className="w-full text-[13px]">
                                        <thead style={{ background: 'var(--paper-tinted)' }}>
                                            <tr>
                                                <th className="kicker px-2 py-2 text-left" style={{ background: 'var(--paper-tinted)' }}>Cuenta</th>
                                                <th className="kicker px-2 py-2 text-left" style={{ background: 'var(--paper-tinted)' }}>NIT</th>
                                                <th className="kicker px-2 py-2 text-left" style={{ background: 'var(--paper-tinted)' }}>Detalle</th>
                                                <th className="kicker px-2 py-2 text-right" style={{ background: 'var(--paper-tinted)' }}>Débito</th>
                                                <th className="kicker px-2 py-2 text-right" style={{ background: 'var(--paper-tinted)' }}>Crédito</th>
                                                <th style={{ background: 'var(--paper-tinted)' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lineas.map((l, i) => (
                                                <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--rule-soft)' : 'none' }}>
                                                    <td className="px-1 py-1">
                                                        <input
                                                            list="cuentas-list"
                                                            value={l.cuenta_codigo}
                                                            onChange={(e) => actualizarLinea(i, 'cuenta_codigo', e.target.value)}
                                                            placeholder="511005"
                                                            className="input-field font-mono text-[12px] py-1.5"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1">
                                                        <input
                                                            value={l.nit_tercero}
                                                            onChange={(e) => actualizarLinea(i, 'nit_tercero', e.target.value)}
                                                            placeholder="Opcional"
                                                            className="input-field font-mono text-[12px] py-1.5"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1">
                                                        <input
                                                            value={l.detalle}
                                                            onChange={(e) => actualizarLinea(i, 'detalle', e.target.value)}
                                                            className="input-field text-[12px] py-1.5"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={l.debito}
                                                            onChange={(e) => actualizarLinea(i, 'debito', e.target.value)}
                                                            className="input-field text-right font-mono text-[12px] py-1.5"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={l.credito}
                                                            onChange={(e) => actualizarLinea(i, 'credito', e.target.value)}
                                                            className="input-field text-right font-mono text-[12px] py-1.5"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1 text-right">
                                                        <button
                                                            onClick={() => quitarLinea(i)}
                                                            disabled={lineas.length <= 2}
                                                            className="text-[11px] transition-colors disabled:opacity-30"
                                                            style={{ color: 'var(--negative)' }}
                                                        >
                                                            Quitar
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <datalist id="cuentas-list">
                                        {cuentas.map((c) => (
                                            <option key={c.codigo} value={c.codigo}>
                                                {c.codigo} — {c.nombre}
                                            </option>
                                        ))}
                                    </datalist>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="surface p-4">
                                    <div className="kicker mb-1.5">Total débitos</div>
                                    <div className="numeral text-[1.5rem] leading-none" style={{ color: 'var(--accent)' }}>
                                        {formatCOP(totalDebito)}
                                    </div>
                                </div>
                                <div className="surface p-4">
                                    <div className="kicker mb-1.5">Total créditos</div>
                                    <div className="numeral text-[1.5rem] leading-none" style={{ color: 'var(--negative)' }}>
                                        {formatCOP(totalCredito)}
                                    </div>
                                </div>
                                <div
                                    className="p-4 rounded-md"
                                    style={{
                                        background: cuadrado ? 'var(--positive-soft)' : 'var(--gold-soft)',
                                        border: `1px solid ${cuadrado ? 'var(--positive)' : 'var(--gold)'}`,
                                    }}
                                >
                                    <div className="kicker-accent" style={{ color: cuadrado ? 'var(--positive)' : 'var(--gold)' }}>
                                        {cuadrado ? '✓ Cuadrado' : 'Diferencia'}
                                    </div>
                                    <div
                                        className="numeral text-[1.5rem] leading-none mt-1"
                                        style={{ color: cuadrado ? 'var(--positive)' : 'var(--gold)' }}
                                    >
                                        {formatCOP(diferencia)}
                                    </div>
                                </div>
                            </div>

                            {formError && (
                                <div
                                    className="px-4 py-3 rounded-md text-[13px]"
                                    style={{
                                        background: 'var(--negative-soft)',
                                        border: '1px solid var(--negative)',
                                        color: 'var(--negative)',
                                    }}
                                >
                                    {formError}
                                </div>
                            )}
                        </div>

                        <div
                            className="p-5 flex items-center justify-end gap-2"
                            style={{ borderTop: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                        >
                            <button onClick={() => setShowForm(false)} disabled={saving} className="btn-ghost disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={guardar} disabled={saving || !cuadrado} className="btn-accent disabled:opacity-50">
                                {saving ? 'Guardando…' : 'Guardar asiento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
