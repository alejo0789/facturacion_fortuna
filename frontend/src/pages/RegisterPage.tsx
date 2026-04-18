/**
 * Wizard de registro self-service.
 *
 *  Paso 1: Datos de la Firma (nombre + NIT)
 *  Paso 2: Primer usuario ADMIN (email + nombre + password)
 *  Paso 3: Primera Empresa (opcional: nombre + NIT)
 *
 * Al terminar: POST /api/auth/register → crea Firma + Usuario + Empresa
 * + rol ADMIN en un solo request, devuelve JWT y redirige al dashboard.
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type Step = 1 | 2 | 3;

export default function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState<Step>(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Paso 1 — Firma
    const [firmaNombre, setFirmaNombre] = useState('');
    const [firmaNit, setFirmaNit] = useState('');

    // Paso 2 — Usuario admin
    const [nombre, setNombre] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');

    // Paso 3 — Empresa (opcional)
    const [crearEmpresa, setCrearEmpresa] = useState(true);
    const [empresaNombre, setEmpresaNombre] = useState('');
    const [empresaNit, setEmpresaNit] = useState('');

    const next = () => setStep((s) => (Math.min(3, s + 1) as Step));
    const prev = () => setStep((s) => (Math.max(1, s - 1) as Step));

    const validateStep = (): string | null => {
        if (step === 1) {
            if (!firmaNombre.trim()) return 'Ingresa el nombre de la firma.';
            if (!firmaNit.trim()) return 'Ingresa el NIT de la firma.';
        }
        if (step === 2) {
            if (!nombre.trim()) return 'Ingresa tu nombre.';
            if (!email.trim()) return 'Ingresa tu email.';
            if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
            if (password !== passwordConfirm) return 'Las contraseñas no coinciden.';
        }
        if (step === 3 && crearEmpresa) {
            if (!empresaNombre.trim()) return 'Ingresa el nombre de la primera empresa.';
            if (!empresaNit.trim()) return 'Ingresa el NIT de la empresa.';
        }
        return null;
    };

    const handleNext = () => {
        const msg = validateStep();
        if (msg) { setError(msg); return; }
        setError(null);
        next();
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const msg = validateStep();
        if (msg) { setError(msg); return; }
        setError(null);
        setSubmitting(true);
        try {
            await register({
                firma_nombre: firmaNombre.trim(),
                firma_nit: firmaNit.trim(),
                email: email.trim(),
                nombre: nombre.trim(),
                password,
                empresa_nombre: crearEmpresa ? empresaNombre.trim() : undefined,
                empresa_nit: crearEmpresa ? empresaNit.trim() : undefined,
            });
            navigate('/app', { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al registrar');
        } finally {
            setSubmitting(false);
        }
    };

    const stepTitles = ['Tu firma', 'Tu usuario', 'Tu primera empresa'];

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-purple-50 p-6">
            <div className="w-full max-w-lg">
                <div className="flex items-center justify-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Fortuna SaaS</h1>
                        <p className="text-xs text-slate-500">Registra tu empresa</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
                    {/* Steps indicator */}
                    <div className="flex items-center justify-between mb-8">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className="flex-1 flex items-center">
                                <div
                                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition ${step >= s
                                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow'
                                            : 'bg-slate-200 text-slate-500'
                                        }`}
                                >
                                    {s}
                                </div>
                                {s < 3 && <div className={`flex-1 h-0.5 mx-2 ${step > s ? 'bg-indigo-500' : 'bg-slate-200'}`} />}
                            </div>
                        ))}
                    </div>

                    <h2 className="text-xl font-bold text-slate-800 mb-1">
                        Paso {step} de 3: {stepTitles[step - 1]}
                    </h2>
                    <p className="text-sm text-slate-500 mb-6">
                        {step === 1 && 'Registra la firma (empresa principal o firma contable que usará el sistema).'}
                        {step === 2 && 'Será la cuenta administradora principal con acceso completo.'}
                        {step === 3 && 'Puedes registrar tu primera empresa cliente ahora o saltarlo y hacerlo después.'}
                    </p>

                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {step === 1 && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la firma</label>
                                    <input
                                        type="text"
                                        value={firmaNombre}
                                        onChange={(e) => setFirmaNombre(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Ej: Firma Contable XYZ S.A.S."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">NIT de la firma</label>
                                    <input
                                        type="text"
                                        value={firmaNit}
                                        onChange={(e) => setFirmaNit(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="900123456-7"
                                    />
                                </div>
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tu nombre</label>
                                    <input
                                        type="text"
                                        value={nombre}
                                        onChange={(e) => setNombre(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Juan Pérez"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="juan@empresa.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="new-password"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Mínimo 8 caracteres"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar contraseña</label>
                                    <input
                                        type="password"
                                        value={passwordConfirm}
                                        onChange={(e) => setPasswordConfirm(e.target.value)}
                                        autoComplete="new-password"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </>
                        )}

                        {step === 3 && (
                            <>
                                <label className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                                    <input
                                        type="checkbox"
                                        checked={crearEmpresa}
                                        onChange={(e) => setCrearEmpresa(e.target.checked)}
                                    />
                                    Crear mi primera empresa ahora
                                </label>
                                {crearEmpresa && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la empresa</label>
                                            <input
                                                type="text"
                                                value={empresaNombre}
                                                onChange={(e) => setEmpresaNombre(e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                placeholder="Mi Empresa S.A.S."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">NIT de la empresa</label>
                                            <input
                                                type="text"
                                                value={empresaNit}
                                                onChange={(e) => setEmpresaNit(e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                placeholder="900987654-3"
                                            />
                                        </div>
                                    </>
                                )}
                                {!crearEmpresa && (
                                    <p className="text-sm text-slate-500 italic">
                                        Podrás crear empresas luego desde el menú "Empresas".
                                    </p>
                                )}
                            </>
                        )}

                        <div className="flex items-center justify-between pt-4">
                            <button
                                type="button"
                                onClick={prev}
                                disabled={step === 1}
                                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                            >
                                ← Atrás
                            </button>
                            {step < 3 ? (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow hover:opacity-95"
                                >
                                    Siguiente →
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium shadow hover:opacity-95 disabled:opacity-60"
                                >
                                    {submitting ? 'Creando…' : 'Crear cuenta'}
                                </button>
                            )}
                        </div>
                    </form>

                    <div className="mt-6 text-center text-sm text-slate-600">
                        ¿Ya tienes cuenta?{' '}
                        <Link to="/login" className="text-indigo-600 hover:underline font-medium">Inicia sesión</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
