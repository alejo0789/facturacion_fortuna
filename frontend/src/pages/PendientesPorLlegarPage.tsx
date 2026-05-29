import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Contrato, Oficina } from '../types';
import { formatCOP } from '../utils/format';
import { getAuthHeaders } from '../utils/apiClient';
import { useLocation } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function PendientesPorLlegarPage() {
    const [contratos, setContratos] = useState<Contrato[]>([]);
    const [loading, setLoading] = useState(true);

    // Filtering states
    const [search, setSearch] = useState('');
    const [oficinaSearch, setOficinaSearch] = useState('');
    const [selectedOficina, setSelectedOficina] = useState<Oficina | null>(null);
    const [allOficinas, setAllOficinas] = useState<Oficina[]>([]);
    const [filteredOficinas, setFilteredOficinas] = useState<Oficina[]>([]);
    const [showOficinaSuggestions, setShowOficinaSuggestions] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    
    // Get categoria_id from URL
    const queryParams = new URLSearchParams(location.search);
    const categoriaId = queryParams.get('categoria_id');

    // Payment Modal States
    const [selectedContratos, setSelectedContratos] = useState<Set<number>>(new Set());
    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    const [payObservaciones, setPayObservaciones] = useState('');
    const [payFile, setPayFile] = useState<File | null>(null);
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState('');

    const fetchPendientes = async () => {
        setLoading(true);
        try {
            let url = `${API_URL}/facturas/stats/contratos-pendientes`;
            if (categoriaId) {
                url += `?categoria_id=${categoriaId}`;
            }
            
            const res = await fetch(url, {
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setContratos(await res.json());
            }
        } catch (error) {
            console.error("Failed to fetch pending contracts", error);
        } finally {
            setLoading(false);
        }
    };

    const loadOficinas = async () => {
        try {
            const res = await fetch(`${API_URL}/oficinas/?limit=1000`);
            if (res.ok) {
                setAllOficinas(await res.json());
            }
        } catch (error) {
            console.error("Failed to load oficinas", error);
        }
    };

    const submitPay = async () => {
        setPaying(true);
        setPayError('');

        try {
            const formData = new FormData();
            if (payObservaciones) {
                formData.append('observaciones', payObservaciones);
            }
            if (payFile) {
                formData.append('file', payFile);
            }

            if (selectedContratos.size === 1) {
                const contratoId = Array.from(selectedContratos)[0];
                formData.append('contrato_id', String(contratoId));

                const res = await fetch(`${API_URL}/facturas/pagar-pendiente-contrato`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: formData
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || 'Error al registrar pago');
                }
            } else {
                const ids = Array.from(selectedContratos);
                formData.append('contrato_ids', JSON.stringify(ids));

                const res = await fetch(`${API_URL}/facturas/pagar-pendiente-contrato-lote`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: formData
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || 'Error al procesar pago en lote');
                }
            }

            await fetchPendientes();
            setSelectedContratos(new Set());
            setIsPayModalOpen(false);
        } catch (err: any) {
            setPayError(err.message || 'Error al registrar el pago');
        } finally {
            setPaying(false);
        }
    };

    useEffect(() => {
        fetchPendientes();
        loadOficinas();
    }, []);

    // Filter oficinas as user types
    useEffect(() => {
        if (oficinaSearch.trim() === '') {
            setFilteredOficinas([]);
            return;
        }
        const term = oficinaSearch.toLowerCase();
        const filtered = allOficinas.filter((o: Oficina) =>
            o.nombre?.toLowerCase().includes(term) ||
            o.cod_oficina?.toLowerCase().includes(term) ||
            o.ciudad?.toLowerCase().includes(term)
        ).slice(0, 8);
        setFilteredOficinas(filtered);
    }, [oficinaSearch, allOficinas]);

    // Local filtering of contracts
    const filteredContratos = contratos.filter((c: Contrato) => {
        // Search by provider or contract num
        const matchesSearch = search === '' ||
            c.proveedor?.nombre.toLowerCase().includes(search.toLowerCase()) ||
            c.proveedor?.nit.toLowerCase().includes(search.toLowerCase()) ||
            c.num_contrato?.toLowerCase().includes(search.toLowerCase());

        // Filter by office
        const matchesOficina = !selectedOficina || c.oficina_id === selectedOficina.id;

        return matchesSearch && matchesOficina;
    });



    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/facturas')}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Facturas Pendientes por Llegar</h1>
                    <p className="text-gray-500 mt-1">Contratos activos sin factura registrada este mes</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                {/* Provider Search */}
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Buscar por proveedor o NIT..."
                        className="w-full px-4 py-2.5 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <svg className="absolute left-3 top-3 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                {/* Office Filter */}
                <div className="relative flex-1">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Filtrar por oficina..."
                            className="w-full px-4 py-2.5 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none"
                            value={selectedOficina ? `${selectedOficina.nombre} (${selectedOficina.cod_oficina})` : oficinaSearch}
                            onChange={(e) => {
                                setOficinaSearch(e.target.value);
                                if (selectedOficina) setSelectedOficina(null);
                                setShowOficinaSuggestions(true);
                            }}
                            onFocus={() => setShowOficinaSuggestions(true)}
                        />
                        <svg className="absolute left-3 top-3 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {selectedOficina && (
                            <button
                                onClick={() => {
                                    setSelectedOficina(null);
                                    setOficinaSearch('');
                                }}
                                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {showOficinaSuggestions && filteredOficinas.length > 0 && !selectedOficina && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                            {filteredOficinas.map((o: Oficina) => (
                                <button
                                    key={o.id}
                                    onClick={() => {
                                        setSelectedOficina(o);
                                        setShowOficinaSuggestions(false);
                                    }}
                                    className="w-full px-4 py-2 text-left hover:bg-red-50 transition-colors border-b border-gray-50 last:border-0"
                                >
                                    <div className="font-medium text-sm text-gray-900">{o.nombre}</div>
                                    <div className="text-xs text-gray-500">{o.cod_oficina} - {o.ciudad}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="text-sm text-gray-500 flex items-center px-2">
                    <span className="font-semibold text-red-600 mr-1">{filteredContratos.length}</span> resultados
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-4 font-semibold text-gray-700 w-12">
                                <input
                                    type="checkbox"
                                    checked={filteredContratos.length > 0 && filteredContratos.every((c: Contrato) => selectedContratos.has(c.id))}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedContratos(new Set(filteredContratos.map((c: Contrato) => c.id)));
                                        } else {
                                            setSelectedContratos(new Set());
                                        }
                                    }}
                                    className="rounded border-gray-300 text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                                />
                            </th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Proveedor</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Oficina</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Contrato #</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Valor Mensual</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Estado</th>
                            <th className="px-6 py-4 font-semibold text-gray-700 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-10 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
                                        <span className="text-gray-500">Cargando contratos...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredContratos.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-10 text-center text-gray-500 italic">
                                    No se encontraron contratos con los filtros aplicados.
                                </td>
                            </tr>
                        ) : (
                            filteredContratos.map((c: Contrato) => (
                                <tr key={c.id} className={`hover:bg-gray-50/80 transition-colors ${selectedContratos.has(c.id) ? 'bg-red-50/20' : ''}`}>
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedContratos.has(c.id)}
                                            onChange={(e) => {
                                                setSelectedContratos(prev => {
                                                    const next = new Set(prev);
                                                    if (e.target.checked) {
                                                        next.add(c.id);
                                                    } else {
                                                        next.delete(c.id);
                                                    }
                                                    return next;
                                                });
                                            }}
                                            className="rounded border-gray-300 text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{c.proveedor?.nombre}</div>
                                        <div className="text-xs text-gray-500">{c.proveedor?.nit}</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-700">
                                        {c.oficina?.nombre}
                                        <span className="text-xs text-gray-500 ml-1">({c.oficina?.cod_oficina})</span>
                                        <div className="text-xs text-gray-500">{c.oficina?.ciudad}</div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-sm text-gray-600">
                                        {c.num_contrato || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-emerald-600 font-semibold">
                                        {formatCOP(c.valor_mensual)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                            {c.estado}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => {
                                                setSelectedContratos(new Set([c.id]));
                                                setPayObservaciones('');
                                                setPayFile(null);
                                                setPayError('');
                                                setIsPayModalOpen(true);
                                            }}
                                            className="px-3 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 font-bold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                                            </svg>
                                            Marcar Pagado
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Floating Action Panel */}
            {selectedContratos.size > 0 && (
                <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 bg-gray-900 text-white p-4 rounded-xl shadow-2xl animate-fade-in w-80 border border-gray-800">
                    <div className="flex items-center justify-between gap-4 pb-2 border-b border-gray-800">
                        <div className="flex items-center gap-2">
                            <span className="bg-red-500 px-2 py-1 rounded-lg font-bold text-sm">
                                {selectedContratos.size}
                            </span>
                            <span className="text-sm text-gray-300">seleccionados</span>
                        </div>
                        <button
                            onClick={() => setSelectedContratos(new Set())}
                            className="text-gray-400 hover:text-white p-1 cursor-pointer"
                            title="Limpiar selección"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="pt-2">
                        <button
                            onClick={() => {
                                setPayObservaciones('');
                                setPayFile(null);
                                setPayError('');
                                setIsPayModalOpen(true);
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg font-bold transition-colors cursor-pointer"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Marcar como Pagadas
                        </button>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {isPayModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-gray-100 animate-fade-in text-left">
                        <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <h3 className="text-lg font-bold text-white">
                                        Registrar Pago - {selectedContratos.size} Contratos
                                    </h3>
                                </div>
                                <button 
                                    onClick={() => setIsPayModalOpen(false)}
                                    className="text-white/80 hover:text-white transition-colors cursor-pointer"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Summary Box */}
                            <div className="bg-red-50 rounded-xl p-4 border border-red-100 text-sm text-red-800">
                                <div className="font-semibold mb-1">Contratos Seleccionados:</div>
                                <div className="max-h-28 overflow-y-auto space-y-1 pr-2">
                                    {contratos
                                        .filter(c => selectedContratos.has(c.id))
                                        .map(c => (
                                            <div key={c.id} className="flex justify-between items-center bg-white/60 px-2 py-1 rounded text-xs">
                                                <span className="font-medium truncate max-w-[180px] text-gray-900">{c.proveedor?.nombre}</span>
                                                <span className="font-mono text-gray-500">{c.num_contrato || `#${c.id}`}</span>
                                                <span className="font-bold text-emerald-700">{formatCOP(c.valor_mensual)}</span>
                                            </div>
                                        ))
                                    }
                                </div>
                                <div className="flex justify-between items-center pt-2 mt-2 border-t border-red-200/50 font-bold">
                                    <span>Total a Pagar:</span>
                                    <span>
                                        {formatCOP(
                                            contratos
                                                .filter(c => selectedContratos.has(c.id))
                                                .reduce((sum, c) => sum + (Number(c.valor_mensual) || 0), 0)
                                        )}
                                    </span>
                                </div>
                            </div>

                            {payError && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>{payError}</span>
                                </div>
                            )}

                            {/* Observations field */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Observaciones / Comentarios
                                </label>
                                <textarea
                                    value={payObservaciones}
                                    onChange={(e) => setPayObservaciones(e.target.value)}
                                    placeholder="Ej: Marcada como pagada manualmente. Pendiente radicación factura."
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-shadow resize-none h-24 text-sm"
                                />
                            </div>

                            {/* PDF payment support file upload */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Soporte de Pago (PDF - Opcional)
                                </label>
                                
                                <div className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
                                    payFile 
                                        ? 'border-red-500 bg-red-50/10' 
                                        : 'border-gray-300 hover:border-red-500 hover:bg-gray-50/50'
                                }`}>
                                    <input
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                if (!file.name.toLowerCase().endsWith('.pdf')) {
                                                    setPayError('El soporte de pago debe ser un archivo PDF');
                                                    return;
                                                }
                                                setPayFile(file);
                                                setPayError('');
                                            }
                                        }}
                                        className="hidden"
                                        id="pay-file-input"
                                    />
                                    
                                    {payFile ? (
                                        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-2 text-sm">
                                            <div className="flex items-center gap-2 truncate">
                                                <svg className="w-8 h-8 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                                </svg>
                                                <div className="text-left truncate">
                                                    <p className="font-medium text-gray-800 truncate max-w-[200px]">{payFile.name}</p>
                                                    <p className="text-xs text-gray-500">{(payFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setPayFile(null)}
                                                className="text-red-500 hover:text-red-700 transition-colors p-1 cursor-pointer"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <label htmlFor="pay-file-input" className="cursor-pointer block space-y-1">
                                            <svg className="w-8 h-8 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                            <p className="text-xs font-semibold text-red-600 hover:text-red-700">Seleccionar PDF de soporte</p>
                                            <p className="text-[10px] text-gray-400">PDF hasta 10MB</p>
                                        </label>
                                    )}
                                </div>
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                <button
                                    onClick={() => setIsPayModalOpen(false)}
                                    disabled={paying}
                                    className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50 text-sm font-medium cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={submitPay}
                                    disabled={paying}
                                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors disabled:opacity-50 text-sm font-bold flex items-center gap-2 cursor-pointer"
                                >
                                    {paying ? (
                                        <>
                                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                            Procesando...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Confirmar Pago
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
