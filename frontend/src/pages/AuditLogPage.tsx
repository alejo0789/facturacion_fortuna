/**
 * Página /app/auditoria — consulta del audit log (solo ADMIN).
 *
 * Filtros:
 *   - fecha desde/hasta
 *   - action (prefijo con "auth.*" o exacto)
 *   - result (success/failure/partial)
 *
 * Paginación server-side (default 50 por página).
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiGet, ApiError } from '../utils/apiClient';

interface AuditEntry {
    id: number;
    ts: string;
    empresa_id: number | null;
    user_id: number | null;
    user_email: string | null;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    ip: string | null;
    user_agent: string | null;
    result: 'success' | 'failure' | 'partial';
    details: Record<string, unknown> | null;
}

interface AuditPage {
    items: AuditEntry[];
    total: number;
    page: number;
    page_size: number;
}

interface ActionCount {
    action: string;
    count: number;
}

const RESULT_META: Record<AuditEntry['result'], { color: string; bg: string; label: string }> = {
    success: { color: 'var(--positive)', bg: 'var(--positive-soft)', label: 'Éxito' },
    failure: { color: 'var(--negative)', bg: 'var(--negative-soft)', label: 'Falló' },
    partial: { color: 'var(--gold)', bg: 'var(--gold-soft)', label: 'Parcial' },
};


export default function AuditLogPage() {
    const [items, setItems] = useState<AuditEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [action, setAction] = useState('');
    const [resultFilter, setResultFilter] = useState('');
    const [actionOptions, setActionOptions] = useState<ActionCount[]>([]);

    const [expanded, setExpanded] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = { page, page_size: pageSize };
            if (fechaDesde) params.fecha_desde = fechaDesde;
            if (fechaHasta) params.fecha_hasta = fechaHasta;
            if (action) params.action = action;
            if (resultFilter) params.result = resultFilter;
            const data = await apiGet<AuditPage>('/api/audit-log', params);
            setItems(data.items);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error cargando auditoría');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, fechaDesde, fechaHasta, action, resultFilter]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        void (async () => {
            try {
                const data = await apiGet<ActionCount[]>('/api/audit-log/actions');
                setActionOptions(data);
            } catch { /* silencioso */ }
        })();
    }, []);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="space-y-6 max-w-[1480px] mx-auto">
            {/* Header */}
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Administración · Auditoría</div>
                <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                    Registro de <em>eventos</em>.
                </h1>
                <p className="text-[13px] mt-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                    Traza append-only de acciones sensibles: login, cambios de rol, rotación de API keys,
                    OAuth, sync DIAN, activación de 2FA. Solo lectura, restringido a ADMIN de la empresa.
                </p>
            </div>

            {error && (
                <div className="px-5 py-4 rounded-lg text-[13px]" style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
                    {error}
                </div>
            )}

            {/* Filtros */}
            <div className="surface p-6">
                <div className="grid md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="kicker block mb-1.5">Desde</label>
                        <input type="date" className="input-field text-[13px]"
                            value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                    </div>
                    <div>
                        <label className="kicker block mb-1.5">Hasta</label>
                        <input type="date" className="input-field text-[13px]"
                            value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                    </div>
                    <div>
                        <label className="kicker block mb-1.5">Acción</label>
                        <select className="input-field text-[13px]"
                            value={action} onChange={(e) => setAction(e.target.value)}>
                            <option value="">Todas</option>
                            <option value="auth.*">auth.* (todo login/logout/2FA)</option>
                            <option value="oauth.*">oauth.* (Gmail + Outlook)</option>
                            <option value="dian.*">dian.* (sync + config)</option>
                            <option value="usuario.*">usuario.* (cambios de rol, activaciones)</option>
                            <option value="empresa.*">empresa.* (API key, config)</option>
                            {actionOptions.slice(0, 30).map((a) => (
                                <option key={a.action} value={a.action}>
                                    {a.action} ({a.count})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="kicker block mb-1.5">Resultado</label>
                        <select className="input-field text-[13px]"
                            value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="success">Éxito</option>
                            <option value="failure">Falló</option>
                            <option value="partial">Parcial</option>
                        </select>
                    </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <button type="button" onClick={() => { setPage(1); void load(); }}
                        className="btn-secondary text-[13px]" disabled={loading}>
                        {loading ? 'Cargando…' : 'Aplicar filtros'}
                    </button>
                    <button type="button"
                        onClick={() => { setFechaDesde(''); setFechaHasta(''); setAction(''); setResultFilter(''); setPage(1); }}
                        className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                        Limpiar
                    </button>
                    <div className="ml-auto text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                        {total} eventos · página {page} de {totalPages}
                    </div>
                </div>
            </div>

            {/* Tabla */}
            <div className="surface p-6 overflow-x-auto">
                <table className="w-full text-[12px]">
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                            <th className="text-left p-2 kicker">Fecha/Hora</th>
                            <th className="text-left p-2 kicker">Acción</th>
                            <th className="text-left p-2 kicker">Usuario</th>
                            <th className="text-left p-2 kicker">IP</th>
                            <th className="text-left p-2 kicker">Recurso</th>
                            <th className="text-left p-2 kicker">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it) => {
                            const meta = RESULT_META[it.result];
                            const isOpen = expanded === it.id;
                            const hasDetails = Boolean(
                                (it.details && Object.keys(it.details).length > 0) || it.user_agent
                            );
                            return (
                                <Fragment key={it.id}>
                                    <tr
                                        style={{ borderBottom: '1px solid var(--rule-soft)', cursor: hasDetails ? 'pointer' : 'default' }}
                                        onClick={() => hasDetails && setExpanded(isOpen ? null : it.id)}>
                                        <td className="p-2 font-mono">
                                            {new Date(it.ts).toLocaleString('es-CO', { hour12: false })}
                                        </td>
                                        <td className="p-2 font-mono text-[11px]" style={{ color: 'var(--ink)' }}>
                                            {it.action}
                                        </td>
                                        <td className="p-2">
                                            {it.user_email || (it.user_id ? `#${it.user_id}` : '—')}
                                        </td>
                                        <td className="p-2 font-mono text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                            {it.ip || '—'}
                                        </td>
                                        <td className="p-2 text-[11px]">
                                            {it.resource_type ? `${it.resource_type}${it.resource_id ? ':' + it.resource_id : ''}` : '—'}
                                        </td>
                                        <td className="p-2">
                                            <span className="text-[10px] px-2 py-0.5 rounded-sm font-medium uppercase"
                                                style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}` }}>
                                                {meta.label}
                                            </span>
                                        </td>
                                    </tr>
                                    {isOpen && (
                                        <tr>
                                            <td colSpan={6} className="p-3" style={{ background: 'var(--surface-soft)' }}>
                                                {it.details && (
                                                    <div className="mb-2">
                                                        <div className="kicker mb-1">Detalles</div>
                                                        <pre className="font-mono text-[11px] whitespace-pre-wrap"
                                                            style={{ color: 'var(--ink-soft)', maxWidth: '100%' }}>
                                                            {JSON.stringify(it.details, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                                {it.user_agent && (
                                                    <div>
                                                        <div className="kicker mb-1">User Agent</div>
                                                        <div className="font-mono text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                                                            {it.user_agent}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>

                {items.length === 0 && !loading && (
                    <p className="text-center text-[13px] py-6" style={{ color: 'var(--ink-faint)' }}>
                        Sin eventos que coincidan con los filtros.
                    </p>
                )}
            </div>

            {/* Paginación */}
            <div className="flex justify-center gap-2 mt-4">
                <button type="button" disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="btn-secondary text-[12px] disabled:opacity-40">
                    ← Anterior
                </button>
                <span className="text-[12px] self-center px-3" style={{ color: 'var(--ink-faint)' }}>
                    Página {page} de {totalPages}
                </span>
                <button type="button" disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="btn-secondary text-[12px] disabled:opacity-40">
                    Siguiente →
                </button>
            </div>
        </div>
    );
}
