import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/apiClient';
import type { Categoria, CategoriaRol, CategoriaUsuario, ModuloAccesoRol, ModuloAccesoUsuario } from '../types/auth';



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
    const [newRolId, setNewRolId] = useState('');
    const [newRolNombre, setNewRolNombre] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [activeTab, setActiveTab] = useState<'roles' | 'usuarios'>('roles');

    // Pagos Access Modal state
    const [showPagosModal, setShowPagosModal] = useState(false);
    const [pagosRoles, setPagosRoles] = useState<ModuloAccesoRol[]>([]);
    const [pagosUsuarios, setPagosUsuarios] = useState<ModuloAccesoUsuario[]>([]);
    const [newPagosRolId, setNewPagosRolId] = useState('');
    const [newPagosRolNombre, setNewPagosRolNombre] = useState('');
    const [newPagosEmail, setNewPagosEmail] = useState('');
    const [pagosActiveTab, setPagosActiveTab] = useState<'roles' | 'usuarios'>('roles');

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

    async function loadPagosAccess() {
        try {
            const [roles, usuarios] = await Promise.all([
                apiGet<ModuloAccesoRol[]>('/categorias/modulos/PAGOS/roles'),
                apiGet<ModuloAccesoUsuario[]>('/categorias/modulos/PAGOS/usuarios')
            ]);
            setPagosRoles(roles);
            setPagosUsuarios(usuarios);
        } catch (err) {
            console.error('Error loading pagos access', err);
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

    async function handleAssignEmail() {
        if (!selectedCategoria || !newEmail) return;
        try {
            await apiPost(`/categorias/${selectedCategoria.id}/usuarios`, {
                email: newEmail.trim()
            });
            const updated = await apiGet<Categoria>(`/categorias/${selectedCategoria.id}`);
            setSelectedCategoria(updated);
            setNewEmail('');
            loadCategorias();
        } catch (err: any) {
            setError(err.message || 'Error al asignar correo');
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

    async function handleRemoveEmail(email: string) {
        if (!selectedCategoria) return;
        try {
            await apiDelete(`/categorias/${selectedCategoria.id}/usuarios/${email}`);
            const updated = await apiGet<Categoria>(`/categorias/${selectedCategoria.id}`);
            setSelectedCategoria(updated);
            loadCategorias();
        } catch (err) {
            setError('Error removing user email');
            console.error(err);
        }
    }

    function openRoleModal(categoria: Categoria) {
        setSelectedCategoria(categoria);
        setActiveTab('roles');
    }

    // Pagos Access Handlers
    function openPagosModal() {
        loadPagosAccess();
        setShowPagosModal(true);
        setPagosActiveTab('roles');
    }

    async function handleAssignPagosRole() {
        if (!newPagosRolId) return;
        try {
            await apiPost('/categorias/modulos/PAGOS/roles', {
                rol_id: parseInt(newPagosRolId),
                rol_nombre: newPagosRolNombre || `Rol ${newPagosRolId}`,
                modulo: 'PAGOS'
            });
            setNewPagosRolId('');
            setNewPagosRolNombre('');
            loadPagosAccess();
        } catch (err) {
            setError('Error asignando rol a pagos');
            console.error(err);
        }
    }

    async function handleAssignPagosEmail() {
        if (!newPagosEmail) return;
        try {
            await apiPost('/categorias/modulos/PAGOS/usuarios', {
                email: newPagosEmail.trim(),
                modulo: 'PAGOS'
            });
            setNewPagosEmail('');
            loadPagosAccess();
        } catch (err: any) {
            setError(err.message || 'Error al asignar correo a pagos');
            console.error(err);
        }
    }

    async function handleRemovePagosRole(rolId: number) {
        try {
            await apiDelete(`/categorias/modulos/PAGOS/roles/${rolId}`);
            loadPagosAccess();
        } catch (err) {
            setError('Error removiendo rol de pagos');
            console.error(err);
        }
    }

    async function handleRemovePagosEmail(email: string) {
        try {
            await apiDelete(`/categorias/modulos/PAGOS/usuarios/${email}`);
            loadPagosAccess();
        } catch (err) {
            setError('Error removiendo correo de pagos');
            console.error(err);
        }
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
                <div className="flex gap-3">
                    <button
                        onClick={openPagosModal}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Acceso a Pagos
                    </button>
                    <button
                        onClick={() => {
                            setShowForm(true);
                            setEditingId(null);
                            setFormData({ nombre: '', descripcion: '', color: '#6366f1', activa: true });
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Nueva Categoría
                    </button>
                </div>
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
                            Configuración de Acceso a "{selectedCategoria.nombre}"
                        </h2>
                        
                        {/* Tabs */}
                        <div className="flex gap-4 border-b mb-4">
                            <button
                                className={`pb-2 px-1 font-medium text-sm transition-colors ${activeTab === 'roles' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                onClick={() => setActiveTab('roles')}
                            >
                                Por Rol
                            </button>
                            <button
                                className={`pb-2 px-1 font-medium text-sm transition-colors ${activeTab === 'usuarios' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                onClick={() => setActiveTab('usuarios')}
                            >
                                Por Correo Individual
                            </button>
                        </div>

                        {activeTab === 'roles' ? (
                            <>
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
                            </>
                        ) : (
                            <>
                                <p className="text-slate-600 text-sm mb-4">
                                    Añade correos específicos para dar acceso directo a usuarios particulares
                                </p>

                                {/* Current Emails */}
                                <div className="mb-4">
                                    <h3 className="text-sm font-medium text-slate-700 mb-2">Correos Autorizados</h3>
                                    {selectedCategoria.usuarios && selectedCategoria.usuarios.length > 0 ? (
                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                            {selectedCategoria.usuarios.map((usr: CategoriaUsuario) => (
                                                <div key={usr.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded">
                                                    <span className="text-sm">{usr.email}</span>
                                                    <button
                                                        onClick={() => handleRemoveEmail(usr.email)}
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
                                        <p className="text-slate-500 text-sm italic">No hay correos asignados manualmente</p>
                                    )}
                                </div>

                                {/* Add new Email */}
                                <div className="border-t pt-4">
                                    <h3 className="text-sm font-medium text-slate-700 mb-3">Agregar Correo</h3>
                                    <div className="space-y-3">
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                                type="email"
                                                placeholder="Ej. juan.perez@empresa.com"
                                                value={newEmail}
                                                onChange={e => setNewEmail(e.target.value)}
                                                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                                            />
                                        </div>
                                        <button
                                            onClick={handleAssignEmail}
                                            disabled={!newEmail}
                                            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                        >
                                            Autorizar Correo
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

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

            {/* Pagos Access Modal */}
            {showPagosModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg">
                        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2 text-emerald-700">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Autorización: Módulo de Pagos
                        </h2>
                        
                        {/* Tabs */}
                        <div className="flex gap-4 border-b mb-4">
                            <button
                                className={`pb-2 px-1 font-medium text-sm transition-colors ${pagosActiveTab === 'roles' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                                onClick={() => setPagosActiveTab('roles')}
                            >
                                Por Rol
                            </button>
                            <button
                                className={`pb-2 px-1 font-medium text-sm transition-colors ${pagosActiveTab === 'usuarios' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                                onClick={() => setPagosActiveTab('usuarios')}
                            >
                                Por Correo Individual
                            </button>
                        </div>

                        {pagosActiveTab === 'roles' ? (
                            <>
                                <p className="text-slate-600 text-sm mb-4">
                                    Los usuarios con estos roles podrán acceder a la pestaña de Pagos y Consolidado.
                                </p>

                                {/* Current roles */}
                                <div className="mb-4">
                                    <h3 className="text-sm font-medium text-slate-700 mb-2">Roles Autorizados</h3>
                                    {pagosRoles.length > 0 ? (
                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                            {pagosRoles.map((rol: ModuloAccesoRol) => (
                                                <div key={rol.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded">
                                                    <span>{rol.rol_nombre} (ID: {rol.rol_id})</span>
                                                    <button
                                                        onClick={() => handleRemovePagosRole(rol.rol_id)}
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
                                        <p className="text-slate-500 text-sm italic">No hay roles autorizados</p>
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
                                                value={newPagosRolId}
                                                onChange={e => setNewPagosRolId(e.target.value)}
                                                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Nombre del Rol"
                                                value={newPagosRolNombre}
                                                onChange={e => setNewPagosRolNombre(e.target.value)}
                                                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500"
                                            />
                                        </div>
                                        <button
                                            onClick={handleAssignPagosRole}
                                            disabled={!newPagosRolId}
                                            className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                        >
                                            Autorizar Rol
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-slate-600 text-sm mb-4">
                                    Añade correos específicos para dar acceso directo a usuarios particulares al módulo de Pagos.
                                </p>

                                {/* Current Emails */}
                                <div className="mb-4">
                                    <h3 className="text-sm font-medium text-slate-700 mb-2">Correos Autorizados</h3>
                                    {pagosUsuarios.length > 0 ? (
                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                            {pagosUsuarios.map((usr: ModuloAccesoUsuario) => (
                                                <div key={usr.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded">
                                                    <span className="text-sm">{usr.email}</span>
                                                    <button
                                                        onClick={() => handleRemovePagosEmail(usr.email)}
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
                                        <p className="text-slate-500 text-sm italic">No hay correos asignados manualmente</p>
                                    )}
                                </div>

                                {/* Add new Email */}
                                <div className="border-t pt-4">
                                    <h3 className="text-sm font-medium text-slate-700 mb-3">Agregar Correo</h3>
                                    <div className="space-y-3">
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                                type="email"
                                                placeholder="Ej. juan.perez@empresa.com"
                                                value={newPagosEmail}
                                                onChange={e => setNewPagosEmail(e.target.value)}
                                                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500"
                                            />
                                        </div>
                                        <button
                                            onClick={handleAssignPagosEmail}
                                            disabled={!newPagosEmail}
                                            className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                        >
                                            Autorizar Correo
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="flex justify-end mt-6">
                            <button
                                onClick={() => setShowPagosModal(false)}
                                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
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
                            <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Roles / Usuarios</th>
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
                                        className="text-indigo-600 hover:text-indigo-700 flex flex-col gap-1 text-sm bg-indigo-50 px-2 py-1.5 rounded"
                                    >
                                        <div className="flex items-center gap-1 font-medium">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                            Administrar Accesos
                                        </div>
                                        <div className="text-xs text-indigo-500 font-normal">
                                            {cat.roles?.length || 0} roles • {cat.usuarios?.length || 0} correos
                                        </div>
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
