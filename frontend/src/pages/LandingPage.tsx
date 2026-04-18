import { Link } from 'react-router-dom';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-purple-50">
            {/* Nav */}
            <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <div className="font-bold text-slate-800">Fortuna SaaS</div>
                        <div className="text-[11px] text-slate-500">Facturación + Contabilidad</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link to="/login" className="px-4 py-2 text-sm text-slate-700 hover:text-indigo-600 font-medium">
                        Iniciar sesión
                    </Link>
                    <Link
                        to="/register"
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium shadow hover:opacity-95"
                    >
                        Registra tu empresa
                    </Link>
                </div>
            </header>

            {/* Hero */}
            <section className="max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
                <h1 className="text-4xl md:text-5xl font-extrabold text-slate-800 leading-tight mb-6">
                    Facturación, contabilidad e impuestos<br />
                    <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        para empresas colombianas.
                    </span>
                </h1>
                <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
                    Plataforma SaaS multi-empresa con PUC Decreto 2649, causación automática,
                    IVA, Retefuente, ReteIVA e ICA. Lista para tu firma y tus clientes.
                </p>
                <div className="flex items-center justify-center gap-3">
                    <Link
                        to="/register"
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-lg hover:opacity-95 transition"
                    >
                        Empieza gratis →
                    </Link>
                    <Link
                        to="/login"
                        className="px-6 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-white transition"
                    >
                        Ya tengo cuenta
                    </Link>
                </div>
            </section>

            {/* Features */}
            <section className="max-w-6xl mx-auto px-6 pb-20 grid md:grid-cols-3 gap-6">
                {[
                    {
                        title: 'Multi-empresa',
                        desc: 'Una sola cuenta maneja varias empresas con roles independientes por usuario.',
                        icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
                        color: 'from-indigo-500 to-purple-600',
                    },
                    {
                        title: 'Contabilidad profesional',
                        desc: 'Plan Único de Cuentas (PUC) Decreto 2649, asientos con partida doble, libro mayor y balance de comprobación.',
                        icon: 'M9 17v-2a4 4 0 014-4h4m-8-4h.01M9 13a3 3 0 11-6 0 3 3 0 016 0zm12 4v3m0 0v3m0-3h3m-3 0h-3',
                        color: 'from-emerald-500 to-teal-600',
                    },
                    {
                        title: 'Impuestos Colombia',
                        desc: 'IVA 19 %, Retefuente, ReteIVA, ICA configurables por empresa. Cálculo y reporte automáticos.',
                        icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                        color: 'from-amber-500 to-orange-600',
                    },
                ].map((f) => (
                    <div key={f.title} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow`}>
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={f.icon} />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">{f.title}</h3>
                        <p className="text-sm text-slate-600">{f.desc}</p>
                    </div>
                ))}
            </section>

            <footer className="border-t border-slate-200 bg-white/50 py-6 text-center text-xs text-slate-500">
                Fortuna SaaS · Facturación + Contabilidad multi-tenant
            </footer>
        </div>
    );
}
