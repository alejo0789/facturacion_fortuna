import { useEffect, useState, useCallback } from 'react';
import type { Contrato } from '../types';
import ContractModal from '../components/ContractModal';
import { formatCOP } from '../utils/format';

import { apiFetch } from '../utils/apiClient';
import { getSignedPdfUrl } from '../utils/pdfUrl';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const authFetch = (url: string, options?: RequestInit): Promise<Response> => {
    const endpoint = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
    return apiFetch(endpoint, options as never);
};

export default function Dashboard() {
    const [contratos, setContratos] = useState<Contrato[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingContract, setEditingContract] = useState<Contrato | undefined>(undefined);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const ITEMS_PER_PAGE = 20;

    const fetchContratos = useCallback(async (searchQuery: string, pageNum: number) => {
        setLoading(true);
        try {
            const skip = (pageNum - 1) * ITEMS_PER_PAGE;
            const params = new URLSearchParams({
                skip: skip.toString(),
                limit: ITEMS_PER_PAGE.toString(),
            });
            if (searchQuery.trim()) params.append('search', searchQuery.trim());

            const res = await authFetch(`${API_URL}/contratos/?${params}`);
            if (res.ok) {
                const data = await res.json();
                setContratos(data);
                setHasMore(data.length === ITEMS_PER_PAGE);
            }
        } catch (error) {
            console.error('Failed to fetch contracts', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchContratos(search, 1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const [isInitialMount, setIsInitialMount] = useState(true);
    useEffect(() => {
        if (isInitialMount) {
            setIsInitialMount(false);
            return;
        }
        fetchContratos(search, page);
    }, [page]);

    const toggleStatus = async (contract: Contrato) => {
        const newStatus = contract.estado === 'ACTIVO' ? 'CANCELADO' : 'ACTIVO';
        await authFetch(`${API_URL}/contratos/${contract.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...contract, estado: newStatus, proveedor: undefined, oficina: undefined }),
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

    const handleDelete = async (contract: Contrato) => {
        if (!confirm(`¿Está seguro de eliminar el contrato ${contract.num_contrato || contract.id}?\n\nEsta acción no se puede deshacer.`)) return;
        try {
            const res = await authFetch(`${API_URL}/contratos/${contract.id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchContratos(search, page);
            } else {
                const error = await res.json();
                alert(error.detail || 'Error al eliminar el contrato');
            }
        } catch (error) {
            console.error('Failed to delete contract', error);
            alert('Error de conexión al eliminar el contrato');
        }
    };

    const estadoTag = (estado: string | undefined) => {
        if (estado === 'ACTIVO') return 'tag-positive';
        if (estado === 'EN TRAMITE') return 'tag-gold';
        return 'tag-negative';
    };

    const tipoColor = (tipo: string | undefined): string => {
        if (tipo === 'FIJO') return 'var(--accent)';
        if (tipo === 'MOVIL') return 'var(--gold)';
        if (tipo === 'COLABORACION') return 'var(--positive)';
        if (tipo === 'LEASING') return 'var(--negative)';
        return 'var(--ink-faint)';
    };

    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Operación · Acuerdos contractuales</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Contratos <em>vigentes</em>.
                    </h1>
                    <button onClick={openNewModal} className="btn-accent">
                        + Nuevo contrato
                    </button>
                </div>
            </div>

            <div className="surface p-4 relative">
                <input
                    type="text"
                    placeholder="Buscar por proveedor, oficina, ciudad, NIT, contrato…"
                    className="input-field pl-10"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <svg
                    className="absolute left-7 top-7 h-4 w-4"
                    style={{ color: 'var(--ink-faint)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {loading && (
                    <div className="absolute right-7 top-7">
                        <div
                            className="h-4 w-4 rounded-full border-2 border-t-transparent"
                            style={{
                                borderColor: 'var(--accent)',
                                borderTopColor: 'transparent',
                                animation: 'spin-soft 800ms linear infinite',
                            }}
                        />
                    </div>
                )}
            </div>

            <ContractModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingContract(undefined); }}
                onSave={handleSave}
                contract={editingContract}
            />

            {/* Lista */}
            <div className="space-y-4">
                {contratos.length === 0 && !loading ? (
                    <div className="surface p-16 text-center">
                        <div
                            className="font-display text-[3rem]"
                            style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                        >
                            —
                        </div>
                        <div className="kicker mt-2">Sin contratos registrados</div>
                    </div>
                ) : (
                    contratos.map((c) => {
                        const borderColor = c.estado === 'ACTIVO' ? 'var(--positive)' :
                            c.estado === 'EN TRAMITE' ? 'var(--gold)' : 'var(--negative)';
                        return (
                            <div
                                key={c.id}
                                className="surface p-6 transition-all hover:-translate-y-px"
                                style={{ borderLeft: `3px solid ${borderColor}` }}
                            >
                                <div className="grid lg:grid-cols-12 gap-6">
                                    {/* Proveedor */}
                                    <div className="lg:col-span-4">
                                        <div className="kicker mb-1">Proveedor</div>
                                        <h3 className="font-display text-[1.3rem] tracking-tight" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                            {c.proveedor?.nombre || 'Sin proveedor'}
                                        </h3>
                                        <div className="font-mono text-[11px] mt-1" style={{ color: 'var(--accent)' }}>
                                            NIT {c.proveedor?.nit || '—'}
                                        </div>
                                        <div className="text-[12px] mt-3" style={{ color: 'var(--ink-soft)' }}>
                                            <span className="kicker mr-2">Oficina</span>
                                            {c.oficina?.nombre || '—'}{c.oficina?.ciudad && ` · ${c.oficina.ciudad}`}
                                        </div>
                                    </div>

                                    {/* Datos */}
                                    <div className="lg:col-span-6 lg:border-l lg:pl-6" style={{ borderColor: 'var(--rule)' }}>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <div className="kicker mb-1">Contrato</div>
                                                <div className="font-mono text-[13px]">{c.num_contrato || '—'}</div>
                                            </div>
                                            <div>
                                                <div className="kicker mb-1">Estado</div>
                                                <button
                                                    onClick={() => toggleStatus(c)}
                                                    className={`tag ${estadoTag(c.estado)} hover:opacity-80 cursor-pointer`}
                                                >
                                                    {c.estado || '—'} ↔
                                                </button>
                                            </div>
                                            <div>
                                                <div className="kicker mb-1">Tipo</div>
                                                <span
                                                    className="tag"
                                                    style={{
                                                        color: tipoColor(c.tipo),
                                                        borderColor: tipoColor(c.tipo),
                                                    }}
                                                >
                                                    {c.tipo || '—'}
                                                </span>
                                            </div>
                                            <div>
                                                <div className="kicker mb-1">Plan</div>
                                                <div className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                                                    {c.tipo_plan || '—'}
                                                </div>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="kicker mb-1">Valor mensual</div>
                                                <div className="numeral text-[1.4rem] leading-none">
                                                    {formatCOP(c.valor_mensual)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Acciones */}
                                    <div className="lg:col-span-2 flex flex-col justify-center gap-2">
                                        <button onClick={() => openEditModal(c)} className="btn-secondary text-[12px]">
                                            Editar
                                        </button>
                                        <button
                                            onClick={() => handleDelete(c)}
                                            className="btn-ghost text-[12px]"
                                            style={{ color: 'var(--negative)' }}
                                        >
                                            Eliminar
                                        </button>
                                        {c.archivo_contrato && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const url = await getSignedPdfUrl('contrato', c.id);
                                                        window.open(url, '_blank');
                                                    } catch { /* silencioso */ }
                                                }}
                                                className="btn-ghost text-[12px]"
                                                style={{ color: 'var(--accent)' }}
                                            >
                                                Ver PDF
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Paginación */}
            <div className="flex justify-center items-center gap-4 py-2">
                <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    ← Anterior
                </button>
                <span className="kicker">
                    Página <span className="font-mono text-[13px]" style={{ color: 'var(--ink)' }}>{page}</span>
                </span>
                <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore || loading}
                    className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Siguiente →
                </button>
            </div>
        </div>
    );
}
