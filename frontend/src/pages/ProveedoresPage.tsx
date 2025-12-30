import { useState, useEffect, useMemo } from 'react';
import type { Proveedor } from '../types';
import DataTable from '../components/DataTable';
import Modal, { FormField, inputClassName } from '../components/Modal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Estado para la búsqueda en Oracle
interface OracleSearchState {
    status: 'idle' | 'searching' | 'found' | 'not_found' | 'already_exists' | 'error';
    message: string;
    nombre: string | null;
    nit: string | null;
}

export default function ProveedoresPage() {
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Proveedor | null>(null);
    const [formData, setFormData] = useState<Partial<Proveedor>>({});
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);

    // Estado para búsqueda en Oracle
    const [oracleSearch, setOracleSearch] = useState<OracleSearchState>({
        status: 'idle',
        message: '',
        nombre: null,
        nit: null
    });

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
            p.nombre?.toLowerCase().includes(term)
        );
    }, [proveedores, search]);

    // Buscar proveedor en Oracle
    const searchInOracle = async (nit: string) => {
        if (!nit || nit.trim().length < 5) {
            setOracleSearch({
                status: 'idle',
                message: 'Ingrese un NIT válido (mínimo 5 dígitos)',
                nombre: null,
                nit: null
            });
            return;
        }

        setOracleSearch({
            status: 'searching',
            message: 'Buscando en Manager...',
            nombre: null,
            nit: null
        });

        try {
            const res = await fetch(`${API_URL}/proveedores/buscar-oracle/${nit.trim()}`);
            const data = await res.json();

            if (!res.ok) {
                setOracleSearch({
                    status: 'error',
                    message: data.detail || 'Error al consultar Manager',
                    nombre: null,
                    nit: null
                });
                return;
            }

            if (data.already_exists) {
                setOracleSearch({
                    status: 'already_exists',
                    message: `Este proveedor ya existe: ${data.nombre}`,
                    nombre: data.nombre,
                    nit: data.nit
                });
            } else if (data.found) {
                setOracleSearch({
                    status: 'found',
                    message: `Encontrado en Manager`,
                    nombre: data.nombre,
                    nit: data.nit
                });
                // Actualizar formData con el nombre encontrado
                setFormData(prev => ({ ...prev, nombre: data.nombre, nit: data.nit }));
            } else {
                setOracleSearch({
                    status: 'not_found',
                    message: 'No se encontró en Manager (VINCULADO)',
                    nombre: null,
                    nit: data.nit
                });
            }
        } catch (err) {
            setOracleSearch({
                status: 'error',
                message: 'Error de conexión con el servidor',
                nombre: null,
                nit: null
            });
        }
    };

    const handleSave = async () => {
        if (!formData.nit) return;

        setSaving(true);
        try {
            const method = editingItem ? 'PUT' : 'POST';
            const url = editingItem
                ? `${API_URL}/proveedores/${editingItem.id}`
                : `${API_URL}/proveedores/`;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nit: formData.nit,
                    nombre: formData.nombre || 'PENDING_ORACLE_LOOKUP'
                })
            });

            if (!res.ok) {
                const error = await res.json();
                alert(error.detail || 'Error al guardar');
                return;
            }

            setIsModalOpen(false);
            setEditingItem(null);
            setFormData({});
            setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
            fetchData();
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (item: Proveedor) => {
        setEditingItem(item);
        setFormData(item);
        setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
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
        setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
        setIsModalOpen(true);
    };

    const columns = [
        { key: 'nit', header: 'NIT' },
        { key: 'nombre', header: 'Proveedor' },
    ];

    // Determinar si se puede guardar
    const canSave = editingItem
        ? (formData.nit && formData.nombre)
        : (oracleSearch.status === 'found' && oracleSearch.nombre);

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
                submitDisabled={!canSave || saving}
                submitText={saving ? 'Guardando...' : (editingItem ? 'Guardar Cambios' : 'Agregar Proveedor')}
            >
                <div className="space-y-4">
                    {/* Campo NIT */}
                    <FormField label="NIT" required>
                        <div className="flex gap-2">
                            <input
                                className={inputClassName}
                                placeholder="Ej: 900123456"
                                value={formData.nit || ''}
                                onChange={e => {
                                    setFormData({ ...formData, nit: e.target.value });
                                    if (!editingItem) {
                                        setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
                                    }
                                }}
                                disabled={editingItem !== null}
                            />
                            {!editingItem && (
                                <button
                                    type="button"
                                    onClick={() => searchInOracle(formData.nit || '')}
                                    disabled={oracleSearch.status === 'searching' || !formData.nit}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                                             disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors
                                             whitespace-nowrap flex items-center gap-2"
                                >
                                    {oracleSearch.status === 'searching' ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Buscando...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            Buscar en Manager
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </FormField>

                    {/* Resultado de la búsqueda en Oracle */}
                    {!editingItem && oracleSearch.status !== 'idle' && (
                        <div className={`p-4 rounded-lg border ${oracleSearch.status === 'found'
                            ? 'bg-green-50 border-green-200'
                            : oracleSearch.status === 'already_exists'
                                ? 'bg-yellow-50 border-yellow-200'
                                : oracleSearch.status === 'searching'
                                    ? 'bg-blue-50 border-blue-200'
                                    : 'bg-red-50 border-red-200'
                            }`}>
                            <div className="flex items-start gap-3">
                                {oracleSearch.status === 'found' && (
                                    <svg className="h-5 w-5 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                                {oracleSearch.status === 'already_exists' && (
                                    <svg className="h-5 w-5 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                )}
                                {oracleSearch.status === 'searching' && (
                                    <svg className="animate-spin h-5 w-5 text-blue-500 mt-0.5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                                {(oracleSearch.status === 'not_found' || oracleSearch.status === 'error') && (
                                    <svg className="h-5 w-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                                <div>
                                    <p className={`font-medium ${oracleSearch.status === 'found'
                                        ? 'text-green-800'
                                        : oracleSearch.status === 'already_exists'
                                            ? 'text-yellow-800'
                                            : oracleSearch.status === 'searching'
                                                ? 'text-blue-800'
                                                : 'text-red-800'
                                        }`}>
                                        {oracleSearch.message}
                                    </p>
                                    {oracleSearch.nombre && (
                                        <p className="text-lg font-semibold mt-1 text-gray-900">
                                            {oracleSearch.nombre}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Campo Nombre (solo visible cuando se edita o cuando se encontró en Oracle) */}
                    {(editingItem || oracleSearch.status === 'found') && (
                        <FormField label="Nombre del Proveedor" required>
                            <input
                                className={`${inputClassName} ${!editingItem ? 'bg-gray-50' : ''}`}
                                placeholder="Nombre obtenido de Manager"
                                value={formData.nombre || ''}
                                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                readOnly={!editingItem}
                            />
                            {!editingItem && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Nombre obtenido automáticamente de Manager (VINCULADO)
                                </p>
                            )}
                        </FormField>
                    )}

                    {/* Instrucciones para nuevo proveedor */}
                    {!editingItem && oracleSearch.status === 'idle' && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg className="h-5 w-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div>
                                    <p className="text-blue-800 font-medium">Instrucciones</p>
                                    <p className="text-blue-700 text-sm mt-1">
                                        Ingrese el NIT del proveedor y haga clic en "Buscar en Manager" para
                                        verificar que existe en el sistema y obtener el nombre automáticamente.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
