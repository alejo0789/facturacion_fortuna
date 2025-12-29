import { useState, useEffect, useRef, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface Proveedor {
    id: number;
    nit: string;
    nombre: string;
}

interface Oficina {
    id: number;
    cod_oficina?: string;
    nombre?: string;
    ciudad?: string;
}

interface MonthOption {
    value: number;
    label: string;
}

interface Filtros {
    proveedores: Proveedor[];
    oficinas: Oficina[];
    años: number[];
    meses: MonthOption[];
    tipos: string[];
    estados: string[];
    ciudades: string[];
}

interface MonthData {
    year: number;
    month: number;
    name: string;
}

interface ReportRow {
    nit_proveedor: string;
    nombre_proveedor: string;
    cod_oficina: string;
    nombre_oficina: string;
    direccion: string;
    ciudad: string;
    tipo: string;
    num_contrato: string;
    tipo_plan: string;
    tipo_canal: string;
    valor_mensual: number;
    pagos: Record<string, { valor: number; fecha: string | null }>;
}

interface PreviewResponse {
    total_registros: number;
    meses: MonthData[];
    data: ReportRow[];
}

interface Estadisticas {
    año: number;
    resumen: {
        total_facturado: number;
        total_facturas: number;
        proveedores_facturados: number;
        contratos_activos: number;
    };
    facturacion_mensual: { mes: number; nombre: string; valor: number }[];
    top_proveedores: { id: number; nombre: string; total: number }[];
    facturacion_por_tipo: { tipo: string; total: number }[];
}

// Searchable Select Component
function SearchableSelect<T extends { id: number }>({
    items,
    value,
    onChange,
    getLabel,
    getSearchText,
    placeholder,
}: {
    items: T[];
    value: number | null;
    onChange: (id: number | null) => void;
    getLabel: (item: T) => string;
    getSearchText: (item: T) => string;
    placeholder: string;
}) {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedItem = items.find(item => item.id === value);

    const filteredItems = useMemo(() => {
        if (!search) return items.slice(0, 50);
        const searchLower = search.toLowerCase();
        return items.filter(item =>
            getSearchText(item).toLowerCase().includes(searchLower)
        ).slice(0, 50);
    }, [items, search, getSearchText]);

    useEffect(() => {
        if (selectedItem && !isOpen) {
            setSearch(getLabel(selectedItem));
        } else if (!selectedItem && !isOpen) {
            setSearch('');
        }
    }, [selectedItem, isOpen, getLabel]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                if (selectedItem) {
                    setSearch(getLabel(selectedItem));
                } else {
                    setSearch('');
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedItem, getLabel]);

    const handleSelect = (item: T) => {
        onChange(item.id);
        setSearch(getLabel(item));
        setIsOpen(false);
    };

    const handleClear = () => {
        onChange(null);
        setSearch('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen && e.key === 'ArrowDown') {
            setIsOpen(true);
            return;
        }
        if (isOpen) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setHighlightedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setHighlightedIndex(prev => Math.max(prev - 1, 0));
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (filteredItems[highlightedIndex]) {
                        handleSelect(filteredItems[highlightedIndex]);
                    }
                    break;
                case 'Escape':
                    setIsOpen(false);
                    break;
            }
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <input
                    type="text"
                    className="w-full px-3 py-2 pr-8 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder={placeholder}
                    value={search}
                    onChange={e => {
                        setSearch(e.target.value);
                        setIsOpen(true);
                        setHighlightedIndex(0);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        setSearch('');
                    }}
                    onKeyDown={handleKeyDown}
                />
                {value && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
            {isOpen && filteredItems.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredItems.map((item, index) => (
                        <div
                            key={item.id}
                            className={`px-3 py-2 cursor-pointer text-sm ${index === highlightedIndex
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-700 hover:bg-gray-100'
                                } ${item.id === value ? 'font-semibold' : ''}`}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                        >
                            {getLabel(item)}
                        </div>
                    ))}
                </div>
            )}
            {isOpen && filteredItems.length === 0 && search && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-400">
                    No se encontraron resultados
                </div>
            )}
        </div>
    );
}

