import { useState, useEffect, useCallback } from 'react';
import type { Oficina } from '../types';
import DataTable from '../components/DataTable';
import Modal, { FormField, inputClassName } from '../components/Modal';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../utils/apiClient';

export default function OficinasPage() {
    const [oficinas, setOficinas] = useState<Oficina[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Oficina | null>(null);
    const [formData, setFormData] = useState<Partial<Oficina>>({});
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const ITEMS_PER_PAGE = 20;

    const fetchOficinas = useCallback(async (searchQuery: string, pageNum: number) => {
        setLoading(true);
        try {
            const skip = (pageNum - 1) * ITEMS_PER_PAGE;
            const params: Record<string, string | number> = { skip, limit: ITEMS_PER_PAGE };
            if (searchQuery.trim()) params.search = searchQuery.trim();

            const data = await apiGet<Oficina[]>('/oficinas/', params);
            setOficinas(data);
            setHasMore(data.length === ITEMS_PER_PAGE);
        } catch (error) {
            console.error('Failed to fetch offices', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchOficinas(search, 1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const [isInitialMount, setIsInitialMount] = useState(true);
    useEffect(() => {
        if (isInitialMount) {
            setIsInitialMount(false);
            return;
        }
        fetchOficinas(search, page);
    }, [page]);

    const handleSave = async () => {
        try {
            if (editingItem) await apiPut(`/oficinas/${editingItem.id}`, formData);
            else await apiPost('/oficinas/', formData);
            setIsModalOpen(false);
            setEditingItem(null);
            setFormData({});
            fetchOficinas(search, page);
        } catch (err) {
            alert(err instanceof ApiError ? err.message : 'Error al guardar');
        }
    };

    const handleEdit = (item: Oficina) => {
        setEditingItem(item);
        setFormData(item);
        setIsModalOpen(true);
    };

    const handleDelete = async (item: Oficina) => {
        if (!confirm('¿Está seguro de eliminar esta oficina?')) return;
        try {
            await apiDelete(`/oficinas/${item.id}`);
            fetchOficinas(search, page);
        } catch (err) {
            alert(err instanceof ApiError ? err.message : 'Error al eliminar');
        }
    };

    const openNewModal = () => {
        setFormData({});
        setEditingItem(null);
        setIsModalOpen(true);
    };

    const columns = [
        { key: 'cod_oficina', header: 'Código' },
        { key: 'nombre', header: 'Nombre' },
        { key: 'direccion', header: 'Dirección' },
        { key: 'ciudad', header: 'Ciudad' },
        { key: 'zona', header: 'Zona' },
        { key: 'tipo_sitio', header: 'Tipo Sitio' },
    ];

    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Maestros · Sedes y puntos</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Oficinas <em>activas</em>.
                    </h1>
                    <button onClick={openNewModal} className="btn-accent">
                        + Nueva oficina
                    </button>
                </div>
            </div>

            <div className="surface p-4 relative">
                <input
                    type="text"
                    placeholder="Buscar por código, nombre, ciudad, zona, dirección…"
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

            <DataTable
                data={oficinas}
                columns={columns}
                loading={loading}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

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

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingItem ? 'Editar oficina' : 'Nueva oficina'}
                onSubmit={handleSave}
            >
                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Código oficina">
                        <input
                            className={inputClassName}
                            placeholder="Ej: 177007"
                            value={formData.cod_oficina || ''}
                            onChange={(e) => setFormData({ ...formData, cod_oficina: e.target.value })}
                        />
                    </FormField>
                    <FormField label="Nombre" required>
                        <input
                            className={inputClassName}
                            placeholder="Ej: PIAMONTE"
                            value={formData.nombre || ''}
                            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        />
                    </FormField>
                    <FormField label="Ciudad">
                        <input
                            className={inputClassName}
                            placeholder="Ej: POPAYAN"
                            value={formData.ciudad || ''}
                            onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                        />
                    </FormField>
                    <FormField label="Zona">
                        <input
                            className={inputClassName}
                            placeholder="Ej: CENTRO SUR"
                            value={formData.zona || ''}
                            onChange={(e) => setFormData({ ...formData, zona: e.target.value })}
                        />
                    </FormField>
                    <div className="col-span-2">
                        <FormField label="Dirección">
                            <input
                                className={inputClassName}
                                placeholder="Ej: Barrio Villa los Prados"
                                value={formData.direccion || ''}
                                onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                            />
                        </FormField>
                    </div>
                    <FormField label="Tipo de sitio">
                        <select
                            className={inputClassName}
                            value={formData.tipo_sitio || ''}
                            onChange={(e) => setFormData({ ...formData, tipo_sitio: e.target.value })}
                        >
                            <option value="">Seleccionar…</option>
                            <option value="OFICINA">Oficina</option>
                            <option value="PUNTO DE VENTA">Punto de venta</option>
                            <option value="SEDE ADMINISTRATIVA">Sede administrativa</option>
                        </select>
                    </FormField>
                    <FormField label="DUDE">
                        <select
                            className={inputClassName}
                            value={formData.dude || ''}
                            onChange={(e) => setFormData({ ...formData, dude: e.target.value })}
                        >
                            <option value="">No</option>
                            <option value="si">Sí</option>
                        </select>
                    </FormField>
                </div>
            </Modal>
        </div>
    );
}
