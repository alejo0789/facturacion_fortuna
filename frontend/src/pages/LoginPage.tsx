import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from || '/app';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await login(email, password);
            navigate(from, { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-purple-50 p-6">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Fortuna SaaS</h1>
                        <p className="text-xs text-slate-500">Facturación + Contabilidad</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
                    <h2 className="text-2xl font-bold text-slate-800 mb-1">Iniciar sesión</h2>
                    <p className="text-sm text-slate-500 mb-6">Ingresa a tu espacio de trabajo.</p>

                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="tu@empresa.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="••••••••"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-md hover:opacity-95 transition disabled:opacity-60"
                        >
                            {submitting ? 'Ingresando…' : 'Ingresar'}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-slate-600">
                        ¿No tienes cuenta?{' '}
                        <Link to="/register" className="text-indigo-600 hover:underline font-medium">
                            Registra tu empresa
                        </Link>
                    </div>
                </div>

                <div className="mt-6 text-center text-xs text-slate-500">
                    <Link to="/" className="hover:underline">← Volver al inicio</Link>
                </div>
            </div>
        </div>
    );
}
