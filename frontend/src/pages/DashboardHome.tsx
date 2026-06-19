import { useEffect, useState } from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Legend,
    LineChart,
    Line,
} from 'recharts';
import { apiGet } from '../utils/apiClient';
import type { Balance } from '../types/contabilidad';

import { apiFetch } from '../utils/apiClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const authFetch = (url: string, options?: RequestInit): Promise<Response> => {
    const endpoint = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
    return apiFetch(endpoint, options as never);
};

interface Estadisticas {
    año: number;
    resumen: {
        total_facturado: number;
        total_facturas: number;
        proveedores_facturados: number;
        contratos_activos: number;
    };
    facturacion_mensual: Array<{
        mes: number;
        nombre: string;
        valor: number;
    }>;
    top_proveedores: Array<{
        id: number;
        nombre: string;
        total: number;
    }>;
}

interface RecentInvoice {
    id: number;
    numero_factura: string;
    proveedor_nombre: string;
    valor: number;
    fecha: string;
    estado: string;
}

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
};

const formatCompact = (value: number) => {
    if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
};

interface UtilidadMes {
    mes: number;
    nombre: string;
    utilidad: number;
    ingresos: number;
    gastos: number;
}

/* ──────────────────────────────────────────────────────────
   Editorial KPI — number as pull-quote
   ────────────────────────────────────────────────────────── */
function EditorialKPI({
    label,
    sublabel,
    value,
    secondary,
    tone = 'ink',
    trend,
}: {
    label: string;
    sublabel?: string;
    value: string;
    secondary?: string;
    tone?: 'ink' | 'positive' | 'negative' | 'accent';
    trend?: { value: number; isPositive: boolean };
}) {
    const toneColor =
        tone === 'positive' ? 'var(--positive)' :
        tone === 'negative' ? 'var(--negative)' :
        tone === 'accent' ? 'var(--accent)' :
        'var(--ink)';

    return (
        <div className="surface p-6 transition-all duration-200 hover:-translate-y-px"
            style={{ minHeight: '160px' }}
        >
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="kicker">{label}</div>
                    {sublabel && (
                        <div className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                            {sublabel}
                        </div>
                    )}
                </div>
                {trend && (
                    <span
                        className="font-mono text-[11px] font-semibold"
                        style={{ color: trend.isPositive ? 'var(--positive)' : 'var(--negative)' }}
                    >
                        {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value).toFixed(0)}%
                    </span>
                )}
            </div>
            <div className="numeral text-[2.4rem] leading-none" style={{ color: toneColor }}>
                {value}
            </div>
            {secondary && (
                <div className="kicker mt-3" style={{ color: 'var(--ink-faint)' }}>
                    {secondary}
                </div>
            )}
        </div>
    );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
    if (active && payload && payload.length) {
        return (
            <div
                className="rounded-lg px-4 py-3 shadow-2xl"
                style={{
                    background: 'var(--ink)',
                    border: '1px solid var(--ink)',
                    color: 'var(--paper)',
                }}
            >
                <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {label}
                </div>
                <div className="numeral text-[1.4rem] mt-1" style={{ color: 'var(--paper)' }}>
                    {formatCurrency(payload[0].value)}
                </div>
            </div>
        );
    }
    return null;
}

