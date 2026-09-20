import { Link } from 'react-router-dom';

export default function TerminosPage() {
    return (
        <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
            <LegalHeader />

            <main className="max-w-3xl mx-auto px-6 py-10">
                <div className="kicker mb-2">Legal</div>
                <h1 className="font-display text-4xl tracking-tight mb-2">
                    Términos de uso
                </h1>
                <p className="text-sm text-gray-500 mb-10">
                    Última actualización: 20 de septiembre de 2026
                </p>

                <section className="prose-legal">
                    <p>
                        Estos términos rigen el uso del servicio Facturación Fortuna
                        (en adelante, &ldquo;el Servicio&rdquo;), operado por Movaiti
                        S.A.S. (NIT &lsaquo;NIT_MOVAITI&rsaquo;), con domicilio en Cali,
                        Colombia. Al crear una cuenta o al usar el Servicio, aceptas
                        estos términos y la{' '}
                        <Link to="/privacidad">Política de privacidad</Link>.
                    </p>

                    <h2>1. Descripción del Servicio</h2>
                    <p>
                        Facturación Fortuna es una plataforma SaaS multi-tenant de
                        facturación de proveedores y contabilidad para firmas contables
                        y empresas colombianas. Ofrece:
                    </p>
                    <ul>
                        <li>Registro y control de facturas de proveedores.</li>
                        <li>Contabilización automática según el PUC colombiano.</li>
                        <li>
                            Cumplimiento DIAN: Medios Magnéticos (formatos 1001, 1007,
                            1008) y conciliación de factura electrónica.
                        </li>
                        <li>Conciliación bancaria y gestión de pagos.</li>
                        <li>
                            Captura automática de facturas desde correo (Gmail y
                            Outlook) mediante integración OAuth voluntaria.
                        </li>
                    </ul>

                    <h2>2. Cuenta y seguridad</h2>
                    <p>Debes registrar tu cuenta con datos verídicos. Eres responsable de:</p>
                    <ul>
                        <li>Mantener la confidencialidad de tu contraseña.</li>
                        <li>
                            Activar segundo factor (TOTP) cuando tu rol lo permita.
                        </li>
                        <li>
                            Notificarnos por escrito ante cualquier uso no autorizado de
                            tu cuenta.
                        </li>
                    </ul>
                    <p>
                        Nos reservamos el derecho a suspender cuentas que incumplan
                        estos términos o que representen riesgo para la operación del
                        Servicio o de los demás usuarios.
                    </p>

                    <h2>3. Uso permitido</h2>
                    <p>
                        El Servicio se ofrece para procesamiento contable legítimo. No
                        está permitido:
                    </p>
                    <ul>
                        <li>
                            Cargar contenido ilegal, malicioso, o que infrinja derechos
                            de terceros.
                        </li>
                        <li>
                            Ejecutar ingeniería inversa sobre el Servicio ni intentar
                            acceder a datos de otras empresas del SaaS.
                        </li>
                        <li>
                            Sobrecargar la infraestructura con solicitudes automatizadas
                            por fuera de la API oficial.
                        </li>
                        <li>
                            Usar el Servicio para fines contrarios a la ley colombiana o
                            para vulnerar obligaciones tributarias.
                        </li>
                    </ul>

                    <h2>4. Datos personales</h2>
                    <p>
                        El tratamiento de datos personales se rige por la{' '}
                        <Link to="/privacidad">Política de privacidad</Link>. Al usar el
                        Servicio autorizas ese tratamiento en los términos allí
                        descritos.
                    </p>

                    <h2>5. Propiedad intelectual</h2>
                    <p>
                        El código fuente, la marca &ldquo;Facturación Fortuna&rdquo; y
                        los materiales del Servicio son propiedad de Movaiti S.A.S. La
                        contabilidad, las facturas y los datos que ingresas siguen
                        siendo tuyos. Al terminar la suscripción puedes exportarlos
                        durante 30 días antes de la eliminación.
                    </p>

                    <h2>6. Limitación de responsabilidad</h2>
                    <p>
                        El Servicio se ofrece &ldquo;como es&rdquo;. Movaiti S.A.S. no
                        garantiza que el Servicio esté libre de errores ni de
                        interrupciones. La responsabilidad total de Movaiti frente al
                        usuario, por cualquier causa, no excederá el valor pagado en
                        los últimos 12 meses de suscripción.
                    </p>
                    <p>
                        El Servicio automatiza la lectura y clasificación de datos
                        contables. La validación de las declaraciones tributarias y su
                        presentación ante la DIAN sigue siendo responsabilidad del
                        contador o representante legal del cliente.
                    </p>

                    <h2>7. Terminación</h2>
                    <p>
                        Puedes cancelar tu suscripción en cualquier momento desde el
                        panel de administración o escribiendo a{' '}
                        <a href="mailto:contactos@movaiti.com">
                            contactos@movaiti.com
                        </a>
                        . Tras la cancelación, mantendremos tus datos por 30 días para
                        permitir su exportación, y luego los eliminaremos, salvo que
                        la ley colombiana exija un plazo de retención mayor
                        (por ejemplo, obligaciones tributarias y contables sujetas a la
                        DIAN).
                    </p>

                    <h2>8. Ley aplicable</h2>
                    <p>
                        Estos términos se rigen por la ley colombiana. Cualquier
                        controversia se someterá a los jueces de la ciudad de Cali,
                        Colombia.
                    </p>

                    <h2>9. Contacto</h2>
                    <p>
                        Movaiti S.A.S.
                        <br />
                        Cali, Colombia
                        <br />
                        <a href="mailto:contactos@movaiti.com">
                            contactos@movaiti.com
                        </a>
                    </p>
                </section>
            </main>

            <LegalFooter />
        </div>
    );
}

function LegalHeader() {
    return (
        <header className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
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
                    <div className="font-display text-[15px] tracking-tight leading-none">
                        Facturación Fortuna
                    </div>
                    <div className="kicker mt-1.5">Contabilidad · Cali</div>
                </div>
            </Link>
            <Link
                to="/"
                className="text-sm text-gray-600 hover:text-gray-900"
            >
                Volver al inicio
            </Link>
        </header>
    );
}

function LegalFooter() {
    return (
        <footer className="max-w-3xl mx-auto px-6 py-10 mt-6 border-t border-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-gray-500">
                <div>
                    © {new Date().getFullYear()} Movaiti S.A.S. Todos los derechos
                    reservados.
                </div>
                <div className="flex gap-6">
                    <Link to="/privacidad" className="hover:text-gray-900">
                        Privacidad
                    </Link>
                    <Link to="/terminos" className="hover:text-gray-900">
                        Términos
                    </Link>
                </div>
            </div>
        </footer>
    );
}
