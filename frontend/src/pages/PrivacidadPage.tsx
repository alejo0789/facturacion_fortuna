import { Link } from 'react-router-dom';

export default function PrivacidadPage() {
    return (
        <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
            <LegalHeader />

            <main className="max-w-3xl mx-auto px-6 py-10">
                <div className="kicker mb-2">Legal</div>
                <h1 className="font-display text-4xl tracking-tight mb-2">
                    Política de privacidad
                </h1>
                <p className="text-sm text-gray-500 mb-10">
                    Última actualización: 20 de septiembre de 2026
                </p>

                <section className="prose-legal">
                    <p>
                        Esta política describe cómo Facturación Fortuna (en adelante,
                        &ldquo;el Servicio&rdquo;), operado por Movaiti S.A.S. (NIT
                        &lsaquo;NIT_MOVAITI&rsaquo;), con domicilio en Cali, Colombia,
                        trata los datos personales y los datos de cuentas de correo
                        electrónico de las personas y empresas que usan el Servicio.
                    </p>

                    <h2>1. Responsable del tratamiento</h2>
                    <p>
                        Movaiti S.A.S. es el responsable del tratamiento de los datos
                        personales recolectados a través del Servicio.
                    </p>
                    <ul>
                        <li>Domicilio: Cali, Colombia.</li>
                        <li>
                            Correo de contacto para asuntos de privacidad:{' '}
                            <a href="mailto:contactos@movaiti.com">
                                contactos@movaiti.com
                            </a>
                        </li>
                    </ul>

                    <h2>2. Datos que recolectamos</h2>

                    <h3>Datos de cuenta</h3>
                    <p>
                        Nombre, correo electrónico y contraseña (almacenada como hash
                        bcrypt con costo 13) que ingresas al registrarte o al ser
                        invitado a una empresa dentro del Servicio.
                    </p>

                    <h3>Datos de correo autorizados por el usuario</h3>
                    <p>
                        Cuando conectas tu cuenta de Gmail o Outlook desde el panel de
                        Integraciones, el Servicio guarda un token de acceso
                        (refresh_token) cifrado con Fernet en nuestra base de datos.
                        Ese token permite leer los mensajes de tu bandeja de entrada
                        únicamente para localizar facturas electrónicas y sus adjuntos
                        PDF. No leemos correos por fuera de esa función y no exportamos
                        los mensajes hacia terceros.
                    </p>
                    <p>
                        Los siguientes campos de cada mensaje pueden ser procesados
                        durante la búsqueda de facturas:
                    </p>
                    <ul>
                        <li>Remitente, destinatarios y asunto.</li>
                        <li>Fecha del mensaje.</li>
                        <li>Adjuntos PDF (contenido descargado y procesado).</li>
                    </ul>
                    <p>
                        No leemos ni almacenamos el cuerpo de mensajes que no sean
                        identificados como candidatos a factura.
                    </p>

                    <h3>Datos de facturas</h3>
                    <p>
                        Los PDF que subes manualmente o que el Servicio localiza en tu
                        correo se guardan en el almacenamiento privado de la empresa a
                        la que perteneces. Su contenido se procesa con Google Gemini
                        para extraer campos estructurados como proveedor, NIT, valor y
                        fecha.
                    </p>

                    <h3>Datos técnicos</h3>
                    <p>
                        Direcciones IP, agente de usuario y sellos de tiempo de tus
                        acciones dentro del Servicio. Se registran en un log de
                        auditoría con fines de trazabilidad de seguridad.
                    </p>

                    <h2>3. Alcance de los permisos de Gmail y Outlook</h2>
                    <p>
                        Para Gmail solicitamos el scope{' '}
                        <code>
                            https://www.googleapis.com/auth/gmail.readonly
                        </code>
                        . Con este permiso solo podemos leer los mensajes de tu bandeja;
                        no podemos enviar, borrar ni modificar correos.
                    </p>
                    <p>
                        Para Outlook (Microsoft Graph) solicitamos los permisos{' '}
                        <code>Mail.Read</code>, <code>offline_access</code> y{' '}
                        <code>User.Read</code>. El alcance es equivalente al de Gmail:
                        lectura de la bandeja para localizar facturas.
                    </p>
                    <p>
                        Nunca vendemos ni cedemos a terceros los datos de tu correo. El
                        acceso está limitado al procesamiento automatizado de facturas
                        para el usuario que otorgó el consentimiento y puede revocarse
                        en cualquier momento desde el panel de Integraciones o desde la
                        cuenta del proveedor de correo.
                    </p>

                    <h2>4. Almacenamiento y retención</h2>
                    <p>
                        Los datos se almacenan en infraestructura de Railway.com
                        (Estados Unidos), con acceso restringido al equipo operativo de
                        Movaiti S.A.S. Aplicamos cifrado en tránsito (TLS) y cifrado en
                        reposo para tokens OAuth y credenciales sensibles (Fernet y
                        bcrypt).
                    </p>
                    <p>Plazos de retención:</p>
                    <ul>
                        <li>
                            Datos de cuenta y facturas: mientras la empresa mantenga
                            activa su suscripción.
                        </li>
                        <li>
                            Tokens OAuth: rotación periódica y eliminación al desconectar
                            el proveedor desde el panel de Integraciones.
                        </li>
                        <li>Log de auditoría: 12 meses.</li>
                    </ul>
                    <p>
                        Puedes solicitar eliminación anticipada escribiendo a{' '}
                        <a href="mailto:contactos@movaiti.com">
                            contactos@movaiti.com
                        </a>
                        .
                    </p>

                    <h2>5. Derechos del titular (Habeas Data)</h2>
                    <p>
                        En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de
                        2013 de Colombia, como titular de tus datos personales tienes
                        derecho a:
                    </p>
                    <ul>
                        <li>Conocer qué datos tuyos tratamos.</li>
                        <li>Actualizar o rectificar datos inexactos.</li>
                        <li>
                            Solicitar la supresión de datos y la revocatoria de la
                            autorización otorgada.
                        </li>
                        <li>
                            Presentar quejas ante la Superintendencia de Industria y
                            Comercio.
                        </li>
                    </ul>
                    <p>
                        Las solicitudes se atienden en el correo{' '}
                        <a href="mailto:contactos@movaiti.com">
                            contactos@movaiti.com
                        </a>{' '}
                        dentro de los plazos legales colombianos: 15 días hábiles para
                        consultas y 15 días hábiles para reclamos, prorrogables hasta 8
                        días hábiles adicionales.
                    </p>

                    <h2>6. Terceros con los que compartimos datos</h2>
                    <ul>
                        <li>
                            <strong>Google (Gemini API):</strong> el contenido de tus
                            PDF se envía a la API de Gemini únicamente para extracción
                            de campos. Google actúa como encargado del tratamiento. Su
                            política está en{' '}
                            <a
                                href="https://policies.google.com/privacy"
                                target="_blank"
                                rel="noreferrer"
                            >
                                policies.google.com/privacy
                            </a>
                            .
                        </li>
                        <li>
                            <strong>Railway.com:</strong> proveedor de infraestructura
                            donde corre el Servicio.
                        </li>
                        <li>
                            <strong>n8n:</strong> herramienta de automatización que
                            orquesta la lectura de correos y la extracción con IA.
                        </li>
                    </ul>
                    <p>
                        No compartimos datos con terceros para fines de mercadeo ni
                        publicidad.
                    </p>

                    <h2>7. Cambios a esta política</h2>
                    <p>
                        Publicaremos cualquier cambio material en esta misma página con
                        la fecha de actualización. Los cambios entran en vigor al momento
                        de la publicación. Cuando el cambio afecte los derechos del
                        titular, avisaremos por correo a las cuentas activas antes de
                        aplicarlo.
                    </p>

                    <h2>8. Contacto</h2>
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