export default function DashboardHome() {
    const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
    const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [oficinas, setOficinas] = useState<Array<{ id: number; cod_oficina?: string; nombre?: string; ciudad?: string }>>([]);
    const [selectedOficina, setSelectedOficina] = useState<number | null>(null);
    const [oficinaSearch, setOficinaSearch] = useState('');
    const [showOficinaDropdown, setShowOficinaDropdown] = useState(false);

    const [balanceActual, setBalanceActual] = useState<Balance | null>(null);
    const [utilidadAnual, setUtilidadAnual] = useState<UtilidadMes[]>([]);
    const [contableLoaded, setContableLoaded] = useState(false);

    const ytdIngresos = utilidadAnual.reduce((s, m) => s + m.ingresos, 0);
    const ytdGastos = utilidadAnual.reduce((s, m) => s + m.gastos, 0);
    const ytdUtilidad = ytdIngresos - ytdGastos;
    const utilidadMesActual = balanceActual ? parseFloat(balanceActual.utilidad_neta || '0') : 0;
    const ingresosMesActual = balanceActual ? parseFloat(balanceActual.total_ingresos || '0') : 0;
    const gastosMesActual = balanceActual
        ? parseFloat(balanceActual.total_gastos || '0') + parseFloat(balanceActual.total_costos || '0')
        : 0;

    const hayDatosContables = contableLoaded && (
        utilidadAnual.some(m => m.ingresos > 0 || m.gastos > 0) ||
        ingresosMesActual > 0 || gastosMesActual > 0
    );

    const getCurrentMonthData = () => {
        if (!estadisticas?.facturacion_mensual) return { current: 0, previous: 0, trend: 0 };
        const current = estadisticas.facturacion_mensual.find(m => m.mes === selectedMonth)?.valor || 0;
        const previous = estadisticas.facturacion_mensual.find(m => m.mes === selectedMonth - 1)?.valor || 0;
        const trend = previous > 0 ? ((current - previous) / previous) * 100 : 0;
        return { current, previous, trend };
    };

    const getLast3MonthsData = () => {
        if (!estadisticas?.facturacion_mensual) return [];
        const months = [];
        for (let i = 2; i >= 0; i--) {
            const mes = selectedMonth - i;
            if (mes > 0) {
                const data = estadisticas.facturacion_mensual.find(m => m.mes === mes);
                months.push({ mes: MESES[mes], valor: data?.valor || 0 });
            }
        }
        return months;
    };

    useEffect(() => {
        authFetch(`${API_URL}/reportes/filtros`)
            .then(r => r.json())
            .then(data => {
                if (data.oficinas) setOficinas(data.oficinas);
            })
            .catch(err => console.error('Error loading oficinas:', err));
    }, []);

    useEffect(() => {
        let cancelled = false;
        async function loadContable() {
            setContableLoaded(false);
            try {
                const balancePromise = apiGet<Balance>('/contabilidad/balance', {
                    anio: selectedYear,
                    mes: selectedMonth,
                }).catch(() => null);

                const anualPromises = Array.from({ length: 12 }, (_, i) =>
                    apiGet<Balance>('/contabilidad/balance', {
                        anio: selectedYear,
                        mes: i + 1,
                    }).catch(() => null)
                );

                const [balance, ...anual] = await Promise.all([balancePromise, ...anualPromises]);
                if (cancelled) return;

                setBalanceActual(balance);
                setUtilidadAnual(
                    anual.map((b, i) => {
                        const ingresos = b ? parseFloat(b.total_ingresos || '0') : 0;
                        const gastos = b
                            ? parseFloat(b.total_gastos || '0') + parseFloat(b.total_costos || '0')
                            : 0;
                        return {
                            mes: i + 1,
                            nombre: MESES[i + 1],
                            ingresos,
                            gastos,
                            utilidad: ingresos - gastos,
                        };
                    })
                );
            } catch (err) {
                if (!cancelled) {
                    console.warn('No se pudo cargar balance contable:', err);
                    setBalanceActual(null);
                    setUtilidadAnual([]);
                }
            } finally {
                if (!cancelled) setContableLoaded(true);
            }
        }
        loadContable();
        return () => { cancelled = true; };
    }, [selectedYear, selectedMonth]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                let statsUrl = `${API_URL}/reportes/estadisticas?año=${selectedYear}`;
                if (selectedOficina) statsUrl += `&oficina_id=${selectedOficina}`;
                const statsRes = await fetch(statsUrl);
                if (statsRes.ok) setEstadisticas(await statsRes.json());

                const invoicesRes = await authFetch(`${API_URL}/facturas/?limit=5&skip=0`);
                if (invoicesRes.ok) {
                    const invoices = await invoicesRes.json();
                    setRecentInvoices(invoices.map((inv: {
                        id: number;
                        numero_factura?: string;
                        proveedor?: { nombre: string };
                        valor?: number;
                        fecha_factura?: string;
                        created_at?: string;
                        estado?: string;
                    }) => ({
                        id: inv.id,
                        numero_factura: inv.numero_factura || 'Sin número',
                        proveedor_nombre: inv.proveedor?.nombre || 'Sin proveedor',
                        valor: inv.valor || 0,
                        fecha: inv.fecha_factura || inv.created_at || '',
                        estado: inv.estado || 'PENDIENTE',
                    })));
                }
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedYear, selectedOficina]);

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="text-center">
                    <div
                        className="h-12 w-12 mx-auto rounded-full border-2 border-t-transparent"
                        style={{
                            borderColor: 'var(--accent)',
                            borderTopColor: 'transparent',
                            animation: 'spin-soft 800ms linear infinite',
                        }}
                    />
                    <div className="kicker mt-4">Cargando libros</div>
                </div>
            </div>
        );
    }

    const monthData = getCurrentMonthData();
    const last3Months = getLast3MonthsData();
    const heroValue = monthData.current;

    return (
        <div className="space-y-12 max-w-[1480px] mx-auto">
            {/* ═══════════════════════════════════════════════════════
                HERO — Editorial masthead
                ═══════════════════════════════════════════════════════ */}
            <div className="anim-fade-up">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
                    <div>
                        <div className="eyebrow mb-4">
                            Estado del libro · {MESES_LARGO[selectedMonth]} {selectedYear}
                        </div>
                        <h1 className="editorial-title text-[3.5rem] lg:text-[4.5rem]">
                            Tablero <em>contable</em>.
                        </h1>
                    </div>

                    {/* Compact toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <input
                                type="text"
                                className="input-field text-[13px] w-52"
                                placeholder="Filtrar por oficina…"
                                value={selectedOficina
                                    ? oficinas.find(o => o.id === selectedOficina)?.nombre || ''
                                    : oficinaSearch
                                }
                                onChange={(e) => {
                                    setOficinaSearch(e.target.value);
                                    if (selectedOficina) setSelectedOficina(null);
                                }}
                                onFocus={() => setShowOficinaDropdown(true)}
                                onBlur={() => setTimeout(() => setShowOficinaDropdown(false), 200)}
                            />
                            {selectedOficina && (
                                <button
                                    className="absolute right-2 top-1/2 -translate-y-1/2"
                                    style={{ color: 'var(--ink-faint)' }}
                                    onClick={() => { setSelectedOficina(null); setOficinaSearch(''); }}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                            {showOficinaDropdown && !selectedOficina && (
                                <div className="absolute z-20 mt-1 w-full surface-raised max-h-48 overflow-y-auto py-1">
                                    <button
                                        className="w-full px-3 py-2 text-left text-[13px] hover:bg-canvas-2 transition-colors"
                                        style={{ color: 'var(--ink-faint)' }}
                                        onClick={() => { setSelectedOficina(null); setShowOficinaDropdown(false); setOficinaSearch(''); }}
                                    >
                                        Todas las oficinas
                                    </button>
                                    {oficinas
                                        .filter(o => {
                                            const search = oficinaSearch.toLowerCase();
                                            return !search ||
                                                (o.nombre || '').toLowerCase().includes(search) ||
                                                (o.cod_oficina || '').toLowerCase().includes(search) ||
                                                (o.ciudad || '').toLowerCase().includes(search);
                                        })
                                        .slice(0, 10)
                                        .map(o => (
                                            <button
                                                key={o.id}
                                                className="w-full px-3 py-2 text-left text-[13px] transition-colors"
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-soft)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                onClick={() => { setSelectedOficina(o.id); setShowOficinaDropdown(false); setOficinaSearch(''); }}
                                            >
                                                <span className="font-mono text-[11px] mr-2" style={{ color: 'var(--accent)' }}>
                                                    {o.cod_oficina}
                                                </span>
                                                <span>{o.nombre}</span>
                                                {o.ciudad && (
                                                    <span className="ml-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                                        — {o.ciudad}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            className="input-field text-[13px] w-32"
                        >
                            {MESES.slice(1).map((mes, i) => (
                                <option key={i + 1} value={i + 1}>{mes}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="input-field text-[13px] w-24"
                        >
                            {[2024, 2025, 2026].map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* HERO PULL-QUOTE — facturación mensual */}
                <div className="ledger paper-grain p-8 lg:p-12 relative">
                    <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-end">
                        <div className="lg:col-span-7">
                            <div className="kicker-accent mb-3">Facturación de {MESES_LARGO[selectedMonth]}</div>
                            <div
                                className="numeral leading-none"
                                style={{ fontSize: 'clamp(3.5rem, 7vw, 6.5rem)' }}
                            >
                                {formatCurrency(heroValue)}
                            </div>
                            <div className="flex items-center gap-6 mt-6">
                                {monthData.previous > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="font-mono text-[14px] font-semibold"
                                            style={{ color: monthData.trend >= 0 ? 'var(--positive)' : 'var(--negative)' }}
                                        >
                                            {monthData.trend >= 0 ? '↑' : '↓'} {Math.abs(monthData.trend).toFixed(1)}%
                                        </span>
                                        <span className="kicker">vs. mes anterior</span>
                                    </div>
                                )}
                                <div className="kicker">
                                    Mes en curso · {selectedYear}
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-5 lg:border-l lg:pl-8" style={{ borderColor: 'var(--rule)' }}>
                            <div className="grid grid-cols-3 gap-6">
                                <div>
                                    <div className="kicker mb-1">Año</div>
                                    <div className="numeral text-[1.6rem] numeral-mute">
                                        {formatCompact(estadisticas?.resumen.total_facturado || 0)}
                                    </div>
                                </div>
                                <div>
                                    <div className="kicker mb-1">Facturas</div>
                                    <div className="numeral text-[1.6rem] numeral-mute">
                                        {estadisticas?.resumen.total_facturas || 0}
                                    </div>
                                </div>
                                <div>
                                    <div className="kicker mb-1">Contratos</div>
                                    <div className="numeral text-[1.6rem] numeral-mute">
                                        {estadisticas?.resumen.contratos_activos || 0}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════
                CONTABLE — Sólo si hay datos
                ═══════════════════════════════════════════════════════ */}
            {hayDatosContables && (
                <section>
                    <div className="flex items-end justify-between mb-6">
                        <div>
                            <div className="eyebrow mb-3">Resumen contable</div>
                            <h2 className="editorial-title text-[2rem]">
                                Movimientos <em>aprobados</em>.
                            </h2>
                            <p className="text-[13px] mt-2" style={{ color: 'var(--ink-faint)' }}>
                                Causación y pagos del periodo — {MESES_LARGO[selectedMonth]} {selectedYear}
                            </p>
                        </div>
                        <a
                            href="/app/balance"
                            className="kicker-accent hover:underline whitespace-nowrap"
                        >
                            Balance completo →
                        </a>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 anim-stagger">
                        <EditorialKPI
                            label={`Utilidad ${MESES[selectedMonth]}`}
                            sublabel={utilidadMesActual >= 0 ? 'Ganancia' : 'Pérdida'}
                            value={formatCompact(utilidadMesActual)}
                            secondary={formatCurrency(utilidadMesActual)}
                            tone={utilidadMesActual >= 0 ? 'positive' : 'negative'}
                        />
                        <EditorialKPI
                            label="Ingresos del mes"
                            sublabel="Clase 4"
                            value={formatCompact(ingresosMesActual)}
                            secondary={formatCurrency(ingresosMesActual)}
                            tone="accent"
                        />
                        <EditorialKPI
                            label="Gastos + costos"
                            sublabel="Clases 5 y 6"
                            value={formatCompact(gastosMesActual)}
                            secondary={formatCurrency(gastosMesActual)}
                        />
                        <EditorialKPI
                            label={`Utilidad YTD ${selectedYear}`}
                            sublabel="Acumulado del año"
                            value={formatCompact(ytdUtilidad)}
                            secondary={
                                ytdIngresos > 0
                                    ? `Margen ${((ytdUtilidad / ytdIngresos) * 100).toFixed(1)}%`
                                    : undefined
                            }
                            tone={ytdUtilidad >= 0 ? 'positive' : 'negative'}
                        />
                    </div>

                    {/* Evolución mensual — large chart */}
                    <div className="surface-raised p-6 lg:p-8 mt-6">
                        <div className="flex items-baseline justify-between mb-6">
                            <div>
                                <div className="eyebrow mb-2">Evolución mensual</div>
                                <h3 className="font-display text-[1.4rem] tracking-tight">
                                    Ingresos, gastos y utilidad — {selectedYear}
                                </h3>
                            </div>
                            <div className="flex items-center gap-4 text-[11px]">
                                <span className="flex items-center gap-2">
                                    <span className="w-3 h-px" style={{ background: 'var(--accent-vivid)' }} />
                                    <span className="kicker">Ingresos</span>
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="w-3 h-px" style={{ background: 'var(--negative)' }} />
                                    <span className="kicker">Gastos</span>
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="w-3 h-[2px]" style={{ background: 'var(--positive)' }} />
                                    <span className="kicker">Utilidad</span>
                                </span>
                            </div>
                        </div>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={utilidadAnual} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                                    <XAxis
                                        dataKey="nombre"
                                        tick={{ fontSize: 11, fill: 'var(--ink-faint)', fontFamily: 'var(--font-body)' }}
                                        tickLine={false}
                                        axisLine={{ stroke: 'var(--rule)' }}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}
                                        tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ display: 'none' }} />
                                    <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="var(--accent-vivid)" strokeWidth={1.5} dot={{ r: 2, fill: 'var(--accent-vivid)' }} />
                                    <Line type="monotone" dataKey="gastos" name="Gastos" stroke="var(--negative)" strokeWidth={1.5} dot={{ r: 2, fill: 'var(--negative)' }} />
                                    <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="var(--positive)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--positive)' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>
            )}

            {/* ═══════════════════════════════════════════════════════
                Charts — facturación
                ═══════════════════════════════════════════════════════ */}
            <section>
                <div className="eyebrow mb-4">Análisis de facturación</div>
                <div className="grid lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 surface-raised p-6 lg:p-8">
                        <div className="mb-6">
                            <div className="kicker-accent">Año {selectedYear}</div>
                            <h3 className="font-display text-[1.4rem] tracking-tight mt-1">Facturación mensual</h3>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={estadisticas?.facturacion_mensual || []}>
                                    <defs>
                                        <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--accent-vivid)" stopOpacity={0.28} />
                                            <stop offset="100%" stopColor="var(--accent-vivid)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                                    <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="valor" stroke="var(--accent-vivid)" strokeWidth={2} fillOpacity={1} fill="url(#colorValor)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="surface-raised p-6 lg:p-8">
                        <div className="mb-6">
                            <div className="kicker-accent">Trimestre activo</div>
                            <h3 className="font-display text-[1.4rem] tracking-tight mt-1">Últimos 3 meses</h3>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={last3Months}>
                                    <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="valor" name="Facturado" fill="var(--ink)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════
                Bottom row — Top proveedores + facturas recientes
                ═══════════════════════════════════════════════════════ */}
            <section className="grid lg:grid-cols-2 gap-6">
                {/* Top proveedores */}
                <div className="surface-raised p-6 lg:p-8">
                    <div className="mb-6 flex items-baseline justify-between">
                        <div>
                            <div className="kicker-accent">Volumen contractado</div>
                            <h3 className="font-display text-[1.4rem] tracking-tight mt-1">Top 5 proveedores</h3>
                        </div>
                    </div>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={estadisticas?.top_proveedores || []} layout="vertical">
                                <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" horizontal={true} vertical={false} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11, fill: 'var(--ink)' }} width={140} axisLine={false} tickLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="total" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Facturas recientes — ledger-style list */}
                <div className="surface-raised p-6 lg:p-8">
                    <div className="mb-6 flex items-baseline justify-between">
                        <div>
                            <div className="kicker-accent">Últimas causaciones</div>
                            <h3 className="font-display text-[1.4rem] tracking-tight mt-1">Facturas recientes</h3>
                        </div>
                        <a href="/app/facturas" className="kicker-accent hover:underline">
                            Ver todas →
                        </a>
                    </div>
                    <div>
                        {recentInvoices.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="font-display text-[2rem]" style={{ color: 'var(--ink-mute)' }}>
                                    —
                                </div>
                                <div className="kicker mt-2">Sin facturas registradas</div>
                            </div>
                        ) : (
                            <div className="-mx-2">
                                {recentInvoices.map((invoice, idx) => (
                                    <div key={invoice.id}>
                                        {idx > 0 && <hr className="hr-ledger mx-2" />}
                                        <div
                                            className="flex items-center justify-between px-2 py-4 rounded-md transition-colors"
                                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div
                                                    className="font-display text-[1.5rem] flex-shrink-0 w-8 text-center"
                                                    style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                                >
                                                    №
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-mono text-[13px] font-medium truncate">
                                                        {invoice.numero_factura}
                                                    </div>
                                                    <div className="text-[12px] truncate" style={{ color: 'var(--ink-faint)' }}>
                                                        {invoice.proveedor_nombre}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0 ml-4">
                                                <div className="numeral text-[1.1rem]">
                                                    {formatCompact(invoice.valor)}
                                                </div>
                                                <span
                                                    className={`tag ${
                                                        invoice.estado === 'PAGADA' ? 'tag-positive' :
                                                        invoice.estado === 'ASIGNADA' ? 'tag-accent' :
                                                        'tag-gold'
                                                    } mt-1`}
                                                >
                                                    {invoice.estado}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════
                Quick actions — dark editorial banner
                ═══════════════════════════════════════════════════════ */}
            <section
                className="relative overflow-hidden rounded-2xl p-10 lg:p-14"
                style={{
                    background: 'linear-gradient(135deg, var(--ink) 0%, #1a2238 60%, #0d2f5e 100%)',
                    color: 'var(--paper)',
                }}
            >
                {/* Decorative serif glyph */}
                <div
                    aria-hidden
                    className="absolute font-display-wonk select-none pointer-events-none"
                    style={{
                        top: '-3rem',
                        right: '-3rem',
                        fontSize: '20rem',
                        lineHeight: 1,
                        color: 'rgba(255, 255, 255, 0.04)',
                        fontWeight: 300,
                    }}
                >
                    ƒ
                </div>

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
                    <div className="max-w-xl">
                        <div
                            className="eyebrow mb-4"
                            style={{ color: 'rgba(255, 255, 255, 0.6)' }}
                        >
                            Accesos rápidos
                        </div>
                        <h2
                            className="font-display text-[2.25rem] leading-tight tracking-tight"
                            style={{ fontVariationSettings: "'SOFT' 30" }}
                        >
                            Lo siguiente,
                            <em
                                style={{
                                    fontStyle: 'italic',
                                    color: 'var(--sidebar-accent)',
                                    fontVariationSettings: "'SOFT' 100, 'WONK' 1",
                                }}
                            >
                                {' '}al alcance.
                            </em>
                        </h2>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <a
                            href="/app/facturas"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[14px] font-medium transition-transform hover:-translate-y-px"
                            style={{ background: 'var(--paper)', color: 'var(--ink)' }}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Nueva factura
                        </a>
                        <a
                            href="/app/reportes"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[14px] font-medium transition-colors"
                            style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                color: 'var(--paper)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                            }}
                        >
                            Ver reportes
                        </a>
                        <a
                            href="/app/contratos"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[14px] font-medium transition-colors"
                            style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                color: 'var(--paper)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                            }}
                        >
                            Contratos
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
}
