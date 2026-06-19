/**
 * Plan Único de Cuentas (PUC) — árbol jerárquico de la empresa activa.
 * Estética "Ledger Modern" — refinada con tipografía editorial.
 */
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, ApiError } from '../utils/apiClient';
import type { CuentaPUC, NivelCuenta } from '../types/contabilidad';
import Autocomplete from '../components/Autocomplete';

interface CuentaCatalogo {
    codigo: string;
    nombre: string;
    clase: string;
    nivel: number;
    naturaleza: 'DEBITO' | 'CREDITO';
    permite_movimiento: boolean;
    padre_codigo: string | null;
}

interface CuentaNode extends CuentaPUC {
    hijos: CuentaNode[];
}

const NIVEL_LABEL: Record<NivelCuenta, string> = {
    CLASE: 'Clase',
    GRUPO: 'Grupo',
    CUENTA: 'Cuenta',
    SUBCUENTA: 'Subcuenta',
    AUXILIAR: 'Auxiliar',
};

function buildTree(cuentas: CuentaPUC[]): CuentaNode[] {
    const byCodigo = new Map<string, CuentaNode>();
    cuentas.forEach((c) => byCodigo.set(c.codigo, { ...c, hijos: [] }));

    const roots: CuentaNode[] = [];
    byCodigo.forEach((node) => {
        if (node.padre_codigo && byCodigo.has(node.padre_codigo)) {
            byCodigo.get(node.padre_codigo)!.hijos.push(node);
        } else {
            roots.push(node);
        }
    });

    const sortRec = (nodes: CuentaNode[]) => {
        nodes.sort((a, b) => a.codigo.localeCompare(b.codigo));
        nodes.forEach((n) => sortRec(n.hijos));
    };
    sortRec(roots);
    return roots;
}

function filterTree(nodes: CuentaNode[], term: string, soloMovimiento: boolean): CuentaNode[] {
    const t = term.trim().toLowerCase();
    const result: CuentaNode[] = [];
    for (const node of nodes) {
        const hijosFiltrados = filterTree(node.hijos, term, soloMovimiento);
        const matchesTerm =
            !t || node.codigo.toLowerCase().includes(t) || node.nombre.toLowerCase().includes(t);
        const matchesMov = !soloMovimiento || node.permite_movimiento;
        if ((matchesTerm && matchesMov) || hijosFiltrados.length > 0) {
            result.push({ ...node, hijos: hijosFiltrados });
        }
    }
    return result;
}

interface NodoProps {
    node: CuentaNode;
    depth: number;
    defaultExpanded: boolean;
}

