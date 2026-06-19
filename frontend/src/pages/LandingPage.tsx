import { Link } from 'react-router-dom';

export default function LandingPage() {
    return (
        <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--canvas)' }}>
            {/* Decorative watermark mesh */}
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `
                        radial-gradient(60% 50% at 8% 0%, rgba(45, 108, 223, 0.10) 0%, transparent 60%),
                        radial-gradient(45% 40% at 95% 5%, rgba(181, 141, 62, 0.06) 0%, transparent 60%),
                        radial-gradient(80% 50% at 50% 110%, rgba(15, 119, 84, 0.05) 0%, transparent 60%)
                    `,
                }}
            />

            {/* Decorative serif glyph — distant, oversized */}
            <div
                aria-hidden
                className="absolute font-display-wonk select-none pointer-events-none"
                style={{
                    top: '8rem',
                    right: '-4rem',
                    fontSize: '38rem',
                    lineHeight: 1,
                    color: 'var(--rule-strong)',
                    opacity: 0.18,
                    fontWeight: 300,
                }}
            >
                ƒ
            </div>

            {/* Nav */}
            <header className="relative z-10 max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-md flex items-center justify-center font-display-wonk text-2xl"
                        style={{
                            background: 'var(--ink)',
                            color: 'var(--paper)',
                        }}
                    >
                        ƒ
                    </div>
                    <div>
                        <div className="font-display text-[15px] tracking-tight leading-none">Facturación SaaS</div>
                        <div className="kicker mt-1.5">Contabilidad · Bogotá</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link to="/login" className="btn-ghost">
                        Iniciar sesión
                    </Link>
                    <Link to="/register" className="btn-accent">
                        Registra tu empresa
                    </Link>
                </div>
            </header>

            {/* Hero — editorial split */}
            <section className="relative z-10 max-w-7xl mx-auto px-8 pt-12 pb-24">
                <div className="grid lg:grid-cols-12 gap-10 items-end">
                    <div className="lg:col-span-8 anim-fade-up">
                        <div className="eyebrow mb-8">Decreto 2650 · Régimen Ordinario · 2026</div>
                        <h1
                            className="editorial-title"
                            style={{ fontSize: 'clamp(3rem, 7vw, 6.25rem)' }}
                        >
                            Contabilidad <em>seria</em>,<br />
                            para empresas que la toman <em>en serio</em>.
                        </h1>
                        <p
                            className="mt-10 text-[17px] leading-relaxed max-w-xl"
                            style={{ color: 'var(--ink-soft)' }}
                        >
                            Plataforma SaaS multi-empresa con PUC Decreto 2650, causación automática,
                            IVA, Retefuente, ReteIVA, ReteICA y Medios Magnéticos DIAN. Diseñada
                            para firmas contadoras que manejan múltiples clientes desde una
                            misma cuenta.
                        </p>
                        <div className="mt-10 flex items-center gap-3">
                            <Link to="/register" className="btn-primary">
                                Empieza gratis
                                <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>→</span>
                            </Link>
                            <Link to="/login" className="btn-secondary">
                                Ya tengo cuenta
                            </Link>
                        </div>
                    </div>

                    {/* Right side: stat card "specimen" */}
                    <div className="lg:col-span-4 anim-fade-up" style={{ animationDelay: '180ms' }}>
                        <div className="ledger p-8 paper-grain">
                            <div className="kicker-accent">Resumen de mayo</div>
                            <div className="mt-1 font-display text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                                Empresa La Fortuna SAS
                            </div>
                            <div className="mt-8">
                                <div className="eyebrow" style={{ color: 'var(--ink-faint)' }}>
                                    Total facturado
                                </div>
                                <div className="numeral text-[3.5rem] leading-none mt-3">
                                    $24<span style={{ color: 'var(--ink-faint)' }}>.85M</span>
                                </div>
                            </div>
                            <hr className="hr-ledger my-6" />
                            <div className="grid grid-cols-2 gap-4 text-[13px]">
                                <div>
                                    <div className="kicker mb-1">Retefuente</div>
                                    <div className="numeral text-[1.4rem]">$612K</div>
                                </div>
                                <div>
                                    <div className="kicker mb-1">IVA dscb.</div>
                                    <div className="numeral text-[1.4rem]">$3.96M</div>
                                </div>
                                <div>
                                    <div className="kicker mb-1">ReteIVA</div>
                                    <div className="numeral text-[1.4rem]">$28K</div>
                                </div>
                                <div>
                                    <div className="kicker mb-1">ReteICA</div>
                                    <div className="numeral text-[1.4rem]">$19K</div>
                                </div>
                            </div>
                            <hr className="hr-ledger my-6" />
                            <div className="flex items-center justify-between text-[12px]">
                                <span className="tag tag-positive">Cuadra ✓</span>
                                <span className="font-mono" style={{ color: 'var(--ink-faint)' }}>
                                    A = P + Pat + U
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features — three editorial columns */}
            <section className="relative z-10 max-w-7xl mx-auto px-8 pb-20">
                <div className="flex items-end justify-between mb-12">
                    <div>
                        <div className="eyebrow mb-3">Para firmas y empresas</div>
                        <h2 className="editorial-title text-[2.25rem]">
                            Tres pilares <em>indispensables</em>.
                        </h2>
                    </div>
                    <div className="hidden lg:block kicker text-right max-w-xs">
                        Construido sobre PUC<br />Decreto 2650 oficial
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-px" style={{ background: 'var(--rule)' }}>
                    {[
                        {
                            num: 'I',
                            title: 'Multi-empresa',
                            desc: 'Una sola cuenta maneja N clientes con roles independientes. Switch en un click, datos completamente aislados por tenant.',
                            kicker: 'Tenant aislado',
                        },
                        {
                            num: 'II',
                            title: 'Contabilidad profesional',
                            desc: 'PUC Decreto 2650 (428 cuentas), partida doble validada, libro mayor, balance de comprobación, cierre anual automático.',
                            kicker: 'Decreto 2650',
                        },
                        {
                            num: 'III',
                            title: 'Impuestos Colombia',
                            desc: 'IVA 19 %, Retefuente con tarifas DIAN 2026, ReteIVA, ReteICA configurable por municipio. Formatos 1001, 1007, 1008.',
                            kicker: 'UVT 52.374',
                        },
                    ].map((f) => (
                        <div
                            key={f.title}
                            className="relative p-8 transition-colors"
                            style={{ background: 'var(--paper)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--paper)')}
                        >
                            <div className="flex items-baseline gap-4">
                                <span
                                    className="font-display-wonk text-[3.5rem] leading-none"
                                    style={{ color: 'var(--accent)' }}
                                >
                                    {f.num}
                                </span>
                                <div>
                                    <div className="kicker-accent">{f.kicker}</div>
                                    <h3 className="font-display text-[1.5rem] mt-1 leading-tight">{f.title}</h3>
                                </div>
                            </div>
                            <p
                                className="mt-6 text-[14px] leading-relaxed"
                                style={{ color: 'var(--ink-soft)' }}
                            >
                                {f.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Bottom strip — fine print */}
            <footer
                className="relative z-10 mt-12 py-8"
                style={{ borderTop: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
            >
                <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="kicker">Facturación SaaS · MMXXVI</div>
                    <div className="text-[12px] font-mono" style={{ color: 'var(--ink-faint)' }}>
                        Plataforma multi-tenant · Bogotá · Medellín · Cali
                    </div>
                </div>
            </footer>
        </div>
    );
}
