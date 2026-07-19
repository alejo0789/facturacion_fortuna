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
    const [totpCode, setTotpCode] = useState('');
    const [needsTotp, setNeedsTotp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await login(email, password, needsTotp ? totpCode : undefined);
            navigate(from, { replace: true });
        } catch (err) {
            const code = (err as Error & { code?: string })?.code;
            if (code === '2fa_required') {
                setNeedsTotp(true);
                setError(null);
                setSubmitting(false);
                return;
            }
            setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex" style={{ background: 'var(--canvas)' }}>
            {/* Left — brand panel (dark, editorial) */}
            <aside
                className="hidden lg:flex relative w-2/5 flex-col justify-between p-12 overflow-hidden sidebar-shell"
            >
                {/* Decorative oversized ƒ */}
                <div
                    aria-hidden
                    className="absolute font-display-wonk select-none pointer-events-none"
                    style={{
                        bottom: '-12rem',
                        right: '-8rem',
                        fontSize: '36rem',
                        lineHeight: 1,
                        color: 'rgba(232, 229, 220, 0.04)',
                    }}
                >
                    ƒ
                </div>

                <Link to="/" className="relative z-10 flex items-center gap-3 anim-fade-up">
                    <div
                        className="w-10 h-10 rounded-md flex items-center justify-center font-display-wonk text-2xl"
                        style={{
                            background: 'linear-gradient(180deg, #f6f4ee, #e8e5dc)',
                            color: 'var(--accent-deep)',
                        }}
                    >
                        ƒ
                    </div>
                    <div>
                        <div className="font-display text-[15px] leading-none" style={{ color: 'var(--sidebar-ink)' }}>
                            Facturación SaaS
                        </div>
                        <div
                            className="text-[9px] uppercase tracking-[0.22em] mt-1.5"
                            style={{ color: 'var(--sidebar-ink-soft)' }}
                        >
                            Contabilidad corporativa
                        </div>
                    </div>
                </Link>

                <div className="relative z-10 anim-fade-up" style={{ animationDelay: '180ms' }}>
                    <div
                        className="eyebrow mb-6"
                        style={{ color: 'rgba(232, 229, 220, 0.6)' }}
                    >
                        Edición Régimen Ordinario
                    </div>
                    <h2
                        className="font-display text-[2.75rem] leading-[1.05] tracking-tight"
                        style={{ color: 'var(--sidebar-ink)', fontVariationSettings: "'SOFT' 30" }}
                    >
                        Los números
                        <br />
                        <em
                            style={{
                                fontStyle: 'italic',
                                color: 'var(--sidebar-accent)',
                                fontVariationSettings: "'SOFT' 100, 'WONK' 1",
                            }}
                        >
                            siempre cuadran.
                        </em>
                    </h2>
                    <p
                        className="mt-6 text-[14px] leading-relaxed max-w-sm"
                        style={{ color: 'rgba(232, 229, 220, 0.65)' }}
                    >
                        PUC Decreto 2650, IVA, Retefuente, ReteIVA, ReteICA y Medios Magnéticos DIAN —
                        todo configurado por empresa, todo automatizado.
                    </p>
                </div>

                <div
                    className="relative z-10 text-[11px] font-mono"
                    style={{ color: 'rgba(232, 229, 220, 0.4)' }}
                >
                    MMXXVI · Bogotá · Medellín · Cali
                </div>
            </aside>

            {/* Right — form */}
            <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative">
                <div className="w-full max-w-md anim-fade-up">
                    {/* Mobile-only brand */}
                    <Link to="/" className="lg:hidden flex items-center justify-center gap-3 mb-10">
                        <div
                            className="w-10 h-10 rounded-md flex items-center justify-center font-display-wonk text-2xl"
                            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                        >
                            ƒ
                        </div>
                        <div>
                            <div className="font-display text-[15px] leading-none">Facturación SaaS</div>
                            <div className="kicker mt-1">Contabilidad corporativa</div>
                        </div>
                    </Link>

                    <div className="eyebrow mb-4">Acceso al espacio de trabajo</div>
                    <h1 className="editorial-title text-[2.5rem] mb-2">Bienvenido de vuelta.</h1>
                    <p className="text-[14px]" style={{ color: 'var(--ink-soft)' }}>
                        Ingresa con tus credenciales para continuar.
                    </p>

                    <hr className="hr-ledger my-8" />

                    {error && (
                        <div className="mb-5 rounded-md border px-4 py-3 text-sm"
                            style={{
                                borderColor: 'var(--negative)',
                                background: 'var(--negative-soft)',
                                color: 'var(--negative)',
                            }}
                        >
                            <div className="kicker-accent mb-1" style={{ color: 'var(--negative)' }}>
                                Error
                            </div>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="kicker block mb-2">Correo electrónico</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                className="input-field"
                                placeholder="tu@empresa.com"
                            />
                        </div>
                        <div>
                            <label className="kicker block mb-2">Contraseña</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                                className="input-field"
                                placeholder="••••••••"
                            />
                        </div>
                        {needsTotp && (
                            <div className="anim-fade-up">
                                <label className="kicker block mb-2">Código 2FA (6 dígitos)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                                    required
                                    autoFocus
                                    autoComplete="one-time-code"
                                    className="input-field font-mono text-center tracking-widest"
                                    placeholder="000000"
                                />
                                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
                                    Abre tu app de autenticación (Google Authenticator, Authy, 1Password…).
                                </p>
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="btn-primary w-full disabled:opacity-60"
                        >
                            {submitting ? 'Ingresando…' : 'Ingresar'}
                            {!submitting && (
                                <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>→</span>
                            )}
                        </button>
                    </form>

                    <hr className="hr-ledger my-8" />

                    <div className="text-center text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                        ¿No tienes cuenta?{' '}
                        <Link
                            to="/register"
                            className="font-medium transition-colors"
                            style={{ color: 'var(--accent)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-vivid)')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                        >
                            Registra tu empresa
                        </Link>
                    </div>

                    <div className="mt-6 text-center">
                        <Link to="/" className="kicker hover:underline">
                            ← Volver al inicio
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
