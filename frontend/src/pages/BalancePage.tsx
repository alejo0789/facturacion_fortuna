/**
 * Balance de Comprobación — saldos por clase PUC acumulados a un periodo.
 * Consume GET /api/contabilidad/balance?anio=&mes=
 */
import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../utils/apiClient';
import { formatCOP } from '../utils/format';
import type { Balance } from '../types/contabilidad';

const CLASE_GLYPH: Record<string, { roman: string; tone: string }> = {
    '1': { roman: 'I',   tone: 'var(--accent)' },
    '2': { roman: 'II',  tone: 'var(--negative)' },
    '3': { roman: 'III', tone: 'var(--gold)' },
    '4': { roman: 'IV',  tone: 'var(--positive)' },
    '5': { roman: 'V',   tone: 'var(--ink-soft)' },
    '6': { roman: 'VI',  tone: 'var(--ink-soft)' },
};

const MESES_LARGO = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
        <div className="space-y-10 max-w-[1480px] mx-auto">
            {/* Masthead */}
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">
                    Contabilidad · {balance ? `${MESES_LARGO[balance.mes]} ${balance.anio}` : 'Cargando…'}
                </div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.75rem]">
                        Balance de <em>comprobación</em>.
                    </h1>
                    <p className="text-[14px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Saldos acumulados por clase del Plan Único de Cuentas (Decreto 2650)
                        al cierre del periodo seleccionado.
                    </p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="surface p-5 flex flex-wrap items-end gap-4">
                <div>
                    <label className="kicker block mb-1.5">Año</label>
                    <input
                        type="number"
                        value={anio}
                        onChange={(e) => setAnio(parseInt(e.target.value) || hoy.getFullYear())}
                        className="input-field font-mono w-28 text-[14px]"
                    />
                </div>
                <div>
                    <label className="kicker block mb-1.5">Mes</label>
                    <input
                        type="number"
                        min={1}
                        max={12}
                        value={mes}
                        onChange={(e) => setMes(parseInt(e.target.value) || 1)}
                        className="input-field font-mono w-20 text-[14px]"
                    />
                </div>
                <label className="inline-flex items-center gap-2 text-[13px] pb-2.5" style={{ color: 'var(--ink-soft)' }}>
                    <input
                        type="checkbox"
                        checked={incluirBorradores}
                        onChange={(e) => setIncluirBorradores(e.target.checked)}
                        className="h-4 w-4 rounded"
                        style={{ accentColor: 'var(--accent)' }}
                    />
                    Incluir borradores
                </label>
                <div className="ml-auto">
                    <button
                        onClick={consultar}
                        disabled={loading}
                        className="btn-accent disabled:opacity-50"
                    >
                        {loading ? 'Consultando…' : 'Actualizar'}
                    </button>
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
                    <div className="kicker-accent mb-1" style={{ color: 'var(--negative)' }}>Error</div>
                    {error}
                </div>
            )}

            {balance && (
                <>
                    {/* ═══════════════════════════════════════════════════
                        Hero — ecuación contable
                        ═══════════════════════════════════════════════════ */}
                    <div className="ledger paper-grain p-8 lg:p-12">
                        <div className="grid lg:grid-cols-12 gap-8 items-center">
                            <div className="lg:col-span-7">
                                <div className="kicker-accent mb-3">Ecuación contable</div>
                                <div className="text-[14px] mb-4" style={{ color: 'var(--ink-faint)' }}>
                                    Activos = Pasivos + Patrimonio + Utilidad neta
                                </div>
                                <div
                                    className="numeral leading-none"
                                    style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
                                >
                                    {formatCOP(Number(balance.total_activos))}
                                </div>
                                <div className="mt-4 flex items-center gap-3 font-mono text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontStyle: 'italic' }}>=</span>
                                    <span>{formatCOP(Number(balance.total_pasivos))}</span>
                                    <span>+</span>
                                    <span>{formatCOP(Number(balance.total_patrimonio))}</span>
                                    <span>+</span>
                                    <span>{formatCOP(Number(balance.utilidad_neta))}</span>
                                </div>
                            </div>
                            <div className="lg:col-span-5 lg:border-l lg:pl-8" style={{ borderColor: 'var(--rule)' }}>
                                {/* Estado del balance */}
                                <div className="mb-6">
                                    <div className="kicker mb-2">Estado del balance</div>
                                    {ecuacionOk ? (
                                        <div className="flex items-baseline gap-3">
                                            <span
                                                className="font-display text-[2.5rem] leading-none"
                                                style={{ color: 'var(--positive)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                            >
                                                ✓
                                            </span>
                                            <span className="font-display text-[1.5rem]" style={{ color: 'var(--positive)' }}>
                                                Cuadra
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-baseline gap-3">
                                            <span
                                                className="font-display text-[2.5rem] leading-none"
                                                style={{ color: 'var(--negative)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                            >
                                                ⚠
                                            </span>
                                            <span className="font-display text-[1.5rem]" style={{ color: 'var(--negative)' }}>
                                                Diferencia
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <hr className="hr-ledger my-4" />

                                <div>
                                    <div className="kicker mb-2">Utilidad neta</div>
                                    <div
                                        className="numeral text-[2rem] leading-none"
                                        style={{ color: Number(balance.utilidad_neta) >= 0 ? 'var(--positive)' : 'var(--negative)' }}
                                    >
                                        {formatCOP(Number(balance.utilidad_neta))}
                                    </div>
                                    <div className="text-[11px] mt-2" style={{ color: 'var(--ink-faint)' }}>
                                        Ingresos − Gastos − Costos
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ═══════════════════════════════════════════════════
                        KPIs por grupo — editorial cards
                        ═══════════════════════════════════════════════════ */}
                    <div>
                        <div className="eyebrow mb-4">Totales por clase</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 anim-stagger">
                            {[
                                { titulo: 'Activos', clase: '1', valor: balance.total_activos },
                                { titulo: 'Pasivos', clase: '2', valor: balance.total_pasivos },
                                { titulo: 'Patrimonio', clase: '3', valor: balance.total_patrimonio },
                                { titulo: 'Ingresos', clase: '4', valor: balance.total_ingresos },
                                { titulo: 'Gastos', clase: '5', valor: balance.total_gastos },
                                { titulo: 'Costos', clase: '6', valor: balance.total_costos },
                            ].map((k) => {
                                const meta = CLASE_GLYPH[k.clase];
                                return (
                                    <div key={k.titulo} className="surface p-5 transition-all hover:-translate-y-px">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="kicker">{k.titulo}</div>
                                            <span
                                                className="font-display-wonk text-[1.5rem] leading-none"
                                                style={{ color: meta.tone }}
                                            >
                                                {meta.roman}
                                            </span>
                                        </div>
                                        <div className="numeral text-[1.8rem] leading-none">
                                            {formatCOP(Number(k.valor))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ═══════════════════════════════════════════════════
                        Tabla por clase
                        ═══════════════════════════════════════════════════ */}
                    <div className="surface-raised overflow-hidden">
                        <div
                            className="px-6 py-5 flex items-baseline justify-between"
                            style={{ borderBottom: '1px solid var(--rule)' }}
                        >
                            <div>
                                <div className="kicker-accent">Detalle</div>
                                <h2 className="font-display text-[1.3rem] tracking-tight mt-1">
                                    Saldos por clase — {MESES_LARGO[balance.mes]} {balance.anio}
                                </h2>
                            </div>
                            <div className="font-mono text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                {balance.clases.length} clases
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-[14px]">
                                <thead>
                                    <tr style={{ background: 'var(--paper-tinted)' }}>
                                        <th className="kicker px-5 py-3" style={{ background: 'var(--paper-tinted)' }}>Clase</th>
                                        <th className="kicker px-5 py-3" style={{ background: 'var(--paper-tinted)' }}>Nombre</th>
                                        <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Débito</th>
                                        <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Crédito</th>
                                        <th className="kicker px-5 py-3 text-right" style={{ background: 'var(--paper-tinted)' }}>Saldo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {balance.clases.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-16 text-center">
                                                <div
                                                    className="font-display text-[2.5rem]"
                                                    style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                                >
                                                    —
                                                </div>
                                                <div className="kicker mt-2">Sin movimientos en el periodo</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        balance.clases.map((c, idx) => {
                                            const meta = CLASE_GLYPH[c.codigo] || { roman: c.codigo, tone: 'var(--ink-soft)' };
                                            return (
                                                <tr
                                                    key={c.codigo}
                                                    style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                                    className="transition-colors hover:bg-canvas"
                                                >
                                                    <td className="px-5 py-4">
                                                        <span
                                                            className="font-display-wonk text-[1.2rem]"
                                                            style={{ color: meta.tone }}
                                                        >
                                                            {meta.roman}
                                                        </span>
                                                        <span className="font-mono text-[11px] ml-2" style={{ color: 'var(--ink-faint)' }}>
                                                            {c.codigo}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4 font-medium">{c.nombre}</td>
                                                    <td className="px-5 py-4 text-right font-mono text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                                                        {formatCOP(Number(c.total_debito))}
                                                    </td>
                                                    <td className="px-5 py-4 text-right font-mono text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                                                        {formatCOP(Number(c.total_credito))}
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <span className="numeral text-[1.05rem]">
                                                            {formatCOP(Number(c.saldo))}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
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
