/**
 * Integraciones n8n + IA + correo — arquitectura "workflow compartido".
 *
 * Default: SaaS-managed. El SaaS opera una sola instancia n8n con UN workflow
 * compartido. El usuario solo crea sus credenciales (OpenAI, Outlook, Gmail)
 * en ese n8n y pega los IDs aquí. El backend inyecta esos IDs en cada payload
 * y el workflow los usa como credentialId dinámico → multi-tenant sin clonar.
 *
 * Avanzado: self-hosted. Cliente enterprise con su propia instancia n8n.
 * Importa el workflow base y configura su propia URL + credentials.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPut, apiPost, ApiError } from '../utils/apiClient';

type EmailProvider = 'outlook' | 'gmail' | 'yahoo' | 'imap';
type Mode = 'saas_managed' | 'self_hosted';

interface Integraciones {
    empresa_id: number;
    api_key: string | null;
    storage_path: string | null;
    n8n_webhook_url: string | null;
    n8n_search_webhook: string | null;
    n8n_process_webhook: string | null;
    n8n_credential_openai_id: string | null;
    n8n_credential_email_id: string | null;
    n8n_email_provider: EmailProvider | null;
    n8n_webhook_last_test: string | null;
    n8n_webhook_last_status: 'ok' | 'error' | null;
    mode: Mode;
    shared_process_url: string | null;
    shared_search_url: string | null;
    effective_process_url: string | null;
    effective_search_url: string | null;
}

interface TestResult {
    ok: boolean;
    status_code: number | null;
    message: string;
    elapsed_ms: number | null;
}

const PROVIDER_LABEL: Record<EmailProvider, string> = {
    outlook: 'Microsoft Outlook (OAuth2)',
    gmail: 'Gmail (OAuth2)',
    yahoo: 'Yahoo Mail (IMAP)',
    imap: 'IMAP genérico (otros proveedores)',
};

export default function IntegracionesPage() {
    const [data, setData] = useState<Integraciones | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    // Toggle UI entre modo SaaS-managed (default) y self-hosted (avanzado)
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Campos editables
    const [webhookUrl, setWebhookUrl] = useState('');
    const [searchWebhook, setSearchWebhook] = useState('');
    const [processWebhook, setProcessWebhook] = useState('');
    const [openaiCredId, setOpenaiCredId] = useState('');
    const [emailCredId, setEmailCredId] = useState('');
    const [emailProvider, setEmailProvider] = useState<EmailProvider | ''>('');
    const [storagePath, setStoragePath] = useState('');

    const cargar = async () => {
        setLoading(true);
        setError(null);
        try {
            const cfg = await apiGet<Integraciones>('/empresas/me/integraciones');
            setData(cfg);
            setWebhookUrl(cfg.n8n_webhook_url ?? '');
            setSearchWebhook(cfg.n8n_search_webhook ?? '');
            setProcessWebhook(cfg.n8n_process_webhook ?? '');
            setOpenaiCredId(cfg.n8n_credential_openai_id ?? '');
            setEmailCredId(cfg.n8n_credential_email_id ?? '');
            setEmailProvider((cfg.n8n_email_provider as EmailProvider) ?? '');
            setStoragePath(cfg.storage_path ?? '');
            setShowAdvanced(cfg.mode === 'self_hosted');
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error cargando integraciones');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { cargar(); }, []);

    const guardar = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const updated = await apiPut<Integraciones>('/empresas/me/integraciones', {
                // En modo SaaS-managed forzamos las URLs override a null para que
                // el backend siempre use la URL compartida.
                n8n_webhook_url: showAdvanced ? (webhookUrl || null) : null,
                n8n_search_webhook: showAdvanced ? (searchWebhook || null) : null,
                n8n_process_webhook: showAdvanced ? (processWebhook || null) : null,
                n8n_credential_openai_id: openaiCredId || null,
                n8n_credential_email_id: emailCredId || null,
                n8n_email_provider: emailProvider || null,
                storage_path: storagePath || null,
            });
            setData(updated);
            setSuccess('Configuración guardada.');
            setTimeout(() => setSuccess(null), 2400);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error guardando');
        } finally {
            setSaving(false);
        }
    };

    const probar = async () => {
        setTesting(true);
        setTestResult(null);
        setError(null);
        try {
            const result = await apiPost<TestResult>('/empresas/me/integraciones/test');
            setTestResult(result);
            await cargar();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error probando webhook');
        } finally {
            setTesting(false);
        }
    };

    const copyKey = async () => {
        if (!data?.api_key) return;
        try {
            await navigator.clipboard.writeText(data.api_key);
            setSuccess('API Key copiada al portapapeles.');
            setTimeout(() => setSuccess(null), 1800);
        } catch {
            setError('No se pudo copiar al portapapeles.');
        }
    };

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="text-center">
                    <div
                        className="h-10 w-10 mx-auto rounded-full border-2 border-t-transparent"
                        style={{
                            borderColor: 'var(--accent)',
                            borderTopColor: 'transparent',
                            animation: 'spin-soft 800ms linear infinite',
                        }}
                    />
                    <div className="kicker mt-4">Cargando configuración</div>
                </div>
            </div>
        );
    }

    const effectiveUrl = data?.effective_process_url ?? '—';
    const sharedUrl = data?.shared_process_url ?? null;

    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Administración · Conexión con n8n</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Integraciones <em>n8n</em>.
                    </h1>
                    <p className="text-[13px] max-w-lg" style={{ color: 'var(--ink-soft)' }}>
                        El SaaS opera un workflow compartido en su instancia n8n. Tú solo creas
                        tus credenciales (OpenAI, Outlook…) y pegas los IDs aquí. El backend
                        usa esos IDs dinámicamente sin afectar a otros clientes.
                    </p>
                </div>
            </div>

            {error && (
                <div className="px-5 py-4 rounded-lg text-[13px]" style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
                    {error}
                </div>
            )}
            {success && (
                <div className="px-5 py-4 rounded-lg text-[13px]" style={{ background: 'var(--positive-soft)', border: '1px solid var(--positive)', color: 'var(--positive)' }}>
                    ✓ {success}
                </div>
            )}

            {/* Banner del modo activo */}
            <div
                className="rounded-md p-5 flex items-start gap-4"
                style={{
                    background: showAdvanced ? 'var(--gold-soft)' : 'var(--accent-soft)',
                    border: `1px solid ${showAdvanced ? 'var(--gold)' : 'var(--accent)'}`,
                }}
            >
                <span
                    className="font-display-wonk text-[1.75rem] leading-none mt-1"
                    style={{ color: showAdvanced ? 'var(--gold)' : 'var(--accent)' }}
                >
                    {showAdvanced ? '↗' : '✦'}
                </span>
                <div className="flex-1">
                    <div className="kicker-accent" style={{ color: showAdvanced ? 'var(--gold)' : 'var(--accent)' }}>
                        Modo actual
                    </div>
                    <div className="font-display text-[1.2rem] tracking-tight mt-0.5" style={{ fontVariationSettings: "'SOFT' 30" }}>
                        {showAdvanced ? 'n8n self-hosted (avanzado)' : 'SaaS-managed (recomendado)'}
                    </div>
                    <p className="text-[12px] mt-2 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                        {showAdvanced
                            ? 'Tienes tu propia instancia n8n. Configuras URL + credentials. El SaaS sigue inyectando apiKey + empresaId al payload.'
                            : 'El SaaS opera n8n por ti. Solo necesitas pegar tu Credential ID de OpenAI más abajo. No hay que importar workflows ni mantener infra n8n propia.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="btn-secondary text-[12px] flex-shrink-0"
                >
                    Cambiar a {showAdvanced ? 'SaaS-managed' : 'self-hosted'}
                </button>
            </div>

            <form onSubmit={guardar} className="space-y-6">
                {/* API Key */}
                <div className="surface p-6">
                    <div className="kicker-accent mb-1">Identidad</div>
                    <h2 className="font-display text-[1.3rem] tracking-tight mb-1">API Key de esta empresa</h2>
                    <p className="text-[12px] mb-4" style={{ color: 'var(--ink-faint)' }}>
                        El backend la incluye en cada payload (como <span className="font-mono">apiKey</span>) y en el
                        header <span className="font-mono">X-API-Key</span>. El workflow la devuelve al backend para
                        autenticar el callback. No la compartas.
                    </p>
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <div
                            className="flex-1 px-4 py-3 rounded-md font-mono text-[13px]"
                            style={{ background: 'var(--paper-tinted)', border: '1px solid var(--rule-soft)', color: 'var(--ink-soft)', wordBreak: 'break-all' }}
                        >
                            {data?.api_key ?? '—'}
                        </div>
                        <button type="button" onClick={copyKey} className="btn-secondary text-[13px]">
                            Copiar
                        </button>
                    </div>
                </div>

                {/* Credential IDs — siempre per-tenant */}
                <div className="surface p-6">
                    <div className="kicker-accent mb-1">Credenciales en n8n</div>
                    <h2 className="font-display text-[1.3rem] tracking-tight mb-1">
                        IDs de tus credenciales
                    </h2>
                    <p className="text-[12px] mb-5" style={{ color: 'var(--ink-faint)' }}>
                        Crea tus credenciales en n8n (OpenAI, Outlook/Gmail…). Después copia los IDs
                        del URL al editar cada credencial y pégalos aquí. El backend los inyecta en
                        cada payload como <span className="font-mono">credentialId</span> dinámico.
                    </p>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="kicker block mb-1.5">Credential ID de OpenAI</label>
                            <input
                                type="text"
                                className="input-field font-mono text-[13px]"
                                placeholder="Ej: 1a2b3c4d-5e6f-7a8b"
                                value={openaiCredId}
                                onChange={(e) => setOpenaiCredId(e.target.value)}
                            />
                            <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
                                Requerido para extracción IA de la factura PDF.
                            </p>
                        </div>
                        <div>
                            <label className="kicker block mb-1.5">Proveedor de correo (fase 2)</label>
                            <select
                                className="input-field text-[13px]"
                                value={emailProvider}
                                onChange={(e) => setEmailProvider((e.target.value as EmailProvider) || '')}
                            >
                                <option value="">No configurado</option>
                                {(Object.keys(PROVIDER_LABEL) as EmailProvider[]).map((k) => (
                                    <option key={k} value={k}>{PROVIDER_LABEL[k]}</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="kicker block mb-1.5">Credential ID del correo</label>
                            <input
                                type="text"
                                className="input-field font-mono text-[13px]"
                                placeholder="Ej: 9z8y7x6w-5v4u"
                                value={emailCredId}
                                onChange={(e) => setEmailCredId(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* URL del webhook efectivo */}
                <div className="surface p-6">
                    <div className="flex items-baseline justify-between mb-4">
                        <div>
                            <div className="kicker-accent mb-1">Webhook efectivo</div>
                            <h2 className="font-display text-[1.3rem] tracking-tight">
                                URL del workflow procesar factura
                            </h2>
                        </div>
                        {data?.n8n_webhook_last_test && (
                            <span className={`tag ${data.n8n_webhook_last_status === 'ok' ? 'tag-positive' : 'tag-negative'}`}>
                                Último test:{' '}
                                {new Date(data.n8n_webhook_last_test).toLocaleString('es-CO', {
                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                })}
                            </span>
                        )}
                    </div>

                    {!showAdvanced && (
                        <>
                            <p className="text-[12px] mb-3" style={{ color: 'var(--ink-faint)' }}>
                                URL administrada por el SaaS. No requiere acción de tu parte.
                            </p>
                            <div
                                className="px-4 py-3 rounded-md font-mono text-[13px]"
                                style={{ background: 'var(--paper-tinted)', border: '1px solid var(--rule-soft)', color: 'var(--ink-soft)', wordBreak: 'break-all' }}
                            >
                                {sharedUrl ?? '⚠ El SaaS no tiene N8N_PROCESS_WEBHOOK_URL configurado en .env'}
                            </div>
                        </>
                    )}

                    {showAdvanced && (
                        <>
                            <p className="text-[12px] mb-3" style={{ color: 'var(--ink-faint)' }}>
                                Apunta a tu propia instancia n8n. Se usará en lugar del workflow compartido del SaaS.
                            </p>
                            <input
                                type="url"
                                className="input-field font-mono text-[13px]"
                                placeholder="https://mi-n8n.example.com/webhook/abc-123"
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                            />
                            <p className="text-[11px] mt-2" style={{ color: 'var(--ink-faint)' }}>
                                Importa <span className="font-mono">workflow_procesar_factura_template.json</span> en tu n8n y pega la Production URL.
                            </p>
                        </>
                    )}

                    <div className="mt-3 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                        <span className="kicker mr-2">Resuelta</span>
                        <span className="font-mono" style={{ color: 'var(--accent)' }}>{effectiveUrl}</span>
                    </div>

                    <div className="mt-5 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={probar}
                            disabled={testing}
                            className="btn-secondary text-[13px] disabled:opacity-50"
                        >
                            {testing ? 'Enviando ping…' : 'Probar conexión'}
                        </button>
                        {testResult && (
                            <span
                                className="text-[12px]"
                                style={{ color: testResult.ok ? 'var(--positive)' : 'var(--negative)' }}
                            >
                                {testResult.ok ? '✓ ' : '✗ '}
                                {testResult.message}
                                {testResult.elapsed_ms != null && ` (${testResult.elapsed_ms} ms)`}
                            </span>
                        )}
                    </div>
                </div>

                {/* Webhooks fase 2 — solo en advanced */}
                {showAdvanced && (
                    <div className="surface p-6">
                        <div className="kicker-accent mb-1">Webhooks de correo · fase 2</div>
                        <h2 className="font-display text-[1.3rem] tracking-tight mb-1">
                            Override para self-hosted
                        </h2>
                        <p className="text-[12px] mb-5" style={{ color: 'var(--ink-faint)' }}>
                            Configura las URLs de tus propios workflows de búsqueda y procesamiento de correo.
                        </p>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="kicker block mb-1.5">Webhook · buscar correos</label>
                                <input
                                    type="url"
                                    className="input-field font-mono text-[12px]"
                                    placeholder="https://mi-n8n.example.com/webhook/search"
                                    value={searchWebhook}
                                    onChange={(e) => setSearchWebhook(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="kicker block mb-1.5">Webhook · procesar adjunto</label>
                                <input
                                    type="url"
                                    className="input-field font-mono text-[12px]"
                                    placeholder="https://mi-n8n.example.com/webhook/process"
                                    value={processWebhook}
                                    onChange={(e) => setProcessWebhook(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Storage path */}
                <div className="surface p-6">
                    <div className="kicker-accent mb-1">Almacenamiento</div>
                    <h2 className="font-display text-[1.3rem] tracking-tight mb-1">
                        Carpeta de destino para PDFs
                    </h2>
                    <p className="text-[12px] mb-4" style={{ color: 'var(--ink-faint)' }}>
                        Ruta donde el backend guarda los archivos antes de notificar al workflow.
                    </p>
                    <input
                        type="text"
                        className="input-field font-mono text-[13px]"
                        placeholder="\\192.168.2.20\Facturas\temp"
                        value={storagePath}
                        onChange={(e) => setStoragePath(e.target.value)}
                    />
                </div>

                <div className="flex justify-end gap-2">
                    <button type="submit" disabled={saving} className="btn-accent disabled:opacity-50">
                        {saving ? 'Guardando…' : 'Guardar configuración'}
                    </button>
                </div>
            </form>

            {/* Instructivo — varía según modo */}
            <div className="ledger paper-grain p-7 lg:p-8">
                <div className="kicker-accent mb-1">Instructivo</div>
                <h2 className="font-display text-[1.5rem] tracking-tight mb-1" style={{ fontVariationSettings: "'SOFT' 30" }}>
                    {showAdvanced
                        ? <>Cómo configurar tu <em>propia</em> instancia n8n</>
                        : <>Cómo crear tu <em>credencial</em> en el n8n del SaaS</>}
                </h2>
                <p className="text-[13px] mb-6" style={{ color: 'var(--ink-soft)' }}>
                    {showAdvanced
                        ? 'Pasos para conectar tu n8n self-hosted al SaaS.'
                        : 'Pasos únicos. Después de esto, cada PDF que subas se procesa automáticamente.'}
                </p>

                <ol className="space-y-5">
                    {(showAdvanced
                        ? [
                            {
                                n: 'I',
                                title: 'Importa el workflow base en tu n8n',
                                body: (
                                    <>
                                        Descarga{' '}
                                        <span className="font-mono text-[12px]" style={{ color: 'var(--accent)' }}>
                                            n8n/workflow_procesar_factura_template.json
                                        </span>{' '}
                                        e impórtalo desde <em>Workflows → Import from File</em>.
                                    </>
                                ),
                            },
                            {
                                n: 'II',
                                title: 'Crea las credenciales en tu n8n',
                                body: 'Credentials → Add Credential → OpenAI API (y Outlook/Gmail si vas a usar correo).',
                            },
                            {
                                n: 'III',
                                title: 'Activa el workflow y copia URL + IDs',
                                body: 'Pega la Production URL en "URL del webhook" y los Credential IDs arriba.',
                            },
                            {
                                n: 'IV',
                                title: 'Prueba la conexión',
                                body: 'Botón "Probar conexión". Si ✓, listo para subir facturas.',
                            },
                        ]
                        : [
                            {
                                n: 'I',
                                title: 'Solicita acceso al n8n del SaaS',
                                body: (
                                    <>
                                        El SaaS gestiona la instancia n8n por ti. Pide a soporte el acceso al
                                        panel n8n donde podrás registrar tus credenciales (sin permisos para
                                        editar workflows).
                                    </>
                                ),
                            },
                            {
                                n: 'II',
                                title: 'Crea tu credencial de OpenAI',
                                body: (
                                    <>
                                        En el panel n8n del SaaS:{' '}
                                        <em>Credentials → Add Credential → OpenAI API</em>. Pega tu API key
                                        de OpenAI y guarda. <strong>Copia el ID</strong> de la URL al editarla.
                                    </>
                                ),
                            },
                            {
                                n: 'III',
                                title: 'Pega el Credential ID aquí',
                                body: 'Pégalo arriba en "Credential ID de OpenAI" y guarda configuración.',
                            },
                            {
                                n: 'IV',
                                title: 'Prueba la conexión',
                                body: 'Botón "Probar conexión". Si ✓, ya puedes subir facturas y el SaaS las procesará automáticamente.',
                            },
                        ]
                    ).map((s) => (
                        <li key={s.n} className="flex items-start gap-5">
                            <span
                                className="font-display-wonk text-[2rem] leading-none flex-shrink-0 w-8 text-center"
                                style={{ color: 'var(--accent)' }}
                            >
                                {s.n}
                            </span>
                            <div>
                                <div className="font-display text-[1.05rem] mb-1" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                    {s.title}
                                </div>
                                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                                    {s.body}
                                </p>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
