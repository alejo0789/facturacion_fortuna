/**
 * Plan Único de Cuentas (PUC) — árbol jerárquico de la empresa activa.
 *
 * Consume GET /api/contabilidad/puc y construye el árbol en cliente
 * usando padre_codigo. Soporta búsqueda por código o nombre y filtro
 * por cuentas que permiten movimiento.
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

const NIVEL_COLOR: Record<NivelCuenta, string> = {
    CLASE: 'bg-indigo-100 text-indigo-700',
    GRUPO: 'bg-blue-100 text-blue-700',
    CUENTA: 'bg-emerald-100 text-emerald-700',
    SUBCUENTA: 'bg-amber-100 text-amber-700',
    AUXILIAR: 'bg-slate-100 text-slate-700',
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
                className="flex items-center gap-2 py-2 px-2 hover:bg-slate-50 rounded-md border-b border-slate-100"
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
            >
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className={`w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 ${
                        hasChildren ? '' : 'invisible'
                    }`}
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
                <span className="font-mono text-sm font-semibold text-slate-700 min-w-[80px]">
                    {node.codigo}
                </span>
                <span className="flex-1 text-sm text-slate-800 truncate">{node.nombre}</span>
                <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${NIVEL_COLOR[node.nivel]}`}
                >
                    {NIVEL_LABEL[node.nivel]}
                </span>
                <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                        node.naturaleza === 'DEBITO'
                            ? 'bg-sky-50 text-sky-700'
                            : 'bg-rose-50 text-rose-700'
                    }`}
                >
                    {node.naturaleza}
                </span>
                {node.permite_movimiento ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        MOV
                    </span>
                ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                        —
                    </span>
                )}
                {node.requiere_tercero && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                        NIT
                    </span>
                )}
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
            // cerrar el modal después de 800ms para que el usuario vea el feedback
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

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Plan Único de Cuentas</h1>
                <p className="text-gray-500 mt-1">
                    Árbol del PUC de la empresa activa según Decreto 2649.
                </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center gap-3">
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Buscar por código o nombre..."
                        className="w-full px-4 py-2.5 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <svg
                        className="absolute left-3 top-3 h-5 w-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={soloMovimiento}
                        onChange={(e) => setSoloMovimiento(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                    />
                    Sólo cuentas de movimiento
                </label>
                <button
                    onClick={() => setExpandAll((v) => !v)}
                    className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                >
                    {expandAll ? 'Colapsar todo' : 'Expandir todo'}
                </button>
                <button
                    onClick={cargar}
                    className="px-4 py-2 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
                >
                    Recargar
                </button>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium"
                >
                    + Añadir cuenta
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="text-xs text-gray-500">Total cuentas</div>
                    <div className="text-2xl font-bold text-slate-800">{totalCuentas}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="text-xs text-gray-500">Permiten movimiento</div>
                    <div className="text-2xl font-bold text-emerald-600">{totalMovimiento}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="text-xs text-gray-500">Clases raíz</div>
                    <div className="text-2xl font-bold text-indigo-600">{arbol.length}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="text-xs text-gray-500">Filtrados</div>
                    <div className="text-2xl font-bold text-slate-800">
                        {arbolFiltrado.reduce(function count(sum, n): number {
                            return sum + 1 + n.hijos.reduce(count, 0);
                        }, 0)}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center">
                        <div className="inline-block animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
                        <div className="mt-2 text-gray-500">Cargando PUC...</div>
                    </div>
                ) : error ? (
                    <div className="p-10 text-center text-rose-600">{error}</div>
                ) : arbolFiltrado.length === 0 ? (
                    <div className="p-10 text-center text-gray-500 italic">
                        No hay cuentas que coincidan con los filtros.
                    </div>
                ) : (
                    <div className="py-2">
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

            {/* ========================================================== */}
            {/* Modal: añadir cuenta desde el catálogo Decreto 2650        */}
            {/* ========================================================== */}
            {showAddModal && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
                    onClick={() => !adding && setShowAddModal(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">
                                    Añadir cuenta desde el catálogo
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Catálogo oficial Decreto 2650 (Colombia). Buscá por código o
                                    nombre y elegí la cuenta a sumar a tu PUC. Los padres faltantes
                                    se siembran automáticamente.
                                </p>
                            </div>
                            <button
                                onClick={() => !adding && setShowAddModal(false)}
                                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                                disabled={adding}
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Buscar cuenta
                                </label>
                                <Autocomplete<CuentaCatalogo>
                                    fetcher={fetchCatalogo}
                                    onSelect={setAddingCuenta}
                                    getOptionLabel={(o) => `${o.codigo} — ${o.nombre}`}
                                    placeholder="Ej: 220505 / proveedores / honorarios / banco…"
                                    autoFocus
                                    minChars={1}
                                    renderOption={(opt, hi) => (
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                                                {opt.codigo}
                                            </span>
                                            <span className={hi ? 'font-medium' : ''}>
                                                {opt.nombre}
                                            </span>
                                            <span
                                                className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                                                    opt.naturaleza === 'DEBITO'
                                                        ? 'bg-sky-100 text-sky-700'
                                                        : 'bg-rose-100 text-rose-700'
                                                }`}
                                            >
                                                {opt.naturaleza}
                                            </span>
                                        </div>
                                    )}
                                />
                            </div>

                            {addingCuenta && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
                                        Cuenta seleccionada
                                    </div>
                                    <div className="flex items-baseline gap-3">
                                        <span className="font-mono text-lg font-bold text-slate-900">
                                            {addingCuenta.codigo}
                                        </span>
                                        <span className="text-slate-700">
                                            {addingCuenta.nombre}
                                        </span>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                        <span className="px-2 py-0.5 rounded bg-white border border-emerald-200">
                                            Clase {addingCuenta.clase}
                                        </span>
                                        <span className="px-2 py-0.5 rounded bg-white border border-emerald-200">
                                            Naturaleza {addingCuenta.naturaleza}
                                        </span>
                                        <span className="px-2 py-0.5 rounded bg-white border border-emerald-200">
                                            {addingCuenta.permite_movimiento
                                                ? 'Permite movimiento'
                                                : 'Solo agrupadora'}
                                        </span>
                                    </div>
                                    {addingCuenta.permite_movimiento && (
                                        <label className="flex items-center gap-2 mt-3 text-sm text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={requiereTercero}
                                                onChange={(e) =>
                                                    setRequiereTercero(e.target.checked)
                                                }
                                                className="h-4 w-4"
                                            />
                                            Requiere NIT de tercero al usarse en asientos (típico
                                            de 22xx Proveedores, 13xx Clientes, 23xx CxP, 236x
                                            Retenciones)
                                        </label>
                                    )}
                                </div>
                            )}

                            {addError && (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                                    {addError}
                                </div>
                            )}
                            {addSuccess && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                                    ✓ {addSuccess}
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                                <button
                                    onClick={() => { setShowAddModal(false); setAddError(null); setAddSuccess(null); }}
                                    disabled={adding}
                                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={agregarCuenta}
                                    disabled={!addingCuenta || adding}
                                    className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {adding ? 'Añadiendo...' : 'Añadir al PUC'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
