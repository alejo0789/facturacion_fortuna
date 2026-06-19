/**
 * Cuentas Bancarias — configuración de bancos de la empresa activa.
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

    useEffect(() => { void load(); }, [load]);

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
        <div className="max-w-[1480px] mx-auto space-y-8">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Bancario · Configuración</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Cuentas <em>bancarias</em>.
                    </h1>
                    <p className="text-[13px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Configuración de bancos para pagos y conciliación. Cada cuenta se mapea a
                        una auxiliar del PUC bajo el grupo{' '}
                        <span className="font-mono" style={{ color: 'var(--accent)' }}>1110 — Bancos</span>.
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

            {/* Form */}
            <form onSubmit={submit} className="surface p-5">
                <div className="kicker-accent mb-1">{editing ? 'Editar' : 'Nueva cuenta'}</div>
                <h2 className="font-display text-[1.3rem] tracking-tight mb-5">
                    {editing ? `Cuenta #${editing.id}` : 'Registrar cuenta bancaria'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                    <div>
                        <label className="kicker block mb-1.5">Banco</label>
                        <input required value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Bancolombia" className="input-field" />
                    </div>
                    <div>
                        <label className="kicker block mb-1.5">Número de cuenta</label>
                        <input required value={numero} onChange={(e) => setNumero(e.target.value)} className="input-field font-mono" />
                    </div>
                    <div>
                        <label className="kicker block mb-1.5">Tipo</label>
                        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input-field">
                            {TIPOS_CUENTA.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="kicker block mb-1.5">Cuenta PUC</label>
                        <select required value={pucCodigo} onChange={(e) => setPucCodigo(e.target.value)} className="input-field">
                            <option value="">Seleccionar…</option>
                            {cuentasPUC.map((c) => (
                                <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                            <input
                                type="checkbox"
                                checked={activa}
                                onChange={(e) => setActiva(e.target.checked)}
                                className="h-4 w-4 rounded"
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            Activa
                        </label>
                        <button type="submit" disabled={saving} className="ml-auto btn-accent text-[12px] disabled:opacity-50">
                            {saving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear'}
                        </button>
                        {editing && (
                            <button type="button" onClick={resetForm} className="btn-ghost text-[12px]">
                                Cancelar
                            </button>
                        )}
                    </div>
                </div>
            </form>

            {/* Listado */}
            <div className="surface-raised overflow-hidden">
                <div
                    className="px-6 py-4"
                    style={{ borderBottom: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                >
                    <div className="kicker-accent">Cuentas registradas</div>
                    <h2 className="font-display text-[1.2rem] tracking-tight mt-1">
                        {cuentas.length} cuenta{cuentas.length !== 1 ? 's' : ''}
                    </h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-[14px]">
                        <thead style={{ background: 'var(--paper-tinted)' }}>
                            <tr>
                                <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Banco</th>
                                <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Número</th>
                                <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Tipo</th>
                                <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Cuenta PUC</th>
                                <th className="kicker px-5 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Estado</th>
                                <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center">
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
                            )}
                            {!loading && cuentas.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-16 text-center">
                                        <div
                                            className="font-display text-[3rem]"
                                            style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                        >
                                            —
                                        </div>
                                        <div className="kicker mt-2">No hay cuentas registradas</div>
                                    </td>
                                </tr>
                            )}
                            {cuentas.map((c, idx) => (
                                <tr
                                    key={c.id}
                                    style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                    className="transition-colors"
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <td className="px-5 py-3 font-display" style={{ fontVariationSettings: "'SOFT' 30" }}>{c.banco}</td>
                                    <td className="px-5 py-3 font-mono text-[13px]" style={{ color: 'var(--ink-soft)' }}>{c.numero_cuenta}</td>
                                    <td className="px-5 py-3" style={{ color: 'var(--ink-soft)' }}>{c.tipo_cuenta ?? '—'}</td>
                                    <td className="px-5 py-3 font-mono text-[12px]" style={{ color: 'var(--accent)' }}>{c.cuenta_puc_codigo}</td>
                                    <td className="px-5 py-3">
                                        <span className={c.activa ? 'tag tag-positive' : 'tag'}>
                                            {c.activa ? 'Activa' : 'Inactiva'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-right space-x-3">
                                        <button
                                            onClick={() => startEdit(c)}
                                            className="text-[12px] font-medium transition-colors"
                                            style={{ color: 'var(--accent)' }}
                                        >
                                            Editar
                                        </button>
                                        {c.activa && (
                                            <button
                                                onClick={() => eliminar(c)}
                                                className="text-[12px] font-medium transition-colors"
                                                style={{ color: 'var(--negative)' }}
                                            >
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
