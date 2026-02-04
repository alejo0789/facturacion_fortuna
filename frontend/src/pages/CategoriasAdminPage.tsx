import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/apiClient';
import type { Categoria, CategoriaRol } from '../types/auth';

interface RolDisponible {
    id: number;
    nombre: string;
}

export default function CategoriasAdminPage() {
    const { isSuperAdmin, loading: authLoading, user } = useAuth();
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        nombre: '',
        descripcion: '',
        color: '#6366f1',
        activa: true
    });

    // Role assignment state
    const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null);
    const [rolesDisponibles, setRolesDisponibles] = useState<RolDisponible[]>([]);
    const [newRolId, setNewRolId] = useState('');
    const [newRolNombre, setNewRolNombre] = useState('');

    useEffect(() => {
        if (!authLoading) {
            loadCategorias();
        }
    }, [authLoading]);

    async function loadCategorias() {
        try {
            setLoading(true);
            const data = await apiGet<Categoria[]>('/categorias/');
            setCategorias(data);
        } catch (err) {
            setError('Error loading categories');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function loadRolesDisponibles() {
        try {
            const data = await apiGet<RolDisponible[]>('/categorias/roles-disponibles');
            setRolesDisponibles(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Could not load roles from parent system:', err);
            // If API fails, allow manual entry
            setRolesDisponibles([]);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            if (editingId) {
                await apiPut(`/categorias/${editingId}`, formData);
            } else {
                await apiPost('/categorias/', formData);
            }
            setShowForm(false);
            setEditingId(null);
            setFormData({ nombre: '', descripcion: '', color: '#6366f1', activa: true });
            loadCategorias();
        } catch (err) {
            setError('Error saving category');
            console.error(err);
        }
    }

    async function handleDelete(id: number) {
        if (!confirm('¿Está seguro de eliminar esta categoría?')) return;
        try {
            await apiDelete(`/categorias/${id}`);
            loadCategorias();
        } catch (err) {
            setError('Error deleting category');
            console.error(err);
        }
    }

    async function handleAssignRole() {
        if (!selectedCategoria || !newRolId) return;
        try {
            await apiPost(`/categorias/${selectedCategoria.id}/roles`, {
                rol_id: parseInt(newRolId),
                rol_nombre: newRolNombre || `Rol ${newRolId}`
            });
            // Refresh category to get updated roles
            const updated = await apiGet<Categoria>(`/categorias/${selectedCategoria.id}`);
            setSelectedCategoria(updated);
            setNewRolId('');
            setNewRolNombre('');
            loadCategorias();
        } catch (err) {
            setError('Error assigning role');
            console.error(err);
        }
    }

    async function handleRemoveRole(rolId: number) {
        if (!selectedCategoria) return;
        try {
            await apiDelete(`/categorias/${selectedCategoria.id}/roles/${rolId}`);
            const updated = await apiGet<Categoria>(`/categorias/${selectedCategoria.id}`);
            setSelectedCategoria(updated);
            loadCategorias();
        } catch (err) {
            setError('Error removing role');
            console.error(err);
        }
    }

    function openRoleModal(categoria: Categoria) {
        setSelectedCategoria(categoria);
        loadRolesDisponibles();
    }

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!isSuperAdmin) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-lg mx-auto mt-10">
                <h2 className="text-lg font-semibold text-red-700 mb-2">Acceso Denegado</h2>
                <p className="text-red-600">
                    Solo los Super Administradores pueden acceder a esta página.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Administración de Categorías</h1>
                    <p className="text-slate-600">
                        Gestiona las categorías de facturas y asigna roles
                    </p>
                </div>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setEditingId(null);
                        setFormData({ nombre: '', descripcion: '', color: '#6366f1', activa: true });
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nueva Categoría
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                    {error}
                    <button onClick={() => setError(null)} className="float-right">&times;</button>
                </div>
            )}

            {/* Category Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md">
                        <h2 className="text-lg font-semibold mb-4">
                            {editingId ? 'Editar Categoría' : 'Nueva Categoría'}
                        </h2>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Nombre
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.nombre}
                                        onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Descripción
                                    </label>
                                    <textarea
                                        value={formData.descripcion}
                                        onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2"
                                        rows={3}
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Color
                                        </label>
                                        <input
                                            type="color"
                                            value={formData.color}
                                            onChange={e => setFormData({ ...formData, color: e.target.value })}
                                            className="w-12 h-10 border rounded cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="activa"
                                            checked={formData.activa}
                                            onChange={e => setFormData({ ...formData, activa: e.target.checked })}
                                            className="rounded"
                                        />
                                        <label htmlFor="activa" className="text-sm font-medium text-slate-700">
                                            Activa
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Role Assignment Modal */}
            {selectedCategoria && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg">
                        <h2 className="text-lg font-semibold mb-2">
                            Roles de "{selectedCategoria.nombre}"
                        </h2>
                        <p className="text-slate-600 text-sm mb-4">
                            Los usuarios con estos roles podrán ver las facturas de esta categoría
                        </p>

                        {/* Current roles */}
                        <div className="mb-4">
                            <h3 className="text-sm font-medium text-slate-700 mb-2">Roles Asignados</h3>
                            {selectedCategoria.roles && selectedCategoria.roles.length > 0 ? (
                                <div className="space-y-2">
                                    {selectedCategoria.roles.map((rol: CategoriaRol) => (
                                        <div key={rol.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded">
                                            <span>{rol.rol_nombre} (ID: {rol.rol_id})</span>
                                            <button
                                                onClick={() => handleRemoveRole(rol.rol_id)}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-500 text-sm italic">No hay roles asignados</p>
                            )}
                        </div>

                        {/* Add new role */}
                        <div className="border-t pt-4">
                            <h3 className="text-sm font-medium text-slate-700 mb-3">Agregar Rol</h3>
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="number"
                                        placeholder="ID del Rol"
                                        value={newRolId}
                                        onChange={e => setNewRolId(e.target.value)}
                                        className="flex-1 border rounded-lg px-3 py-2 text-sm"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Nombre del Rol"
                                        value={newRolNombre}
                                        onChange={e => setNewRolNombre(e.target.value)}
                                        className="flex-1 border rounded-lg px-3 py-2 text-sm"
                                    />
                                </div>
                                <button
                                    onClick={handleAssignRole}
                                    disabled={!newRolId}
                                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                                >
                                    Agregar Rol
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end mt-6">
                            <button
                                onClick={() => setSelectedCategoria(null)}
                                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Categories List */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Color</th>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Nombre</th>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Descripción</th>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Roles</th>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Estado</th>
                            <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {categorias.map(cat => (
                            <tr key={cat.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3">
                                    <div
                                        className="w-6 h-6 rounded-full border"
                                        style={{ backgroundColor: cat.color || '#6366f1' }}
                                    />
                                </td>
                                <td className="px-4 py-3 font-medium">{cat.nombre}</td>
                                <td className="px-4 py-3 text-slate-600 text-sm">{cat.descripcion || '-'}</td>
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => openRoleModal(cat)}
                                        className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                                    >
                                        <span>{cat.roles?.length || 0} roles</span>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${cat.activa
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-slate-100 text-slate-600'
                                        }`}>
                                        {cat.activa ? 'Activa' : 'Inactiva'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button
                                        onClick={() => {
                                            setEditingId(cat.id);
                                            setFormData({
                                                nombre: cat.nombre,
                                                descripcion: cat.descripcion || '',
                                                color: cat.color || '#6366f1',
                                                activa: cat.activa ?? true
                                            });
                                            setShowForm(true);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-700 mr-3"
                                    >
                                        Editar
                                    </button>
                                    <button
                                        onClick={() => handleDelete(cat.id)}
                                        className="text-red-600 hover:text-red-700"
                                    >
                                        Eliminar
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {categorias.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                    No hay categorías creadas
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-6 text-sm text-slate-500">
                <p>Usuario actual: {user?.primer_nombre} {user?.primer_apellido} (ID: {user?.id})</p>
            </div>
        </div>
    );
}
