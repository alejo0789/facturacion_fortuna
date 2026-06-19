/**
 * Wizard de registro self-service — Ledger Modern.
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type Step = 1 | 2 | 3;

const ROMANS = ['', 'I', 'II', 'III'];

export default function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState<Step>(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [firmaNombre, setFirmaNombre] = useState('');
    const [firmaNit, setFirmaNit] = useState('');

    const [nombre, setNombre] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');

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
    const stepDescs = [
        'Registra la firma o empresa principal que usará el sistema.',
        'Será la cuenta administradora principal con acceso completo.',
        'Puedes registrar la primera empresa cliente ahora o hacerlo después.',
    ];

    return (
        <div className="min-h-screen flex relative overflow-hidden" style={{ background: 'var(--canvas)' }}>
            {/* Decorative watermark */}
            <div
                aria-hidden
                className="absolute font-display-wonk select-none pointer-events-none"
                style={{
                    top: '12rem',
                    right: '-6rem',
                    fontSize: '34rem',
                    lineHeight: 1,
                    color: 'var(--rule-strong)',
                    opacity: 0.16,
                    fontWeight: 300,
                }}
            >
                ƒ
            </div>

            <div className="w-full max-w-2xl mx-auto px-6 py-10 relative z-10 anim-fade-up">
                {/* Brand */}
                <Link to="/" className="flex items-center justify-center gap-3 mb-10">
                    <div
                        className="w-10 h-10 rounded-md flex items-center justify-center font-display-wonk text-2xl"
                        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                    >
                        ƒ
                    </div>
                    <div>
                        <div className="font-display text-[15px] leading-none">Facturación SaaS</div>
                        <div className="kicker mt-1">Registra tu empresa</div>
                    </div>
                </Link>

                <div className="ledger paper-grain p-8 lg:p-10">
                    {/* Step indicator — editorial roman numerals */}
                    <div className="flex items-center justify-between mb-10">
                        {[1, 2, 3].map((s) => {
                            const active = step >= s;
                            const current = step === s;
                            return (
                                <div key={s} className="flex-1 flex items-center">
                                    <div className="flex flex-col items-center">
                                        <div
                                            className="font-display-wonk text-[1.6rem] leading-none transition-colors"
                                            style={{
                                                color: active ? 'var(--accent)' : 'var(--ink-mute)',
                                                opacity: current ? 1 : (active ? 0.8 : 0.5),
                                            }}
                                        >
                                            {ROMANS[s]}
                                        </div>
                                        <div
                                            className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
                                            style={{ color: current ? 'var(--accent)' : 'var(--ink-faint)' }}
                                        >
                                            {stepTitles[s - 1]}
                                        </div>
                                    </div>
                                    {s < 3 && (
                                        <div
                                            className="flex-1 h-px mx-3 mt-[-1.25rem] transition-colors"
                                            style={{ background: step > s ? 'var(--accent)' : 'var(--rule)' }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="eyebrow mb-3">Paso {step} de 3</div>
                    <h2 className="editorial-title text-[2rem] mb-2">{stepTitles[step - 1]}.</h2>
                    <p className="text-[13px] mb-6" style={{ color: 'var(--ink-soft)' }}>
                        {stepDescs[step - 1]}
                    </p>

                    <hr className="hr-ledger mb-6" />

                    {error && (
                        <div
                            className="mb-5 px-4 py-3 rounded-md text-[13px]"
                            style={{
                                background: 'var(--negative-soft)',
                                border: '1px solid var(--negative)',
                                color: 'var(--negative)',
                            }}
                        >
                            <div className="kicker-accent mb-1" style={{ color: 'var(--negative)' }}>
                                Verifica
                            </div>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {step === 1 && (
                            <>
                                <div>
                                    <label className="kicker block mb-2">Nombre de la firma</label>
                                    <input
                                        type="text"
                                        value={firmaNombre}
                                        onChange={(e) => setFirmaNombre(e.target.value)}
                                        className="input-field"
                                        placeholder="Ej: Firma Contable XYZ S.A.S."
                                    />
                                </div>
                                <div>
                                    <label className="kicker block mb-2">NIT de la firma</label>
                                    <input
                                        type="text"
                                        value={firmaNit}
                                        onChange={(e) => setFirmaNit(e.target.value)}
                                        className="input-field font-mono"
                                        placeholder="900123456-7"
                                    />
                                </div>
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <div>
                                    <label className="kicker block mb-2">Tu nombre</label>
                                    <input
                                        type="text"
                                        value={nombre}
                                        onChange={(e) => setNombre(e.target.value)}
                                        className="input-field"
                                        placeholder="Juan Pérez"
                                    />
                                </div>
                                <div>
                                    <label className="kicker block mb-2">Correo electrónico</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                        className="input-field"
                                        placeholder="juan@empresa.com"
                                    />
                                </div>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="kicker block mb-2">Contraseña</label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            autoComplete="new-password"
                                            className="input-field"
                                            placeholder="Mínimo 8 caracteres"
                                        />
                                    </div>
                                    <div>
                                        <label className="kicker block mb-2">Confirmar</label>
                                        <input
                                            type="password"
                                            value={passwordConfirm}
                                            onChange={(e) => setPasswordConfirm(e.target.value)}
                                            autoComplete="new-password"
                                            className="input-field"
                                            placeholder="Repite la contraseña"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {step === 3 && (
                            <>
                                <label
                                    className="flex items-start gap-3 p-4 rounded-md cursor-pointer transition-colors"
                                    style={{
                                        background: crearEmpresa ? 'var(--accent-soft)' : 'var(--paper-tinted)',
                                        border: `1px solid ${crearEmpresa ? 'var(--accent)' : 'var(--rule)'}`,
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={crearEmpresa}
                                        onChange={(e) => setCrearEmpresa(e.target.checked)}
                                        className="h-4 w-4 mt-0.5"
                                        style={{ accentColor: 'var(--accent)' }}
                                    />
                                    <span>
                                        <span className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>
                                            Crear mi primera empresa ahora
                                        </span>
                                        <span className="block text-[12px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                                            Recomendado. Si lo prefieres, puedes hacerlo después desde el panel.
                                        </span>
                                    </span>
                                </label>
                                {crearEmpresa && (
                                    <>
                                        <div>
                                            <label className="kicker block mb-2">Nombre de la empresa</label>
                                            <input
                                                type="text"
                                                value={empresaNombre}
                                                onChange={(e) => setEmpresaNombre(e.target.value)}
                                                className="input-field"
                                                placeholder="Mi Empresa S.A.S."
                                            />
                                        </div>
                                        <div>
                                            <label className="kicker block mb-2">NIT de la empresa</label>
                                            <input
                                                type="text"
                                                value={empresaNit}
                                                onChange={(e) => setEmpresaNit(e.target.value)}
                                                className="input-field font-mono"
                                                placeholder="900987654-3"
                                            />
                                        </div>
                                    </>
                                )}
                                {!crearEmpresa && (
                                    <div
                                        className="p-4 rounded-md text-[13px] italic"
                                        style={{
                                            background: 'var(--paper-tinted)',
                                            border: '1px solid var(--rule-soft)',
                                            color: 'var(--ink-faint)',
                                        }}
                                    >
                                        Podrás crear empresas más adelante desde el panel "Empresas".
                                    </div>
                                )}
                            </>
                        )}

                        <hr className="hr-ledger" />

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={prev}
                                disabled={step === 1}
                                className="btn-ghost disabled:opacity-40"
                            >
                                ← Atrás
                            </button>
                            {step < 3 ? (
                                <button type="button" onClick={handleNext} className="btn-accent">
                                    Siguiente
                                    <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>→</span>
                                </button>
                            ) : (
                                <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
                                    {submitting ? 'Creando…' : 'Crear cuenta'}
                                    {!submitting && (
                                        <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>→</span>
                                    )}
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                <div className="text-center mt-6 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                    ¿Ya tienes cuenta?{' '}
                    <Link
                        to="/login"
                        className="font-medium transition-colors"
                        style={{ color: 'var(--accent)' }}
                    >
                        Inicia sesión
                    </Link>
                </div>
            </div>
        </div>
    );
}
