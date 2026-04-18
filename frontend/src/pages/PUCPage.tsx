/**
 * Plan Único de Cuentas (PUC) — árbol jerárquico de la empresa activa.
 *
 * Consume GET /api/contabilidad/puc y construye el árbol en cliente
 * usando padre_codigo. Soporta búsqueda por código o nombre y filtro
 * por cuentas que permiten movimiento.
 */
import { useEffect, useMemo, useState } from 'react';
import { apiGet, ApiError } from '../utils/apiClient';
import type { CuentaPUC, NivelCuenta } from '../types/contabilidad';

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
        </div>
    );
}
