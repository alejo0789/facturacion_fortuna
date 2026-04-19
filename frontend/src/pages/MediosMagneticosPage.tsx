/**
 * Medios Magnéticos DIAN — formatos 1001, 1007 y 1008.
 *
 * Consume /api/dian/medios-magneticos/*:
 *   - /resumen?anio= → totales de los 3 formatos
 *   - /1001?anio=&formato=json|csv
 *   - /1007?anio=&formato=json|csv
 *   - /1008?anio=&formato=json|csv
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
        // Usa apiFetch para que el interceptor global inyecte Authorization
        // y X-Empresa-Id desde el AuthContext.
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
        <div className="max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Medios Magnéticos DIAN</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Formatos 1001 (pagos + retenciones), 1007 (ingresos) y 1008 (CxC) — exigidos por
                    la Resolución anual de la DIAN. Se construyen a partir de los asientos APROBADOS
                    del año seleccionado.
                </p>
            </div>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800 text-sm">{error}</div>}

            {/* Aviso de integridad: líneas 1001 sin NIT — reporte incompleto */}
            {resumen && (resumen.f1001_lineas_omitidas_sin_nit ?? 0) > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm">
                    <strong>Atención — Formato 1001 incompleto:</strong>{' '}
                    {resumen.f1001_lineas_omitidas_sin_nit} línea(s) contable(s) por{' '}
                    {formatCOP(resumen.f1001_valor_omitido_sin_nit ?? '0')} se omitieron por
                    falta de NIT del tercero. Complete esos NITs en los asientos para que
                    el reporte DIAN quede íntegro.
                </div>
            )}

            {/* Año */}
            <div className="bg-white rounded-xl border shadow-sm p-4 flex items-end gap-3">
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Año fiscal</label>
                    <input type="number" min={2000} max={2100} value={anio}
                        onChange={(e) => setAnio(Number(e.target.value) || currentYear)}
                        className="px-3 py-2 border rounded-lg text-sm w-32" />
                </div>
            </div>

            {/* Resumen de los 3 formatos */}
            {resumen && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl border shadow-sm p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Formato 1001 — Pagos</div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{formatCOP(resumen.f1001_total_pagos)}</div>
                        <div className="text-xs text-slate-500 mt-1">{resumen.f1001_registros} terceros</div>
                    </div>
                    <div className="bg-white rounded-xl border shadow-sm p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Formato 1007 — Ingresos</div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{formatCOP(resumen.f1007_total_ingresos)}</div>
                        <div className="text-xs text-slate-500 mt-1">{resumen.f1007_registros} terceros</div>
                    </div>
                    <div className="bg-white rounded-xl border shadow-sm p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Formato 1008 — CxC</div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{formatCOP(resumen.f1008_total_cxc)}</div>
                        <div className="text-xs text-slate-500 mt-1">{resumen.f1008_registros} terceros</div>
                    </div>
                </div>
            )}

            {/* Tabs + CSV */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
                    <div className="flex gap-2">
                        {(['1001', '1007', '1008'] as const).map((f) => (
                            <button key={f} onClick={() => setFormato(f)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${formato === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                                Formato {f}
                            </button>
                        ))}
                    </div>
                    <button onClick={descargarCSV} disabled={filas.length === 0}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                        Descargar CSV
                    </button>
                </div>

                <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                        <tr>
                            {columnas[formato].map((c) => (
                                <th key={c.key} className={`px-4 py-2 font-semibold text-slate-600 ${c.money ? 'text-right' : 'text-left'}`}>
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {cargando && <tr><td colSpan={columnas[formato].length} className="p-6 text-center text-slate-400">Cargando...</td></tr>}
                        {!cargando && filas.length === 0 && (
                            <tr><td colSpan={columnas[formato].length} className="p-6 text-center text-slate-400">
                                Sin registros para el año {anio}.
                            </td></tr>
                        )}
                        {filas.map((f, idx) => (
                            <tr key={idx} className="border-b last:border-0 hover:bg-slate-50">
                                {columnas[formato].map((c) => {
                                    const v = f[c.key];
                                    return (
                                        <td key={c.key} className={`px-4 py-2 ${c.money ? 'text-right font-mono' : ''}`}>
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
