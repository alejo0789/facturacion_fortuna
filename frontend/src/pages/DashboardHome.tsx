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
    Legend
} from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

const COLORS = {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    success: '#10b981',
    warning: '#f59e0b',
};

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
};

// Formato compacto para cards (ej: $412M)
const formatCompact = (value: number) => {
    if (value >= 1000000000) {
        return `$${(value / 1000000000).toFixed(1)}B`;
    } else if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
        return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toLocaleString()}`;
};

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    gradient: string;
    trend?: { value: number; isPositive: boolean };
}

function StatCard({ title, value, subtitle, icon, gradient, trend }: StatCardProps) {
    return (
        <div className={`relative overflow-hidden rounded-xl p-3 lg:p-4 ${gradient} text-white shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.01]`}>
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10"></div>
            <div className="relative z-10">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] lg:text-xs font-medium text-white/80 truncate">{title}</p>
                        <p className="mt-0.5 lg:mt-1 text-lg lg:text-xl font-bold tracking-tight">{value}</p>
                        {subtitle && <p className="text-[10px] lg:text-xs text-white/70">{subtitle}</p>}
                        {trend && (
                            <div className={`mt-1 inline-flex items-center text-[10px] lg:text-xs ${trend.isPositive ? 'text-emerald-200' : 'text-red-200'}`}>
                                <span className="mr-0.5">{trend.isPositive ? '↑' : '↓'}</span>
                                {Math.abs(trend.value).toFixed(0)}%
                            </div>
                        )}
                    </div>
                    <div className="rounded-lg bg-white/20 p-1.5 lg:p-2 flex-shrink-0">
                        <div className="h-4 w-4 lg:h-5 lg:w-5 [&>svg]:h-full [&>svg]:w-full">{icon}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-xl bg-slate-900/95 p-4 shadow-xl border border-slate-700">
                <p className="text-sm font-medium text-slate-300">{label}</p>
                <p className="mt-1 text-lg font-bold text-white">{formatCurrency(payload[0].value)}</p>
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

    // Calcular métricas mensuales
    const getCurrentMonthData = () => {
        if (!estadisticas?.facturacion_mensual) return { current: 0, previous: 0, trend: 0 };
        const current = estadisticas.facturacion_mensual.find(m => m.mes === selectedMonth)?.valor || 0;
        const previous = estadisticas.facturacion_mensual.find(m => m.mes === selectedMonth - 1)?.valor || 0;
        const trend = previous > 0 ? ((current - previous) / previous) * 100 : 0;
        return { current, previous, trend };
    };

    // Datos para gráfico comparativo de últimos 3 meses
    const getLast3MonthsData = () => {
        if (!estadisticas?.facturacion_mensual) return [];
        const months = [];
        for (let i = 2; i >= 0; i--) {
            const mes = selectedMonth - i;
            if (mes > 0) {
                const data = estadisticas.facturacion_mensual.find(m => m.mes === mes);
                months.push({
                    mes: MESES[mes],
                    valor: data?.valor || 0,
                });
            }
        }
        return months;
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const statsRes = await fetch(`${API_URL}/reportes/estadisticas?año=${selectedYear}`);
                if (statsRes.ok) {
                    setEstadisticas(await statsRes.json());
                }

                const invoicesRes = await fetch(`${API_URL}/facturas/?limit=5&skip=0`);
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
                        estado: inv.estado || 'PENDIENTE'
                    })));
                }
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedYear]);

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
            </div>
        );
    }

    const monthData = getCurrentMonthData();
    const last3Months = getLast3MonthsData();

    return (
        <div className="space-y-4 lg:space-y-6 xl:space-y-8">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-indigo-800 to-purple-900 bg-clip-text text-transparent">
                        Dashboard
                    </h1>
                    <p className="mt-2 text-lg text-slate-500">Resumen de facturación - {MESES[selectedMonth]} {selectedYear}</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        className="rounded-xl border-0 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500"
                    >
                        {MESES.slice(1).map((mes, i) => (
                            <option key={i + 1} value={i + 1}>{mes}</option>
                        ))}
                    </select>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="rounded-xl border-0 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500"
                    >
                        {[2024, 2025, 2026].map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Stat Cards - Información del MES actual */}
            <div className="grid gap-3 md:gap-4 lg:gap-5 grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title={`Facturado ${MESES[selectedMonth]}`}
                    value={formatCurrency(monthData.current)}
                    subtitle="Mes actual"
                    gradient="bg-gradient-to-br from-indigo-500 to-purple-600"
                    trend={monthData.previous > 0 ? { value: monthData.trend, isPositive: monthData.trend >= 0 } : undefined}
                    icon={<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <StatCard
                    title="Acumulado Año"
                    value={formatCurrency(estadisticas?.resumen.total_facturado || 0)}
                    subtitle={`${selectedYear}`}
                    gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
                    icon={<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                />
                <StatCard
                    title="Facturas"
                    value={estadisticas?.resumen.total_facturas || 0}
                    subtitle="Procesadas"
                    gradient="bg-gradient-to-br from-amber-500 to-orange-600"
                    icon={<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                />
                <StatCard
                    title="Contratos"
                    value={estadisticas?.resumen.contratos_activos || 0}
                    subtitle="Activos"
                    gradient="bg-gradient-to-br from-pink-500 to-rose-600"
                    icon={<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
                />
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 lg:gap-5 xl:gap-6 lg:grid-cols-3">
                {/* Monthly Invoice Chart */}
                <div className="lg:col-span-2 rounded-xl lg:rounded-2xl bg-white p-4 lg:p-5 xl:p-6 shadow-lg lg:shadow-xl ring-1 ring-slate-100">
                    <div className="mb-3 lg:mb-4 xl:mb-6">
                        <h2 className="text-base lg:text-lg xl:text-xl font-bold text-slate-800">Facturación Mensual {selectedYear}</h2>
                        <p className="text-xs lg:text-sm text-slate-500">Evolución durante el año</p>
                    </div>
                    <div className="h-48 lg:h-60 xl:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={estadisticas?.facturacion_mensual || []}>
                                <defs>
                                    <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="nombre" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} tickLine={false} axisLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="valor" stroke={COLORS.primary} strokeWidth={3} fillOpacity={1} fill="url(#colorValor)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Comparativo últimos 3 meses */}
                <div className="rounded-xl lg:rounded-2xl bg-white p-4 lg:p-5 xl:p-6 shadow-lg lg:shadow-xl ring-1 ring-slate-100">
                    <div className="mb-3 lg:mb-4">
                        <h2 className="text-base lg:text-lg xl:text-xl font-bold text-slate-800">Últimos 3 Meses</h2>
                        <p className="text-xs lg:text-sm text-slate-500">Comparación de facturación</p>
                    </div>
                    <div className="h-44 lg:h-56 xl:h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={last3Months}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} tickLine={false} axisLine={false} />
                                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }} />
                                <Legend />
                                <Bar dataKey="valor" name="Facturado" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid gap-4 lg:gap-5 xl:gap-6 lg:grid-cols-2">
                {/* Top Providers */}
                <div className="rounded-xl lg:rounded-2xl bg-white p-4 lg:p-5 xl:p-6 shadow-lg lg:shadow-xl ring-1 ring-slate-100">
                    <h2 className="text-base lg:text-lg xl:text-xl font-bold text-slate-800 mb-3 lg:mb-4 xl:mb-6">Top 5 Proveedores</h2>
                    <div className="h-52 lg:h-60 xl:h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={estadisticas?.top_proveedores || []} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={true} vertical={false} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11, fill: '#64748b' }} width={120} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }} />
                                <Bar dataKey="total" fill={COLORS.primary} radius={[0, 8, 8, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Recent Invoices */}
                <div className="rounded-xl lg:rounded-2xl bg-white p-4 lg:p-5 xl:p-6 shadow-lg lg:shadow-xl ring-1 ring-slate-100">
                    <div className="mb-3 lg:mb-4 xl:mb-6 flex items-center justify-between">
                        <h2 className="text-base lg:text-lg xl:text-xl font-bold text-slate-800">Facturas Recientes</h2>
                        <a href="/facturas" className="text-xs lg:text-sm font-medium text-indigo-600 hover:text-indigo-700">Ver todas →</a>
                    </div>
                    <div className="space-y-4">
                        {recentInvoices.length === 0 ? (
                            <div className="flex h-48 items-center justify-center text-slate-400">No hay facturas recientes</div>
                        ) : (
                            recentInvoices.map((invoice) => (
                                <div key={invoice.id} className="flex items-center justify-between rounded-lg lg:rounded-xl border border-slate-100 p-2.5 lg:p-3 xl:p-4 hover:border-indigo-200 hover:shadow-md transition-all">
                                    <div className="flex items-center gap-2 lg:gap-3 xl:gap-4">
                                        <div className="flex h-9 w-9 lg:h-10 lg:w-10 xl:h-12 xl:w-12 items-center justify-center rounded-lg xl:rounded-xl bg-slate-100">
                                            <svg className="h-6 w-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-800">{invoice.numero_factura}</p>
                                            <p className="text-sm text-slate-500">{invoice.proveedor_nombre}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-slate-900">{formatCurrency(invoice.valor)}</p>
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${invoice.estado === 'PAGADA' ? 'bg-emerald-100 text-emerald-700'
                                            : invoice.estado === 'ASIGNADA' ? 'bg-blue-100 text-blue-700'
                                                : 'bg-amber-100 text-amber-700'
                                            }`}>
                                            {invoice.estado}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl lg:rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-900 to-purple-900 p-4 lg:p-6 xl:p-8 shadow-lg lg:shadow-xl">
                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Acciones Rápidas</h2>
                        <p className="mt-2 text-slate-300">Accede rápidamente a las secciones más utilizadas.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <a href="/facturas" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg hover:scale-105 transition-all">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            Nueva Factura
                        </a>
                        <a href="/reportes" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-all">
                            Ver Reportes
                        </a>
                        <a href="/contratos" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-all">
                            Contratos
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
