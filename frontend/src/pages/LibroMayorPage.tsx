/**
 * Libro Mayor — movimientos de una cuenta específica con saldo corriente.
 * Consume GET /api/contabilidad/libro-mayor/{codigo} con rango de fechas.
 */
import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../utils/apiClient';
import { formatCOP } from '../utils/format';
import type { CuentaPUC, LibroMayor } from '../types/contabilidad';

export default function LibroMayorPage() {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const inicioAnio = `${anio}-01-01`;
    const hoyStr = hoy.toISOString().substring(0, 10);

    const [cuentas, setCuentas] = useState<CuentaPUC[]>([]);
    const [cuentaCodigo, setCuentaCodigo] = useState('');
    const [fechaDesde, setFechaDesde] = useState(inicioAnio);
    const [fechaHasta, setFechaHasta] = useState(hoyStr);
    const [incluirBorradores, setIncluirBorradores] = useState(false);

    const [mayor, setMayor] = useState<LibroMayor | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet<CuentaPUC[]>('/contabilidad/puc', { solo_movimiento: 'true' });
                setCuentas(data);
            } catch {
                /* silencio */
            }
        })();
    }, []);

    const consultar = async () => {
        if (!cuentaCodigo.trim()) {
            setError('Seleccione una cuenta.');
            return;
        }
        setLoading(true);
        setError(null);
        setMayor(null);
        try {
            const params: Record<string, string> = {
                fecha_desde: fechaDesde,
                fecha_hasta: fechaHasta,
                incluir_borradores: incluirBorradores ? 'true' : 'false',
            };
            const data = await apiGet<LibroMayor>(
                `/contabilidad/libro-mayor/${encodeURIComponent(cuentaCodigo.trim())}`,
                params,
            );
            setMayor(data);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error consultando el libro mayor');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Libro Mayor</h1>
                <p className="text-gray-500 mt-1">Movimientos de una cuenta con saldo corriente.</p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cuenta</label>
                    <input
                        list="lm-cuentas"
                        value={cuentaCodigo}
                        onChange={(e) => setCuentaCodigo(e.target.value)}
                        placeholder="Ej: 511005"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono"
                    />
                    <datalist id="lm-cuentas">
                        {cuentas.map((c) => (
                            <option key={c.codigo} value={c.codigo}>
                                {c.codigo} — {c.nombre}
                            </option>
                        ))}
                    </datalist>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                    <input
                        type="date"
                        value={fechaDesde}
                        onChange={(e) => setFechaDesde(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                    <input
                        type="date"
                        value={fechaHasta}
                        onChange={(e) => setFechaHasta(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    />
                </div>
                <div>
                    <button
                        onClick={consultar}
                        disabled={loading}
                        className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                    >
                        {loading ? 'Consultando...' : 'Consultar'}
                    </button>
                </div>
                <div className="md:col-span-5">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={incluirBorradores}
                            onChange={(e) => setIncluirBorradores(e.target.checked)}
                            className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                        />
                        Incluir asientos en borrador
                    </label>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {mayor && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <div className="text-xs text-gray-500">Cuenta</div>
                            <div className="text-lg font-bold text-slate-800 font-mono">
                                {mayor.cuenta_codigo}
                            </div>
                            <div className="text-xs text-gray-600 truncate">{mayor.cuenta_nombre}</div>
                        </div>
                        <div className="bg-sky-50 p-4 rounded-xl border border-sky-100">
                            <div className="text-xs text-sky-700">Total débito</div>
                            <div className="text-lg font-bold text-sky-700 font-mono">
                                {formatCOP(Number(mayor.total_debito))}
                            </div>
                        </div>
                        <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                            <div className="text-xs text-rose-700">Total crédito</div>
                            <div className="text-lg font-bold text-rose-700 font-mono">
                                {formatCOP(Number(mayor.total_credito))}
                            </div>
                        </div>
                        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                            <div className="text-xs text-emerald-700">Saldo final</div>
                            <div className="text-lg font-bold text-emerald-700 font-mono">
                                {formatCOP(Number(mayor.saldo_final))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                                        Fecha
                                    </th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                                        Asiento #
                                    </th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                                        Descripción
                                    </th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-right">
                                        Débito
                                    </th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-right">
                                        Crédito
                                    </th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-right">
                                        Saldo
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {mayor.movimientos.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500 italic">
                                            Sin movimientos en el rango seleccionado.
                                        </td>
                                    </tr>
                                ) : (
                                    mayor.movimientos.map((m, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 text-gray-700">{m.fecha}</td>
                                            <td className="px-4 py-2 font-mono text-gray-700">{m.asiento_numero}</td>
                                            <td className="px-4 py-2 text-gray-800">
                                                {m.descripcion || (
                                                    <span className="italic text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono text-sky-700">
                                                {Number(m.debito) > 0 ? formatCOP(Number(m.debito)) : '—'}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono text-rose-700">
                                                {Number(m.credito) > 0 ? formatCOP(Number(m.credito)) : '—'}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-700">
                                                {formatCOP(Number(m.saldo))}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