function NodoCuenta({ node, depth, defaultExpanded }: NodoProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const hasChildren = node.hijos.length > 0;

    return (
        <div>
            <div
                className="group flex items-center gap-3 py-2.5 px-3 transition-colors"
                style={{
                    paddingLeft: `${depth * 24 + 12}px`,
                    borderBottom: '1px solid var(--rule-soft)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                        hasChildren ? '' : 'invisible'
                    }`}
                    style={{ color: 'var(--ink-faint)' }}
                    aria-label={expanded ? 'Colapsar' : 'Expandir'}
                >
                    <svg
                        className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
                <span
                    className="font-mono text-[12px] font-semibold min-w-[72px]"
                    style={{ color: depth === 0 ? 'var(--accent)' : 'var(--ink-soft)' }}
                >
                    {node.codigo}
                </span>
                <span
                    className={`flex-1 truncate ${depth === 0 ? 'font-display text-[15px]' : 'text-[13.5px]'}`}
                    style={{
                        color: 'var(--ink)',
                        fontVariationSettings: depth === 0 ? "'SOFT' 30" : undefined,
                    }}
                >
                    {node.nombre}
                </span>
                <span className="tag tag-accent text-[9px] py-[1px] hidden md:inline-flex">
                    {NIVEL_LABEL[node.nivel]}
                </span>
                <span
                    className={`tag text-[9px] py-[1px] ${
                        node.naturaleza === 'DEBITO' ? 'tag-accent' : 'tag-negative'
                    }`}
                >
                    {node.naturaleza}
                </span>
                {node.permite_movimiento ? (
                    <span className="tag tag-positive text-[9px] py-[1px]">MOV</span>
                ) : (
                    <span className="tag text-[9px] py-[1px]" style={{ color: 'var(--ink-mute)' }}>—</span>
                )}
                {node.requiere_tercero && <span className="tag tag-gold text-[9px] py-[1px]">NIT</span>}
            </div>
            {expanded && hasChildren && (
                <div>
                    {node.hijos.map((h) => (
                        <NodoCuenta
                            key={h.codigo}
                            node={h}
                            depth={depth + 1}
                            defaultExpanded={defaultExpanded}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function PUCPage() {
    const [cuentas, setCuentas] = useState<CuentaPUC[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [soloMovimiento, setSoloMovimiento] = useState(false);
    const [expandAll, setExpandAll] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addingCuenta, setAddingCuenta] = useState<CuentaCatalogo | null>(null);
    const [adding, setAdding] = useState(false);
    const [requiereTercero, setRequiereTercero] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [addSuccess, setAddSuccess] = useState<string | null>(null);

    const cargar = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiGet<CuentaPUC[]>('/contabilidad/puc');
            setCuentas(data);
        } catch (e) {
            const msg = e instanceof ApiError ? e.message : 'Error cargando el PUC';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargar();
    }, []);

    const fetchCatalogo = async (q: string): Promise<CuentaCatalogo[]> => {
        try {
            const params: Record<string, string | number> = { limit: 30 };
            if (q) params.q = q;
            return await apiGet<CuentaCatalogo[]>('/contabilidad/puc/catalogo', params);
        } catch (e) {
            console.error('Error catalogo:', e);
            return [];
        }
    };

    const agregarCuenta = async () => {
        if (!addingCuenta) return;
        setAdding(true);
        setAddError(null);
        setAddSuccess(null);
        const codigo = addingCuenta.codigo;
        const nombre = addingCuenta.nombre;
        try {
            await apiPost(`/contabilidad/puc/agregar-desde-catalogo?codigo=${encodeURIComponent(codigo)}&requiere_tercero=${requiereTercero}`);
            setAddSuccess(`Cuenta ${codigo} — ${nombre} añadida al PUC.`);
            setAddingCuenta(null);
            setRequiereTercero(false);
            await cargar();
            setTimeout(() => {
                setShowAddModal(false);
                setAddSuccess(null);
            }, 900);
        } catch (e) {
            setAddError(e instanceof ApiError ? e.message : 'Error agregando cuenta');
        } finally {
            setAdding(false);
        }
    };

    const arbol = useMemo(() => buildTree(cuentas), [cuentas]);
    const arbolFiltrado = useMemo(
        () => filterTree(arbol, search, soloMovimiento),
        [arbol, search, soloMovimiento],
    );

    const totalCuentas = cuentas.length;
    const totalMovimiento = cuentas.filter((c) => c.permite_movimiento).length;
    const filtradas = arbolFiltrado.reduce(function count(sum, n): number {
        return sum + 1 + n.hijos.reduce(count, 0);
    }, 0);

    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            {/* Masthead */}
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Plan Único de Cuentas · Decreto 2650</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Catálogo <em>contable</em>.
                    </h1>
                    <p className="text-[14px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Árbol jerárquico de cuentas de la empresa activa. Añade nuevas cuentas
                        desde el catálogo oficial — los padres se siembran en cascada.
                    </p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="surface p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Buscar por código o nombre…"
                        className="input-field pl-10 text-[14px]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <svg
                        className="absolute left-3 top-3 h-4 w-4"
                        style={{ color: 'var(--ink-faint)' }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <label className="flex items-center gap-2 text-[13px] cursor-pointer select-none whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>
                    <input
                        type="checkbox"
                        checked={soloMovimiento}
                        onChange={(e) => setSoloMovimiento(e.target.checked)}
                        className="h-4 w-4 rounded"
                        style={{ accentColor: 'var(--accent)' }}
                    />
                    Sólo movimiento
                </label>
                <button
                    onClick={() => setExpandAll((v) => !v)}
                    className="btn-secondary text-[13px]"
                >
                    {expandAll ? 'Colapsar' : 'Expandir'}
                </button>
                <button onClick={cargar} className="btn-ghost text-[13px]">
                    Recargar
                </button>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="btn-accent text-[13px]"
                >
                    + Añadir cuenta
                </button>
            </div>

            {/* Stats — editorial KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 anim-stagger">
                {[
                    { label: 'Total cuentas', value: totalCuentas, tone: 'var(--ink)' },
                    { label: 'Permiten mov.', value: totalMovimiento, tone: 'var(--positive)' },
                    { label: 'Clases raíz', value: arbol.length, tone: 'var(--accent)' },
                    { label: 'Resultados filtro', value: filtradas, tone: 'var(--ink-soft)' },
                ].map((k) => (
                    <div key={k.label} className="surface p-5">
                        <div className="kicker mb-2">{k.label}</div>
                        <div className="numeral text-[2.4rem] leading-none" style={{ color: k.tone }}>
                            {k.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Árbol */}
            <div className="surface-raised overflow-hidden">
                <div
                    className="px-6 py-4 flex items-baseline justify-between"
                    style={{ borderBottom: '1px solid var(--rule)', background: 'var(--paper-tinted)' }}
                >
                    <div>
                        <div className="kicker-accent">Árbol</div>
                        <h2 className="font-display text-[1.2rem] tracking-tight mt-1">
                            Jerarquía Decreto 2650
                        </h2>
                    </div>
                </div>
                {loading ? (
                    <div className="p-16 text-center">
                        <div
                            className="h-10 w-10 mx-auto rounded-full border-2 border-t-transparent"
                            style={{
                                borderColor: 'var(--accent)',
                                borderTopColor: 'transparent',
                                animation: 'spin-soft 800ms linear infinite',
                            }}
                        />
                        <div className="kicker mt-4">Cargando catálogo</div>
                    </div>
                ) : error ? (
                    <div className="p-10 text-center" style={{ color: 'var(--negative)' }}>{error}</div>
                ) : arbolFiltrado.length === 0 ? (
                    <div className="p-16 text-center">
                        <div
                            className="font-display text-[3rem]"
                            style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                        >
                            —
                        </div>
                        <div className="kicker mt-2">Sin coincidencias</div>
                    </div>
                ) : (
                    <div>
                        {arbolFiltrado.map((n) => (
                            <NodoCuenta
                                key={`${n.codigo}-${expandAll}`}
                                node={n}
                                depth={0}
                                defaultExpanded={expandAll}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Modal — añadir cuenta */}
            {showAddModal && (
                <div
                    className="fixed inset-0 z-40 flex items-center justify-center p-4 anim-fade-in"
                    style={{ background: 'rgba(11, 15, 25, 0.55)', backdropFilter: 'blur(4px)' }}
                    onClick={() => !adding && setShowAddModal(false)}
                >
                    <div
                        className="surface-raised w-full max-w-2xl p-7 max-h-[90vh] overflow-y-auto anim-fade-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <div className="kicker-accent mb-2">Catálogo Decreto 2650</div>
                                <h2 className="font-display text-[1.6rem] tracking-tight">
                                    Añadir cuenta al PUC
                                </h2>
                                <p className="text-[13px] mt-2" style={{ color: 'var(--ink-faint)' }}>
                                    Catálogo oficial. Busca por código o nombre. Los padres faltantes
                                    se siembran automáticamente.
                                </p>
                            </div>
                            <button
                                onClick={() => !adding && setShowAddModal(false)}
                                className="text-2xl leading-none transition-colors"
                                style={{ color: 'var(--ink-mute)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-mute)')}
                                disabled={adding}
                            >
                                ×
                            </button>
                        </div>

                        <hr className="hr-ledger mb-6" />

                        <div className="space-y-5">
                            <div>
                                <label className="kicker block mb-2">Buscar cuenta</label>
                                <Autocomplete<CuentaCatalogo>
                                    fetcher={fetchCatalogo}
                                    onSelect={setAddingCuenta}
                                    getOptionLabel={(o) => `${o.codigo} — ${o.nombre}`}
                                    placeholder="Ej: 220505 / proveedores / honorarios / banco…"
                                    autoFocus
                                    minChars={1}
                                    renderOption={(opt, hi) => (
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                                                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                                            >
                                                {opt.codigo}
                                            </span>
                                            <span className={hi ? 'font-medium' : ''}>{opt.nombre}</span>
                                            <span className={`ml-auto tag text-[9px] ${opt.naturaleza === 'DEBITO' ? 'tag-accent' : 'tag-negative'}`}>
                                                {opt.naturaleza}
                                            </span>
                                        </div>
                                    )}
                                />
                            </div>

                            {addingCuenta && (
                                <div
                                    className="rounded-lg p-5 space-y-3 anim-fade-up"
                                    style={{
                                        background: 'var(--positive-soft)',
                                        border: '1px solid var(--positive)',
                                    }}
                                >
                                    <div className="kicker-accent" style={{ color: 'var(--positive)' }}>
                                        Cuenta seleccionada
                                    </div>
                                    <div className="flex items-baseline gap-3">
                                        <span className="font-mono text-[1.1rem] font-semibold">
                                            {addingCuenta.codigo}
                                        </span>
                                        <span className="font-display text-[1.1rem]" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                            {addingCuenta.nombre}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="tag">Clase {addingCuenta.clase}</span>
                                        <span className={`tag ${addingCuenta.naturaleza === 'DEBITO' ? 'tag-accent' : 'tag-negative'}`}>
                                            {addingCuenta.naturaleza}
                                        </span>
                                        <span className="tag">
                                            {addingCuenta.permite_movimiento ? 'Permite movimiento' : 'Solo agrupadora'}
                                        </span>
                                    </div>
                                    {addingCuenta.permite_movimiento && (
                                        <label className="flex items-start gap-2 mt-3 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                                            <input
                                                type="checkbox"
                                                checked={requiereTercero}
                                                onChange={(e) => setRequiereTercero(e.target.checked)}
                                                className="h-4 w-4 mt-0.5"
                                                style={{ accentColor: 'var(--accent)' }}
                                            />
                                            <span>
                                                Requiere NIT al usarse en asientos
                                                <span className="block text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                                                    Típico de 22xx Proveedores, 13xx Clientes, 23xx CxP, 236x Retenciones
                                                </span>
                                            </span>
                                        </label>
                                    )}
                                </div>
                            )}

                            {addError && (
                                <div
                                    className="rounded-lg px-4 py-3 text-[13px]"
                                    style={{
                                        background: 'var(--negative-soft)',
                                        border: '1px solid var(--negative)',
                                        color: 'var(--negative)',
                                    }}
                                >
                                    {addError}
                                </div>
                            )}
                            {addSuccess && (
                                <div
                                    className="rounded-lg px-4 py-3 text-[13px]"
                                    style={{
                                        background: 'var(--positive-soft)',
                                        border: '1px solid var(--positive)',
                                        color: 'var(--positive)',
                                    }}
                                >
                                    ✓ {addSuccess}
                                </div>
                            )}

                            <hr className="hr-ledger" />

                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => { setShowAddModal(false); setAddError(null); setAddSuccess(null); }}
                                    disabled={adding}
                                    className="btn-ghost disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={agregarCuenta}
                                    disabled={!addingCuenta || adding}
                                    className="btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {adding ? 'Añadiendo…' : 'Añadir al PUC'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
