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

type EmailProvider = 'outlook' | 'gmail';
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

interface GmailStatus {
    connected: boolean;
    email: string | null;
    connected_at: string | null;
    mode: 'saas' | 'custom';
    has_custom_client: boolean;
    gemini_configured: boolean;
}

interface OutlookStatus {
    connected: boolean;
    email: string | null;
    connected_at: string | null;
    mode: 'saas' | 'custom';
    has_custom_client: boolean;
}

// PROVIDER_LABEL fue removido — no está en uso. Los labels se manejan
// inline en el JSX o en constantes por-card.

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

    // Campos editables (solo self-hosted / operador)
    const [webhookUrl, setWebhookUrl] = useState('');
    const [searchWebhook, setSearchWebhook] = useState('');
    const [processWebhook, setProcessWebhook] = useState('');
    const [storagePath, setStoragePath] = useState('');

    // Provider activo — se persiste automáticamente al cambiar en el selector,
    // no se guarda en el submit del form.
    const [emailProvider, setEmailProvider] = useState<EmailProvider | ''>('');

    // ---- OAuth multi-tenant (Checkpoint 2) ----
    const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
    const [gmailMode, setGmailMode] = useState<'saas' | 'custom'>('saas');
    const [gmailCustomClientId, setGmailCustomClientId] = useState('');
    const [gmailCustomClientSecret, setGmailCustomClientSecret] = useState('');
    const [gmailBusy, setGmailBusy] = useState(false);

    const [outlookStatus, setOutlookStatus] = useState<OutlookStatus | null>(null);
    const [outlookMode, setOutlookMode] = useState<'saas' | 'custom'>('saas');
    const [outlookCustomClientId, setOutlookCustomClientId] = useState('');
    const [outlookCustomClientSecret, setOutlookCustomClientSecret] = useState('');
    const [outlookCustomTenantId, setOutlookCustomTenantId] = useState('common');
    const [outlookBusy, setOutlookBusy] = useState(false);

    const cargar = async () => {
        setLoading(true);
        setError(null);
        try {
            const cfg = await apiGet<Integraciones>('/empresas/me/integraciones');
            setData(cfg);
            setWebhookUrl(cfg.n8n_webhook_url ?? '');
            setSearchWebhook(cfg.n8n_search_webhook ?? '');
            setProcessWebhook(cfg.n8n_process_webhook ?? '');
            setEmailProvider((cfg.n8n_email_provider as EmailProvider) ?? '');
            setStoragePath(cfg.storage_path ?? '');
            setShowAdvanced(cfg.mode === 'self_hosted');
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error cargando integraciones');
        } finally {
            setLoading(false);
        }
    };

    const cargarGmailStatus = async () => {
        try {
            const s = await apiGet<GmailStatus>('/oauth/gmail/status');
            setGmailStatus(s);
            setGmailMode(s.mode);
        } catch { /* no crítico */ }
    };

    const cargarOutlookStatus = async () => {
        try {
            const s = await apiGet<OutlookStatus>('/oauth/outlook/status');
            setOutlookStatus(s);
            setOutlookMode(s.mode);
        } catch { /* no crítico */ }
    };

    useEffect(() => { cargar(); cargarGmailStatus(); cargarOutlookStatus(); }, []);

    // Auto-set del provider activo cuando cambian los statuses.
    // Regla: si solo hay 1 conectado, se auto-selecciona. Si hay ambos, se
    // respeta lo que el usuario tenga guardado (o se pide con la card selector).
    useEffect(() => {
        const gc = gmailStatus?.connected;
        const oc = outlookStatus?.connected;
        if (gc && !oc && emailProvider !== 'gmail') {
            setEmailProvider('gmail');
            apiPut('/empresas/me/integraciones', { n8n_email_provider: 'gmail' }).catch(() => {});
        } else if (oc && !gc && emailProvider !== 'outlook') {
            setEmailProvider('outlook');
            apiPut('/empresas/me/integraciones', { n8n_email_provider: 'outlook' }).catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gmailStatus?.connected, outlookStatus?.connected]);

    // Persistir el provider activo cuando el usuario lo cambia manualmente (radio).
    const cambiarProviderActivo = (p: EmailProvider) => {
        setEmailProvider(p);
        apiPut('/empresas/me/integraciones', { n8n_email_provider: p }).catch((e) => {
            setError(e instanceof ApiError ? e.message : 'Error guardando provider activo');
        });
    };

    // Escucha postMessage del popup OAuth para refrescar el estado al cerrar.
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const t = event.data?.type;
            if (t === 'gmail_oauth_complete') {
                if (event.data.success) {
                    setSuccess(event.data.message || 'Gmail conectado.');
                    setTimeout(() => setSuccess(null), 3000);
                } else {
                    setError(event.data.message || 'Error autorizando Gmail.');
                }
                cargarGmailStatus();
            } else if (t === 'outlook_oauth_complete') {
                if (event.data.success) {
                    setSuccess(event.data.message || 'Outlook conectado.');
                    setTimeout(() => setSuccess(null), 3000);
                } else {
                    setError(event.data.message || 'Error autorizando Outlook.');
                }
                cargarOutlookStatus();
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const conectarGmail = async () => {
        setGmailBusy(true);
        setError(null);
        try {
            const { authorize_url } = await apiGet<{ authorize_url: string }>(
                '/oauth/gmail/authorize'
            );
            // Popup centrado para no perder el contexto de la app
            const w = 520;
            const h = 640;
            const left = window.screenX + (window.outerWidth - w) / 2;
            const top = window.screenY + (window.outerHeight - h) / 2;
            window.open(
                authorize_url,
                'gmail_oauth',
                `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
            );
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error iniciando OAuth');
        } finally {
            setGmailBusy(false);
        }
    };

    const desconectarGmail = async () => {
        if (!confirm('¿Desconectar Gmail? Esta empresa dejará de recibir facturas de este buzón hasta que reconectes.')) return;
        setGmailBusy(true);
        try {
            await apiPost('/oauth/gmail/disconnect');
            setSuccess('Gmail desconectado.');
            setTimeout(() => setSuccess(null), 2400);
            await cargarGmailStatus();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error desconectando');
        } finally {
            setGmailBusy(false);
        }
    };

    const guardarGmailModoCustom = async () => {
        if (!gmailCustomClientId || !gmailCustomClientSecret) {
            setError('En modo custom, Client ID y Client Secret son obligatorios.');
            return;
        }
        setGmailBusy(true);
        try {
            await apiPut('/oauth/gmail/config', {
                mode: 'custom',
                client_id: gmailCustomClientId,
                client_secret: gmailCustomClientSecret,
            });
            setGmailCustomClientSecret(''); // limpiar el input por seguridad
            setSuccess('Credenciales OAuth custom guardadas. Ahora pulsa "Conectar Gmail".');
            setTimeout(() => setSuccess(null), 3000);
            await cargarGmailStatus();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error guardando');
        } finally {
            setGmailBusy(false);
        }
    };

    const cambiarAModoSaas = async () => {
        if (!confirm('¿Cambiar al modo SaaS-managed? Esto desconecta la sesión actual y limpia el Client ID/Secret custom.')) return;
        setGmailBusy(true);
        try {
            await apiPut('/oauth/gmail/config', { mode: 'saas' });
            setGmailCustomClientId('');
            setGmailCustomClientSecret('');
            setSuccess('Modo cambiado a SaaS-managed.');
            setTimeout(() => setSuccess(null), 2400);
            await cargarGmailStatus();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error cambiando modo');
        } finally {
            setGmailBusy(false);
        }
    };

    // --- Outlook handlers (paralelos a los de Gmail) ---

    const conectarOutlook = async () => {
        setOutlookBusy(true);
        setError(null);
        try {
            const { authorize_url } = await apiGet<{ authorize_url: string }>(
                '/oauth/outlook/authorize'
            );
            const w = 520, h = 640;
            const left = window.screenX + (window.outerWidth - w) / 2;
            const top = window.screenY + (window.outerHeight - h) / 2;
            window.open(
                authorize_url,
                'outlook_oauth',
                `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
            );
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error iniciando OAuth Outlook');
        } finally {
            setOutlookBusy(false);
        }
    };

    const desconectarOutlook = async () => {
        if (!confirm('¿Desconectar Outlook? Esta empresa dejará de recibir facturas de este buzón hasta que reconectes.')) return;
        setOutlookBusy(true);
        try {
            await apiPost('/oauth/outlook/disconnect');
            setSuccess('Outlook desconectado.');
            setTimeout(() => setSuccess(null), 2400);
            await cargarOutlookStatus();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error desconectando');
        } finally {
            setOutlookBusy(false);
        }
    };

    const guardarOutlookModoCustom = async () => {
        if (!outlookCustomClientId || !outlookCustomClientSecret) {
            setError('En modo custom, Client ID y Client Secret son obligatorios.');
            return;
        }
        setOutlookBusy(true);
        try {
            await apiPut('/oauth/outlook/config', {
                mode: 'custom',
                client_id: outlookCustomClientId,
                client_secret: outlookCustomClientSecret,
                tenant_id: outlookCustomTenantId || 'common',
            });
            setOutlookCustomClientSecret('');
            setSuccess('Credenciales OAuth Outlook custom guardadas. Ahora pulsa "Conectar Outlook".');
            setTimeout(() => setSuccess(null), 3000);
            await cargarOutlookStatus();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error guardando');
        } finally {
            setOutlookBusy(false);
        }
    };

    const cambiarOutlookAModoSaas = async () => {
        if (!confirm('¿Cambiar Outlook al modo SaaS-managed? Esto desconecta la sesión actual y limpia el Client ID/Secret custom.')) return;
        setOutlookBusy(true);
        try {
            await apiPut('/oauth/outlook/config', { mode: 'saas' });
            setOutlookCustomClientId('');
            setOutlookCustomClientSecret('');
            setOutlookCustomTenantId('common');
            setSuccess('Modo Outlook cambiado a SaaS-managed.');
            setTimeout(() => setSuccess(null), 2400);
            await cargarOutlookStatus();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Error cambiando modo');
        } finally {
            setOutlookBusy(false);
        }
    };

    const guardar = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            // Ya NO se envían n8n_credential_openai_id ni n8n_credential_email_id.
            // El modelo actual usa OAuth directo desde el backend (Gmail/Outlook)
            // + credencial Gemini del SaaS. n8n_email_provider se persiste
            // desde el radio del selector "Buzón activo" cuando se cambia
            // (auto-guardado), no desde este submit.
            const updated = await apiPut<Integraciones>('/empresas/me/integraciones', {
                n8n_webhook_url: showAdvanced ? (webhookUrl || null) : null,
                n8n_search_webhook: showAdvanced ? (searchWebhook || null) : null,
                n8n_process_webhook: showAdvanced ? (processWebhook || null) : null,
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

                {/* ---------- Extracción IA — servicio del SaaS ---------- */}
                <div className="surface p-6">
                    <div className="flex items-baseline justify-between mb-2">
                        <div>
                            <div className="kicker-accent mb-1">Extracción IA · Google Gemini</div>
                            <h2 className="font-display text-[1.3rem] tracking-tight">
                                Incluido en tu plan
                            </h2>
                        </div>
                        <span
                            className="text-[11px] px-2 py-1 rounded-sm font-medium uppercase tracking-wider"
                            style={{
                                background: 'var(--positive-soft)',
                                color: 'var(--positive)',
                                border: '1px solid var(--positive)',
                            }}
                        >
                            ✓ Activo
                        </span>
                    </div>

                    <p className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                        La extracción de datos de facturas PDF se procesa con Google Gemini como
                        parte del servicio SaaS. <strong>No necesitas configurar API keys ni pagar
                        créditos por tu cuenta</strong> — el consumo lo gestiona el operador del
                        SaaS.
                    </p>
                    <p className="text-[11px] mt-2" style={{ color: 'var(--ink-faint)' }}>
                        ¿Volumen alto o necesitas usar tu propia cuenta de Google Cloud?
                        Contacta a soporte para habilitar override per-tenant.
                    </p>
                </div>

                {/* ---------- OAuth Gmail (nuevo — Checkpoint 2) ---------- */}
                <div className="surface p-6">
                    <div className="flex items-baseline justify-between mb-4">
                        <div>
                            <div className="kicker-accent mb-1">Buzón de correo · OAuth 2.0</div>
                            <h2 className="font-display text-[1.3rem] tracking-tight">
                                Gmail conectado
                            </h2>
                        </div>
                        {gmailStatus?.connected ? (
                            <span
                                className="text-[11px] px-2 py-1 rounded-sm font-medium uppercase tracking-wider"
                                style={{
                                    background: 'var(--positive-soft)',
                                    color: 'var(--positive)',
                                    border: '1px solid var(--positive)',
                                }}
                            >
                                ✓ Conectado
                            </span>
                        ) : (
                            <span
                                className="text-[11px] px-2 py-1 rounded-sm font-medium uppercase tracking-wider"
                                style={{
                                    background: 'var(--paper-tinted)',
                                    color: 'var(--ink-faint)',
                                    border: '1px solid var(--rule-soft)',
                                }}
                            >
                                No conectado
                            </span>
                        )}
                    </div>

                    {gmailStatus?.connected ? (
                        <div className="mb-5">
                            <div className="text-[13px] mb-1">
                                <span style={{ color: 'var(--ink-faint)' }}>Cuenta autorizada:</span>{' '}
                                <span className="font-mono" style={{ color: 'var(--ink)' }}>{gmailStatus.email}</span>
                            </div>
                            {gmailStatus.connected_at && (
                                <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                    Conectado el {new Date(gmailStatus.connected_at).toLocaleString('es-CO')}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-[12px] mb-5" style={{ color: 'var(--ink-faint)' }}>
                            Conecta tu cuenta de Gmail para que el asistente pueda buscar facturas en tu buzón. Solo lectura — el SaaS nunca envía ni modifica correos.
                        </p>
                    )}

                    {/* Selector modo saas / custom */}
                    <div
                        className="mb-4 p-4 rounded-md"
                        style={{ background: 'var(--paper-tinted)', border: '1px solid var(--rule-soft)' }}
                    >
                        <div className="kicker mb-3">Modo de OAuth</div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <label className="flex items-start gap-2 cursor-pointer flex-1">
                                <input
                                    type="radio"
                                    name="gmailMode"
                                    checked={gmailMode === 'saas'}
                                    onChange={() => {
                                        if (gmailStatus?.mode === 'custom') cambiarAModoSaas();
                                        else setGmailMode('saas');
                                    }}
                                    className="mt-1"
                                    style={{ accentColor: 'var(--accent)' }}
                                />
                                <div>
                                    <div className="font-medium text-[13px]">SaaS-managed (recomendado)</div>
                                    <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                        Autoriza con un click usando la app OAuth del SaaS.
                                    </div>
                                </div>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer flex-1">
                                <input
                                    type="radio"
                                    name="gmailMode"
                                    checked={gmailMode === 'custom'}
                                    onChange={() => setGmailMode('custom')}
                                    className="mt-1"
                                    style={{ accentColor: 'var(--accent)' }}
                                />
                                <div>
                                    <div className="font-medium text-[13px]">Custom (avanzado)</div>
                                    <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                        Usa tu propia OAuth app registrada en Google Cloud.
                                    </div>
                                </div>
                            </label>
                        </div>

                        {gmailMode === 'custom' && (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="kicker block mb-1.5">Client ID</label>
                                    <input
                                        type="text"
                                        className="input-field font-mono text-[13px]"
                                        placeholder="XXXX.apps.googleusercontent.com"
                                        value={gmailCustomClientId}
                                        onChange={(e) => setGmailCustomClientId(e.target.value)}
                                        autoComplete="off"
                                    />
                                </div>
                                <div>
                                    <label className="kicker block mb-1.5">Client Secret</label>
                                    <input
                                        type="password"
                                        className="input-field font-mono text-[13px]"
                                        placeholder="GOCSPX-..."
                                        value={gmailCustomClientSecret}
                                        onChange={(e) => setGmailCustomClientSecret(e.target.value)}
                                        autoComplete="off"
                                    />
                                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
                                        Se guarda encriptado. El secret nunca vuelve a mostrarse.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={guardarGmailModoCustom}
                                    disabled={gmailBusy}
                                    className="btn-secondary text-[13px] disabled:opacity-50"
                                >
                                    {gmailBusy ? 'Guardando…' : 'Guardar credenciales custom'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        {gmailStatus?.connected ? (
                            <>
                                <button
                                    type="button"
                                    onClick={conectarGmail}
                                    disabled={gmailBusy}
                                    className="btn-secondary text-[13px] disabled:opacity-50"
                                    title="Reconectar (cambio de cuenta)"
                                >
                                    Reconectar
                                </button>
                                <button
                                    type="button"
                                    onClick={desconectarGmail}
                                    disabled={gmailBusy}
                                    className="text-[13px] px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
                                    style={{ color: 'var(--negative)', border: '1px solid var(--negative)' }}
                                >
                                    Desconectar
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={conectarGmail}
                                disabled={gmailBusy}
                                className="btn-primary text-[13px] disabled:opacity-50 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 5c1.617 0 3.108.554 4.293 1.481L19.755 3C17.717 1.15 15.017 0 12 0 7.392 0 3.397 2.6 1.386 6.373l4.028 3.117C6.365 6.68 8.94 5 12 5z" fill="#EA4335"/>
                                    <path d="M23.49 12.275c0-.79-.07-1.54-.194-2.275H12v4.51h6.457c-.288 1.44-1.14 2.67-2.412 3.5l3.72 2.87c2.148-1.985 3.725-4.9 3.725-8.605z" fill="#4285F4"/>
                                    <path d="M5.414 14.51A6.98 6.98 0 015 12c0-.888.15-1.735.42-2.526L1.386 6.357C.51 8.03 0 9.955 0 12s.51 3.97 1.386 5.643l4.028-3.133z" fill="#FBBC05"/>
                                    <path d="M12 24c3.24 0 5.955-1.065 7.94-2.905l-3.72-2.87c-1.037.7-2.36 1.11-4.22 1.11-3.06 0-5.635-1.68-6.586-4.49L1.386 17.98C3.397 21.4 7.392 24 12 24z" fill="#34A853"/>
                                </svg>
                                {gmailBusy ? 'Iniciando…' : 'Conectar Gmail'}
                            </button>
                        )}
                    </div>

                    {gmailMode === 'custom' && !gmailStatus?.has_custom_client && (
                        <p className="text-[11px] mt-3" style={{ color: 'var(--gold)' }}>
                            ⚠ Guarda primero tus credenciales custom antes de conectar.
                        </p>
                    )}
                </div>

                {/* ---------- OAuth Outlook (Modelo A/B — paralelo a Gmail) ---------- */}
                <div className="surface p-6">
                    <div className="flex items-baseline justify-between mb-4">
                        <div>
                            <div className="kicker-accent mb-1">Buzón de correo · OAuth 2.0</div>
                            <h2 className="font-display text-[1.3rem] tracking-tight">
                                Outlook conectado
                            </h2>
                        </div>
                        {outlookStatus?.connected ? (
                            <span className="text-[11px] px-2 py-1 rounded-sm font-medium uppercase tracking-wider"
                                style={{ background: 'var(--positive-soft)', color: 'var(--positive)', border: '1px solid var(--positive)' }}>
                                ✓ Conectado
                            </span>
                        ) : (
                            <span className="text-[11px] px-2 py-1 rounded-sm font-medium uppercase tracking-wider"
                                style={{ background: 'var(--paper-tinted)', color: 'var(--ink-faint)', border: '1px solid var(--rule-soft)' }}>
                                No conectado
                            </span>
                        )}
                    </div>

                    {outlookStatus?.connected ? (
                        <div className="mb-5">
                            <div className="text-[13px] mb-1">
                                <span style={{ color: 'var(--ink-faint)' }}>Cuenta autorizada:</span>{' '}
                                <span className="font-mono" style={{ color: 'var(--ink)' }}>{outlookStatus.email}</span>
                            </div>
                            {outlookStatus.connected_at && (
                                <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                    Conectado el {new Date(outlookStatus.connected_at).toLocaleString('es-CO')}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-[12px] mb-5" style={{ color: 'var(--ink-faint)' }}>
                            Conecta tu cuenta Microsoft (Outlook / M365) para que el asistente busque facturas en tu Inbox. Solo lectura.
                        </p>
                    )}

                    <div className="mb-4 p-4 rounded-md" style={{ background: 'var(--paper-tinted)', border: '1px solid var(--rule-soft)' }}>
                        <div className="kicker mb-3">Modo de OAuth</div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <label className="flex items-start gap-2 cursor-pointer flex-1">
                                <input type="radio" name="outlookMode"
                                    checked={outlookMode === 'saas'}
                                    onChange={() => {
                                        if (outlookStatus?.mode === 'custom') cambiarOutlookAModoSaas();
                                        else setOutlookMode('saas');
                                    }}
                                    className="mt-1" style={{ accentColor: 'var(--accent)' }} />
                                <div>
                                    <div className="font-medium text-[13px]">SaaS-managed (recomendado)</div>
                                    <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                        Autoriza con un click usando la app OAuth del SaaS.
                                    </div>
                                </div>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer flex-1">
                                <input type="radio" name="outlookMode"
                                    checked={outlookMode === 'custom'}
                                    onChange={() => setOutlookMode('custom')}
                                    className="mt-1" style={{ accentColor: 'var(--accent)' }} />
                                <div>
                                    <div className="font-medium text-[13px]">Custom (avanzado)</div>
                                    <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                        Usa tu propia app registrada en Azure Portal.
                                    </div>
                                </div>
                            </label>
                        </div>

                        {outlookMode === 'custom' && (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="kicker block mb-1.5">Client ID (Application ID)</label>
                                    <input type="text" className="input-field font-mono text-[13px]"
                                        placeholder="00000000-0000-0000-0000-000000000000"
                                        value={outlookCustomClientId}
                                        onChange={(e) => setOutlookCustomClientId(e.target.value)}
                                        autoComplete="off" />
                                </div>
                                <div>
                                    <label className="kicker block mb-1.5">Client Secret (Value)</label>
                                    <input type="password" className="input-field font-mono text-[13px]"
                                        placeholder="Secret VALUE (no Secret ID)"
                                        value={outlookCustomClientSecret}
                                        onChange={(e) => setOutlookCustomClientSecret(e.target.value)}
                                        autoComplete="off" />
                                </div>
                                <div>
                                    <label className="kicker block mb-1.5">Tenant ID (opcional)</label>
                                    <input type="text" className="input-field font-mono text-[13px]"
                                        placeholder="common (para multi-tenant + personal accounts)"
                                        value={outlookCustomTenantId}
                                        onChange={(e) => setOutlookCustomTenantId(e.target.value)}
                                        autoComplete="off" />
                                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
                                        Usa <span className="font-mono">common</span> para permitir cuentas personales + org. Otro UUID → tu Entra ID específico.
                                    </p>
                                </div>
                                <button type="button" onClick={guardarOutlookModoCustom}
                                    disabled={outlookBusy}
                                    className="btn-secondary text-[13px] disabled:opacity-50">
                                    {outlookBusy ? 'Guardando…' : 'Guardar credenciales custom'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        {outlookStatus?.connected ? (
                            <>
                                <button type="button" onClick={conectarOutlook}
                                    disabled={outlookBusy}
                                    className="btn-secondary text-[13px] disabled:opacity-50">
                                    Reconectar
                                </button>
                                <button type="button" onClick={desconectarOutlook}
                                    disabled={outlookBusy}
                                    className="text-[13px] px-4 py-2 rounded-md disabled:opacity-50"
                                    style={{ color: 'var(--negative)', border: '1px solid var(--negative)' }}>
                                    Desconectar
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={conectarOutlook}
                                disabled={outlookBusy}
                                className="btn-primary text-[13px] disabled:opacity-50 flex items-center gap-2">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                                    <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                                    <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                                    <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                                    <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                                </svg>
                                {outlookBusy ? 'Iniciando…' : 'Conectar Outlook'}
                            </button>
                        )}
                    </div>

                    {outlookMode === 'custom' && !outlookStatus?.has_custom_client && (
                        <p className="text-[11px] mt-3" style={{ color: 'var(--gold)' }}>
                            ⚠ Guarda primero tus credenciales custom antes de conectar.
                        </p>
                    )}
                </div>

                {/* Selector de buzón activo — solo visible si hay más de uno conectado */}
                {(gmailStatus?.connected && outlookStatus?.connected) && (
                    <div className="surface p-6">
                        <div className="kicker-accent mb-1">Buzón activo</div>
                        <h2 className="font-display text-[1.3rem] tracking-tight mb-1">
                            ¿Cuál usar para el buscador?
                        </h2>
                        <p className="text-[12px] mb-4" style={{ color: 'var(--ink-faint)' }}>
                            Tienes ambos buzones conectados. Escoge cuál usar cuando ejecutes búsquedas de facturas.
                        </p>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="activeProvider"
                                    checked={emailProvider === 'gmail'}
                                    onChange={() => cambiarProviderActivo('gmail')}
                                    style={{ accentColor: 'var(--accent)' }} />
                                <span className="text-[13px]">Gmail ({gmailStatus.email})</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="activeProvider"
                                    checked={emailProvider === 'outlook'}
                                    onChange={() => cambiarProviderActivo('outlook')}
                                    style={{ accentColor: 'var(--accent)' }} />
                                <span className="text-[13px]">Outlook ({outlookStatus.email})</span>
                            </label>
                        </div>
                    </div>
                )}

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
