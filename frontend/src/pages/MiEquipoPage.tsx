/**
 * Mi Equipo — gestión de usuarios y roles por empresa.
 *
 * Requiere rol ADMIN en la empresa activa.
 *
 *  - Lista usuarios de la firma (GET /api/usuarios/)
 *  - Crea un nuevo usuario (POST /api/usuarios/)
 *  - Asigna rol a (usuario, empresa_activa) (POST /api/usuarios/asignar-rol)
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost, ApiError } from '../utils/apiClient';
import { useAuth, type UserInfo } from '../auth/AuthContext';

const ROLES = [
    'ADMIN',
    'CONTADOR',
    'AUDITOR',
    'FACTURACION',
    'CONTABILIDAD',
    'PRODUCTOS',
    'VENTAS',
    'SOLO_LECTURA',
] as const;

type Rol = typeof ROLES[number];

export default function MiEquipoPage() {
    const { empresaActiva, user } = useAuth();
    const [users, setUsers] = useState<UserInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form — nuevo usuario
    const [nuevoEmail, setNuevoEmail] = useState('');
    const [nuevoNombre, setNuevoNombre] = useState('');
    const [nuevoPassword, setNuevoPassword] = useState('');
    const [nuevoRol, setNuevoRol] = useState<Rol>('FACTURACION');
    const [creating, setCreating] = useState(false);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiGet<UserInfo[]>('/api/usuarios/');
            setUsers(data);
        } catch (err) {
            if (err instanceof ApiError && err.status === 403) {
                setError('Necesitas rol ADMIN en la empresa activa para gestionar usuarios.');
            } else {
                setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        if (!empresaActiva) {
            setError('Selecciona una empresa activa antes de crear usuarios.');
            return;
        }
        if (nuevoPassword.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        setCreating(true);
        try {
            // 1. Crear el usuario en la firma
            const nuevoUser = await apiPost<UserInfo>('/api/usuarios/', {
                email: nuevoEmail.trim(),
                nombre: nuevoNombre.trim(),
                password: nuevoPassword,
            });
            // 2. Asignarle rol en la empresa activa
            await apiPost('/api/usuarios/asignar-rol', {
                usuario_id: nuevoUser.id,
                empresa_id: empresaActiva.id,
                rol: nuevoRol,
            });
            setSuccess(`Usuario ${nuevoUser.email} creado con rol ${nuevoRol} en ${empresaActiva.nombre}.`);
            setNuevoEmail(''); setNuevoNombre(''); setNuevoPassword('');
            await loadUsers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al crear usuario');
        } finally {
            setCreating(false);
        }
    };

    const handleAsignar = async (usuario_id: number, rol: Rol) => {
        setError(null);
        setSuccess(null);
        if (!empresaActiva) return;
        try {
            await apiPost('/api/usuarios/asignar-rol', {
                usuario_id,
                empresa_id: empresaActiva.id,
                rol,
            });
            setSuccess(`Rol ${rol} asignado.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al asignar rol');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Mi equipo</h1>
                <p className="text-sm text-slate-500">
                    Administra los usuarios de tu firma y asigna roles en{' '}
                    <span className="font-medium text-slate-700">
                        {empresaActiva?.nombre ?? 'la empresa activa'}
                    </span>.
                </p>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
            )}
            {success && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">{success}</div>
            )}

            {/* Alta de usuario */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="font-semibold text-slate-800 mb-4">Invitar nuevo usuario</h2>
                <form onSubmit={handleCreate} className="grid md:grid-cols-5 gap-3">
                    <input
                        type="text"
                        placeholder="Nombre"
                        value={nuevoNombre}
                        onChange={(e) => setNuevoNombre(e.target.value)}
                        required
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                        type="email"
                        placeholder="email@empresa.com"
                        value={nuevoEmail}
                        onChange={(e) => setNuevoEmail(e.target.value)}
                        required
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                        type="password"
                        placeholder="Contraseña inicial"
                        value={nuevoPassword}
                        onChange={(e) => setNuevoPassword(e.target.value)}
                        required
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <select
                        value={nuevoRol}
                        onChange={(e) => setNuevoRol(e.target.value as Rol)}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                        type="submit"
                        disabled={creating || !empresaActiva}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow hover:opacity-95 disabled:opacity-60"
                    >
                        {creating ? 'Creando…' : 'Crear + asignar'}
                    </button>
                </form>
            </div>

            {/* Listado */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-800">Usuarios de tu firma</h2>
                    <button
                        onClick={loadUsers}
                        className="text-sm text-indigo-600 hover:underline"
                    >
                        Recargar
                    </button>
                </div>
                {loading ? (
                    <div className="p-6 text-sm text-slate-500">Cargando…</div>
                ) : users.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">No hay usuarios registrados todavía.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600 text-left">
                            <tr>
                                <th className="px-6 py-3 font-medium">Nombre</th>
                                <th className="px-6 py-3 font-medium">Email</th>
                                <th className="px-6 py-3 font-medium">Rol en {empresaActiva?.nombre ?? '—'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.map((u) => (
                                <tr key={u.id}>
                                    <td className="px-6 py-3">
                                        {u.nombre}
                                        {u.id === user?.id && (
                                            <span className="ml-2 text-[10px] uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                                Tú
                                            </span>
                                        )}
                                        {u.es_superadmin && (
                                            <span className="ml-2 text-[10px] uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                Superadmin
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3 text-slate-600">{u.email}</td>
                                    <td className="px-6 py-3">
                                        <select
                                            defaultValue=""
                                            onChange={(e) => {
                                                const rol = e.target.value as Rol;
                                                if (rol) handleAsignar(u.id, rol);
                                                e.target.value = '';
                                            }}
                                            className="px-2 py-1 border border-slate-300 rounded-lg text-xs"
                                            disabled={!empresaActiva}
                                        >
                                            <option value="">Asignar rol…</option>
                                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
