/**
 * Conciliación DIAN — descarga automatizada del histórico oficial de
 * facturación electrónica (catalogo-vpfe.dian.gov.co) y cruce contra
 * las facturas procesadas en la app.
 *
 * Tabs:
 *   1. Sincronizar    → configurar cédula + disparar sync + pegar magic link
 *   2. Conciliación   → cruce facturas app ↔ documentos DIAN
 *   3. IVA por período → resumen bimestral/cuatrimestral/anual
 *   4. IVA Estratégico → dashboard analítico con recomendaciones
 */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
    CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { apiGet, apiPut, apiPost, apiDelete, ApiError } from '../utils/apiClient';
import { formatCOP } from '../utils/format';

type Tab = 'sync' | 'conciliacion' | 'iva' | 'analisis';

type DianMetodo = 'persona' | 'administrador' | 'rep_legal' | 'usuario_autorizado';
type DianTipoId = 'CC' | 'CE' | 'PP' | 'TI' | 'NIT';

interface DianConfig {
    metodo: DianMetodo;
    tipo_id: DianTipoId | null;
    periodicidad: string;
    ultima_sync: string | null;
    tiene_cedula: boolean;
    tiene_email: boolean;
    tiene_nit_empresa_dian: boolean;
    tiene_doc_usuario: boolean;
    tiene_sesion: boolean;
    requiere_password_en_sync: boolean;
}

const METODO_LABEL: Record<DianMetodo, string> = {
    persona: 'Persona natural (cédula + magic link)',
    administrador: 'Administrador (correo + contraseña)',
    rep_legal: 'Empresa · Representante legal (magic link)',
    usuario_autorizado: 'Empresa · Usuario autorizado (contraseña)',
};

const METODO_HINT: Record<DianMetodo, string> = {
    persona: 'DIAN envía un link único al correo de la cédula. Sin contraseña.',
    administrador: 'Ingresa correo y contraseña del portal DIAN. La contraseña no se guarda; solo se usa para el login y se descarta.',
    rep_legal: 'Cédula del representante legal + NIT empresa. DIAN envía magic link al correo del rep.',
    usuario_autorizado: 'NIT empresa + cédula del usuario autorizado + contraseña. La contraseña no se guarda.',
};

const TIPOS_ID_OPCIONES: { value: DianTipoId; label: string }[] = [
    { value: 'CC', label: 'Cédula de ciudadanía' },
    { value: 'CE', label: 'Cédula de extranjería' },
    { value: 'PP', label: 'Pasaporte' },
    { value: 'TI', label: 'Tarjeta de identidad' },
    { value: 'NIT', label: 'NIT' },
];

interface SyncJob {
    id: number;
    empresa_id: number;
    fecha_desde: string;
    fecha_hasta: string;
    estado: 'pending_magic_link' | 'in_progress' | 'completed' | 'failed';
    mensaje: string | null;
    creado_en: string;
    magic_link_recibido_en: string | null;
    completado_en: string | null;
    documentos_nuevos: number;
    documentos_actualizados: number;
    documentos_totales: number;
}

interface ConciliacionResumen {
    total: number;
    coincidencias: number;
    diferencias_valor: number;
    solo_en_app: number;
    solo_en_dian: number;
    valor_pendiente_registrar: number;
    valor_sin_soporte_dian: number;
    suma_discrepancias: number;
}

interface ConciliacionItem {
    estado: 'coincide' | 'diferencia_valor' | 'solo_en_app' | 'solo_en_dian';
    match_por: 'cufe' | 'folio' | null;
    diferencia_valor: number | null;
    factura_id: number | null;
    factura_numero: string | null;
    factura_proveedor_nit: string | null;
    factura_proveedor_nombre: string | null;
    factura_fecha: string | null;
    factura_valor: number | null;
    factura_estado: string | null;
    documento_dian_id: number | null;
    dian_cufe: string | null;
    dian_prefijo: string | null;
    dian_folio: string | null;
    dian_tipo: string | null;
    dian_grupo: string | null;
    dian_nit_emisor: string | null;
    dian_nombre_emisor: string | null;
    dian_fecha_emision: string | null;
    dian_valor: number | null;
}

interface ConciliacionResponse {
    resumen: ConciliacionResumen;
    items: ConciliacionItem[];
}

interface PeriodoIva {
    etiqueta: string;
    fecha_desde: string;
    fecha_hasta: string;
    docs_ventas: number;
    docs_compras: number;
    iva_ventas: number;
    iva_compras: number;
    saldo_iva: number;
    situacion: 'A PAGAR' | 'A FAVOR' | 'CERO';
}

interface KPIsIVA {
    iva_generado: number;
    iva_descontable_app: number;
    iva_descontable_dian: number;
    iva_no_capturado: number;
    saldo_declaracion: number;
    saldo_si_capturara_todo: number;
    situacion: 'a_pagar' | 'a_favor' | 'cero';
    ratio_captura: number;
    ratio_descontable_generado: number;
    num_ventas_dian: number;
    num_compras_app: number;
    num_compras_dian: number;
    num_no_capturadas: number;
    uvt_anio: number;
}

interface TendenciaPeriodo {
    etiqueta: string;
    fecha_desde: string;
    fecha_hasta: string;
    iva_generado: number;
    iva_descontable: number;
    saldo: number;
    situacion: 'a_pagar' | 'a_favor' | 'cero';
}

interface ProveedorTopIVA {
    nit: string;
    nombre: string;
    iva_total: number;
    num_docs: number;
}

interface FacturaHuerfana {
    documento_dian_id: number;
    cufe: string | null;
    prefijo: string | null;
    folio: string | null;
    nit_emisor: string | null;
    nombre_emisor: string | null;
    fecha_emision: string | null;
    valor: number;
    iva: number;
}

interface Recomendacion {
    tipo: string;
    severidad: 'info' | 'warning' | 'critical';
    titulo: string;
    mensaje: string;
    impacto_estimado_cop: number;
}

interface AnalisisIVA {
    anio: number;
    periodicidad: string;
    periodo_num: number;
    etiqueta: string;
    fecha_desde: string;
    fecha_hasta: string;
    kpis: KPIsIVA;
    tendencia: TendenciaPeriodo[];
    top_proveedores: ProveedorTopIVA[];
    facturas_no_capturadas: FacturaHuerfana[];
    recomendaciones: Recomendacion[];
}

const SEVERIDAD_META: Record<Recomendacion['severidad'], { color: string; bg: string; icon: string }> = {
    info: { color: 'var(--accent)', bg: 'var(--accent-soft)', icon: 'ⓘ' },
    warning: { color: 'var(--gold)', bg: 'var(--gold-soft)', icon: '⚠' },
    critical: { color: 'var(--negative)', bg: 'var(--negative-soft)', icon: '●' },
};

const ESTADO_META: Record<ConciliacionItem['estado'], { label: string; color: string; bg: string }> = {
    coincide: { label: 'Coincide', color: 'var(--positive)', bg: 'var(--positive-soft)' },
    diferencia_valor: { label: 'Diferencia $', color: 'var(--gold)', bg: 'var(--gold-soft)' },
    solo_en_app: { label: 'Solo en app', color: 'var(--gold)', bg: 'var(--gold-soft)' },
    solo_en_dian: { label: 'Solo en DIAN', color: 'var(--negative)', bg: 'var(--negative-soft)' },
};

