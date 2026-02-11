
import { useState, useRef, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

    // Polling ref
    const pollingRef = useRef<number | null>(null);

    // Clean up polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearTimeout(pollingRef.current);
        };
    }, []);

    const pollStatus = async (requestId: string) => {
        try {
            const res = await fetch(`${API_URL}/asistente/search/${requestId}`);
            if (!res.ok) {
                // If 404, maybe not ready yet or error
                if (res.status !== 404) throw new Error('Error consultando estado');
            } else {
                const data = await res.json();
                if (data.status === 'completed') {
                    if (Array.isArray(data.data)) {
                        setResults(data.data);
                    } else {
                        console.warn("Received non-array data:", data.data);
                        setResults([]);
                    }
                    setLoading(false);
                    setStatusMsg('');
                    return; // Stop polling
                } else if (data.status === 'error') {
                    setError(data.error || 'Error desconocido en el proceso remoto');
                    setLoading(false);
                    setStatusMsg('');
                    return; // Stop polling
                }
            }
        } catch (err: any) {
            console.error('Polling error', err);
            // Don't stop polling immediately on intermittent network error, but maybe limit retries?
            // For now, continue
        }

        // Continue polling
        pollingRef.current = setTimeout(() => pollStatus(requestId), 2000);
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatusMsg('Iniciando búsqueda...');
        setError(null);
        setResults([]);
        setSelected(new Set());
        if (pollingRef.current) clearTimeout(pollingRef.current);

        try {
            const res = await fetch(`${API_URL}/asistente/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email || undefined,
                    start_date: startDate,
                    end_date: endDate
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error en la búsqueda');
            }

            const data = await res.json();
            const requestId = data.requestId;

            setStatusMsg('Buscando correos y archivos (esto puede tomar un momento)...');
            pollStatus(requestId);

        } catch (err: any) {
            setError(err.message);
            setLoading(false);
            setStatusMsg('');
        }
    };

    const toggleSelect = (id: string, all: boolean = false) => {
        if (all) {
            if (selected.size === results.length) {
                setSelected(new Set());
            } else {
                setSelected(new Set(results.map(r => r.sourceId + r.filename)));
            }
        } else {
            const newSelected = new Set(selected);
            if (newSelected.has(id)) {
                newSelected.delete(id);
            } else {
                newSelected.add(id);
            }
            setSelected(newSelected);
        }
    };

    const handleProcess = async () => {
        if (selected.size === 0) return;
        setProcessing(true);
        setSuccessMsg(null);
        setError(null);

        try {
            // Filter results to get full objects of selected items
            const filesToProcess = results.filter(r => selected.has(r.sourceId + r.filename));

            const res = await fetch(`${API_URL}/asistente/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: filesToProcess }),
            });

            if (!res.ok) {
                throw new Error('Error al iniciar procesamiento');
            }

            setSuccessMsg(`Se enviaron ${filesToProcess.length} archivos a procesar.`);
            setSelected(new Set());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Asistente Buscador</h1>
                    <p className="text-slate-500">Buscar correos y procesar documentos adjuntos</p>
                </div>
            </header>

            {/* Search Form */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Inicial</label>
                        <input
                            type="date"
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Final</label>
                        <input
                            type="date"
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Correo (Opcional)</label>
                        <input
                            type="email"
                            placeholder="ejemplo@proveedor.com"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Buscando
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    Buscar
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Messages */}
            {loading && statusMsg && (
                <div className="bg-blue-50 text-blue-600 p-4 rounded-lg border border-blue-200 flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {statusMsg}
                </div>
            )}
            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
                    {error}
                </div>
            )}
            {successMsg && (
                <div className="bg-green-50 text-green-600 p-4 rounded-lg border border-green-200">
                    {successMsg}
                </div>
            )}

            {/* Empty Results State */}
            {!loading && !statusMsg && !error && results.length === 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-slate-800 mb-2">No se encontraron archivos</h3>
                    <p className="text-slate-500">Intenta ajustar los filtros de búsqueda</p>
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                        <h2 className="font-semibold text-slate-700">Resultados ({results.length})</h2>
                        <button
                            onClick={handleProcess}
                            disabled={selected.size === 0 || processing}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-1.5 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            {processing ? (
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
                            Procesar Seleccionados ({selected.size})
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="p-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={results.length > 0 && selected.size === results.length}
                                            onChange={() => toggleSelect('', true)}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </th>
                                    <th className="p-4">Archivo</th>
                                    <th className="p-4 w-10"></th>
                                    <th className="p-4">Tamaño</th>
                                    <th className="p-4">Tipo</th>
                                    <th className="p-4">Remitente</th>
                                    <th className="p-4">Fecha</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {results.map((file, idx) => {
                                    const key = file.sourceId + file.filename;
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(key)}
                                                    onChange={() => toggleSelect(key)}
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="p-4 font-medium text-slate-800">
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                    </svg>
                                                    {file.storage_path ? (
                                                        <button
                                                            onClick={() => setPreviewFile(`${API_URL}/asistente/preview/${encodeURIComponent(file.storage_path!.split('\\').pop() || '')}`)}
                                                            className="hover:text-blue-600 hover:underline text-left truncate"
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
                                                        className="text-slate-400 hover:text-blue-600 transition-colors"
                                                        title="Ver PDF"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </button>
                                                ) : <span className="text-slate-200">-</span>}
                                            </td>
                                            <td className="p-4 text-slate-500">{(file.size / 1024).toFixed(1)} KB</td>
                                            <td className="p-4 text-slate-500">{file.type}</td>
                                            <td className="p-4 text-slate-500 text-xs">{(file as any).sender}</td>
                                            <td className="p-4 text-slate-500 text-xs">{file.date ? new Date(file.date).toLocaleDateString() : '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {/* Preview Modal */}
            {previewFile && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setPreviewFile(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b border-slate-200">
                            <h3 className="font-semibold text-slate-800">Vista Previa</h3>
                            <button
                                onClick={() => setPreviewFile(null)}
                                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 bg-slate-100 p-4">
                            <iframe
                                src={previewFile}
                                className="w-full h-full rounded-lg border border-slate-200 shadow-sm bg-white"
                                title="Vista Previa de PDF"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
