/**
 * Mi Equipo — gestión de usuarios y roles por empresa.
 * Requiere rol ADMIN en la empresa activa.
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
            const nuevoUser = await apiPost<UserInfo>('/api/usuarios/', {
                email: nuevoEmail.trim(),
                nombre: nuevoNombre.trim(),
                password: nuevoPassword,
            });
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
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Administración · Roles y accesos</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Mi <em>equipo</em>.
                    </h1>
                    <p className="text-[13px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Administra los usuarios de tu firma y asigna roles en{' '}
                        <span className="font-display" style={{ color: 'var(--ink)' }}>
                            {empresaActiva?.nombre ?? 'la empresa activa'}
                        </span>.
                    </p>
                </div>
            </div>

            {error && (
                <div
                    className="px-5 py-4 rounded-lg text-[13px]"
                    style={{
                        background: 'var(--negative-soft)',
                        border: '1px solid var(--negative)',
                        color: 'var(--negative)',
                    }}
                >
                    {error}
                </div>
            )}
            {success && (
                <div
                    className="px-5 py-4 rounded-lg text-[13px]"
                    style={{
                        background: 'var(--positive-soft)',
                        border: '1px solid var(--positive)',
                        color: 'var(--positive)',
                    }}
                >
                    ✓ {success}
                </div>
            )}

            {/* Alta de usuario */}
            <div className="surface p-6">
                <div className="kicker-accent">Acción</div>
                <h2 className="font-display text-[1.4rem] tracking-tight mt-1 mb-5">
                    Invitar nuevo usuario
                </h2>
                <form onSubmit={handleCreate} className="grid md:grid-cols-5 gap-3">
                    <input
                        type="text"
                        placeholder="Nombre"
                        value={nuevoNombre}
                        onChange={(e) => setNuevoNombre(e.target.value)}
                        required
                        className="input-field"
                    />
                    <input
                        type="email"
                        placeholder="email@empresa.com"
                        value={nuevoEmail}
                        onChange={(e) => setNuevoEmail(e.target.value)}
                        required
                        className="input-field"
                    />
                    <input
                        type="password"
                        placeholder="Contraseña inicial"
                        value={nuevoPassword}
                        onChange={(e) => setNuevoPassword(e.target.value)}
                        required
                        className="input-field"
                    />
                    <select
                        value={nuevoRol}
                        onChange={(e) => setNuevoRol(e.target.value as Rol)}
                        className="input-field"
                    >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                        type="submit"
                        disabled={creating || !empresaActiva}
                        className="btn-accent disabled:opacity-50"
                    >
                        {creating ? 'Creando…' : 'Crear + asignar'}
                    </button>
                </form>
            </div>

            {/* Listado */}
            <div className="surface-raised overflow-hidden">
                <div
                    className="px-6 py-4 flex items-baseline justify-between"
                    style={{ borderBottom: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                >
                    <div>
                        <div className="kicker-accent">Equipo</div>
                        <h2 className="font-display text-[1.2rem] tracking-tight mt-1">
                            Usuarios de tu firma
                        </h2>
                    </div>
                    <button onClick={loadUsers} className="btn-ghost text-[12px]">
                        Recargar
                    </button>
                </div>
                {loading ? (
                    <div className="p-10 text-center">
                        <div
                            className="h-8 w-8 mx-auto rounded-full border-2 border-t-transparent"
                            style={{
                                borderColor: 'var(--accent)',
                                borderTopColor: 'transparent',
                                animation: 'spin-soft 800ms linear infinite',
                            }}
                        />
                        <div className="kicker mt-3">Cargando</div>
                    </div>
                ) : users.length === 0 ? (
                    <div className="p-16 text-center">
                        <div
                            className="font-display text-[3rem]"
                            style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                        >
                            —
                        </div>
                        <div className="kicker mt-2">Sin usuarios registrados</div>
                    </div>
                ) : (
                    <table className="w-full text-[14px]">
                        <thead style={{ background: 'var(--paper-tinted)' }}>
                            <tr>
                                <th className="kicker px-6 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Nombre</th>
                                <th className="kicker px-6 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>Email</th>
                                <th className="kicker px-6 py-3 text-left" style={{ background: 'var(--paper-tinted)' }}>
                                    Rol en {empresaActiva?.nombre ?? '—'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u, idx) => (
                                <tr
                                    key={u.id}
                                    style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                >
                                    <td className="px-6 py-3.5">
                                        <span className="font-display" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                            {u.nombre}
                                        </span>
                                        {u.id === user?.id && (
                                            <span className="tag tag-accent ml-2">Tú</span>
                                        )}
                                        {u.es_superadmin && (
                                            <span className="tag tag-gold ml-2">Superadmin</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3.5 font-mono text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                                        {u.email}
                                    </td>
                                    <td className="px-6 py-3.5">
                                        <select
                                            defaultValue=""
                                            onChange={(e) => {
                                                const rol = e.target.value as Rol;
                                                if (rol) handleAsignar(u.id, rol);
                                                e.target.value = '';
                                            }}
                                            className="input-field text-[12px] py-1.5 w-44"
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
