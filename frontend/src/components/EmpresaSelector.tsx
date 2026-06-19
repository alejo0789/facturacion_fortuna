/**
 * Selector de empresa activa — Ledger Modern.
 */
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function EmpresaSelector({ collapsed = false }: { collapsed?: boolean }) {
    const { empresas, empresaActiva, switchEmpresa } = useAuth();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    if (empresas.length === 0) {
        return (
            <div
                className="px-3 py-2 text-[11px] italic"
                style={{ color: 'var(--sidebar-ink-mute)' }}
            >
                {collapsed ? '—' : 'Sin empresas'}
            </div>
        );
    }

    if (collapsed) {
        const initials = (empresaActiva?.nombre ?? '?').slice(0, 2).toUpperCase();
        return (
            <div
                className="w-10 h-10 rounded-md flex items-center justify-center text-[11px] font-display"
                style={{
                    background: 'rgba(127, 169, 224, 0.12)',
                    border: '1px solid rgba(127, 169, 224, 0.28)',
                    color: 'var(--sidebar-accent)',
                    fontVariationSettings: "'SOFT' 100, 'WONK' 1",
                    fontWeight: 600,
                }}
                title={empresaActiva?.nombre ?? ''}
            >
                {initials}
            </div>
        );
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-colors"
                style={{
                    background: 'rgba(232, 229, 220, 0.05)',
                    border: '1px solid var(--sidebar-rule)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(232, 229, 220, 0.09)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(232, 229, 220, 0.05)')}
            >
                <div
                    className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-display flex-shrink-0"
                    style={{
                        background: 'var(--paper)',
                        color: 'var(--accent-deep)',
                        fontVariationSettings: "'SOFT' 100, 'WONK' 1",
                        fontWeight: 600,
                    }}
                >
                    {(empresaActiva?.nombre ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div
                        className="text-[12px] font-medium truncate"
                        style={{ color: 'var(--sidebar-ink)' }}
                    >
                        {empresaActiva?.nombre ?? 'Sin empresa'}
                    </div>
                    <div
                        className="text-[9px] uppercase tracking-[0.18em] truncate"
                        style={{ color: 'var(--sidebar-accent)' }}
                    >
                        {empresaActiva?.rol ?? ''}
                    </div>
                </div>
                <svg
                    className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--sidebar-ink-soft)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div
                    className="absolute bottom-full mb-2 left-0 right-0 rounded-md overflow-hidden max-h-64 overflow-y-auto z-50 sidebar-scroll"
                    style={{
                        background: 'var(--sidebar-bg-2)',
                        border: '1px solid var(--sidebar-rule)',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
                    }}
                >
                    <div
                        className="px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.22em]"
                        style={{
                            color: 'var(--sidebar-ink-mute)',
                            borderBottom: '1px solid var(--sidebar-rule)',
                        }}
                    >
                        Cambiar empresa
                    </div>
                    {empresas.map((e) => {
                        const active = e.id === empresaActiva?.id;
                        return (
                            <button
                                key={e.id}
                                onClick={() => { switchEmpresa(e.id); setOpen(false); }}
                                className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors"
                                style={{
                                    background: active ? 'rgba(127, 169, 224, 0.10)' : 'transparent',
                                    borderBottom: '1px solid rgba(232, 229, 220, 0.04)',
                                }}
                                onMouseEnter={(ev) => {
                                    if (!active) ev.currentTarget.style.background = 'rgba(232, 229, 220, 0.05)';
                                }}
                                onMouseLeave={(ev) => {
                                    if (!active) ev.currentTarget.style.background = 'transparent';
                                }}
                            >
                                <div
                                    className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-display flex-shrink-0"
                                    style={{
                                        background: 'var(--paper)',
                                        color: 'var(--accent-deep)',
                                        fontVariationSettings: "'SOFT' 100, 'WONK' 1",
                                        fontWeight: 600,
                                    }}
                                >
                                    {e.nombre.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div
                                        className="text-[12px] font-medium truncate"
                                        style={{ color: 'var(--sidebar-ink)' }}
                                    >
                                        {e.nombre}
                                    </div>
                                    <div
                                        className="text-[10px] truncate font-mono"
                                        style={{ color: 'var(--sidebar-ink-mute)' }}
                                    >
                                        {e.nit} · {e.rol}
                                    </div>
                                </div>
                                {active && (
                                    <svg
                                        className="w-3.5 h-3.5"
                                        style={{ color: 'var(--sidebar-accent)' }}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
