/**
 * Página /app/seguridad — configuración de 2FA para el usuario actual.
 *
 * Flujo:
 *   1. Botón "Activar 2FA" → llama /setup → devuelve secret + otpauth URI
 *   2. UI muestra el secret + QR (canvas simple con el URI)
 *   3. Usuario escanea o pega el secret en Google Authenticator
 *   4. Ingresa el código de 6 dígitos → llama /verify-setup → guarda
 *   5. UI muestra "✓ 2FA activo" + botón "Desactivar" que exige password + code
 */
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '../utils/apiClient';

interface StatusResp { enabled: boolean; }
interface SetupResp {
    secret: string;
    provisioning_uri: string;
    issuer: string;
}

// Renderiza el QR usando la API pública de Google Charts (con fallback a
// mostrar solo el otpauth URI si no carga).
function QRCode({ data }: { data: string }) {
    const encoded = encodeURIComponent(data);
    return (
        <div className="inline-block p-3 rounded-lg" style={{ background: 'white', border: '1px solid var(--rule)' }}>
            <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`}
                alt="QR Code 2FA"
                width={200}
                height={200}
                style={{ display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
        </div>
    );
}


export default function SeguridadPage() {
    const [status, setStatus] = useState<StatusResp | null>(null);
    const [setupData, setSetupData] = useState<SetupResp | null>(null);
    const [verifyCode, setVerifyCode] = useState('');
    const [disablePassword, setDisablePassword] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const loadStatus = useCallback(async () => {
        try {
            const s = await apiGet<StatusResp>('/api/auth/2fa/status');
            setStatus(s);
        } catch { /* silencioso */ }
    }, []);

    useEffect(() => { void loadStatus(); }, [loadStatus]);

    const startSetup = async () => {
        setBusy(true); setError(null);
        try {
            const s = await apiPost<SetupResp>('/api/auth/2fa/setup', {});
            setSetupData(s);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error iniciando setup');
        } finally { setBusy(false); }
    };

    const confirmSetup = async () => {
        if (!setupData || !verifyCode) return;
        setBusy(true); setError(null);
        try {
            await apiPost('/api/auth/2fa/verify-setup', {
                secret: setupData.secret, code: verifyCode,
            });
            setSetupData(null);
            setVerifyCode('');
            setSuccess('2FA activado correctamente.');
            setTimeout(() => setSuccess(null), 3000);
            await loadStatus();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Código inválido');
        } finally { setBusy(false); }
    };

    const disable2FA = async () => {
        if (!confirm('¿Desactivar 2FA? Solo el password protegerá tu cuenta.')) return;
        setBusy(true); setError(null);
        try {
            await apiPost('/api/auth/2fa/disable', {
                password: disablePassword, code: disableCode,
            });
            setDisablePassword(''); setDisableCode('');
            setSuccess('2FA desactivado.');
            setTimeout(() => setSuccess(null), 3000);
            await loadStatus();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error al desactivar');
        } finally { setBusy(false); }
    };

    const cancelSetup = () => { setSetupData(null); setVerifyCode(''); setError(null); };

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Perfil · Seguridad</div>
                <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                    Segundo <em>factor</em>.
                </h1>
                <p className="text-[13px] mt-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                    Un código TOTP (Time-based One-Time Password) generado por tu app de autenticación
                    (Google Authenticator, Authy, 1Password) — se pide junto con tu contraseña al ingresar.
                    Si alguien te roba el password, sin el código de tu teléfono no puede entrar.
                </p>
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

            {/* Caso 1: sin 2FA + no en setup */}
            {status && !status.enabled && !setupData && (
                <div className="surface p-6">
                    <div className="kicker-accent mb-1">Estado</div>
                    <h2 className="font-display text-[1.3rem] tracking-tight mb-2">2FA desactivado</h2>
                    <p className="text-[13px] mb-5" style={{ color: 'var(--ink-soft)' }}>
                        Tu cuenta solo está protegida por password. Recomendamos activar 2FA — toma menos de un minuto.
                    </p>
                    <button type="button" onClick={startSetup} disabled={busy}
                        className="btn-primary text-[13px] disabled:opacity-50">
                        {busy ? 'Generando…' : 'Activar 2FA'}
                    </button>
                </div>
            )}

            {/* Caso 2: en setup */}
            {setupData && (
                <div className="surface p-6 space-y-5">
                    <div>
                        <div className="kicker-accent mb-1">Paso 1 de 2</div>
                        <h2 className="font-display text-[1.3rem] tracking-tight mb-2">
                            Escanea el código
                        </h2>
                        <p className="text-[13px] mb-4" style={{ color: 'var(--ink-soft)' }}>
                            Abre tu app de autenticación y escanea este QR. O pega el secret manualmente.
                        </p>
                        <div className="flex flex-wrap gap-6 items-center">
                            <QRCode data={setupData.provisioning_uri} />
                            <div className="flex-1 min-w-[240px]">
                                <div className="kicker mb-2">Secret (base32)</div>
                                <div className="font-mono text-[13px] px-3 py-2 rounded-md break-all"
                                    style={{ background: 'var(--surface-soft)', border: '1px solid var(--rule)' }}>
                                    {setupData.secret}
                                </div>
                                <p className="text-[11px] mt-2" style={{ color: 'var(--ink-faint)' }}>
                                    Guarda este secret en un lugar seguro por si pierdes el acceso a la app.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4" style={{ borderTop: '1px solid var(--rule-soft)' }}>
                        <div className="kicker-accent mb-1">Paso 2 de 2</div>
                        <h3 className="font-display text-[1.15rem] tracking-tight mb-3">
                            Ingresa el código actual
                        </h3>
                        <div className="flex gap-3 items-end">
                            <div className="flex-1 max-w-[200px]">
                                <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                                    className="input-field font-mono text-center tracking-widest text-[15px]"
                                    placeholder="000000"
                                    value={verifyCode}
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))} />
                            </div>
                            <button type="button" onClick={confirmSetup}
                                disabled={busy || verifyCode.length !== 6}
                                className="btn-primary text-[13px] disabled:opacity-50">
                                {busy ? 'Verificando…' : 'Confirmar y activar'}
                            </button>
                            <button type="button" onClick={cancelSetup}
                                className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Caso 3: 2FA activo */}
            {status?.enabled && !setupData && (
                <div className="surface p-6">
                    <div className="kicker-accent mb-1">Estado</div>
                    <h2 className="font-display text-[1.3rem] tracking-tight mb-2" style={{ color: 'var(--positive)' }}>
                        ✓ 2FA activo
                    </h2>
                    <p className="text-[13px] mb-5" style={{ color: 'var(--ink-soft)' }}>
                        Tu cuenta está protegida con 2FA. Al ingresar te pediremos tu contraseña + el código actual de tu app.
                    </p>

                    <div className="mt-5 pt-5" style={{ borderTop: '1px dashed var(--rule)' }}>
                        <h3 className="font-display text-[1.1rem] tracking-tight mb-3">Desactivar 2FA</h3>
                        <p className="text-[12px] mb-3" style={{ color: 'var(--ink-faint)' }}>
                            Necesitamos tu contraseña + el código actual — así garantizamos que tú lo estás pidiendo.
                        </p>
                        <div className="grid md:grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className="kicker block mb-1.5">Contraseña actual</label>
                                <input type="password" className="input-field text-[13px]"
                                    value={disablePassword}
                                    onChange={(e) => setDisablePassword(e.target.value)} />
                            </div>
                            <div>
                                <label className="kicker block mb-1.5">Código 2FA</label>
                                <input type="text" inputMode="numeric" maxLength={6}
                                    className="input-field font-mono text-[13px]"
                                    value={disableCode}
                                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))} />
                            </div>
                        </div>
                        <button type="button" onClick={disable2FA}
                            disabled={busy || !disablePassword || disableCode.length !== 6}
                            className="text-[13px] px-4 py-2 rounded-md disabled:opacity-40"
                            style={{ color: 'var(--negative)', border: '1px solid var(--negative)' }}>
                            {busy ? 'Desactivando…' : 'Desactivar 2FA'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
