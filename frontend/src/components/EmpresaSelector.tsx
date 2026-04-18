/**
 * Selector de empresa activa.
 *
 * Muestra la empresa seleccionada y un dropdown con todas las empresas a las
 * que el usuario tiene acceso. Al cambiar, actualiza el `X-Empresa-Id` global
 * que el fetchInterceptor inyecta en cada request.
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
            <div className="px-3 py-2 text-xs text-slate-400 italic">
                {collapsed ? '—' : 'Sin empresas'}
            </div>
        );
    }

    if (collapsed) {
        // Colapsado: muestra sólo iniciales con tooltip
        const initials = (empresaActiva?.nombre ?? '?').slice(0, 2).toUpperCase();
        return (
            <div
                className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-xs font-bold text-indigo-200"
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
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 hover:bg-slate-800 text-left"
            >
                <div className="w-8 h-8 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {(empresaActiva?.nombre ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                        {empresaActiva?.nombre ?? 'Sin empresa'}
                    </div>
                    <div className="text-[10px] text-indigo-300 truncate">
                        {empresaActiva?.rol ?? ''}
                    </div>
                </div>
                <svg
                    className={`w-4 h-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div className="absolute bottom-full mb-2 left-0 right-0 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden max-h-64 overflow-y-auto z-50">
                    {empresas.map((e) => (
                        <button
                            key={e.id}
                            onClick={() => { switchEmpresa(e.id); setOpen(false); }}
                            className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-800 transition ${e.id === empresaActiva?.id ? 'bg-slate-800/60' : ''
                                }`}
                        >
                            <div className="w-7 h-7 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
                                {e.nombre.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-white truncate">{e.nombre}</div>
                                <div className="text-[10px] text-slate-400 truncate">{e.nit} · {e.rol}</div>
                            </div>
                            {e.id === empresaActiva?.id && (
                                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
