import { useState, useEffect, useCallback } from 'react';
import type { Oficina } from '../types';
import DataTable from '../components/DataTable';
import Modal, { FormField, inputClassName } from '../components/Modal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

    // Server-side search with debouncing
    const fetchOficinas = useCallback(async (searchQuery: string, pageNum: number) => {
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

            const res = await fetch(`${API_URL}/oficinas/?${params}`);
            if (res.ok) {
                const data = await res.json();
                setOficinas(data);
                setHasMore(data.length === ITEMS_PER_PAGE);
            }
        } catch (error) {
            console.error("Failed to fetch offices", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounced search effect - only when search changes
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1); // Reset to page 1 when search changes
            fetchOficinas(search, 1);
        }, 300); // Wait 300ms after user stops typing

        return () => clearTimeout(timer);
    }, [search]); // Only depend on search, not fetchOficinas

    // Fetch when page changes (but not on initial mount or search change)
    const [isInitialMount, setIsInitialMount] = useState(true);

    useEffect(() => {
        if (isInitialMount) {
            setIsInitialMount(false);
            return;
        }
        fetchOficinas(search, page);
    }, [page]); // Only depend on page

    const handleSave = async () => {
        const method = editingItem ? 'PUT' : 'POST';
        const url = editingItem
            ? `${API_URL}/oficinas/${editingItem.id}`
            : `${API_URL}/oficinas/`;

        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        setIsModalOpen(false);
        setEditingItem(null);
        setFormData({});
        fetchOficinas(search, page);
    };

    const handleEdit = (item: Oficina) => {
        setEditingItem(item);
        setFormData(item);
        setIsModalOpen(true);
    };

    const handleDelete = async (item: Oficina) => {
        if (!confirm('¿Está seguro de eliminar esta oficina?')) return;
        await fetch(`${API_URL}/oficinas/${item.id}`, { method: 'DELETE' });
        fetchOficinas(search, page);
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
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Oficinas</h1>
                    <p className="text-gray-500 mt-1">Gestiona las oficinas y puntos de venta.</p>
                </div>
                <button onClick={openNewModal} className="btn-primary">
                    + Nueva Oficina
                </button>
            </div>

            {/* Search Bar - Server-side */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Buscar por código, nombre, ciudad, zona, dirección... (búsqueda en servidor)"
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

            <DataTable
                data={oficinas}
                columns={columns}
                loading={loading}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

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

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingItem ? 'Editar Oficina' : 'Nueva Oficina'}
                onSubmit={handleSave}
            >
                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Código Oficina">
                        <input
                            className={inputClassName}
                            placeholder="Ej: 177007"
                            value={formData.cod_oficina || ''}
                            onChange={e => setFormData({ ...formData, cod_oficina: e.target.value })}
                        />
                    </FormField>
                    <FormField label="Nombre" required>
                        <input
                            className={inputClassName}
                            placeholder="Ej: PIAMONTE"
                            value={formData.nombre || ''}
                            onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                        />
                    </FormField>
                    <FormField label="Ciudad">
                        <input
                            className={inputClassName}
                            placeholder="Ej: POPAYAN"
                            value={formData.ciudad || ''}
                            onChange={e => setFormData({ ...formData, ciudad: e.target.value })}
                        />
                    </FormField>
                    <FormField label="Zona">
                        <input
                            className={inputClassName}
                            placeholder="Ej: CENTRO SUR"
                            value={formData.zona || ''}
                            onChange={e => setFormData({ ...formData, zona: e.target.value })}
                        />
                    </FormField>
                    <div className="col-span-2">
                        <FormField label="Dirección">
                            <input
                                className={inputClassName}
                                placeholder="Ej: Barrio Villa los Prados"
                                value={formData.direccion || ''}
                                onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                            />
                        </FormField>
                    </div>
                    <FormField label="Tipo de Sitio">
                        <select
                            className={inputClassName}
                            value={formData.tipo_sitio || ''}
                            onChange={e => setFormData({ ...formData, tipo_sitio: e.target.value })}
                        >
                            <option value="">Seleccionar...</option>
                            <option value="OFICINA">Oficina</option>
                            <option value="PUNTO DE VENTA">Punto de Venta</option>
                            <option value="SEDE ADMINISTRATIVA">Sede Administrativa</option>
                        </select>
                    </FormField>
                    <FormField label="DUDE">
                        <select
                            className={inputClassName}
                            value={formData.dude || ''}
                            onChange={e => setFormData({ ...formData, dude: e.target.value })}
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
