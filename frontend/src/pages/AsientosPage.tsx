/**
 * Asientos contables — listado con filtros + creación manual con validación
 * de partida doble (DB == CR) en cliente.
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

const ESTADO_BADGE: Record<EstadoAsiento, string> = {
    BORRADOR: 'bg-amber-100 text-amber-700',
    APROBADO: 'bg-emerald-100 text-emerald-700',
    ANULADO: 'bg-rose-100 text-rose-700',
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
        } catch {
            /* silenciar */
        }
    };

    useEffect(() => {
        cargarCuentas();
    }, []);

    useEffect(() => {
        cargarAsientos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtroAnio, filtroMes, filtroEstado, filtroTipo]);

    const totalDebito = useMemo(
        () => lineas.reduce((s, l) => s + (parseFloat(l.debito) || 0), 0),
        [lineas],
    );
    const totalCredito = useMemo(
        () => lineas.reduce((s, l) => s + (parseFloat(l.credito) || 0), 0),
        [lineas],
    );
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Asientos contables</h1>
                    <p className="text-gray-500 mt-1">Libro diario con validación de partida doble.</p>
                </div>
                <button
                    onClick={() => {
                        resetForm();
                        setShowForm(true);
                    }}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nuevo asiento
                </button>
            </div>

            {/* Filtros */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-3">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
                    <input
                        type="number"
                        value={filtroAnio}
                        onChange={(e) => setFiltroAnio(parseInt(e.target.value) || hoy.getFullYear())}
                        className="px-3 py-2 border border-gray-200 rounded-lg w-24"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
                    <input
                        type="number"
                        min={1}
                        max={12}
                        value={filtroMes}
                        onChange={(e) => setFiltroMes(parseInt(e.target.value) || 1)}
                        className="px-3 py-2 border border-gray-200 rounded-lg w-20"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                    <select
                        value={filtroTipo}
                        onChange={(e) => setFiltroTipo(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-lg"
                    >
                        <option value="">Todos</option>
                        {TIPOS.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                    <select
                        value={filtroEstado}
                        onChange={(e) => setFiltroEstado(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-lg"
                    >
                        <option value="">Todos</option>
                        {ESTADOS.map((e) => (
                            <option key={e} value={e}>
                                {e}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="ml-auto text-sm text-gray-500">
                    <span className="font-semibold text-indigo-600">{asientos.length}</span> asientos
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase">#</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase">Descripción</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase text-right">DB</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase text-right">CR</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase">Estado</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-10 text-center">
                                    <div className="inline-block animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-10 text-center text-rose-600">
                                    {error}
                                </td>
                            </tr>
                        ) : asientos.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-10 text-center text-gray-500 italic">
                                    Sin asientos para los filtros aplicados.
                                </td>
                            </tr>
                        ) : (
                            asientos.map((a) => (
                                <tr key={a.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-mono text-sm text-gray-700">{a.numero}</td>
                                    <td className="px-6 py-3 text-sm text-gray-700">{a.fecha}</td>
                                    <td className="px-6 py-3 text-xs font-medium text-indigo-700">{a.tipo}</td>
                                    <td className="px-6 py-3 text-sm text-gray-800">
                                        {a.descripcion || <span className="italic text-gray-400">Sin descripción</span>}
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono text-sm text-sky-700">
                                        {formatCOP(Number(a.total_debito))}
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono text-sm text-rose-700">
                                        {formatCOP(Number(a.total_credito))}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span
                                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_BADGE[a.estado]}`}
                                        >
                                            {a.estado}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <button
                                            onClick={() => setSelectedAsiento(a)}
                                            className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
                                        >
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
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedAsiento(null)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    Asiento #{selectedAsiento.numero}
                                </h2>
                                <p className="text-sm text-gray-500">
                                    {selectedAsiento.fecha} · {selectedAsiento.tipo} ·{' '}
                                    <span
                                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                            ESTADO_BADGE[selectedAsiento.estado]
                                        }`}
                                    >
                                        {selectedAsiento.estado}
                                    </span>
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedAsiento(null)}
                                className="text-gray-400 hover:text-gray-700"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto">
                            {selectedAsiento.descripcion && (
                                <div className="mb-4 text-sm text-gray-700">{selectedAsiento.descripcion}</div>
                            )}
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Cuenta</th>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Tercero</th>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Detalle</th>
                                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Débito</th>
                                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Crédito</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedAsiento.lineas.map((l, i) => (
                                        <tr key={i} className="border-b border-gray-50">
                                            <td className="px-3 py-2 font-mono">{l.cuenta_codigo}</td>
                                            <td className="px-3 py-2">{l.nit_tercero || '—'}</td>
                                            <td className="px-3 py-2">{l.detalle || '—'}</td>
                                            <td className="px-3 py-2 text-right font-mono text-sky-700">
                                                {formatCOP(Number(l.debito))}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-rose-700">
                                                {formatCOP(Number(l.credito))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 font-bold">
                                        <td colSpan={3} className="px-3 py-2 text-right">
                                            Totales
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-sky-700">
                                            {formatCOP(Number(selectedAsiento.total_debito))}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-rose-700">
                                            {formatCOP(Number(selectedAsiento.total_credito))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
                            {selectedAsiento.estado === 'BORRADOR' && (
                                <button
                                    onClick={() => aprobar(selectedAsiento.id)}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm"
                                >
                                    Aprobar
                                </button>
                            )}
                            {selectedAsiento.estado !== 'ANULADO' && (
                                <button
                                    onClick={() => anular(selectedAsiento.id)}
                                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm"
                                >
                                    Anular
                                </button>
                            )}
                            <button
                                onClick={() => setSelectedAsiento(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Nuevo Asiento */}
            {showForm && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => !saving && setShowForm(false)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900">Nuevo asiento manual</h2>
                        </div>
                        <div className="p-5 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
                                    <input
                                        type="date"
                                        value={fecha}
                                        onChange={(e) => setFecha(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                                    <select
                                        value={tipo}
                                        onChange={(e) => setTipo(e.target.value as TipoAsiento)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                    >
                                        {TIPOS.map((t) => (
                                            <option key={t} value={t}>
                                                {t}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="md:col-span-3">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                        Descripción
                                    </label>
                                    <input
                                        type="text"
                                        value={descripcion}
                                        onChange={(e) => setDescripcion(e.target.value)}
                                        placeholder="Concepto general del asiento"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold text-gray-700">Líneas</h3>
                                    <button
                                        onClick={agregarLinea}
                                        className="text-xs px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded"
                                    >
                                        + Agregar línea
                                    </button>
                                </div>
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-200">
                                                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600">
                                                    Cuenta
                                                </th>
                                                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600">
                                                    NIT
                                                </th>
                                                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600">
                                                    Detalle
                                                </th>
                                                <th className="px-2 py-2 text-right text-xs font-semibold text-gray-600">
                                                    Débito
                                                </th>
                                                <th className="px-2 py-2 text-right text-xs font-semibold text-gray-600">
                                                    Crédito
                                                </th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lineas.map((l, i) => (
                                                <tr key={i} className="border-b border-gray-100">
                                                    <td className="px-1 py-1">
                                                        <input
                                                            list="cuentas-list"
                                                            value={l.cuenta_codigo}
                                                            onChange={(e) =>
                                                                actualizarLinea(i, 'cuenta_codigo', e.target.value)
                                                            }
                                                            placeholder="511005"
                                                            className="w-full px-2 py-1.5 border border-gray-200 rounded font-mono text-sm"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1">
                                                        <input
                                                            value={l.nit_tercero}
                                                            onChange={(e) =>
                                                                actualizarLinea(i, 'nit_tercero', e.target.value)
                                                            }
                                                            placeholder="Opcional"
                                                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1">
                                                        <input
                                                            value={l.detalle}
                                                            onChange={(e) => actualizarLinea(i, 'detalle', e.target.value)}
                                                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={l.debito}
                                                            onChange={(e) =>
                                                                actualizarLinea(i, 'debito', e.target.value)
                                                            }
                                                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-right font-mono text-sm"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={l.credito}
                                                            onChange={(e) =>
                                                                actualizarLinea(i, 'credito', e.target.value)
                                                            }
                                                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-right font-mono text-sm"
                                                        />
                                                    </td>
                                                    <td className="px-1 py-1 text-right">
                                                        <button
                                                            onClick={() => quitarLinea(i)}
                                                            disabled={lineas.length <= 2}
                                                            className="text-xs px-2 py-1 text-rose-600 hover:bg-rose-50 rounded disabled:opacity-30"
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
                                <div className="bg-sky-50 border border-sky-100 rounded-lg p-3">
                                    <div className="text-xs text-sky-700">Total Débitos</div>
                                    <div className="text-xl font-bold text-sky-700 font-mono">
                                        {formatCOP(totalDebito)}
                                    </div>
                                </div>
                                <div className="bg-rose-50 border border-rose-100 rounded-lg p-3">
                                    <div className="text-xs text-rose-700">Total Créditos</div>
                                    <div className="text-xl font-bold text-rose-700 font-mono">
                                        {formatCOP(totalCredito)}
                                    </div>
                                </div>
                                <div
                                    className={`border rounded-lg p-3 ${
                                        cuadrado
                                            ? 'bg-emerald-50 border-emerald-100'
                                            : 'bg-amber-50 border-amber-100'
                                    }`}
                                >
                                    <div className={`text-xs ${cuadrado ? 'text-emerald-700' : 'text-amber-700'}`}>
                                        {cuadrado ? '✓ Cuadrado' : 'Diferencia'}
                                    </div>
                                    <div
                                        className={`text-xl font-bold font-mono ${
                                            cuadrado ? 'text-emerald-700' : 'text-amber-700'
                                        }`}
                                    >
                                        {formatCOP(diferencia)}
                                    </div>
                                </div>
                            </div>

                            {formError && (
                                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
                                    {formError}
                                </div>
                            )}
                        </div>

                        <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setShowForm(false)}
                                disabled={saving}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={guardar}
                                disabled={saving || !cuadrado}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm disabled:opacity-50"
                            >
                                {saving ? 'Guardando...' : 'Guardar asiento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
