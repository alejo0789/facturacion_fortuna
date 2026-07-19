/**
 * Sidebar — navegación principal del SaaS.
 * Estética "Ledger Modern" — leather-spine refinado con accent rail luminoso.
 */
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import EmpresaSelector from './EmpresaSelector';

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

interface NavItem {
    to: string;
    end?: boolean;
    label: string;
    icon: string;
}

interface NavGroup {
    id: string;
    label: string;
    items: NavItem[];
}

const navGroups: NavGroup[] = [
    {
        id: 'operacion',
        label: 'Operación',
        items: [
            { to: '/app', end: true, label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { to: '/app/contratos', label: 'Contratos', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { to: '/app/facturas', label: 'Facturas', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
            { to: '/app/pagos', label: 'Pagos', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
            { to: '/app/asistente-buscador', label: 'Buscador', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
        ],
    },
    {
        id: 'maestros',
        label: 'Maestros',
        items: [
            { to: '/app/proveedores', label: 'Proveedores', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
            { to: '/app/oficinas', label: 'Oficinas', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
        ],
    },
    {
        id: 'contabilidad',
        label: 'Contabilidad',
        items: [
            { to: '/app/puc', label: 'PUC', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
            { to: '/app/asientos', label: 'Asientos', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
            { to: '/app/libro-mayor', label: 'Libro Mayor', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
            { to: '/app/balance', label: 'Balance', icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3' },
            { to: '/app/impuestos', label: 'Impuestos', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
        ],
    },
    {
        id: 'bancario',
        label: 'Bancario',
        items: [
            { to: '/app/cuentas-bancarias', label: 'Cuentas Bancarias', icon: 'M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm3 10h.01M13 16h3' },
            { to: '/app/conciliacion', label: 'Conciliación', icon: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4' },
        ],
    },
    {
        id: 'fiscal',
        label: 'DIAN',
        items: [
            { to: '/app/medios-magneticos', label: 'Medios Magnéticos', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { to: '/app/conciliacion-dian', label: 'Conciliación DIAN', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
        ],
    },
    {
        id: 'analisis',
        label: 'Análisis',
        items: [
            { to: '/app/reportes', label: 'Reportes', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        ],
    },
    {
        id: 'administracion',
        label: 'Administración',
        items: [
            { to: '/app/mi-equipo', label: 'Mi equipo', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
            { to: '/app/integraciones', label: 'Integraciones', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
            { to: '/app/auditoria', label: 'Auditoría', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
            { to: '/app/seguridad', label: 'Seguridad (2FA)', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
        ],
    },
];

const LS_COLLAPSED_GROUPS = 'fortuna.sidebar.collapsedGroups';

function loadCollapsedGroups(): Set<string> {
    try {
        const raw = localStorage.getItem(LS_COLLAPSED_GROUPS);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch {
        return new Set();
    }
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsedGroups);

    useEffect(() => {
        localStorage.setItem(LS_COLLAPSED_GROUPS, JSON.stringify(Array.from(collapsedGroups)));
    }, [collapsedGroups]);

    const toggleGroup = (id: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    const activeGroupId = useMemo(() => {
        for (const g of navGroups) {
            for (const it of g.items) {
                const match = it.end
                    ? location.pathname === it.to
                    : location.pathname.startsWith(it.to);
                if (match) return g.id;
            }
        }
        return null;
    }, [location.pathname]);

    const renderItem = (item: NavItem) => {
        const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
        return (
            <li key={item.to}>
                <NavLink
                    to={item.to}
                    end={item.end}
                    className={`relative flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ${
                        isActive ? 'nav-link-active' : 'nav-link-idle'
                    }`}
                    title={collapsed ? item.label : undefined}
                >
                    <svg
                        className={`w-[18px] h-[18px] flex-shrink-0 transition-opacity ${
                            isActive ? 'opacity-100' : 'opacity-70'
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                    </svg>
                    {!collapsed && (
                        <span className={`text-[13px] tracking-tight truncate ${isActive ? 'font-medium' : 'font-normal'}`}>
                            {item.label}
                        </span>
                    )}
                    {!collapsed && isActive && (
                        <span
                            className="ml-auto text-[10px] tracking-[0.18em]"
                            style={{ color: 'var(--sidebar-accent)' }}
                        >
                            ●
                        </span>
                    )}
                </NavLink>
            </li>
        );
    };

    return (
        <aside
            className={`sidebar-shell h-screen fixed left-0 top-0 transition-all duration-300 z-50 flex flex-col ${collapsed ? 'w-16' : 'w-64'}`}
            style={{ borderRight: '1px solid var(--sidebar-rule)' }}
        >
            {/* Brand */}
            <div
                className="relative px-4 py-5 flex items-center justify-between flex-shrink-0"
                style={{ borderBottom: '1px solid var(--sidebar-rule)' }}
            >
                {!collapsed && (
                    <div className="flex items-center gap-3 relative z-10">
                        <div
                            className="w-9 h-9 rounded-md flex items-center justify-center font-display text-xl"
                            style={{
                                background: 'linear-gradient(180deg, #f6f4ee, #e8e5dc)',
                                color: 'var(--accent-deep)',
                                boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 4px 12px -4px rgba(45,108,223,0.4)',
                                fontVariationSettings: "'SOFT' 100, 'WONK' 1",
                            }}
                        >
                            ƒ
                        </div>
                        <div>
                            <div
                                className="font-display text-[15px] leading-none tracking-tight"
                                style={{ color: 'var(--sidebar-ink)', fontVariationSettings: "'SOFT' 30" }}
                            >
                                Facturación
                            </div>
                            <div
                                className="text-[9px] uppercase tracking-[0.22em] mt-1.5"
                                style={{ color: 'var(--sidebar-ink-soft)' }}
                            >
                                SaaS Contable
                            </div>
                        </div>
                    </div>
                )}
                {collapsed && (
                    <div
                        className="w-9 h-9 rounded-md flex items-center justify-center font-display text-xl mx-auto relative z-10"
                        style={{
                            background: 'linear-gradient(180deg, #f6f4ee, #e8e5dc)',
                            color: 'var(--accent-deep)',
                            fontVariationSettings: "'SOFT' 100, 'WONK' 1",
                        }}
                    >
                        ƒ
                    </div>
                )}
                <button
                    onClick={onToggle}
                    className="relative z-10 p-1.5 rounded-md transition-colors"
                    style={{ color: 'var(--sidebar-ink-soft)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--sidebar-ink)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sidebar-ink-soft)')}
                    title={collapsed ? 'Expandir' : 'Colapsar'}
                >
                    <svg
                        className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-4 sidebar-scroll relative z-10">
                {navGroups.map((group) => {
                    const isGroupCollapsed = collapsedGroups.has(group.id) && activeGroupId !== group.id;

                    if (collapsed) {
                        return (
                            <ul key={group.id} className="space-y-1 mb-3">
                                {group.items.map(renderItem)}
                            </ul>
                        );
                    }

                    return (
                        <div key={group.id} className="mb-5">
                            <button
                                type="button"
                                onClick={() => toggleGroup(group.id)}
                                className="w-full flex items-center justify-between px-3 mb-2 text-[9px] font-semibold uppercase tracking-[0.22em] transition-colors"
                                style={{ color: 'var(--sidebar-ink-mute)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--sidebar-ink-soft)')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sidebar-ink-mute)')}
                            >
                                <span className="flex items-center gap-2">
                                    <span className="inline-block w-3 h-px" style={{ background: 'currentColor' }} />
                                    {group.label}
                                </span>
                                <svg
                                    className={`w-2.5 h-2.5 transition-transform ${isGroupCollapsed ? '-rotate-90' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {!isGroupCollapsed && <ul className="space-y-0.5">{group.items.map(renderItem)}</ul>}
                        </div>
                    );
                })}
            </nav>

            {/* Footer */}
            <div
                className="relative z-10 px-3 py-3 space-y-3 flex-shrink-0"
                style={{ borderTop: '1px solid var(--sidebar-rule)' }}
            >
                {!collapsed && (
                    <div
                        className="text-[9px] font-semibold uppercase tracking-[0.22em] px-1"
                        style={{ color: 'var(--sidebar-ink-mute)' }}
                    >
                        Empresa activa
                    </div>
                )}
                <EmpresaSelector collapsed={collapsed} />

                {!collapsed && user && (
                    <div
                        className="flex items-center gap-2 px-2 py-2 rounded-md"
                        style={{ background: 'rgba(232, 229, 220, 0.04)' }}
                    >
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-display flex-shrink-0"
                            style={{
                                background: 'var(--paper)',
                                color: 'var(--accent-deep)',
                                fontVariationSettings: "'SOFT' 100, 'WONK' 1",
                                fontWeight: 600,
                            }}
                        >
                            {user.nombre.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate" style={{ color: 'var(--sidebar-ink)' }}>
                                {user.nombre}
                            </div>
                            <div className="text-[10px] truncate" style={{ color: 'var(--sidebar-ink-soft)' }}>
                                {user.email}
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            title="Cerrar sesión"
                            className="p-1.5 rounded-md transition-colors flex-shrink-0"
                            style={{ color: 'var(--sidebar-ink-soft)' }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#f4b8b8';
                                e.currentTarget.style.background = 'rgba(185, 28, 44, 0.18)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'var(--sidebar-ink-soft)';
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                )}
                {collapsed && user && (
                    <button
                        onClick={handleLogout}
                        title="Cerrar sesión"
                        className="w-full p-2 rounded-md transition-colors flex items-center justify-center"
                        style={{ color: 'var(--sidebar-ink-soft)' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#f4b8b8';
                            e.currentTarget.style.background = 'rgba(185, 28, 44, 0.18)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--sidebar-ink-soft)';
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                )}
            </div>
        </aside>
    );
}
