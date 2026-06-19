import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { apiFetch, apiGet } from '../utils/apiClient';

interface IntegracionesMin {
    n8n_credential_email_id: string | null;
    n8n_email_provider: 'outlook' | 'gmail' | 'yahoo' | 'imap' | null;
    effective_search_url: string | null;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const authFetch = (url: string, options?: RequestInit): Promise<Response> => {
    const endpoint = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
    return apiFetch(endpoint, options as never);
};

interface SearchResult {
    filename: string;
    size: number;
    type: string;
    sourceId: string;
    date: string;
    storage_path?: string;
}

export default function AsistenteBuscadorPage() {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [email, setEmail] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState<string>('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [previewFile, setPreviewFile] = useState<string | null>(null);

    const pollingRef = useRef<number | null>(null);
    const currentRequestIdRef = useRef<string | null>(null);

    // Verificar config de integraciones para mostrar banner
    const [integ, setInteg] = useState<IntegracionesMin | null>(null);
    useEffect(() => {
        apiGet<IntegracionesMin>('/empresas/me/integraciones')
            .then((cfg) => setInteg({
                n8n_credential_email_id: cfg.n8n_credential_email_id,
                n8n_email_provider: cfg.n8n_email_provider,
                effective_search_url: cfg.effective_search_url,
            }))
            .catch(() => setInteg(null));
    }, []);
    const configIncomplete = !!integ && (
        !integ.n8n_email_provider ||
        !integ.n8n_credential_email_id ||
        !integ.effective_search_url
    );

    useEffect(() => {
        return () => {
            if (pollingRef.current) clearTimeout(pollingRef.current);
            const reqId = currentRequestIdRef.current;
            if (reqId) {
                authFetch(`${API_URL}/asistente/cleanup/${reqId}`, {
                    method: 'DELETE',
                    keepalive: true,
                }).catch((err) => console.error('Error cleaning up temp files:', err));
            }
        };
    }, []);

    const pollStatus = async (requestId: string) => {
        try {
            const res = await authFetch(`${API_URL}/asistente/search/${requestId}`);
            if (!res.ok) {
                if (res.status !== 404) throw new Error('Error consultando estado');
            } else {
                const data = await res.json();
                if (data.status === 'completed') {
                    if (Array.isArray(data.data)) {
                        setResults(data.data);
                    } else {
                        console.warn('Received non-array data:', data.data);
                        setResults([]);
                    }
                    setLoading(false);
                    setStatusMsg('');
                    return;
                } else if (data.status === 'error') {
                    setError(data.error || 'Error desconocido en el proceso remoto');
                    setLoading(false);
                    setStatusMsg('');
                    return;
                }
            }
        } catch (err) {
            console.error('Polling error', err);
        }
        pollingRef.current = setTimeout(() => pollStatus(requestId), 2000);
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatusMsg('Iniciando búsqueda…');
        setError(null);
        setResults([]);
        setSelected(new Set());
        if (pollingRef.current) clearTimeout(pollingRef.current);

        if (currentRequestIdRef.current) {
            const prevReqId = currentRequestIdRef.current;
            authFetch(`${API_URL}/asistente/cleanup/${prevReqId}`, { method: 'DELETE' }).catch(console.error);
        }

        try {
            const res = await authFetch(`${API_URL}/asistente/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email || undefined,
                    start_date: startDate,
                    end_date: endDate,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error en la búsqueda');
            }

            const data = await res.json();
            const requestId = data.requestId;
            currentRequestIdRef.current = requestId;

            setStatusMsg('Buscando correos y archivos (esto puede tomar un momento)…');
            pollStatus(requestId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error');
            setLoading(false);
            setStatusMsg('');
        }
    };

    const toggleSelect = (id: string, all: boolean = false) => {
        if (all) {
            if (selected.size === results.length) {
                setSelected(new Set());
            } else {
                setSelected(new Set(results.map((r) => r.sourceId + r.filename)));
            }
        } else {
            const newSelected = new Set(selected);
            if (newSelected.has(id)) newSelected.delete(id);
            else newSelected.add(id);
            setSelected(newSelected);
        }
    };

    const handleProcess = async () => {
        if (selected.size === 0) return;
        setProcessing(true);
        setSuccessMsg(null);
        setError(null);
        try {
            const filesToProcess = results.filter((r) => selected.has(r.sourceId + r.filename));
            const res = await authFetch(`${API_URL}/asistente/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: filesToProcess }),
            });
            if (!res.ok) throw new Error('Error al iniciar procesamiento');
            setSuccessMsg(`Se enviaron ${filesToProcess.length} archivos a procesar.`);
            setSelected(new Set());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Operación · Captura de adjuntos</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Asistente <em>buscador</em>.
                    </h1>
                    <p className="text-[13px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Busca correos por rango y filtra adjuntos para procesar facturas en lote.
                    </p>
                </div>
            </div>

            {/* Banner config incompleta — captura por correo (fase 2) */}
            {configIncomplete && (
                <div
                    className="rounded-md p-5 flex items-start gap-4"
                    style={{ background: 'var(--gold-soft)', border: '1px solid var(--gold)' }}
                >
                    <span
                        className="font-display-wonk text-[1.75rem] leading-none mt-1"
                        style={{ color: 'var(--gold)' }}
                    >
                        !
                    </span>
                    <div className="flex-1">
                        <div className="kicker-accent" style={{ color: 'var(--gold)' }}>
                            Configuración incompleta
                        </div>
                        <div
                            className="font-display text-[1.15rem] tracking-tight mt-0.5"
                            style={{ fontVariationSettings: "'SOFT' 30" }}
                        >
                            Falta conectar tu cuenta de correo a n8n
                        </div>
                        <p className="text-[12px] mt-2 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                            Para que la búsqueda funcione necesitas:{' '}
                            <strong>proveedor de correo</strong> seleccionado y{' '}
                            <strong>Credential ID</strong> de tu cuenta pegado en el panel de
                            Integraciones. El SaaS soporta Outlook, Gmail, Yahoo e IMAP genérico.
                        </p>
                    </div>
                    <Link to="/app/integraciones" className="btn-accent text-[12px] flex-shrink-0">
                        Ir a Integraciones →
                    </Link>
                </div>
            )}

            {!configIncomplete && integ?.n8n_email_provider && (
                <div className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                    <span className="kicker mr-2">Conectado vía</span>
                    <span className="font-mono" style={{ color: 'var(--accent)' }}>
                        {integ.n8n_email_provider.toUpperCase()}
                    </span>
                </div>
            )}

            <form onSubmit={handleSearch} className="surface p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                    <label className="kicker block mb-1.5">Fecha inicial</label>
                    <input type="date" required className="input-field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                    <label className="kicker block mb-1.5">Fecha final</label>
                    <input type="date" required className="input-field" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <div>
                    <label className="kicker block mb-1.5">Correo (opcional)</label>
                    <input type="email" placeholder="ejemplo@proveedor.com" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <button type="submit" disabled={loading} className="btn-accent disabled:opacity-50">
                    {loading ? (
                        <>
                            <div
                                className="h-3.5 w-3.5 rounded-full border-2 border-t-transparent"
                                style={{
                                    borderColor: 'var(--paper)',
                                    borderTopColor: 'transparent',
                                    animation: 'spin-soft 800ms linear infinite',
                                }}
                            />
                            Buscando
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            Buscar
                        </>
                    )}
                </button>
            </form>

            {loading && statusMsg && (
                <div
                    className="px-5 py-4 rounded-lg text-[13px] flex items-center gap-3"
                    style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
                >
                    <div
                        className="h-4 w-4 rounded-full border-2 border-t-transparent flex-shrink-0"
                        style={{
                            borderColor: 'var(--accent)',
                            borderTopColor: 'transparent',
                            animation: 'spin-soft 800ms linear infinite',
                        }}
                    />
                    {statusMsg}
                </div>
            )}
            {error && (
                <div
                    className="px-5 py-4 rounded-lg text-[13px]"
                    style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative)', color: 'var(--negative)' }}
                >
                    {error}
                </div>
            )}
            {successMsg && (
                <div
                    className="px-5 py-4 rounded-lg text-[13px]"
                    style={{ background: 'var(--positive-soft)', border: '1px solid var(--positive)', color: 'var(--positive)' }}
                >
                    ✓ {successMsg}
                </div>
            )}

