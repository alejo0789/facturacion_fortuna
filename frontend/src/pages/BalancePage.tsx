/**
 * Balance de Comprobación — saldos por clase PUC acumulados a un periodo.
 * Consume GET /api/contabilidad/balance?anio=&mes=
 */
import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../utils/apiClient';
import { formatCOP } from '../utils/format';
import type { Balance } from '../types/contabilidad';

const CLASE_COLOR: Record<string, string> = {
    '1': 'from-indigo-500 to-indigo-600',
    '2': 'from-rose-500 to-rose-600',
    '3': 'from-purple-500 to-purple-600',
    '4': 'from-emerald-500 to-emerald-600',
    '5': 'from-amber-500 to-amber-600',
    '6': 'from-orange-500 to-orange-600',
};

export default function BalancePage() {
    const hoy = new Date();
    const [anio, setAnio] = useState(hoy.getFullYear());
    const [mes, setMes] = useState(hoy.getMonth() + 1);
    const [incluirBorradores, setIncluirBorradores] = useState(false);
    const [balance, setBalance] = useState<Balance | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const consultar = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiGet<Balance>('/contabilidad/balance', {
                anio,
                mes,
                incluir_borradores: incluirBorradores ? 'true' : 'false',
            });
            setBalance(data);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error consultando el balance');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        consultar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const ecuacionOk = balance
        ? Math.abs(
              Number(balance.total_activos) -
                  (Number(balance.total_pasivos) +
                      Number(balance.total_patrimonio) +
                      Number(balance.utilidad_neta)),
          ) < 1
        : false;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Balance de Comprobación</h1>
                <p className="text-gray-500 mt-1">Saldos acumulados por clase al periodo seleccionado.</p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
                    <input
                        type="number"
                        value={anio}
                        onChange={(e) => setAnio(parseInt(e.target.value) || hoy.getFullYear())}
                        className="px-3 py-2 border border-gray-200 rounded-lg w-28"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
                    <input
                        type="number"
                        min={1}
                        max={12}
                        value={mes}
                        onChange={(e) => setMes(parseInt(e.target.value) || 1)}
                        className="px-3 py-2 border border-gray-200 rounded-lg w-20"
                    />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={incluirBorradores}
                        onChange={(e) => setIncluirBorradores(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                    />
                    Incluir borradores
                </label>
                <button
                    onClick={consultar}
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                >
                    {loading ? 'Cargando...' : 'Actualizar'}
                </button>
            </div>

            {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {balance && (
                <>
                    {/* KPIs por grupo */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <KPI titulo="Activos" color="from-indigo-500 to-indigo-600" valor={balance.total_activos} />
                        <KPI titulo="Pasivos" color="from-rose-500 to-rose-600" valor={balance.total_pasivos} />
                        <KPI
                            titulo="Patrimonio"
                            color="from-purple-500 to-purple-600"
                            valor={balance.total_patrimonio}
                        />
                        <KPI
                            titulo="Ingresos"
                            color="from-emerald-500 to-emerald-600"
                            valor={balance.total_ingresos}
                        />
                        <KPI titulo="Gastos" color="from-amber-500 to-amber-600" valor={balance.total_gastos} />
                        <KPI titulo="Costos" color="from-orange-500 to-orange-600" valor={balance.total_costos} />
                    </div>

                    {/* Utilidad + ecuación contable */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div
                            className={`p-5 rounded-xl border-2 ${
                                Number(balance.utilidad_neta) >= 0
                                    ? 'bg-emerald-50 border-emerald-200'
                                    : 'bg-rose-50 border-rose-200'
                            }`}
                        >
                            <div className="text-sm text-gray-700">
                                Utilidad neta{' '}
                                <span className="text-xs text-gray-500">
                                    (Ingresos − Gastos − Costos)
                                </span>
                            </div>
                            <div
                                className={`text-3xl font-bold font-mono ${
                                    Number(balance.utilidad_neta) >= 0
                                        ? 'text-emerald-700'
                                        : 'text-rose-700'
                                }`}
                            >
                                {formatCOP(Number(balance.utilidad_neta))}
                            </div>
                        </div>
                        <div
                            className={`p-5 rounded-xl border-2 ${
                                ecuacionOk
                                    ? 'bg-sky-50 border-sky-200'
                                    : 'bg-amber-50 border-amber-200'
                            }`}
                        >
                            <div className="text-sm text-gray-700">
                                Ecuación contable{' '}
                                <span className="text-xs text-gray-500">
                                    (A = P + Patrimonio + Utilidad)
                                </span>
                            </div>
                            <div
                                className={`text-2xl font-bold ${
                                    ecuacionOk ? 'text-sky-700' : 'text-amber-700'
                                }`}
                            >
                                {ecuacionOk ? '✓ Cuadra' : '⚠ Diferencia'}
                            </div>
                            <div className="text-xs text-gray-600 font-mono mt-1">
                                {formatCOP(Number(balance.total_activos))} ={' '}
                                {formatCOP(
                                    Number(balance.total_pasivos) +
                                        Number(balance.total_patrimonio) +
                                        Number(balance.utilidad_neta),
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabla detalle por clase */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                            <h2 className="text-sm font-semibold text-gray-700">
                                Detalle por clase — {balance.anio}-{String(balance.mes).padStart(2, '0')}
                            </h2>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                                        Clase
                                    </th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                                        Nombre
                                    </th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-right">
                                        Total débito
                                    </th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-right">
                                        Total crédito
                                    </th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-right">
                                        Saldo
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {balance.clases.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-10 text-center text-gray-500 italic">
                                            Sin movimientos acumulados al periodo.
                                        </td>
                                    </tr>
                                ) : (
                                    balance.clases.map((c) => (
                                        <tr key={c.codigo} className="hover:bg-gray-50">
                                            <td className="px-4 py-2">
                                                <span
                                                    className={`text-xs font-bold px-2 py-0.5 rounded text-white bg-gradient-to-r ${
                                                        CLASE_COLOR[c.codigo] || 'from-slate-500 to-slate-600'
                                                    }`}
                                                >
                                                    {c.codigo}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 font-medium text-gray-800">{c.nombre}</td>
                                            <td className="px-4 py-2 text-right font-mono text-sky-700">
                                                {formatCOP(Number(c.total_debito))}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono text-rose-700">
                                                {formatCOP(Number(c.total_credito))}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-700">
                                                {formatCOP(Number(c.saldo))}
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

interface KPIProps {
    titulo: string;
    color: string;
    valor: string;
}
function KPI({ titulo, color, valor }: KPIProps) {
    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className={`text-xs font-semibold uppercase tracking-wide bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                {titulo}
            </div>
            <div className="text-xl font-bold text-slate-800 font-mono mt-1">
                {formatCOP(Number(valor))}
            </div>
        </div>
    );
}
