/**
 * Cuentas Bancarias — configuración de bancos de la empresa activa.
 *
 * Consume:
 *   GET    /api/contabilidad/cuentas-bancarias
 *   POST   /api/contabilidad/cuentas-bancarias
 *   PUT    /api/contabilidad/cuentas-bancarias/:id
 *   DELETE /api/contabilidad/cuentas-bancarias/:id
 *
 * Requiere rol ADMIN / CONTADOR / CONTABILIDAD para crear/editar.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../utils/apiClient';
import type { CuentaPUC } from '../types/contabilidad';

interface CuentaBancaria {
    id: number;
    empresa_id?: number | null;
    banco: string;
    numero_cuenta: string;
    tipo_cuenta?: string | null;
    cuenta_puc_codigo: string;
    activa: boolean;
}

const TIPOS_CUENTA = ['Ahorros', 'Corriente'] as const;

export default function CuentasBancariasPage() {
    const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
    const [cuentasPUC, setCuentasPUC] = useState<CuentaPUC[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    // Formulario creación/edición
    const [editing, setEditing] = useState<CuentaBancaria | null>(null);
    const [banco, setBanco] = useState('');
    const [numero, setNumero] = useState('');
    const [tipo, setTipo] = useState<string>('Ahorros');
    const [pucCodigo, setPucCodigo] = useState('');
    const [activa, setActiva] = useState(true);
    const [saving, setSaving] = useState(false);

    const resetForm = () => {
        setEditing(null);
        setBanco('');
        setNumero('');
        setTipo('Ahorros');
        setPucCodigo('');
        setActiva(true);
    };

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [cbs, puc] = await Promise.all([
                apiGet<CuentaBancaria[]>('/api/contabilidad/cuentas-bancarias', { solo_activas: 'false' }),
                apiGet<CuentaPUC[]>('/api/contabilidad/puc', { solo_movimiento: 'true', codigo: '1110' }),
            ]);
            setCuentas(cbs);
            setCuentasPUC(puc);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al cargar cuentas bancarias');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const startEdit = (c: CuentaBancaria) => {
        setEditing(c);
        setBanco(c.banco);
        setNumero(c.numero_cuenta);
        setTipo(c.tipo_cuenta ?? 'Ahorros');
        setPucCodigo(c.cuenta_puc_codigo);
        setActiva(c.activa);
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setInfo(null);
        try {
            if (editing) {
                await apiPut(`/api/contabilidad/cuentas-bancarias/${editing.id}`, {
                    banco, numero_cuenta: numero, tipo_cuenta: tipo,
                    cuenta_puc_codigo: pucCodigo, activa,
                });
                setInfo(`Cuenta #${editing.id} actualizada`);
            } else {
                await apiPost('/api/contabilidad/cuentas-bancarias', {
                    banco, numero_cuenta: numero, tipo_cuenta: tipo,
                    cuenta_puc_codigo: pucCodigo, activa,
                });
                setInfo('Cuenta bancaria creada');
            }
            resetForm();
            await load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const eliminar = async (c: CuentaBancaria) => {
        if (!confirm(`¿Desactivar cuenta ${c.banco} ${c.numero_cuenta}?`)) return;
        try {
            await apiDelete(`/api/contabilidad/cuentas-bancarias/${c.id}`);
            setInfo(`Cuenta #${c.id} desactivada`);
            await load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al eliminar');
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Cuentas Bancarias</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Configuración de bancos para pagos y conciliación. Cada cuenta se mapea a una cuenta
                    auxiliar del PUC bajo el grupo <span className="font-mono">1110 — Bancos</span>.
                </p>
            </div>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800 text-sm">{error}</div>}
            {info && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 text-sm">{info}</div>}

            {/* Form */}
            <form onSubmit={submit} className="bg-white rounded-xl border shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div className="md:col-span-1">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Banco</label>
                    <input required value={banco} onChange={(e) => setBanco(e.target.value)}
                        placeholder="Bancolombia"
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="md:col-span-1">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Número de cuenta</label>
                    <input required value={numero} onChange={(e) => setNumero(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                    <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm">
                        {TIPOS_CUENTA.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cuenta PUC</label>
                    <select required value={pucCodigo} onChange={(e) => setPucCodigo(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm">
                        <option value="">Seleccionar...</option>
                        {cuentasPUC.map((c) => (
                            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
                        Activa
                    </label>
                    <button type="submit" disabled={saving}
                        className="ml-auto px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear'}
                    </button>
                    {editing && (
                        <button type="button" onClick={resetForm}
                            className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200">
                            Cancelar
                        </button>
                    )}
                </div>
            </form>

            {/* Listado */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Banco</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Número</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Tipo</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Cuenta PUC</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-600">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={6} className="p-6 text-center text-slate-400">Cargando...</td></tr>}
                        {!loading && cuentas.length === 0 && (
                            <tr><td colSpan={6} className="p-6 text-center text-slate-400">
                                No hay cuentas bancarias. Crea la primera arriba.
                            </td></tr>
                        )}
                        {cuentas.map((c) => (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                                <td className="px-4 py-3 font-medium text-slate-900">{c.banco}</td>
                                <td className="px-4 py-3 font-mono text-slate-700">{c.numero_cuenta}</td>
                                <td className="px-4 py-3 text-slate-600">{c.tipo_cuenta ?? '—'}</td>
                                <td className="px-4 py-3 font-mono text-xs text-slate-700">{c.cuenta_puc_codigo}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.activa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {c.activa ? 'Activa' : 'Inactiva'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right space-x-2">
                                    <button onClick={() => startEdit(c)}
                                        className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100">
                                        Editar
                                    </button>
                                    {c.activa && (
                                        <button onClick={() => eliminar(c)}
                                            className="px-2 py-1 text-xs rounded bg-rose-50 text-rose-700 hover:bg-rose-100">
                                            Desactivar
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
    );
}
