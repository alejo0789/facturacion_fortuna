import { useState, useEffect, useMemo } from 'react';
import type { Proveedor } from '../types';
import DataTable from '../components/DataTable';
import Modal, { FormField, inputClassName } from '../components/Modal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function ProveedoresPage() {
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Proveedor | null>(null);
    const [formData, setFormData] = useState<Partial<Proveedor>>({});
    const [search, setSearch] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/proveedores/`);
            if (res.ok) setProveedores(await res.json());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Client-side filtering
    const filteredData = useMemo(() => {
        if (!search.trim()) return proveedores;
        const term = search.toLowerCase();
        return proveedores.filter(p =>
            p.nit?.toLowerCase().includes(term) ||
            p.nombre?.toLowerCase().includes(term) ||
            p.iva?.toLowerCase().includes(term)
        );
    }, [proveedores, search]);

    const handleSave = async () => {
        const method = editingItem ? 'PUT' : 'POST';
        const url = editingItem
            ? `${API_URL}/proveedores/${editingItem.id}`
            : `${API_URL}/proveedores/`;

        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        setIsModalOpen(false);
        setEditingItem(null);
        setFormData({});
        fetchData();
    };

    const handleEdit = (item: Proveedor) => {
        setEditingItem(item);
        setFormData(item);
        setIsModalOpen(true);
    };

    const handleDelete = async (item: Proveedor) => {
        if (!confirm('¿Está seguro de eliminar este proveedor?')) return;
        await fetch(`${API_URL}/proveedores/${item.id}`, { method: 'DELETE' });
        fetchData();
    };

    const openNewModal = () => {
        setFormData({});
        setEditingItem(null);
        setIsModalOpen(true);
    };

    const columns = [
        { key: 'nit', header: 'NIT' },
        { key: 'nombre', header: 'Proveedor' },
        { key: 'iva', header: 'IVA' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Proveedores</h1>
                    <p className="text-gray-500 mt-1">Gestiona los proveedores de servicios.</p>
                </div>
                <button onClick={openNewModal} className="btn-primary">
                    + Nuevo Proveedor
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Buscar por NIT o nombre del proveedor..."
                    className="w-full px-4 py-3 pl-11 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <svg className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            <DataTable
                data={filteredData}
                columns={columns}
                loading={loading}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingItem ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                onSubmit={handleSave}
            >
                <div className="space-y-4">
                    <FormField label="NIT" required>
                        <input
                            className={inputClassName}
                            placeholder="Ej: 900123456-7"
                            value={formData.nit || ''}
                            onChange={e => setFormData({ ...formData, nit: e.target.value })}
                        />
                    </FormField>
                    <FormField label="Nombre del Proveedor" required>
                        <input
                            className={inputClassName}
                            placeholder="Ej: REDES DE TELECOMUNICACIONES"
                            value={formData.nombre || ''}
                            onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                        />
                    </FormField>
                    <FormField label="IVA">
                        <input
                            className={inputClassName}
                            placeholder="Ej: 19%"
                            value={formData.iva || ''}
                            onChange={e => setFormData({ ...formData, iva: e.target.value })}
                        />
                    </FormField>
                </div>
            </Modal>
        </div>
    );
}