// Monthly Bar Chart with values in pesos
function MonthlyBarChart({
    data,
    title,
    oficinas,
    proveedores,
    selectedOficina,
    selectedProveedor,
    onOficinaChange,
    onProveedorChange
}: {
    data: { mes: number; nombre: string; valor: number }[];
    title: string;
    oficinas: Oficina[];
    proveedores: Proveedor[];
    selectedOficina: number | null;
    selectedProveedor: number | null;
    onOficinaChange: (id: number | null) => void;
    onProveedorChange: (id: number | null) => void;
}) {
    const [oficinaSearch, setOficinaSearch] = useState('');
    const [proveedorSearch, setProveedorSearch] = useState('');
    const [showOficinaDropdown, setShowOficinaDropdown] = useState(false);
    const [showProveedorDropdown, setShowProveedorDropdown] = useState(false);

    const maxValue = Math.max(...data.map(d => d.valor), 1);
    const currentMonth = new Date().getMonth(); // 0-indexed
    const total = data.reduce((sum, d) => sum + d.valor, 0);

    const formatPesos = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    };

    // Filter oficinas
    const filteredOficinas = oficinas.filter(o => {
        const search = oficinaSearch.toLowerCase();
        return (o.nombre || '').toLowerCase().includes(search) ||
            (o.cod_oficina || '').toLowerCase().includes(search) ||
            (o.ciudad || '').toLowerCase().includes(search);
    }).slice(0, 10);

    // Filter proveedores
    const filteredProveedores = proveedores.filter(p => {
        const search = proveedorSearch.toLowerCase();
        return p.nombre.toLowerCase().includes(search) ||
            p.nit.toLowerCase().includes(search);
    }).slice(0, 10);

    // Get selected names for display
    const selectedOficinaName = selectedOficina
        ? oficinas.find(o => o.id === selectedOficina)?.nombre || 'Oficina seleccionada'
        : '';
    const selectedProveedorName = selectedProveedor
        ? proveedores.find(p => p.id === selectedProveedor)?.nombre || 'Proveedor seleccionado'
        : '';

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                        <p className="text-2xl font-bold text-blue-600 mt-1">{formatPesos(total)}</p>
                        <p className="text-xs text-gray-500">Total del año</p>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Proveedor Filter */}
                    <div className="relative">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Filtrar por proveedor</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Buscar proveedor..."
                            value={selectedProveedor ? selectedProveedorName : proveedorSearch}
                            onChange={e => {
                                setProveedorSearch(e.target.value);
                                if (selectedProveedor) onProveedorChange(null);
                            }}
                            onFocus={() => setShowProveedorDropdown(true)}
                            onBlur={() => setTimeout(() => setShowProveedorDropdown(false), 200)}
                        />
                        {selectedProveedor && (
                            <button
                                className="absolute right-2 top-7 text-gray-400 hover:text-gray-600"
                                onClick={() => { onProveedorChange(null); setProveedorSearch(''); }}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                        {showProveedorDropdown && !selectedProveedor && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                <button
                                    className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                                    onClick={() => { onProveedorChange(null); setShowProveedorDropdown(false); setProveedorSearch(''); }}
                                >
                                    Todos los proveedores
                                </button>
                                {filteredProveedores.map(p => (
                                    <button
                                        key={p.id}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                                        onClick={() => { onProveedorChange(p.id); setShowProveedorDropdown(false); setProveedorSearch(''); }}
                                    >
                                        <span className="font-medium">{p.nombre}</span>
                                        <span className="text-gray-500 ml-2">({p.nit})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Oficina Filter */}
                    <div className="relative">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Filtrar por oficina</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Buscar oficina..."
                            value={selectedOficina ? selectedOficinaName : oficinaSearch}
                            onChange={e => {
                                setOficinaSearch(e.target.value);
                                if (selectedOficina) onOficinaChange(null);
                            }}
                            onFocus={() => setShowOficinaDropdown(true)}
                            onBlur={() => setTimeout(() => setShowOficinaDropdown(false), 200)}
                        />
                        {selectedOficina && (
                            <button
                                className="absolute right-2 top-7 text-gray-400 hover:text-gray-600"
                                onClick={() => { onOficinaChange(null); setOficinaSearch(''); }}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                        {showOficinaDropdown && !selectedOficina && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                <button
                                    className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                                    onClick={() => { onOficinaChange(null); setShowOficinaDropdown(false); setOficinaSearch(''); }}
                                >
                                    Todas las oficinas
                                </button>
                                {filteredOficinas.map(o => (
                                    <button
                                        key={o.id}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                                        onClick={() => { onOficinaChange(o.id); setShowOficinaDropdown(false); setOficinaSearch(''); }}
                                    >
                                        <span className="font-medium">{o.cod_oficina}</span>
                                        <span className="text-gray-700 ml-2">{o.nombre}</span>
                                        {o.ciudad && <span className="text-gray-500 ml-1">- {o.ciudad}</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {data.map((item, idx) => {
                    const width = maxValue > 0 ? (item.valor / maxValue) * 100 : 0;
                    const isCurrentMonth = idx === currentMonth;
                    return (
                        <div key={idx} className="group">
                            <div className="flex justify-between text-sm mb-1">
                                <span className={`font-medium ${isCurrentMonth ? 'text-blue-600' : 'text-gray-700'}`}>
                                    {item.nombre}
                                    {isCurrentMonth && <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Actual</span>}
                                </span>
                                <span className="font-semibold text-gray-900">
                                    {formatPesos(item.valor)}
                                </span>
                            </div>
                            <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                                <div
                                    className={`h-full rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-2 ${isCurrentMonth
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                                        : 'bg-gradient-to-r from-gray-300 to-gray-400 group-hover:from-blue-400 group-hover:to-blue-500'
                                        }`}
                                    style={{
                                        width: `${Math.max(width, item.valor > 0 ? 5 : 0)}%`,
                                    }}
                                >
                                    {width > 15 && (
                                        <span className="text-white text-xs font-medium">
                                            {((item.valor / total) * 100).toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function ReportesPage() {
    const [filtros, setFiltros] = useState<Filtros | null>(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [stats, setStats] = useState<Estadisticas | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);
    const [chartOficina, setChartOficina] = useState<number | null>(null);
    const [chartProveedor, setChartProveedor] = useState<number | null>(null);

    // Filter values
    const [proveedorId, setProveedorId] = useState<number | null>(null);
    const [oficinaId, setOficinaId] = useState<number | null>(null);
    const [año, setAño] = useState<string>('');
    const [mes, setMes] = useState<string>('');
    const [fechaDesde, setFechaDesde] = useState<string>('');
    const [fechaHasta, setFechaHasta] = useState<string>('');
    const [filterType, setFilterType] = useState<'año' | 'rango'>('año');

    // Advanced filters
    const [tipo, setTipo] = useState<string>('');
    const [estado, setEstado] = useState<string>('');
    const [ciudad, setCiudad] = useState<string>('');

    // Load filters and stats on mount
    useEffect(() => {
        fetch(`${API_URL}/reportes/filtros`)
            .then(r => r.json())
            .then(data => {
                setFiltros(data);
                if (data.años?.length > 0) {
                    setAño(data.años[0].toString());
                }
            })
            .catch(err => console.error('Error loading filters:', err));

        fetch(`${API_URL}/reportes/estadisticas`)
            .then(r => r.json())
            .then(data => setStats(data))
            .catch(err => console.error('Error loading stats:', err))
            .finally(() => setLoadingStats(false));
    }, []);

    // Reload stats when year or chart filter changes
    useEffect(() => {
        if (año) {
            setLoadingStats(true);
            let url = `${API_URL}/reportes/estadisticas?año=${año}`;
            if (chartOficina) {
                url += `&oficina_id=${chartOficina}`;
            }
            if (chartProveedor) {
                url += `&proveedor_id=${chartProveedor}`;
            }
            fetch(url)
                .then(r => r.json())
                .then(data => setStats(data))
                .catch(err => console.error('Error loading stats:', err))
                .finally(() => setLoadingStats(false));
        }
    }, [año, chartOficina, chartProveedor]);

    const buildQueryParams = () => {
        const params = new URLSearchParams();
        if (proveedorId) params.append('proveedor_id', proveedorId.toString());
        if (oficinaId) params.append('oficina_id', oficinaId.toString());

        if (filterType === 'año') {
            if (año) params.append('año', año);
            if (mes) params.append('mes', mes);
        } else if (filterType === 'rango') {
            if (fechaDesde) params.append('fecha_desde', fechaDesde);
            if (fechaHasta) params.append('fecha_hasta', fechaHasta);
        }

        if (tipo) params.append('tipo', tipo);
        if (estado) params.append('estado', estado);
        if (ciudad) params.append('ciudad', ciudad);

        return params;
    };

    const handlePreview = async () => {
        setLoading(true);
        try {
            const params = buildQueryParams();
            const res = await fetch(`${API_URL}/reportes/preview?${params}`);
            const data = await res.json();
            setPreview(data);
        } catch (error) {
            console.error('Error previewing report:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const params = buildQueryParams();
            const res = await fetch(`${API_URL}/reportes/export?${params}`);

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `reporte_contratos_${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                const error = await res.json();
                alert(error.error || 'Error al exportar');
            }
        } catch (error) {
            console.error('Error exporting report:', error);
            alert('Error al exportar el reporte');
        } finally {
            setExporting(false);
        }
    };

    const clearAllFilters = () => {
        setProveedorId(null);
        setOficinaId(null);
        setMes('');
        setTipo('');
        setEstado('');
        setCiudad('');
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(value);
    };

    const activeFiltersCount = [proveedorId, oficinaId, tipo, estado, ciudad, mes].filter(Boolean).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">📊 Reportes</h1>
                    <p className="text-gray-500 mt-1">Genera y exporta reportes de contratos</p>
                </div>
                {activeFiltersCount > 0 && (
                    <button
                        onClick={clearAllFilters}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Limpiar filtros ({activeFiltersCount})
                    </button>
                )}
            </div>

            {/* Filter Card - FIRST */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span>🔍</span> Filtros del Reporte
                </h2>

                {/* Main Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                        {filtros && (
                            <SearchableSelect
                                items={filtros.proveedores}
                                value={proveedorId}
                                onChange={setProveedorId}
                                getLabel={p => `${p.nombre} (${p.nit})`}
                                getSearchText={p => `${p.nombre} ${p.nit}`}
                                placeholder="Buscar proveedor..."
                            />
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Oficina</label>
                        {filtros && (
                            <SearchableSelect
                                items={filtros.oficinas}
                                value={oficinaId}
                                onChange={setOficinaId}
                                getLabel={o => `${o.cod_oficina || ''} - ${o.nombre || ''}`}
                                getSearchText={o => `${o.cod_oficina || ''} ${o.nombre || ''} ${o.ciudad || ''}`}
                                placeholder="Buscar oficina..."
                            />
                        )}
                    </div>

                    <div className="lg:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                        <div className="flex gap-2">
                            <button
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${filterType === 'año' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                onClick={() => setFilterType('año')}
                            >
                                Año/Mes
                            </button>
                            <button
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${filterType === 'rango' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                onClick={() => setFilterType('rango')}
                            >
                                Rango de Fechas
                            </button>
                        </div>
                    </div>
                </div>

                {/* Date Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                    {filterType === 'año' ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                                <select className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" value={año} onChange={e => setAño(e.target.value)}>
                                    {filtros?.años.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
                                <select className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" value={mes} onChange={e => setMes(e.target.value)}>
                                    <option value="">Todos los meses</option>
                                    {filtros?.meses.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                                <input type="date" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                                <input type="date" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                            </div>
                        </>
                    )}
                </div>

                {/* Advanced Filters */}
                <div className="mt-4 border-t pt-4">
                    <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800">
                        <svg className={`w-4 h-4 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <span className="font-medium">Filtros Avanzados</span>
                    </button>

                    {showAdvancedFilters && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Contrato</label>
                                <select className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg" value={tipo} onChange={e => setTipo(e.target.value)}>
                                    <option value="">Todos</option>
                                    {filtros?.tipos.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                                <select className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg" value={estado} onChange={e => setEstado(e.target.value)}>
                                    <option value="">Todos</option>
                                    {filtros?.estados.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                                <select className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg" value={ciudad} onChange={e => setCiudad(e.target.value)}>
                                    <option value="">Todas</option>
                                    {filtros?.ciudades.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 mt-6">
                    <button onClick={handlePreview} disabled={loading} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg hover:shadow-xl">
                        {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                        Vista Previa
                    </button>
                    <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all disabled:opacity-50 shadow-lg hover:shadow-xl">
                        {exporting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                        Exportar Excel
                    </button>
                </div>
            </div>

            {/* Monthly Bar Chart - SECOND */}
            {!loadingStats && stats && filtros && (
                <MonthlyBarChart
                    data={stats.facturacion_mensual}
                    title={`📅 Facturación Mensual ${stats.año}`}
                    oficinas={filtros.oficinas}
                    proveedores={filtros.proveedores}
                    selectedOficina={chartOficina}
                    selectedProveedor={chartProveedor}
                    onOficinaChange={setChartOficina}
                    onProveedorChange={setChartProveedor}
                />
            )}

            {/* Preview Results - THIRD */}
            {preview && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-semibold">Vista Previa del Reporte</h3>
                                <p className="text-blue-100 text-sm">Mostrando primeros 50 de {preview.total_registros} registros</p>
                            </div>
                            <div className="flex gap-4 text-sm">
                                <div className="bg-white/20 rounded-lg px-3 py-1"><span className="font-semibold">{preview.total_registros}</span> contratos</div>
                                <div className="bg-white/20 rounded-lg px-3 py-1"><span className="font-semibold">{preview.meses.length}</span> meses</div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                            {preview.meses.map(m => (
                                <span key={`${m.year}-${m.month}`} className="bg-white/20 text-white text-xs px-2 py-1 rounded-full">{m.name}</span>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Proveedor</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Oficina</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Ciudad</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Contrato</th>
                                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Valor Mensual</th>
                                    {preview.meses.map(m => (
                                        <th key={`${m.year}-${m.month}`} className="px-4 py-3 text-right font-semibold text-gray-700 bg-green-50">
                                            {m.name.split(' ')[0].substring(0, 3)} {m.year.toString().slice(-2)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {preview.data.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{row.nombre_proveedor}</div>
                                            <div className="text-xs text-gray-500">{row.nit_proveedor}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-800">{row.nombre_oficina}</div>
                                            <div className="text-xs text-gray-500">{row.cod_oficina}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{row.ciudad}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.tipo === 'Fijo' ? 'bg-blue-100 text-blue-800' : row.tipo === 'Movil' ? 'bg-purple-100 text-purple-800' : row.tipo === 'Colaboracion' ? 'bg-yellow-100 text-yellow-800' : row.tipo === 'Leasing' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>
                                                {row.tipo || '-'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-gray-700">{row.num_contrato}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(row.valor_mensual)}</td>
                                        {preview.meses.map(m => {
                                            const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
                                            const pago = row.pagos[key];
                                            return (
                                                <td key={`${m.year}-${m.month}`} className={`px-4 py-3 text-right ${pago?.valor ? 'bg-green-50' : ''}`}>
                                                    {pago?.valor ? <span className="font-semibold text-green-700">{formatCurrency(pago.valor)}</span> : <span className="text-gray-300">-</span>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {preview.total_registros > 50 && (
                        <div className="bg-yellow-50 border-t border-yellow-100 px-4 py-3 text-center text-sm text-yellow-700">
                            ⚠️ Vista previa limitada a 50 registros. Exporta a Excel para ver los {preview.total_registros} registros completos.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
