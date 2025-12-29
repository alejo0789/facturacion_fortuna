import { useEffect, useState, useCallback } from 'react';
import type { Contrato } from '../types';
import ContractModal from '../components/ContractModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function Dashboard() {
    const [contratos, setContratos] = useState<Contrato[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingContract, setEditingContract] = useState<Contrato | undefined>(undefined);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const ITEMS_PER_PAGE = 20;

    // Server-side search with debouncing
    const fetchContratos = useCallback(async (searchQuery: string, pageNum: number) => {
        setLoading(true);
        try {
            const skip = (pageNum - 1) * ITEMS_PER_PAGE;
            const params = new URLSearchParams({
                skip: skip.toString(),
                limit: ITEMS_PER_PAGE.toString(),
            });

            if (searchQuery.trim()) {
                params.append('search', searchQuery.trim());
            }

            const res = await fetch(`${API_URL}/contratos/?${params}`);
            if (res.ok) {
                const data = await res.json();
                setContratos(data);
                setHasMore(data.length === ITEMS_PER_PAGE);
            }
        } catch (error) {
            console.error("Failed to fetch contracts", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounced search effect - only when search changes
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1); // Reset to page 1 when search changes
            fetchContratos(search, 1);
        }, 300); // Wait 300ms after user stops typing

        return () => clearTimeout(timer);
    }, [search]); // Only depend on search, not fetchContratos

    // Fetch when page changes (but not on initial mount or search change)
    const [isInitialMount, setIsInitialMount] = useState(true);

    useEffect(() => {
        if (isInitialMount) {
            setIsInitialMount(false);
            return;
        }
        fetchContratos(search, page);
    }, [page]); // Only depend on page

    // Toggle contract status
    const toggleStatus = async (contract: Contrato) => {
        const newStatus = contract.estado === 'ACTIVO' ? 'CANCELADO' : 'ACTIVO';
        await fetch(`${API_URL}/contratos/${contract.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...contract, estado: newStatus, proveedor: undefined, oficina: undefined })
        });
        fetchContratos(search, page);
    };

    const openEditModal = (contract: Contrato) => {
        setEditingContract(contract);
        setIsModalOpen(true);
    };

    const openNewModal = () => {
        setEditingContract(undefined);
        setIsModalOpen(true);
    };

    const handleSave = () => {
        fetchContratos(search, page);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Contratos</h1>
                    <p className="text-gray-500 mt-1">Gestiona los contratos de servicios.</p>
                </div>
                <button onClick={openNewModal} className="btn-primary whitespace-nowrap">
                    + Nuevo Contrato
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Buscar por proveedor, oficina, ciudad, NIT, contrato... (búsqueda en servidor)"
                    className="w-full px-4 py-3 pl-11 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <svg className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {loading && (
                    <div className="absolute right-4 top-3.5">
                        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                )}
            </div>

            <ContractModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingContract(undefined); }}
                onSave={handleSave}
                contract={editingContract}
            />

            {/* Contracts List */}
            <div className="space-y-4">
                {contratos.length === 0 && !loading ? (
                    <div className="text-center py-10 text-gray-500 bg-white rounded-xl shadow-sm border border-gray-100">
                        No se encontraron contratos.
                    </div>
                ) : (
                    contratos.map((c) => (
                        <div
                            key={c.id}
                            className={`card hover:shadow-xl transition-shadow duration-300 border-l-4 ${c.estado === 'ACTIVO' ? 'border-green-500' : 'border-red-400'
                                }`}
                        >
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                {/* Provider Info */}
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-gray-800">{c.proveedor?.nombre || 'Sin Proveedor'}</h3>
                                    <div className="text-sm text-gray-500 font-medium">NIT: {c.proveedor?.nit || '-'}</div>
                                    <div className="mt-2 text-sm text-gray-600">
                                        <span className="font-semibold text-gray-700">Oficina:</span> {c.oficina?.nombre || '-'} ({c.oficina?.ciudad || '-'})
                                    </div>
                                </div>

                                {/* Contract Info */}
                                <div className="flex-1 border-l border-gray-100 md:pl-6">
                                    <div className="grid grid-cols-3 gap-2 text-sm">
                                        <div>
                                            <span className="block text-gray-400 text-xs uppercase">Contrato #</span>
                                            <span className="font-mono text-gray-700">{c.num_contrato || '-'}</span>
                                        </div>
                                        <div>
                                            <span className="block text-gray-400 text-xs uppercase">Estado</span>
                                            <button
                                                onClick={() => toggleStatus(c)}
                                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all hover:scale-105 ${c.estado === 'ACTIVO'
                                                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                    : 'bg-red-100 text-red-800 hover:bg-red-200'
                                                    }`}
                                            >
                                                {c.estado || 'Unknown'}
                                                <span className="ml-1 text-xs opacity-60">↔</span>
                                            </button>
                                        </div>
                                        <div>
                                            <span className="block text-gray-400 text-xs uppercase">Tipo</span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.tipo === 'Fijo' ? 'bg-blue-100 text-blue-800' :
                                                    c.tipo === 'Movil' ? 'bg-purple-100 text-purple-800' :
                                                        c.tipo === 'Colaboracion' ? 'bg-yellow-100 text-yellow-800' :
                                                            c.tipo === 'Leasing' ? 'bg-orange-100 text-orange-800' :
                                                                'bg-gray-100 text-gray-600'
                                                }`}>
                                                {c.tipo || '-'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-gray-400 text-xs uppercase">Plan</span>
                                            <span className="text-gray-700">{c.tipo_plan || '-'}</span>
                                        </div>
                                        <div>
                                            <span className="block text-gray-400 text-xs uppercase">Valor Mensual</span>
                                            <span className="text-lg font-bold text-gray-900">
                                                ${c.valor_mensual?.toLocaleString() || '0'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col justify-center gap-2 md:w-32">
                                    <button
                                        onClick={() => openEditModal(c)}
                                        className="btn-secondary text-sm"
                                    >
                                        Editar
                                    </button>
                                    {c.archivo_contrato && (
                                        <button
                                            onClick={() => window.open(`${API_URL}/contratos/${c.id}/pdf`, '_blank')}
                                            className="flex items-center justify-center gap-1 px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                            </svg>
                                            Ver PDF
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-center items-center gap-4 py-4">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    ← Anterior
                </button>

                <span className="text-sm text-gray-600">
                    Página {page}
                </span>

                <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={!hasMore || loading}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Siguiente →
                </button>
            </div>
        </div>
    );
}