            {!loading && !statusMsg && !error && results.length === 0 && (
                <div className="surface p-16 text-center">
                    <div
                        className="font-display text-[3rem]"
                        style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                    >
                        —
                    </div>
                    <div className="kicker mt-2">Sin resultados</div>
                    <p className="text-[13px] mt-2" style={{ color: 'var(--ink-faint)' }}>
                        Ajusta los filtros y vuelve a buscar.
                    </p>
                </div>
            )}

            {results.length > 0 && (
                <div className="surface-raised overflow-hidden">
                    <div
                        className="p-5 flex items-baseline justify-between"
                        style={{ borderBottom: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                    >
                        <div>
                            <div className="kicker-accent">Resultados</div>
                            <h2 className="font-display text-[1.2rem] tracking-tight mt-1">
                                {results.length} archivo{results.length !== 1 ? 's' : ''}
                            </h2>
                        </div>
                        <button onClick={handleProcess} disabled={selected.size === 0 || processing} className="btn-accent text-[12px] disabled:opacity-50">
                            {processing ? 'Enviando…' : `Procesar seleccionados (${selected.size})`}
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[14px] text-left">
                            <thead style={{ background: 'var(--paper-tinted)' }}>
                                <tr>
                                    <th className="p-4 w-10" style={{ background: 'var(--paper-tinted)' }}>
                                        <input
                                            type="checkbox"
                                            checked={results.length > 0 && selected.size === results.length}
                                            onChange={() => toggleSelect('', true)}
                                            className="h-4 w-4 rounded"
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                    </th>
                                    <th className="kicker p-4" style={{ background: 'var(--paper-tinted)' }}>Archivo</th>
                                    <th className="p-4 w-10" style={{ background: 'var(--paper-tinted)' }}></th>
                                    <th className="kicker p-4" style={{ background: 'var(--paper-tinted)' }}>Tamaño</th>
                                    <th className="kicker p-4" style={{ background: 'var(--paper-tinted)' }}>Tipo</th>
                                    <th className="kicker p-4" style={{ background: 'var(--paper-tinted)' }}>Remitente</th>
                                    <th className="kicker p-4" style={{ background: 'var(--paper-tinted)' }}>Fecha</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((file, idx) => {
                                    const key = file.sourceId + file.filename;
                                    return (
                                        <tr
                                            key={idx}
                                            style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                            className="transition-colors"
                                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <td className="p-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(key)}
                                                    onChange={() => toggleSelect(key)}
                                                    className="h-4 w-4 rounded"
                                                    style={{ accentColor: 'var(--accent)' }}
                                                />
                                            </td>
                                            <td className="p-4 font-medium">
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--negative)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                    </svg>
                                                    {file.storage_path ? (
                                                        <button
                                                            onClick={() => setPreviewFile(`${API_URL}/asistente/preview/${encodeURIComponent(file.storage_path!.split('\\').pop() || '')}`)}
                                                            className="hover:underline text-left truncate transition-colors"
                                                            style={{ color: 'var(--ink)' }}
                                                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                                                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                                                            title="Ver PDF"
                                                        >
                                                            {file.filename}
                                                        </button>
                                                    ) : (
                                                        <span className="truncate">{file.filename}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 w-10">
                                                {file.storage_path ? (
                                                    <button
                                                        onClick={() => setPreviewFile(`${API_URL}/asistente/preview/${encodeURIComponent(file.storage_path!.split('\\').pop() || '')}`)}
                                                        className="transition-colors"
                                                        style={{ color: 'var(--ink-faint)' }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                                                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-faint)')}
                                                        title="Ver PDF"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </button>
                                                ) : <span style={{ color: 'var(--ink-mute)' }}>—</span>}
                                            </td>
                                            <td className="p-4 text-[12px] font-mono" style={{ color: 'var(--ink-soft)' }}>{(file.size / 1024).toFixed(1)} KB</td>
                                            <td className="p-4 text-[12px]" style={{ color: 'var(--ink-soft)' }}>{file.type}</td>
                                            <td className="p-4 text-[12px]" style={{ color: 'var(--ink-faint)' }}>{(file as { sender?: string }).sender ?? '—'}</td>
                                            <td className="p-4 text-[12px] font-mono" style={{ color: 'var(--ink-faint)' }}>
                                                {file.date ? new Date(file.date).toLocaleDateString() : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {previewFile && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 anim-fade-in"
                    style={{ background: 'rgba(11, 15, 25, 0.55)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setPreviewFile(null)}
                >
                    <div className="surface-raised w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden anim-fade-up" onClick={(e) => e.stopPropagation()}>
                        <div
                            className="flex justify-between items-center p-4"
                            style={{ borderBottom: '1px solid var(--rule)' }}
                        >
                            <h3 className="font-display text-[1.2rem]" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                Vista previa
                            </h3>
                            <button
                                onClick={() => setPreviewFile(null)}
                                className="text-2xl transition-colors"
                                style={{ color: 'var(--ink-mute)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-mute)')}
                            >
                                ×
                            </button>
                        </div>
                        <div className="flex-1 p-4" style={{ background: 'var(--canvas-2)' }}>
                            <iframe
                                src={previewFile}
                                className="w-full h-full rounded-lg shadow-sm"
                                style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}
                                title="Vista previa de PDF"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
