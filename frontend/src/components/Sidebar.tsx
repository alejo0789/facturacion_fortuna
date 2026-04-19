import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import EmpresaSelector from './EmpresaSelector';

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

const navItems = [
    {
        to: '/app',
        end: true,
        label: 'Dashboard',
        icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
        color: 'from-indigo-500 to-purple-600',
    },
    {
        to: '/app/contratos',
        label: 'Contratos',
        icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        color: 'from-blue-500 to-blue-600',
    },
    {
        to: '/app/facturas',
        label: 'Facturas',
        icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
        color: 'from-emerald-500 to-emerald-600',
    },
    {
        to: '/app/pagos',
        label: 'Pagos',
        icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
        color: 'from-teal-500 to-teal-600',
    },
    {
        to: '/app/asistente-buscador',
        label: 'Buscador',
        icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
        color: 'from-cyan-500 to-cyan-600',
    },
    {
        to: '/app/oficinas',
        label: 'Oficinas',
        icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
        color: 'from-violet-500 to-violet-600',
    },
    {
        to: '/app/proveedores',
        label: 'Proveedores',
        icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
        color: 'from-amber-500 to-amber-600',
    },
    {
        to: '/app/reportes',
        label: 'Reportes',
        icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
        color: 'from-rose-500 to-rose-600',
    },
    {
        to: '/app/puc',
        label: 'PUC',
        icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
        color: 'from-indigo-500 to-indigo-600',
    },
    {
        to: '/app/asientos',
        label: 'Asientos',
        icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
        color: 'from-sky-500 to-sky-600',
    },
    {
        to: '/app/libro-mayor',
        label: 'Libro Mayor',
        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
        color: 'from-cyan-500 to-cyan-600',
    },
    {
        to: '/app/balance',
        label: 'Balance',
        icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3',
        color: 'from-emerald-500 to-emerald-600',
    },
    {
        to: '/app/impuestos',
        label: 'Impuestos',
        icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
        color: 'from-amber-500 to-orange-600',
    },
    {
        to: '/app/cuentas-bancarias',
        label: 'Bancos',
        icon: 'M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm3 10h.01M13 16h3',
        color: 'from-sky-500 to-blue-600',
    },
    {
        to: '/app/conciliacion',
        label: 'Conciliación',
        icon: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4',
        color: 'from-teal-500 to-cyan-600',
    },
    {
        to: '/app/medios-magneticos',
        label: 'DIAN',
        icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        color: 'from-red-500 to-rose-600',
    },
    {
        to: '/app/mi-equipo',
        label: 'Mi equipo',
        icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
        color: 'from-fuchsia-500 to-pink-600',
    },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    return (
        <aside className={`min-h-screen fixed left-0 top-0 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 border-r border-slate-700/50 shadow-2xl transition-all duration-300 z-50 flex flex-col ${collapsed ? 'w-16' : 'w-64'}`}>
            {/* Logo Section */}
            <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
                <div className={`flex items-center gap-2 ${collapsed ? 'hidden' : ''}`}>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-white leading-tight">Fortuna SaaS</h1>
                        <p className="text-[10px] text-slate-400">Facturación + Contabilidad</p>
                    </div>
                </div>
                <button
                    onClick={onToggle}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title={collapsed ? 'Expandir' : 'Colapsar'}
                >
                    <svg className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {/* Navigation */}
            <nav className="p-2 flex-1 overflow-y-auto">
                {!collapsed && (
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Menú</div>
                )}
                <ul className="space-y-1">
                    {navItems.map(item => {
                        const isActive = item.end
                            ? location.pathname === item.to
                            : location.pathname.startsWith(item.to);
                        const isHovered = hoveredItem === item.to;
                        return (
                            <li key={item.to}>
                                <NavLink
                                    to={item.to}
                                    end={item.end}
                                    onMouseEnter={() => setHoveredItem(item.to)}
                                    onMouseLeave={() => setHoveredItem(null)}
                                    className={`group relative flex items-center gap-2 px-2 py-2 rounded-lg transition-all duration-200 overflow-hidden ${isActive
                                            ? `bg-gradient-to-r ${item.color} text-white shadow-lg`
                                            : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                                        }`}
                                    title={collapsed ? item.label : undefined}
                                >
                                    <div className={`relative z-10 w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${isActive
                                            ? 'bg-white/20'
                                            : 'bg-slate-800 group-hover:bg-slate-700 border border-slate-700 group-hover:border-slate-600'
                                        }`}
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                                        </svg>
                                    </div>
                                    {!collapsed && (
                                        <div className="relative z-10 flex-1 min-w-0">
                                            <div className={`font-medium text-sm truncate ${isActive ? 'text-white' : ''}`}>{item.label}</div>
                                        </div>
                                    )}
                                    {!isActive && isHovered && (
                                        <div className={`absolute inset-0 bg-gradient-to-r ${item.color} opacity-10 rounded-lg`} />
                                    )}
                                </NavLink>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* Bottom: Empresa selector + user */}
            <div className="p-2 border-t border-slate-700/50 bg-slate-900/50 space-y-2">
                {!collapsed && (
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">
                        Empresa activa
                    </div>
                )}
                <EmpresaSelector collapsed={collapsed} />

                {!collapsed && user && (
                    <div className="flex items-center gap-2 px-2 py-2 bg-slate-800/40 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                            {user.nombre.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-white truncate">{user.nombre}</div>
                            <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                        </div>
                        <button
                            onClick={handleLogout}
                            title="Cerrar sesión"
                            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                )}
                {collapsed && user && (
                    <button
                        onClick={handleLogout}
                        title="Cerrar sesión"
                        className="w-full p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition flex items-center justify-center"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                )}
            </div>
        </aside>
    );
}
