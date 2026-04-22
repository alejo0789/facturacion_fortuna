import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

const navItems = [
    {
        to: '/',
        label: 'Dashboard',
        description: 'Resumen y estadísticas',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        ),
        color: 'from-indigo-500 to-purple-600'
    },
    {
        to: '/contratos',
        label: 'Contratos',
        description: 'Gestión de contratos',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ),
        color: 'from-blue-500 to-blue-600'
    },
    {
        to: '/facturas',
        label: 'Facturas',
        description: 'Control de facturas',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
        ),
        color: 'from-emerald-500 to-emerald-600'
    },
    {
        to: '/pagos',
        label: 'Pagos',
        description: 'Programación de pagos',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
        ),
        color: 'from-teal-500 to-teal-600'
    },
    {
        to: '/asistente-buscador',
        label: 'Buscador',
        description: 'Buscador inteligente',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
        ),
        color: 'from-cyan-500 to-cyan-600'
    },
    {
        to: '/oficinas',
        label: 'Oficinas',
        description: 'Puntos de servicio',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
        ),
        color: 'from-violet-500 to-violet-600'
    },
    {
        to: '/proveedores',
        label: 'Proveedores',
        description: 'Empresas aliadas',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
        ),
        color: 'from-amber-500 to-amber-600'
    },
    {
        to: '/reportes',
        label: 'Reportes',
        description: 'Análisis y exports',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
        ),
        color: 'from-rose-500 to-rose-600'
    },

];

// Admin items - only shown to super admins
const adminItems = [
    {
        to: '/admin/categorias',
        label: 'Categorías',
        description: 'Administrar categorías',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
        ),
        color: 'from-cyan-500 to-cyan-600'
    },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const location = useLocation();
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);
    const { user, isSuperAdmin, isAuthenticated, rolNombre } = useAuth();

    // Get user display name
    const userObj = user?.usuario || user;
    const userName = userObj
        ? (userObj.name || `${userObj.primer_nombre || ''} ${userObj.primer_apellido || ''}`.trim() || 'Usuario')
        : 'Usuario';
    const userRole = rolNombre || (isSuperAdmin ? 'Super Admin' : 'Usuario');

    const renderNavItem = (item: typeof navItems[0]) => {
        const isActive = location.pathname === item.to;
        const isHovered = hoveredItem === item.to;

        return (
            <li key={item.to}>
                <NavLink
                    to={item.to}
                    onMouseEnter={() => setHoveredItem(item.to)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={`group relative flex items-center gap-2 px-2 py-2 rounded-lg transition-all duration-200 overflow-hidden
                        ${isActive
                            ? `bg-gradient-to-r ${item.color} text-white shadow-lg`
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                        }`
                    }
                    title={collapsed ? item.label : undefined}
                >
                    {/* Icon container */}
                    <div className={`relative z-10 w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-all
                        ${isActive
                            ? 'bg-white/20'
                            : 'bg-slate-800 group-hover:bg-slate-700 border border-slate-700 group-hover:border-slate-600'
                        }`}
                    >
                        {item.icon}
                    </div>

                    {/* Text content - hidden when collapsed */}
                    {!collapsed && (
                        <div className="relative z-10 flex-1 min-w-0">
                            <div className={`font-medium text-sm truncate ${isActive ? 'text-white' : ''}`}>
                                {item.label}
                            </div>
                        </div>
                    )}

                    {/* Hover glow effect */}
                    {!isActive && isHovered && (
                        <div className={`absolute inset-0 bg-gradient-to-r ${item.color} opacity-10 rounded-lg`} />
                    )}
                </NavLink>
            </li>
        );
    };

    return (
        <aside className={`min-h-screen fixed left-0 top-0 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 border-r border-slate-700/50 shadow-2xl transition-all duration-300 z-50 ${collapsed ? 'w-16' : 'w-64'}`}>
            {/* Logo Section */}
            <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
                <div className={`flex items-center gap-2 ${collapsed ? 'hidden' : ''}`}>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-white leading-tight">Facturación Céntrica</h1>
                        <p className="text-[10px] text-slate-400">Control de Proveedores</p>
                    </div>
                </div>
                <button
                    onClick={onToggle}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
                >
                    <svg className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {/* Navigation */}
            <nav className="p-2">
                <ul className="space-y-1 mb-4">
                    <li>
                        <a
                            href="https://saman.lafortuna.com.co/#/home"
                            className={`group relative flex items-center gap-2 px-2 py-2 rounded-lg transition-all duration-200 overflow-hidden text-slate-300 hover:text-white hover:bg-slate-800/80`}
                            title={collapsed ? 'Volver a Céntrica' : undefined}
                        >
                            <div className="relative z-10 w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-slate-800 group-hover:bg-slate-700 border border-slate-700 group-hover:border-slate-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                                </svg>
                            </div>
                            {!collapsed && (
                                <div className="relative z-10 flex-1 min-w-0">
                                    <div className="font-bold text-sm tracking-wide">CÉNTRICA</div>
                                </div>
                            )}
                        </a>
                    </li>
                </ul>

                {!collapsed && (
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                        Menú
                    </div>
                )}
                <ul className="space-y-1">
                    {navItems.map(renderNavItem)}
                </ul>

                {/* Admin Section - Only for Super Admins */}
                {isSuperAdmin && (
                    <>
                        {!collapsed && (
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2 px-2">
                                Administración
                            </div>
                        )}
                        <ul className="space-y-1">
                            {adminItems.map(renderNavItem)}
                        </ul>
                    </>
                )}
            </nav>

            {/* Bottom Section - User Info */}
            {!collapsed && (
                <div className="absolute bottom-0 left-0 right-0 p-2 border-t border-slate-700/50 bg-slate-900/50">
                    <div className="flex items-center gap-2 px-2 py-1">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                            {isSuperAdmin ? (
                                <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-white truncate">{userName}</div>
                            <div className="text-[10px] text-slate-500 truncate">{userRole}</div>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-slate-500'} animate-pulse`} />
                    </div>
                </div>
            )}
        </aside>
    );
}