const JOB_ESTADO_META: Record<SyncJob['estado'], { label: string; color: string; bg: string }> = {
    pending_magic_link: { label: 'Esperando link', color: 'var(--gold)', bg: 'var(--gold-soft)' },
    in_progress: { label: 'En curso', color: 'var(--accent)', bg: 'var(--accent-soft)' },
    completed: { label: 'Completado', color: 'var(--positive)', bg: 'var(--positive-soft)' },
    failed: { label: 'Falló', color: 'var(--negative)', bg: 'var(--negative-soft)' },
};

export default function ConciliacionDianPage() {
    const [tab, setTab] = useState<Tab>('sync');
    const [config, setConfig] = useState<DianConfig | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Config — multi-método
    const [metodo, setMetodo] = useState<DianMetodo>('persona');
    const [tipoId, setTipoId] = useState<DianTipoId>('CC');
    const [cedula, setCedula] = useState('');
    const [email, setEmail] = useState('');
    const [nitEmpresaDian, setNitEmpresaDian] = useState('');
    const [docUsuario, setDocUsuario] = useState('');
    const [periodicidad, setPeriodicidad] = useState('bimestral');
    const [savingConfig, setSavingConfig] = useState(false);

    // Sync — password inline (solo para métodos administrador / usuario_autorizado)
    const [syncPassword, setSyncPassword] = useState('');

    // Sync
    const currentYear = new Date().getFullYear();
    const [fechaDesde, setFechaDesde] = useState(`${currentYear}-01-01`);
    const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().slice(0, 10));
    const [jobs, setJobs] = useState<SyncJob[]>([]);
    const [activeJob, setActiveJob] = useState<SyncJob | null>(null);
    const [magicLink, setMagicLink] = useState('');
    const [syncBusy, setSyncBusy] = useState(false);
    const pollingRef = useRef<number | null>(null);

    // Conciliación
    const [conc, setConc] = useState<ConciliacionResponse | null>(null);
    const [concLoading, setConcLoading] = useState(false);
    const [concSoloCompras, setConcSoloCompras] = useState(true);
    const [concFechaDesde, setConcFechaDesde] = useState(`${currentYear}-01-01`);
    const [concFechaHasta, setConcFechaHasta] = useState(new Date().toISOString().slice(0, 10));
    const [concEstadoFiltro, setConcEstadoFiltro] = useState<'' | ConciliacionItem['estado']>('');

    // IVA
    const [ivaAnio, setIvaAnio] = useState(currentYear);
    const [periodos, setPeriodos] = useState<PeriodoIva[]>([]);
    const [ivaLoading, setIvaLoading] = useState(false);

    // Análisis IVA
    const [anaAnio, setAnaAnio] = useState(currentYear);
    const [anaPeriodoNum, setAnaPeriodoNum] = useState(1);
    const [anaMostrarUVT, setAnaMostrarUVT] = useState(false);
    const [analisis, setAnalisis] = useState<AnalisisIVA | null>(null);
    const [anaLoading, setAnaLoading] = useState(false);

    // ============================================================
    // Cargar config al montar
    // ============================================================
    const loadConfig = useCallback(async () => {
        try {
            const cfg = await apiGet<DianConfig>('/api/conciliacion-dian/config');
            setConfig(cfg);
            setMetodo(cfg.metodo);
            setTipoId(cfg.tipo_id ?? 'CC');
            setPeriodicidad(cfg.periodicidad);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error cargando config');
        }
    }, []);

    const loadJobs = useCallback(async () => {
        try {
            const list = await apiGet<SyncJob[]>('/api/conciliacion-dian/sync/jobs', { limit: 10 });
            setJobs(list);
            // Auto-seleccionar el job activo si hay uno en curso o esperando link
            const active = list.find((j) => j.estado === 'pending_magic_link' || j.estado === 'in_progress');
            setActiveJob(active ?? null);
        } catch { /* silencioso */ }
    }, []);

    useEffect(() => { void loadConfig(); void loadJobs(); }, [loadConfig, loadJobs]);

    // Polling del job activo
    useEffect(() => {
        if (!activeJob || activeJob.estado === 'completed' || activeJob.estado === 'failed') {
            if (pollingRef.current) { window.clearInterval(pollingRef.current); pollingRef.current = null; }
            return;
        }
        pollingRef.current = window.setInterval(async () => {
            try {
                const j = await apiGet<SyncJob>(`/api/conciliacion-dian/sync/${activeJob.id}`);
                setActiveJob(j);
                if (j.estado === 'completed' || j.estado === 'failed') {
                    void loadJobs();
                    void loadConfig();
                }
            } catch { /* silencioso */ }
        }, 2500);
        return () => {
            if (pollingRef.current) window.clearInterval(pollingRef.current);
        };
    }, [activeJob?.id, activeJob?.estado, loadJobs, loadConfig]);

    // ============================================================
    // Handlers
    // ============================================================
    const guardarConfig = async () => {
        setSavingConfig(true);
        setError(null);
        try {
            const body: Record<string, unknown> = {
                metodo,
                tipo_id: tipoId,
                periodicidad,
            };
            // Solo enviamos los campos correspondientes al método seleccionado.
            // Los que no aplican quedan como undefined y el backend los ignora.
            if (metodo === 'persona' && cedula) body.cedula_representante = cedula;
            if (metodo === 'administrador' && email) body.email = email;
            if (metodo === 'rep_legal') {
                if (cedula) body.cedula_representante = cedula;
                if (nitEmpresaDian) body.nit_empresa_dian = nitEmpresaDian;
            }
            if (metodo === 'usuario_autorizado') {
                if (docUsuario) body.doc_usuario = docUsuario;
                if (nitEmpresaDian) body.nit_empresa_dian = nitEmpresaDian;
            }

            const cfg = await apiPut<DianConfig>('/api/conciliacion-dian/config', body);
            setConfig(cfg);
            // Limpiar todos los campos sensibles de la memoria del componente
            setCedula('');
            setEmail('');
            setNitEmpresaDian('');
            setDocUsuario('');
            setSuccess('Configuración guardada.');
            setTimeout(() => setSuccess(null), 2400);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error guardando');
        } finally {
            setSavingConfig(false);
        }
    };

    const iniciarSync = async (opts?: { forzarRelogin?: boolean }) => {
        setSyncBusy(true);
        setError(null);
        try {
            const body: Record<string, unknown> = {
                fecha_desde: fechaDesde,
                fecha_hasta: fechaHasta,
            };
            // Password solo si es método que la exige y no hay sesión, o si se fuerza
            const necesitaPw =
                (config?.metodo === 'administrador' || config?.metodo === 'usuario_autorizado') &&
                (config?.requiere_password_en_sync || opts?.forzarRelogin);
            if (necesitaPw) {
                if (!syncPassword) {
                    setError('Ingresa la contraseña del portal DIAN para iniciar el sync.');
                    setSyncBusy(false);
                    return;
                }
                body.password = syncPassword;
            }
            if (opts?.forzarRelogin) body.force_password_relogin = true;

            const j = await apiPost<SyncJob>('/api/conciliacion-dian/sync/start', body);
            // Limpiar la password del state inmediatamente después de enviarla.
            // Aunque solo estuvo en RAM del navegador, mejor no dejarla acumulada.
            setSyncPassword('');

            setActiveJob(j);
            const msgOk = j.estado === 'pending_magic_link'
                ? 'Sync iniciado. Revisa tu correo para el link de acceso DIAN.'
                : 'Sync iniciado. Login con contraseña en curso...';
            setSuccess(msgOk);
            setTimeout(() => setSuccess(null), 3000);
            void loadJobs();
            void loadConfig();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error iniciando sync');
        } finally {
            setSyncBusy(false);
        }
    };

    const cancelarSync = async () => {
        if (!activeJob) return;
        if (!confirm('¿Cancelar el sync? El browser se cerrará y el job quedará marcado como fallido.')) return;
        setSyncBusy(true);
        try {
            await apiPost(`/api/conciliacion-dian/sync/${activeJob.id}/cancel`);
            setActiveJob(null);
            setMagicLink('');
            setSuccess('Sync cancelado.');
            setTimeout(() => setSuccess(null), 2400);
            void loadJobs();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error cancelando sync');
        } finally {
            setSyncBusy(false);
        }
    };

    const limpiarFallidos = async () => {
        if (!confirm('¿Borrar del historial todos los jobs en estado "Falló"?')) return;
        try {
            const r = await apiDelete<{ deleted: number }>('/api/conciliacion-dian/sync/jobs/failed');
            setSuccess(`${r.deleted} jobs fallidos borrados.`);
            setTimeout(() => setSuccess(null), 2400);
            void loadJobs();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error borrando historial');
        }
    };

    const cargarFixture = async () => {
        try {
            const r = await apiPost<{
                documentos_dian_insertados: number;
                facturas_app_insertadas: number;
                proveedores_demo: number;
            }>('/api/conciliacion-dian/dev/seed-fixture');
            setSuccess(
                `Fixture cargada: ${r.documentos_dian_insertados} docs DIAN + ` +
                `${r.facturas_app_insertadas} facturas app + ${r.proveedores_demo} proveedores. ` +
                `Revisa los tabs Conciliación, IVA por período e IVA Estratégico.`
            );
            setTimeout(() => setSuccess(null), 6000);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error cargando fixture. Verifica que DEBUG=True en .env.');
        }
    };

    const enviarMagicLink = async () => {
        if (!activeJob || !magicLink.trim()) return;
        setSyncBusy(true);
        try {
            await apiPost(`/api/conciliacion-dian/sync/${activeJob.id}/magic-link`, {
                link: magicLink.trim(),
            });
            setMagicLink('');
            setSuccess('Link enviado. Iniciando descarga...');
            setTimeout(() => setSuccess(null), 2400);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error enviando link');
        } finally {
            setSyncBusy(false);
        }
    };

    const loadConciliacion = useCallback(async () => {
        setConcLoading(true);
        setError(null);
        try {
            const data = await apiGet<ConciliacionResponse>('/api/conciliacion-dian/conciliacion', {
                fecha_desde: concFechaDesde,
                fecha_hasta: concFechaHasta,
                // FastAPI acepta "true"/"false" para bool en query params
                solo_compras: concSoloCompras ? 'true' : 'false',
            });
            setConc(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error cargando conciliación');
        } finally {
            setConcLoading(false);
        }
    }, [concFechaDesde, concFechaHasta, concSoloCompras]);

    const loadIva = useCallback(async () => {
        setIvaLoading(true);
        setError(null);
        try {
            const data = await apiGet<PeriodoIva[]>('/api/conciliacion-dian/iva-periodos', { anio: ivaAnio });
            setPeriodos(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error cargando IVA');
        } finally {
            setIvaLoading(false);
        }
    }, [ivaAnio]);

    const loadAnalisis = useCallback(async () => {
        setAnaLoading(true);
        setError(null);
        try {
            const data = await apiGet<AnalisisIVA>('/api/conciliacion-dian/analisis-iva', {
                anio: anaAnio,
                periodo_num: anaPeriodoNum,
            });
            setAnalisis(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Error cargando análisis IVA');
        } finally {
            setAnaLoading(false);
        }
    }, [anaAnio, anaPeriodoNum]);

    useEffect(() => { if (tab === 'conciliacion') void loadConciliacion(); }, [tab, loadConciliacion]);
    useEffect(() => { if (tab === 'iva') void loadIva(); }, [tab, loadIva]);
    useEffect(() => { if (tab === 'analisis') void loadAnalisis(); }, [tab, loadAnalisis]);

    // Helper para mostrar cifras en COP o UVT según toggle
    const fmt = useCallback((v: number): string => {
        if (!anaMostrarUVT || !analisis?.kpis.uvt_anio) return formatCOP(v);
        const uvt = v / analisis.kpis.uvt_anio;
        return `${uvt.toFixed(1)} UVT`;
    }, [anaMostrarUVT, analisis?.kpis.uvt_anio]);

    // Config de períodos según periodicidad
    const periodosDisponibles = useMemo(() => {
        const p = config?.periodicidad ?? 'bimestral';
        if (p === 'bimestral') return [
            { num: 1, label: 'Bim 1 (Ene-Feb)' }, { num: 2, label: 'Bim 2 (Mar-Abr)' },
            { num: 3, label: 'Bim 3 (May-Jun)' }, { num: 4, label: 'Bim 4 (Jul-Ago)' },
            { num: 5, label: 'Bim 5 (Sep-Oct)' }, { num: 6, label: 'Bim 6 (Nov-Dic)' },
        ];
        if (p === 'cuatrimestral') return [
            { num: 1, label: 'Cuat 1 (Ene-Abr)' },
            { num: 2, label: 'Cuat 2 (May-Ago)' },
            { num: 3, label: 'Cuat 3 (Sep-Dic)' },
        ];
        return [{ num: 1, label: 'Anual' }];
    }, [config?.periodicidad]);

    const itemsFiltered = conc?.items.filter((i) => !concEstadoFiltro || i.estado === concEstadoFiltro) ?? [];

    // ============================================================
    // Render
    // ============================================================
    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            {/* Header */}
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Administración · Facturación electrónica</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Conciliación <em>DIAN</em>.
                    </h1>
                    <p className="text-[13px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Descarga el histórico oficial del portal DIAN y crúzalo contra las
                        facturas procesadas en la app para detectar diferencias y cuadrar IVA.
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

            {/* Tabs */}
            <div className="flex gap-2 border-b flex-wrap" style={{ borderColor: 'var(--rule)' }}>
                {(['sync', 'conciliacion', 'iva', 'analisis'] as Tab[]).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className="px-5 py-3 text-[13px] font-medium transition-colors"
                        style={{
                            color: tab === t ? 'var(--ink)' : 'var(--ink-faint)',
                            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                            marginBottom: '-1px',
                        }}
                    >
                        {t === 'sync' ? 'Sincronizar'
                            : t === 'conciliacion' ? 'Conciliación'
                                : t === 'iva' ? 'IVA por período'
                                    : 'IVA Estratégico'}
                    </button>
                ))}
            </div>

            {/* ============= TAB SYNC ============= */}
            {tab === 'sync' && (
                <div className="space-y-6">
                    {/* Config — multi-método */}
                    <div className="surface p-6">
                        <div className="kicker-accent mb-1">Configuración</div>
                        <h2 className="font-display text-[1.3rem] tracking-tight mb-1">
                            Método de autenticación DIAN
                        </h2>
                        <p className="text-[12px] mb-5" style={{ color: 'var(--ink-faint)' }}>
                            El portal DIAN acepta cuatro formas de ingreso. Elige la que aplique según
                            cómo esté registrada tu empresa. <strong>Ninguna contraseña se guarda</strong> —
                            solo se usa una vez para el login y se descarta. Los demás datos (cédula,
                            correo, NITs) se guardan encriptados con Fernet.
                        </p>

                        {/* Selector de método — cards */}
                        <div className="grid md:grid-cols-2 gap-3 mb-6">
                            {(Object.keys(METODO_LABEL) as DianMetodo[]).map((m) => (
                                <button key={m}
                                    type="button"
                                    onClick={() => setMetodo(m)}
                                    className="text-left px-4 py-3 rounded-md transition-all"
                                    style={{
                                        border: metodo === m
                                            ? '2px solid var(--accent)'
                                            : '1px solid var(--rule)',
                                        background: metodo === m ? 'var(--accent-soft)' : 'transparent',
                                    }}>
                                    <div className="font-display text-[13px] tracking-tight mb-0.5">
                                        {METODO_LABEL[m]}
                                    </div>
                                    <div className="text-[11px] leading-snug" style={{ color: 'var(--ink-faint)' }}>
                                        {METODO_HINT[m]}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Campos condicionales por método */}
                        <div className="grid md:grid-cols-2 gap-4 mb-4">
                            {/* Tipo ID — para todos excepto administrador */}
                            {metodo !== 'administrador' && (
                                <div>
                                    <label className="kicker block mb-1.5">Tipo de identificación</label>
                                    <select className="input-field text-[13px]"
                                        value={tipoId}
                                        onChange={(e) => setTipoId(e.target.value as DianTipoId)}>
                                        {TIPOS_ID_OPCIONES.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Persona / Rep. Legal: cédula */}
                            {(metodo === 'persona' || metodo === 'rep_legal') && (
                                <div>
                                    <label className="kicker block mb-1.5">
                                        {metodo === 'persona' ? 'Cédula del contribuyente' : 'Cédula del representante legal'}
                                        {config?.tiene_cedula && (
                                            <span className="ml-1" style={{ color: 'var(--positive)' }}>✓ guardada</span>
                                        )}
                                    </label>
                                    <input type="text"
                                        className="input-field font-mono text-[13px]"
                                        placeholder={config?.tiene_cedula ? '••••••••  (dejar vacío para conservar)' : 'Solo dígitos'}
                                        value={cedula}
                                        onChange={(e) => setCedula(e.target.value.replace(/\D/g, ''))} />
                                </div>
                            )}

                            {/* Administrador: email */}
                            {metodo === 'administrador' && (
                                <div className="md:col-span-2">
                                    <label className="kicker block mb-1.5">
                                        Correo del Administrador DIAN
                                        {config?.tiene_email && (
                                            <span className="ml-1" style={{ color: 'var(--positive)' }}>✓ guardado</span>
                                        )}
                                    </label>
                                    <input type="email"
                                        className="input-field text-[13px]"
                                        placeholder={config?.tiene_email ? '••••••••  (dejar vacío para conservar)' : 'admin@empresa.com'}
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value.trim())} />
                                </div>
                            )}

                            {/* Rep. Legal / Usuario Autz: NIT empresa */}
                            {(metodo === 'rep_legal' || metodo === 'usuario_autorizado') && (
                                <div>
                                    <label className="kicker block mb-1.5">
                                        NIT de la empresa
                                        {config?.tiene_nit_empresa_dian && (
                                            <span className="ml-1" style={{ color: 'var(--positive)' }}>✓ guardado</span>
                                        )}
                                    </label>
                                    <input type="text"
                                        className="input-field font-mono text-[13px]"
                                        placeholder={config?.tiene_nit_empresa_dian ? '••••••••' : 'Solo dígitos'}
                                        value={nitEmpresaDian}
                                        onChange={(e) => setNitEmpresaDian(e.target.value.replace(/\D/g, ''))} />
                                </div>
                            )}

                            {/* Usuario Autorizado: doc usuario */}
                            {metodo === 'usuario_autorizado' && (
                                <div>
                                    <label className="kicker block mb-1.5">
                                        Documento del usuario autorizado
                                        {config?.tiene_doc_usuario && (
                                            <span className="ml-1" style={{ color: 'var(--positive)' }}>✓ guardado</span>
                                        )}
                                    </label>
                                    <input type="text"
                                        className="input-field font-mono text-[13px]"
                                        placeholder={config?.tiene_doc_usuario ? '••••••••' : 'Solo dígitos'}
                                        value={docUsuario}
                                        onChange={(e) => setDocUsuario(e.target.value.replace(/\D/g, ''))} />
                                </div>
                            )}
                        </div>

                        {/* Periodicidad + botón Guardar (comunes) */}
                        <div className="grid md:grid-cols-2 gap-4 items-end pt-4"
                            style={{ borderTop: '1px solid var(--rule-soft)' }}>
                            <div>
                                <label className="kicker block mb-1.5">Periodicidad IVA</label>
                                <select className="input-field text-[13px]"
                                    value={periodicidad}
                                    onChange={(e) => setPeriodicidad(e.target.value)}>
                                    <option value="bimestral">Bimestral (default)</option>
                                    <option value="cuatrimestral">Cuatrimestral</option>
                                    <option value="anual">Anual</option>
                                </select>
                            </div>
                            <button type="button"
                                onClick={guardarConfig}
                                disabled={savingConfig}
                                className="btn-secondary text-[13px] disabled:opacity-50">
                                {savingConfig ? 'Guardando…' : 'Guardar configuración'}
                            </button>
                        </div>

                        {config && (
                            <div className="mt-4 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                {config.tiene_sesion && <>✓ Sesión DIAN guardada · </>}
                                {config.ultima_sync && <>Última sync: {new Date(config.ultima_sync).toLocaleString('es-CO')}</>}
                                {!config.tiene_sesion && !config.ultima_sync && <>Nunca sincronizado.</>}
                            </div>
                        )}

                        {/* Fixture — solo dev */}
                        <div className="mt-4 pt-4" style={{ borderTop: '1px dashed var(--rule)' }}>
                            <div className="text-[11px] mb-2" style={{ color: 'var(--ink-faint)' }}>
                                <strong>¿No tienes registro DIAN?</strong> Puedes cargar datos de prueba para
                                ver los tabs Conciliación e IVA sin necesidad de un sync real.
                                Requiere <span className="font-mono">DEBUG=True</span> en <span className="font-mono">.env</span> del backend.
                            </div>
                            <button type="button"
                                onClick={cargarFixture}
                                className="text-[12px] px-3 py-1.5 rounded-md"
                                style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                                Cargar datos de prueba
                            </button>
                        </div>
                    </div>

                    {/* Nueva sync */}
                    <div className="surface p-6">
                        <div className="kicker-accent mb-1">Iniciar descarga</div>
                        <h2 className="font-display text-[1.3rem] tracking-tight mb-4">
                            Rango a sincronizar con DIAN
                        </h2>

                        <div className="grid md:grid-cols-3 gap-4 items-end">
                            <div>
                                <label className="kicker block mb-1.5">Fecha desde</label>
                                <input type="date" className="input-field text-[13px]"
                                    value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                            </div>
                            <div>
                                <label className="kicker block mb-1.5">Fecha hasta</label>
                                <input type="date" className="input-field text-[13px]"
                                    value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                            </div>
                            <button type="button"
                                onClick={() => iniciarSync()}
                                disabled={syncBusy || Boolean(activeJob && activeJob.estado !== 'completed' && activeJob.estado !== 'failed')}
                                className="btn-primary text-[13px] disabled:opacity-50">
                                {syncBusy ? 'Iniciando…' : 'Iniciar sync'}
                            </button>
                        </div>

                        {/* Prompt de contraseña inline — solo métodos administrador/usuario_autorizado */}
                        {config && (config.metodo === 'administrador' || config.metodo === 'usuario_autorizado') && (
                            <div className="mt-5 pt-5 space-y-3" style={{ borderTop: '1px dashed var(--rule)' }}>
                                <div>
                                    <label className="kicker block mb-1.5">
                                        Contraseña del portal DIAN
                                        {config.tiene_sesion && !config.requiere_password_en_sync && (
                                            <span className="ml-1 text-[11px] normal-case tracking-normal"
                                                style={{ color: 'var(--positive)' }}>
                                                (sesión activa — no requerida)
                                            </span>
                                        )}
                                    </label>
                                    <input type="password"
                                        className="input-field text-[13px] font-mono"
                                        autoComplete="off"
                                        placeholder={config.requiere_password_en_sync
                                            ? 'Requerida — no se guarda en BD'
                                            : 'Opcional cuando hay sesión activa'}
                                        value={syncPassword}
                                        onChange={(e) => setSyncPassword(e.target.value)} />
                                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
                                        La contraseña vive solo en memoria del thread del sync — se descarta
                                        tras el login. Si el login funciona, guardamos únicamente cookies +
                                        localStorage encriptados para reusar la sesión (~30 min).
                                    </p>
                                </div>
                                {config.tiene_sesion && (
                                    <button type="button"
                                        onClick={() => iniciarSync({ forzarRelogin: true })}
                                        disabled={syncBusy || !syncPassword}
                                        className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-40"
                                        style={{ color: 'var(--gold)', border: '1px solid var(--gold)' }}>
                                        Forzar re-login (invalida sesión guardada)
                                    </button>
                                )}
                            </div>
                        )}

                        {config?.metodo === 'persona' && !config.tiene_cedula && (
                            <p className="text-[11px] mt-3" style={{ color: 'var(--gold)' }}>
                                ⚠ Configura primero la cédula para poder sincronizar.
                            </p>
                        )}
                        {config?.metodo === 'rep_legal' && (!config.tiene_cedula || !config.tiene_nit_empresa_dian) && (
                            <p className="text-[11px] mt-3" style={{ color: 'var(--gold)' }}>
                                ⚠ Configura cédula del rep. legal y NIT empresa para poder sincronizar.
                            </p>
                        )}
                        {config?.metodo === 'administrador' && !config.tiene_email && (
                            <p className="text-[11px] mt-3" style={{ color: 'var(--gold)' }}>
                                ⚠ Configura el correo del Administrador para poder sincronizar.
                            </p>
                        )}
                        {config?.metodo === 'usuario_autorizado' && (!config.tiene_nit_empresa_dian || !config.tiene_doc_usuario) && (
                            <p className="text-[11px] mt-3" style={{ color: 'var(--gold)' }}>
                                ⚠ Configura NIT empresa y documento del usuario autorizado para poder sincronizar.
                            </p>
                        )}
                    </div>

                    {/* Job activo con magic link */}
                    {activeJob && activeJob.estado === 'pending_magic_link' && (
                        <div className="surface p-6"
                            style={{ background: 'var(--gold-soft)', border: '2px solid var(--gold)' }}>
                            <div className="kicker mb-1" style={{ color: 'var(--gold)' }}>Acción requerida</div>
                            <h2 className="font-display text-[1.3rem] tracking-tight mb-2">
                                📧 Pega el link que la DIAN envió a tu correo
                            </h2>
                            <p className="text-[12px] mb-4" style={{ color: 'var(--ink-soft)' }}>
                                Puedes pegar la URL completa (<span className="font-mono">https://catalogo-vpfe.dian.gov.co/User/AuthToken?...</span>)
                                o el tag <span className="font-mono">&lt;a href="..."&gt;</span> completo copiado del correo.
                                Tienes 15 minutos desde que iniciaste el sync.
                            </p>

                            <textarea rows={3}
                                className="input-field font-mono text-[12px] w-full"
                                placeholder="Pega aquí el link o el tag <a href=...>"
                                value={magicLink}
                                onChange={(e) => setMagicLink(e.target.value)} />

                            <div className="flex gap-3 mt-3">
                                <button type="button"
                                    onClick={enviarMagicLink}
                                    disabled={syncBusy || !magicLink.trim()}
                                    className="btn-primary text-[13px] disabled:opacity-50">
                                    {syncBusy ? 'Enviando…' : 'Enviar link'}
                                </button>
                                <button type="button"
                                    onClick={cancelarSync}
                                    disabled={syncBusy}
                                    className="text-[13px] px-4 py-2 rounded-md disabled:opacity-50"
                                    style={{ color: 'var(--negative)', border: '1px solid var(--negative)' }}>
                                    Cancelar sync
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Job en curso: mostrar botón cancelar (por si Cloudflare bloquea, etc.) */}
                    {activeJob && activeJob.estado === 'in_progress' && (
                        <div className="flex justify-end -mt-4">
                            <button type="button"
                                onClick={cancelarSync}
                                disabled={syncBusy}
                                className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
                                style={{ color: 'var(--negative)', border: '1px solid var(--negative)' }}>
                                Cancelar sync
                            </button>
                        </div>
                    )}

                    {/* Job en curso */}
                    {activeJob && activeJob.estado === 'in_progress' && (
                        <div className="surface p-6"
                            style={{ background: 'var(--accent-soft)', border: '2px solid var(--accent)' }}>
                            <div className="kicker mb-1" style={{ color: 'var(--accent)' }}>Descargando</div>
                            <h2 className="font-display text-[1.2rem] tracking-tight">
                                Job #{activeJob.id} — {activeJob.mensaje ?? 'procesando...'}
                            </h2>
                        </div>
                    )}

                    {/* Historial */}
                    <div className="surface p-6">
                        <div className="flex justify-between items-baseline mb-4">
                            <div>
                                <div className="kicker-accent mb-1">Últimas sincronizaciones</div>
                                <h2 className="font-display text-[1.2rem] tracking-tight">Historial</h2>
                            </div>
                            {jobs.some((j) => j.estado === 'failed') && (
                                <button type="button"
                                    onClick={limpiarFallidos}
                                    className="text-[11px] px-3 py-1.5 rounded-md transition-colors"
                                    style={{ color: 'var(--ink-faint)', border: '1px solid var(--rule)' }}>
                                    Limpiar fallidos
                                </button>
                            )}
                        </div>

                        {jobs.length === 0 ? (
                            <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                                Aún no has sincronizado con la DIAN.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                                            <th className="text-left p-2 kicker">Job</th>
                                            <th className="text-left p-2 kicker">Rango</th>
                                            <th className="text-left p-2 kicker">Estado</th>
                                            <th className="text-right p-2 kicker">Docs</th>
                                            <th className="text-left p-2 kicker">Iniciado</th>
                                            <th className="text-left p-2 kicker">Mensaje</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobs.map((j) => {
                                            const m = JOB_ESTADO_META[j.estado];
                                            return (
                                                <tr key={j.id} style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                                                    <td className="p-2 font-mono">#{j.id}</td>
                                                    <td className="p-2 font-mono">{j.fecha_desde} → {j.fecha_hasta}</td>
                                                    <td className="p-2">
                                                        <span className="text-[10px] px-2 py-0.5 rounded-sm font-medium uppercase"
                                                            style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}` }}>
                                                            {m.label}
                                                        </span>
                                                    </td>
                                                    <td className="p-2 text-right font-mono">{j.documentos_totales}</td>
                                                    <td className="p-2 font-mono" style={{ color: 'var(--ink-faint)' }}>
                                                        {new Date(j.creado_en).toLocaleString('es-CO')}
                                                    </td>
                                                    <td className="p-2 whitespace-pre-wrap" style={{ color: 'var(--ink-faint)', maxWidth: '480px', wordBreak: 'break-word' }}>
                                                        {j.mensaje}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ============= TAB CONCILIACIÓN ============= */}
            {tab === 'conciliacion' && (
                <div className="space-y-6">
                    <div className="surface p-6">
                        <div className="grid md:grid-cols-4 gap-4 items-end">
                            <div>
                                <label className="kicker block mb-1.5">Desde</label>
                                <input type="date" className="input-field text-[13px]"
                                    value={concFechaDesde} onChange={(e) => setConcFechaDesde(e.target.value)} />
                            </div>
                            <div>
                                <label className="kicker block mb-1.5">Hasta</label>
                                <input type="date" className="input-field text-[13px]"
                                    value={concFechaHasta} onChange={(e) => setConcFechaHasta(e.target.value)} />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={concSoloCompras}
                                    onChange={(e) => setConcSoloCompras(e.target.checked)}
                                    style={{ accentColor: 'var(--accent)' }} />
                                <span className="text-[13px]">Solo compras (recibidas)</span>
                            </label>
                            <button type="button" onClick={loadConciliacion}
                                disabled={concLoading}
                                className="btn-secondary text-[13px] disabled:opacity-50">
                                {concLoading ? 'Cargando…' : 'Recalcular'}
                            </button>
                        </div>
                    </div>

                    {conc && (
                        <>
                            {/* KPI cards */}
                            <div className="grid md:grid-cols-4 gap-4">
                                {(['coincide', 'solo_en_dian', 'solo_en_app', 'diferencia_valor'] as const).map((estado) => {
                                    const m = ESTADO_META[estado];
                                    const cuenta = estado === 'coincide' ? conc.resumen.coincidencias
                                        : estado === 'solo_en_dian' ? conc.resumen.solo_en_dian
                                        : estado === 'solo_en_app' ? conc.resumen.solo_en_app
                                        : conc.resumen.diferencias_valor;
                                    return (
                                        <button key={estado}
                                            type="button"
                                            onClick={() => setConcEstadoFiltro(concEstadoFiltro === estado ? '' : estado)}
                                            className="surface p-5 text-left transition-transform hover:scale-[1.02]"
                                            style={{
                                                border: concEstadoFiltro === estado ? `2px solid ${m.color}` : '1px solid var(--rule)',
                                            }}>
                                            <div className="kicker mb-1" style={{ color: m.color }}>{m.label}</div>
                                            <div className="font-display text-[2rem] tracking-tight">{cuenta}</div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Impacto monetario */}
                            <div className="surface p-6">
                                <div className="kicker-accent mb-3">Impacto monetario</div>
                                <div className="grid md:grid-cols-3 gap-6">
                                    <div>
                                        <div className="kicker mb-1">Pendiente de registrar</div>
                                        <div className="font-mono text-[1.2rem]" style={{ color: 'var(--negative)' }}>
                                            {formatCOP(conc.resumen.valor_pendiente_registrar)}
                                        </div>
                                        <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                            En DIAN pero no en la app
                                        </div>
                                    </div>
                                    <div>
                                        <div className="kicker mb-1">Sin soporte DIAN</div>
                                        <div className="font-mono text-[1.2rem]" style={{ color: 'var(--gold)' }}>
                                            {formatCOP(conc.resumen.valor_sin_soporte_dian)}
                                        </div>
                                        <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                            En la app pero no en DIAN
                                        </div>
                                    </div>
                                    <div>
                                        <div className="kicker mb-1">Suma discrepancias</div>
                                        <div className="font-mono text-[1.2rem]" style={{ color: 'var(--gold)' }}>
                                            {formatCOP(conc.resumen.suma_discrepancias)}
                                        </div>
                                        <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                            Facturas con match pero valor distinto
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tabla de items */}
                            <div className="surface p-6 overflow-x-auto">
                                <div className="flex justify-between items-baseline mb-4">
                                    <h3 className="font-display text-[1.2rem]">
                                        Detalle {concEstadoFiltro && <em style={{ color: 'var(--ink-faint)' }}>· filtrado</em>}
                                    </h3>
                                    <div className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                                        {itemsFiltered.length} de {conc.items.length} registros
                                    </div>
                                </div>

                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                                            <th className="text-left p-2 kicker">Estado</th>
                                            <th className="text-left p-2 kicker">Proveedor / Emisor</th>
                                            <th className="text-left p-2 kicker">Documento</th>
                                            <th className="text-left p-2 kicker">Fecha</th>
                                            <th className="text-right p-2 kicker">Valor app</th>
                                            <th className="text-right p-2 kicker">Valor DIAN</th>
                                            <th className="text-right p-2 kicker">Diferencia</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {itemsFiltered.slice(0, 500).map((i, idx) => {
                                            const m = ESTADO_META[i.estado];
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                                                    <td className="p-2">
                                                        <span className="text-[10px] px-2 py-0.5 rounded-sm font-medium uppercase"
                                                            style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}` }}>
                                                            {m.label}
                                                        </span>
                                                    </td>
                                                    <td className="p-2">
                                                        <div>{i.factura_proveedor_nombre || i.dian_nombre_emisor || '—'}</div>
                                                        <div className="font-mono" style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>
                                                            NIT {i.factura_proveedor_nit || i.dian_nit_emisor || '—'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 font-mono">
                                                        {i.factura_numero || (i.dian_prefijo && i.dian_folio ? `${i.dian_prefijo}-${i.dian_folio}` : '—')}
                                                    </td>
                                                    <td className="p-2 font-mono">
                                                        {i.factura_fecha || i.dian_fecha_emision || '—'}
                                                    </td>
                                                    <td className="p-2 text-right font-mono">
                                                        {i.factura_valor != null ? formatCOP(i.factura_valor) : '—'}
                                                    </td>
                                                    <td className="p-2 text-right font-mono">
                                                        {i.dian_valor != null ? formatCOP(i.dian_valor) : '—'}
                                                    </td>
                                                    <td className="p-2 text-right font-mono"
                                                        style={{ color: i.diferencia_valor ? 'var(--gold)' : 'var(--ink-faint)' }}>
                                                        {i.diferencia_valor != null ? formatCOP(i.diferencia_valor) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {itemsFiltered.length > 500 && (
                                    <p className="text-[11px] mt-3" style={{ color: 'var(--ink-faint)' }}>
                                        Mostrando los primeros 500 de {itemsFiltered.length}. Ajusta filtros para reducir.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ============= TAB IVA ============= */}
            {tab === 'iva' && (
                <div className="space-y-6">
                    <div className="surface p-6">
                        <div className="grid md:grid-cols-3 gap-4 items-end">
                            <div>
                                <label className="kicker block mb-1.5">Año fiscal</label>
                                <input type="number" min={2000} max={2100}
                                    className="input-field text-[13px]"
                                    value={ivaAnio}
                                    onChange={(e) => setIvaAnio(Number(e.target.value))} />
                            </div>
                            <div className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                                Periodicidad: <strong style={{ color: 'var(--ink)' }}>{config?.periodicidad ?? 'bimestral'}</strong>
                                <br />
                                Cámbiala en el tab Sincronizar → Configuración.
                            </div>
                            <button type="button" onClick={loadIva}
                                disabled={ivaLoading}
                                className="btn-secondary text-[13px] disabled:opacity-50">
                                {ivaLoading ? 'Cargando…' : 'Recalcular'}
                            </button>
                        </div>
                    </div>

                    {periodos.length > 0 && (
                        <div className="surface p-6 overflow-x-auto">
                            <div className="kicker-accent mb-3">IVA por período — {config?.periodicidad ?? 'bimestral'} {ivaAnio}</div>
                            <table className="w-full text-[12px]">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                                        <th className="text-left p-2 kicker">Período</th>
                                        <th className="text-right p-2 kicker">Docs V</th>
                                        <th className="text-right p-2 kicker">IVA ventas</th>
                                        <th className="text-right p-2 kicker">Docs C</th>
                                        <th className="text-right p-2 kicker">IVA compras</th>
                                        <th className="text-right p-2 kicker">Saldo IVA</th>
                                        <th className="text-left p-2 kicker">Situación</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {periodos.map((p, idx) => {
                                        const color = p.situacion === 'A PAGAR' ? 'var(--negative)'
                                            : p.situacion === 'A FAVOR' ? 'var(--positive)' : 'var(--ink-faint)';
                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                                                <td className="p-2">{p.etiqueta}</td>
                                                <td className="p-2 text-right font-mono">{p.docs_ventas}</td>
                                                <td className="p-2 text-right font-mono">{formatCOP(p.iva_ventas)}</td>
                                                <td className="p-2 text-right font-mono">{p.docs_compras}</td>
                                                <td className="p-2 text-right font-mono">{formatCOP(p.iva_compras)}</td>
                                                <td className="p-2 text-right font-mono font-bold" style={{ color }}>
                                                    {formatCOP(p.saldo_iva)}
                                                </td>
                                                <td className="p-2">
                                                    <span className="text-[10px] px-2 py-0.5 rounded-sm font-medium uppercase"
                                                        style={{ color, border: `1px solid ${color}` }}>
                                                        {p.situacion}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {periodos.length === 0 && !ivaLoading && (
                        <div className="surface p-6 text-center">
                            <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                                No hay documentos DIAN cargados para {ivaAnio}. Sincroniza primero en el tab Sincronizar.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ============= TAB ANÁLISIS ESTRATÉGICO IVA ============= */}
            {tab === 'analisis' && (
                <div className="space-y-6">
                    {/* Controles */}
                    <div className="surface p-6">
                        <div className="kicker-accent mb-1">Análisis estratégico</div>
                        <h2 className="font-display text-[1.3rem] tracking-tight mb-4">
                            IVA generado vs descontable — decisiones tributarias
                        </h2>
                        <p className="text-[12px] mb-5" style={{ color: 'var(--ink-faint)' }}>
                            Cruza el IVA generado por ventas (DIAN oficial) con el IVA descontable
                            de las compras procesadas en la app. Identifica facturas registradas
                            en DIAN que no has capturado y sugiere acciones para optimizar tu carga tributaria.
                        </p>

                        <div className="grid md:grid-cols-4 gap-4 items-end">
                            <div>
                                <label className="kicker block mb-1.5">Año</label>
                                <input type="number" min={2000} max={2100}
                                    className="input-field text-[13px]"
                                    value={anaAnio}
                                    onChange={(e) => setAnaAnio(Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="kicker block mb-1.5">
                                    Período ({config?.periodicidad ?? 'bimestral'})
                                </label>
                                <select className="input-field text-[13px]"
                                    value={anaPeriodoNum}
                                    onChange={(e) => setAnaPeriodoNum(Number(e.target.value))}>
                                    {periodosDisponibles.map((p) => (
                                        <option key={p.num} value={p.num}>{p.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="kicker block mb-1.5">Cifras</label>
                                <div className="inline-flex rounded-md overflow-hidden text-[12px]"
                                    style={{ border: '1px solid var(--rule)' }}>
                                    <button type="button"
                                        onClick={() => setAnaMostrarUVT(false)}
                                        className="px-3 py-1.5"
                                        style={{
                                            background: !anaMostrarUVT ? 'var(--accent)' : 'transparent',
                                            color: !anaMostrarUVT ? 'white' : 'var(--ink-faint)',
                                        }}>
                                        COP
                                    </button>
                                    <button type="button"
                                        onClick={() => setAnaMostrarUVT(true)}
                                        className="px-3 py-1.5"
                                        style={{
                                            background: anaMostrarUVT ? 'var(--accent)' : 'transparent',
                                            color: anaMostrarUVT ? 'white' : 'var(--ink-faint)',
                                        }}>
                                        UVT
                                    </button>
                                </div>
                            </div>
                            <button type="button" onClick={loadAnalisis}
                                disabled={anaLoading}
                                className="btn-secondary text-[13px] disabled:opacity-50">
                                {anaLoading ? 'Cargando…' : 'Recalcular'}
                            </button>
                        </div>
                    </div>

                    {analisis && (
                        <>
                            {/* KPIs */}
                            <div className="grid md:grid-cols-4 gap-4">
                                <div className="surface p-5">
                                    <div className="kicker mb-1">IVA generado</div>
                                    <div className="font-display text-[1.6rem] tracking-tight"
                                        style={{ color: 'var(--ink)' }}>
                                        {fmt(analisis.kpis.iva_generado)}
                                    </div>
                                    <div className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                                        {analisis.kpis.num_ventas_dian} ventas en DIAN · fuente única
                                    </div>
                                </div>
                                <div className="surface p-5">
                                    <div className="kicker mb-1">IVA descontable (app)</div>
                                    <div className="font-display text-[1.6rem] tracking-tight"
                                        style={{ color: 'var(--ink)' }}>
                                        {fmt(analisis.kpis.iva_descontable_app)}
                                    </div>
                                    <div className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                                        {analisis.kpis.num_compras_app} facturas procesadas
                                    </div>
                                </div>
                                <div className="surface p-5" style={{
                                    borderLeft: `3px solid ${analisis.kpis.situacion === 'a_pagar' ? 'var(--negative)'
                                        : analisis.kpis.situacion === 'a_favor' ? 'var(--positive)' : 'var(--ink-faint)'
                                        }`
                                }}>
                                    <div className="kicker mb-1">Saldo declaración</div>
                                    <div className="font-display text-[1.6rem] tracking-tight"
                                        style={{
                                            color: analisis.kpis.situacion === 'a_pagar' ? 'var(--negative)'
                                                : analisis.kpis.situacion === 'a_favor' ? 'var(--positive)' : 'var(--ink)'
                                        }}>
                                        {fmt(Math.abs(analisis.kpis.saldo_declaracion))}
                                    </div>
                                    <div className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                                        {analisis.kpis.situacion === 'a_pagar' ? 'A pagar a DIAN'
                                            : analisis.kpis.situacion === 'a_favor' ? 'Saldo a favor'
                                                : 'Sin saldo'}
                                    </div>
                                </div>
                                <div className="surface p-5" style={{
                                    borderLeft: analisis.kpis.iva_no_capturado > 0 ? '3px solid var(--gold)' : undefined,
                                }}>
                                    <div className="kicker mb-1">IVA sin capturar</div>
                                    <div className="font-display text-[1.6rem] tracking-tight"
                                        style={{ color: analisis.kpis.iva_no_capturado > 0 ? 'var(--gold)' : 'var(--ink-faint)' }}>
                                        {fmt(analisis.kpis.iva_no_capturado)}
                                    </div>
                                    <div className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                                        {analisis.kpis.num_no_capturadas} facturas en DIAN sin procesar
                                    </div>
                                </div>
                            </div>

                            {/* Ratios + Tendencia */}
                            <div className="grid lg:grid-cols-3 gap-4">
                                <div className="surface p-5 space-y-4">
                                    <div>
                                        <div className="kicker mb-2">Tasa de captura electrónica</div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-display text-[2rem] tracking-tight"
                                                style={{ color: 'var(--ink)' }}>
                                                {(analisis.kpis.ratio_captura * 100).toFixed(1)}%
                                            </span>
                                            <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                                de facturas DIAN procesadas
                                            </span>
                                        </div>
                                        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--rule-soft)' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${analisis.kpis.ratio_captura * 100}%`,
                                                background: analisis.kpis.ratio_captura >= 0.9 ? 'var(--positive)'
                                                    : analisis.kpis.ratio_captura >= 0.6 ? 'var(--gold)' : 'var(--negative)',
                                            }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="kicker mb-2">Ratio descontable / generado</div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-display text-[2rem] tracking-tight"
                                                style={{ color: 'var(--ink)' }}>
                                                {(analisis.kpis.ratio_descontable_generado * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                                            Comercio ≈ 60-85% · Servicios ≈ 20-50%
                                        </div>
                                    </div>
                                    {analisis.kpis.iva_no_capturado > 0 && (
                                        <div className="pt-3" style={{ borderTop: '1px dashed var(--rule)' }}>
                                            <div className="kicker mb-1">Saldo si capturaras todo</div>
                                            <div className="font-mono text-[15px]" style={{ color: 'var(--ink)' }}>
                                                {fmt(Math.abs(analisis.kpis.saldo_si_capturara_todo))}
                                                <span className="text-[11px] ml-2" style={{ color: 'var(--ink-faint)' }}>
                                                    {analisis.kpis.saldo_si_capturara_todo < 0 ? 'a favor' : 'a pagar'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="surface p-5 lg:col-span-2">
                                    <div className="kicker-accent mb-3">
                                        Tendencia {analisis.periodicidad} — {analisis.anio}
                                    </div>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart data={analisis.tendencia.map((t) => ({
                                            etiqueta: t.etiqueta,
                                            'IVA generado': t.iva_generado,
                                            'IVA descontable': t.iva_descontable,
                                            saldo: t.saldo,
                                        }))} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
                                            <XAxis dataKey="etiqueta" fontSize={11} stroke="var(--ink-faint)" />
                                            <YAxis fontSize={10} stroke="var(--ink-faint)"
                                                tickFormatter={(v: number) => v > 1e6 ? `${(v / 1e6).toFixed(0)}M` : v > 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v}`} />
                                            <Tooltip
                                                formatter={(v: number | undefined) => formatCOP(v ?? 0)}
                                                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--rule)', fontSize: 12 }}
                                            />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                            <ReferenceLine y={0} stroke="var(--rule)" />
                                            <Bar dataKey="IVA generado" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="IVA descontable" fill="var(--positive)" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Recomendaciones */}
                            {analisis.recomendaciones.length > 0 && (
                                <div className="space-y-3">
                                    <div className="kicker-accent">Decisiones sugeridas</div>
                                    {analisis.recomendaciones.map((r, idx) => {
                                        const meta = SEVERIDAD_META[r.severidad];
                                        return (
                                            <div key={idx} className="surface p-5"
                                                style={{ borderLeft: `3px solid ${meta.color}` }}>
                                                <div className="flex items-start gap-3">
                                                    <div className="text-[18px] pt-0.5" style={{ color: meta.color }}>
                                                        {meta.icon}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="font-display text-[1rem] tracking-tight mb-1">
                                                            {r.titulo}
                                                        </div>
                                                        <p className="text-[12.5px] leading-relaxed"
                                                            style={{ color: 'var(--ink-soft)' }}>
                                                            {r.mensaje}
                                                        </p>
                                                    </div>
                                                    {r.impacto_estimado_cop > 0 && (
                                                        <div className="text-right shrink-0">
                                                            <div className="kicker mb-0.5">Impacto</div>
                                                            <div className="font-mono text-[13px]"
                                                                style={{ color: meta.color }}>
                                                                {fmt(r.impacto_estimado_cop)}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Top proveedores + Facturas huerfanas */}
                            <div className="grid lg:grid-cols-2 gap-4">
                                <div className="surface p-6 overflow-x-auto">
                                    <div className="kicker-accent mb-3">Top 10 proveedores por IVA</div>
                                    {analisis.top_proveedores.length === 0 ? (
                                        <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                                            No hay proveedores registrados en DIAN para este período.
                                        </p>
                                    ) : (
                                        <table className="w-full text-[12px]">
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                                                    <th className="text-left p-2 kicker">Proveedor</th>
                                                    <th className="text-right p-2 kicker">Docs</th>
                                                    <th className="text-right p-2 kicker">IVA total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {analisis.top_proveedores.map((p, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                                                        <td className="p-2">
                                                            <div className="text-[12px]" style={{ color: 'var(--ink)' }}>
                                                                {p.nombre || '—'}
                                                            </div>
                                                            <div className="font-mono text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                                                                NIT {p.nit}
                                                            </div>
                                                        </td>
                                                        <td className="p-2 text-right font-mono">{p.num_docs}</td>
                                                        <td className="p-2 text-right font-mono">{fmt(p.iva_total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                <div className="surface p-6 overflow-x-auto">
                                    <div className="flex items-baseline justify-between mb-3">
                                        <div className="kicker-accent">Facturas DIAN sin capturar</div>
                                        {analisis.kpis.num_no_capturadas > 20 && (
                                            <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                                Top 20 de {analisis.kpis.num_no_capturadas}
                                            </span>
                                        )}
                                    </div>
                                    {analisis.facturas_no_capturadas.length === 0 ? (
                                        <p className="text-[12px]" style={{ color: 'var(--positive)' }}>
                                            ✓ Todas las facturas de DIAN están procesadas en la app.
                                        </p>
                                    ) : (
                                        <table className="w-full text-[12px]">
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                                                    <th className="text-left p-2 kicker">Proveedor</th>
                                                    <th className="text-left p-2 kicker">Documento</th>
                                                    <th className="text-right p-2 kicker">IVA</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {analisis.facturas_no_capturadas.map((f) => (
                                                    <tr key={f.documento_dian_id} style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                                                        <td className="p-2">
                                                            <div className="text-[12px]" style={{ color: 'var(--ink)' }}>
                                                                {f.nombre_emisor || '—'}
                                                            </div>
                                                            <div className="font-mono text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                                                                NIT {f.nit_emisor || '—'}
                                                            </div>
                                                        </td>
                                                        <td className="p-2 font-mono">
                                                            <div>{f.prefijo && f.folio ? `${f.prefijo}-${f.folio}` : '—'}</div>
                                                            <div className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                                                                {f.fecha_emision || ''}
                                                            </div>
                                                        </td>
                                                        <td className="p-2 text-right font-mono"
                                                            style={{ color: 'var(--gold)' }}>
                                                            {fmt(f.iva)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* Nota explicativa de fuentes */}
                            <div className="surface p-5" style={{ background: 'var(--surface-soft)' }}>
                                <div className="kicker mb-2">Fuentes de datos</div>
                                <div className="text-[11.5px] leading-relaxed space-y-1" style={{ color: 'var(--ink-soft)' }}>
                                    <div>
                                        <strong>IVA generado (ventas)</strong> se toma exclusivamente del histórico DIAN
                                        (documentos con NIT emisor = NIT de tu empresa). La app no captura ventas emitidas.
                                    </div>
                                    <div>
                                        <strong>IVA descontable (compras)</strong> se toma de las facturas procesadas en la app —
                                        es la fuente autoritativa para la declaración (Formulario 300).
                                    </div>
                                    <div>
                                        <strong>IVA sin capturar</strong> = facturas de compra registradas en DIAN electrónica
                                        que no tienen equivalente en la app (posible dinero por recuperar).
                                    </div>
                                    <div className="pt-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                        UVT {analisis.anio}: {formatCOP(analisis.kpis.uvt_anio)}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {!analisis && !anaLoading && (
                        <div className="surface p-6 text-center">
                            <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                                Selecciona año y período, luego recalcula. Necesitas tener documentos DIAN sincronizados o cargar el fixture de prueba.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
