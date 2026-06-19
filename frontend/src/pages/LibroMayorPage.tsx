/**
 * Libro Mayor — movimientos de una cuenta específica con saldo corriente.
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
    const [oficinas, setOficinas] = useState<Array<{ cod_oficina: string; nombre: string }>>([]);
    const [cuentaCodigo, setCuentaCodigo] = useState('');
    const [fechaDesde, setFechaDesde] = useState(inicioAnio);
    const [fechaHasta, setFechaHasta] = useState(hoyStr);
    const [incluirBorradores, setIncluirBorradores] = useState(false);
    const [centroCosto, setCentroCosto] = useState('');
    const [nitTercero, setNitTercero] = useState('');

    const [mayor, setMayor] = useState<LibroMayor | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet<CuentaPUC[]>('/contabilidad/puc', { solo_movimiento: 'true' });
                setCuentas(data);
            } catch { /* silencio */ }
            try {
                const ofs = await apiGet<Array<{ cod_oficina: string; nombre: string }>>('/oficinas/', { limit: 500 });
                setOficinas(ofs.filter((o) => o.cod_oficina));
            } catch { /* silencio */ }
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
            if (centroCosto.trim()) params.centro_costo = centroCosto.trim();
            if (nitTercero.trim()) params.nit_tercero = nitTercero.trim();
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
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Contabilidad · Movimientos por cuenta</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Libro <em>mayor</em>.
                    </h1>
                    <p className="text-[13px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Movimientos cronológicos de una cuenta con saldo corriente, filtrable por
                        centro de costo y NIT del tercero.
                    </p>
                </div>
            </div>

            <div className="surface p-5 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div className="md:col-span-2">
                    <label className="kicker block mb-1.5">Cuenta</label>
                    <input
                        list="lm-cuentas"
                        value={cuentaCodigo}
                        onChange={(e) => setCuentaCodigo(e.target.value)}
                        placeholder="Ej: 511005"
                        className="input-field font-mono"
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
                    <label className="kicker block mb-1.5">Desde</label>
                    <input
                        type="date"
                        value={fechaDesde}
                        onChange={(e) => setFechaDesde(e.target.value)}
                        className="input-field"
                    />
                </div>
                <div>
                    <label className="kicker block mb-1.5">Hasta</label>
                    <input
                        type="date"
                        value={fechaHasta}
                        onChange={(e) => setFechaHasta(e.target.value)}
                        className="input-field"
                    />
                </div>
                <div>
                    <button
                        onClick={consultar}
                        disabled={loading}
                        className="btn-accent w-full disabled:opacity-50"
                    >
                        {loading ? 'Consultando…' : 'Consultar'}
                    </button>
                </div>
                <div className="md:col-span-5 grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                    <div>
                        <label className="kicker block mb-1.5">Centro de costo (opcional)</label>
                        <select
                            className="input-field text-[13px]"
                            value={centroCosto}
                            onChange={(e) => setCentroCosto(e.target.value)}
                        >
                            <option value="">Todas las sedes</option>
                            {oficinas.map((o) => (
                                <option key={o.cod_oficina} value={o.cod_oficina}>
                                    {o.cod_oficina} — {o.nombre}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="kicker block mb-1.5">NIT tercero (opcional)</label>
                        <input
                            type="text"
                            placeholder="Ej: 900111111"
                            value={nitTercero}
                            onChange={(e) => setNitTercero(e.target.value)}
                            className="input-field font-mono text-[13px]"
                        />
                    </div>
                    <label className="inline-flex items-end gap-2 text-[13px] pb-2.5" style={{ color: 'var(--ink-soft)' }}>
                        <input
                            type="checkbox"
                            checked={incluirBorradores}
                            onChange={(e) => setIncluirBorradores(e.target.checked)}
                            className="h-4 w-4 rounded"
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        Incluir asientos en borrador
                    </label>
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

            {mayor && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 anim-stagger">
                        <div className="surface p-5">
                            <div className="kicker mb-2">Cuenta</div>
                            <div className="font-mono text-[1.1rem] font-semibold">{mayor.cuenta_codigo}</div>
                            <div className="text-[12px] truncate mt-1" style={{ color: 'var(--ink-faint)' }}>
                                {mayor.cuenta_nombre}
                            </div>
                        </div>
                        <div className="surface p-5">
                            <div className="kicker mb-2">Total débito</div>
                            <div className="numeral text-[1.6rem] leading-none" style={{ color: 'var(--accent)' }}>
                                {formatCOP(Number(mayor.total_debito))}
                            </div>
                        </div>
                        <div className="surface p-5">
                            <div className="kicker mb-2">Total crédito</div>
                            <div className="numeral text-[1.6rem] leading-none" style={{ color: 'var(--negative)' }}>
                                {formatCOP(Number(mayor.total_credito))}
                            </div>
                        </div>
                        <div className="surface p-5">
                            <div className="kicker mb-2">Saldo final</div>
                            <div className="numeral text-[1.6rem] leading-none" style={{ color: 'var(--positive)' }}>
                                {formatCOP(Number(mayor.saldo_final))}
                            </div>
                        </div>
                    </div>

                    <div className="surface-raised overflow-hidden">
                        <div
                            className="px-6 py-4"
                            style={{ borderBottom: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                        >
                            <div className="kicker-accent">Movimientos</div>
                            <h2 className="font-display text-[1.2rem] tracking-tight mt-1">
                                Detalle cronológico
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-[14px]">
                                <thead style={{ background: 'var(--paper-tinted)' }}>
                                    <tr>
                                        <th className="kicker px-5 py-3" style={{ background: 'var(--paper-tinted)' }}>Fecha</th>
                                        <th className="kicker px-5 py-3" style={{ background: 'var(--paper-tinted)' }}>Asiento</th>
                                        <th className="kicker px-5 py-3" style={{ background: 'var(--paper-tinted)' }}>Descripción</th>
                                        <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Débito</th>
                                        <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Crédito</th>
                                        <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Saldo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mayor.movimientos.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-16 text-center">
                                                <div
                                                    className="font-display text-[2.5rem]"
                                                    style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                                >
                                                    —
                                                </div>
                                                <div className="kicker mt-2">Sin movimientos en el rango</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        mayor.movimientos.map((m, i) => (
                                            <tr
                                                key={i}
                                                style={{ borderTop: i > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                                className="transition-colors"
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <td className="px-5 py-3 font-mono text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                                                    {m.fecha}
                                                </td>
                                                <td className="px-5 py-3 font-mono text-[12px]" style={{ color: 'var(--accent)' }}>
                                                    {m.asiento_numero}
                                                </td>
                                                <td className="px-5 py-3">
                                                    {m.descripcion || <span className="italic" style={{ color: 'var(--ink-mute)' }}>—</span>}
                                                </td>
                                                <td className="px-5 py-3 text-right font-mono text-[13px]" style={{ color: 'var(--accent)' }}>
                                                    {Number(m.debito) > 0 ? formatCOP(Number(m.debito)) : '—'}
                                                </td>
                                                <td className="px-5 py-3 text-right font-mono text-[13px]" style={{ color: 'var(--negative)' }}>
                                                    {Number(m.credito) > 0 ? formatCOP(Number(m.credito)) : '—'}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <span className="numeral text-[14px]" style={{ color: 'var(--positive)' }}>
                                                        {formatCOP(Number(m.saldo))}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
