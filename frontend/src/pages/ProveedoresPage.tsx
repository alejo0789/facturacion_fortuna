import { useState, useEffect, useMemo } from 'react';
import type { Proveedor } from '../types';
import DataTable from '../components/DataTable';
import Modal, { FormField, inputClassName } from '../components/Modal';
import { apiGet, apiPost, apiPut, apiDelete, API_URL } from '../utils/apiClient';

interface CategoriaSimple {
    id: number;
    nombre: string;
    color?: string;
}

// Estado para la búsqueda en Oracle
interface OracleSearchState {
    status: 'idle' | 'searching' | 'found' | 'not_found' | 'already_exists' | 'error';
    message: string;
    nombre: string | null;
    nit: string | null;
}

export default function ProveedoresPage() {
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [categorias, setCategorias] = useState<CategoriaSimple[]>([]);
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Proveedor | null>(null);
    const [formData, setFormData] = useState<Partial<Proveedor>>({});
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [addingCategory, setAddingCategory] = useState(false);
    const [newCategoryId, setNewCategoryId] = useState('');
    const [initialCategoryId, setInitialCategoryId] = useState('');

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
            const params: any = {};
            if (selectedCategoriaId) params.categoria_id = selectedCategoriaId;
            const res = await apiGet<Proveedor[]>('/proveedores/', params);
            setProveedores(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCategorias = async () => {
        try {
            const res = await apiGet<CategoriaSimple[]>('/categorias/mis-categorias');
            setCategorias(res);
        } catch (err) {
            console.error('Error loading categories:', err);
        }
    };

    useEffect(() => {
        fetchCategorias();
    }, []);

    useEffect(() => { 
        fetchData(); 
    }, [selectedCategoriaId]);

    // Client-side filtering
    const filteredData = useMemo(() => {
        if (!search.trim()) return proveedores;
        const term = search.toLowerCase();
        return proveedores.filter(p =>
            p.nit?.toLowerCase().includes(term) ||
            p.nombre?.toLowerCase().includes(term) ||
            p.nombre_comercial?.toLowerCase().includes(term)
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
            const endpoint = editingItem
                ? `/proveedores/${editingItem.id}`
                : `/proveedores/`;

            const payload = {
                nit: formData.nit,
                nombre: formData.nombre || 'PENDING_ORACLE_LOOKUP',
                nombre_comercial: formData.nombre_comercial || null
            };

            let savedProveedor: Proveedor;
            if (editingItem) {
                savedProveedor = await apiPut<Proveedor>(endpoint, payload);
            } else {
                savedProveedor = await apiPost<Proveedor>(endpoint, payload);
                // Si es nuevo, autorizarlo automáticamente para la categoría inicial seleccionada
                if (initialCategoryId) {
                    await apiPost<Proveedor>(`/proveedores/${savedProveedor.id}/autorizar-categoria`, {
                        categoria_id: parseInt(initialCategoryId)
                    });
                }
            }

            setIsModalOpen(false);
            setEditingItem(null);
            setFormData({});
            setInitialCategoryId('');
            setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
            fetchData();
        } catch (err: any) {
            alert(err.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const handleAssignCategory = async () => {
        if (!editingItem || !newCategoryId) return;
        setAddingCategory(true);
        try {
            const updated = await apiPost<Proveedor>(`/proveedores/${editingItem.id}/autorizar-categoria`, {
                categoria_id: parseInt(newCategoryId)
            });
            setEditingItem(updated);
            setFormData(updated);
            setNewCategoryId('');
            // Also update the list in background
            fetchData();
        } catch (err: any) {
            alert(err.message || 'Error al autorizar categoría');
        } finally {
            setAddingCategory(false);
        }
    };

    const handleRemoveCategory = async (categoriaId: number) => {
        if (!editingItem) return;
        if (!confirm('¿Quitar autorización para esta área?')) return;
        try {
            await apiDelete(`/proveedores/${editingItem.id}/desautorizar-categoria/${categoriaId}`);
            // Remove locally to update UI immediately
            const updatedItem = {
                ...editingItem,
                categorias_autorizadas: editingItem.categorias_autorizadas?.filter(c => c.categoria_id !== categoriaId)
            };
            setEditingItem(updatedItem);
            setFormData(updatedItem);
            fetchData();
        } catch (err: any) {
            alert(err.message || 'Error al quitar categoría');
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
        try {
            await apiDelete(`/proveedores/${item.id}`);
            fetchData();
        } catch (err: any) {
            alert(err.message || 'Error al eliminar');
        }
    };

    const openNewModal = () => {
        setFormData({});
        setEditingItem(null);
        setInitialCategoryId(categorias.length === 1 ? String(categorias[0].id) : ''); // Select first if only one
        setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
        setIsModalOpen(true);
    };

    const columns = [
        { key: 'nit', header: 'NIT' },
        { key: 'nombre', header: 'Nombre Legal' },
        { key: 'nombre_comercial', header: 'Nombre Comercial' },
        { 
            key: 'categorias', 
            header: 'Áreas Autorizadas',
            render: (item: Proveedor) => (
                <div className="flex flex-wrap gap-1">
                    {item.categorias_autorizadas && item.categorias_autorizadas.length > 0 ? (
                        item.categorias_autorizadas.map(cat => (
                            <span 
                                key={cat.categoria_id} 
                                className="px-2 py-0.5 text-xs font-medium rounded-full text-white cursor-help"
                                style={{ backgroundColor: cat.categoria_color || '#6366f1' }}
                                title={`Autorizado por: ${cat.autorizado_por || 'desconocido'}`}
                            >
                                {cat.categoria_nombre}
                            </span>
                        ))
                    ) : (
                        <span className="text-gray-400 text-xs italic">Ninguna</span>
                    )}
                </div>
            )
        },
    ];

    // Determinar si se puede guardar
    const canSave = editingItem
        ? (formData.nit && formData.nombre)
        : ((oracleSearch.status === 'found' || oracleSearch.status === 'already_exists') && oracleSearch.nombre && initialCategoryId);

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

            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-64">
                    <select
                        value={selectedCategoriaId}
                        onChange={(e) => setSelectedCategoriaId(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                        <option value="">Todas las áreas</option>
                        {categorias.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                        ))}
                    </select>
                </div>
                <div className="relative flex-1">
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
                    {(editingItem || oracleSearch.status === 'found' || oracleSearch.status === 'already_exists') && (
                        <FormField label="Nombre del Proveedor (Legal)" required>
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

                    {/* Campo Nombre Comercial (opcional) */}
                    {(editingItem || oracleSearch.status === 'found' || oracleSearch.status === 'already_exists') && (
                        <FormField label="Nombre Comercial (Opcional)">
                            <input
                                className={inputClassName}
                                placeholder="Ej: Claro, Movistar, ETB..."
                                value={formData.nombre_comercial || ''}
                                onChange={e => setFormData({ ...formData, nombre_comercial: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Nombre comercial o de marca. Se usará para búsquedas en contratos, facturas y reportes.
                            </p>
                        </FormField>
                    )}

                    {/* Categoría Inicial para Proveedor Nuevo */}
                    {!editingItem && (oracleSearch.status === 'found' || oracleSearch.status === 'already_exists') && (
                        <FormField label="Área de Autorización Inicial" required>
                            <select
                                className={inputClassName}
                                value={initialCategoryId}
                                onChange={e => setInitialCategoryId(e.target.value)}
                            >
                                <option value="">Seleccione el área donde operará...</option>
                                {categorias.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                El proveedor se creará e inmediatamente será autorizado para esta área.
                            </p>
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

                    {/* Autorizaciones por Área (Solo al Editar) */}
                    {editingItem && (
                        <div className="border-t pt-4 mt-4">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Áreas Autorizadas</h3>
                            
                            {/* Lista de autorizadas actuales */}
                            <div className="space-y-2 mb-4">
                                {editingItem.categorias_autorizadas && editingItem.categorias_autorizadas.length > 0 ? (
                                    editingItem.categorias_autorizadas.map(cat => (
                                        <div key={cat.categoria_id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.categoria_color || '#6366f1' }}></div>
                                                    <span className="text-sm font-medium">{cat.categoria_nombre}</span>
                                                </div>
                                                {cat.autorizado_por && (
                                                    <span className="text-xs text-gray-500 mt-0.5 ml-5">
                                                        Autorizado por: {cat.autorizado_por}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveCategory(cat.categoria_id)}
                                                className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
                                            >
                                                Quitar
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500 italic">Este proveedor no está autorizado en ninguna área.</p>
                                )}
                            </div>

                            {/* Agregar nueva autorización */}
                            <div className="flex gap-2">
                                <select
                                    value={newCategoryId}
                                    onChange={e => setNewCategoryId(e.target.value)}
                                    className="flex-1 text-sm border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                >
                                    <option value="">Seleccione un área para autorizar...</option>
                                    {categorias
                                        .filter(c => !editingItem.categorias_autorizadas?.some(ec => ec.categoria_id === c.id))
                                        .map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={handleAssignCategory}
                                    disabled={!newCategoryId || addingCategory}
                                    className="px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                    {addingCategory ? 'Autorizando...' : 'Autorizar'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
