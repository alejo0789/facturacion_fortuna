import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Contrato, Oficina } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function PendientesPorLlegarPage() {
    const [contratos, setContratos] = useState<Contrato[]>([]);
    const [loading, setLoading] = useState(true);

    // Filtering states
    const [search, setSearch] = useState('');
    const [oficinaSearch, setOficinaSearch] = useState('');
    const [selectedOficina, setSelectedOficina] = useState<Oficina | null>(null);
    const [allOficinas, setAllOficinas] = useState<Oficina[]>([]);
    const [filteredOficinas, setFilteredOficinas] = useState<Oficina[]>([]);
    const [showOficinaSuggestions, setShowOficinaSuggestions] = useState(false);

    const navigate = useNavigate();

    const fetchPendientes = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/facturas/stats/contratos-pendientes`);
            if (res.ok) {
                setContratos(await res.json());
            }
        } catch (error) {
            console.error("Failed to fetch pending contracts", error);
        } finally {
            setLoading(false);
        }
    };

    const loadOficinas = async () => {
        try {
            const res = await fetch(`${API_URL}/oficinas/?limit=1000`);
            if (res.ok) {
                setAllOficinas(await res.json());
            }
        } catch (error) {
            console.error("Failed to load oficinas", error);
        }
    };

    useEffect(() => {
        fetchPendientes();
        loadOficinas();
    }, []);

    // Filter oficinas as user types
    useEffect(() => {
        if (oficinaSearch.trim() === '') {
            setFilteredOficinas([]);
            return;
        }
        const term = oficinaSearch.toLowerCase();
        const filtered = allOficinas.filter((o: Oficina) =>
            o.nombre?.toLowerCase().includes(term) ||
            o.cod_oficina?.toLowerCase().includes(term) ||
            o.ciudad?.toLowerCase().includes(term)
        ).slice(0, 8);
        setFilteredOficinas(filtered);
    }, [oficinaSearch, allOficinas]);

    // Local filtering of contracts
    const filteredContratos = contratos.filter((c: Contrato) => {
        // Search by provider or contract num
        const matchesSearch = search === '' ||
            c.proveedor?.nombre.toLowerCase().includes(search.toLowerCase()) ||
            c.proveedor?.nit.toLowerCase().includes(search.toLowerCase()) ||
            c.num_contrato?.toLowerCase().includes(search.toLowerCase());

        // Filter by office
        const matchesOficina = !selectedOficina || c.oficina_id === selectedOficina.id;

        return matchesSearch && matchesOficina;
    });

    const formatCurrency = (value: number | string | undefined) => {
        if (value === undefined || value === null) return '-';
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(Number(value));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/facturas')}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Facturas Pendientes por Llegar</h1>
                    <p className="text-gray-500 mt-1">Contratos activos sin factura registrada este mes</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                {/* Provider Search */}
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Buscar por proveedor o NIT..."
                        className="w-full px-4 py-2.5 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <svg className="absolute left-3 top-3 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                {/* Office Filter */}
                <div className="relative flex-1">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Filtrar por oficina..."
                            className="w-full px-4 py-2.5 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none"
                            value={selectedOficina ? `${selectedOficina.nombre} (${selectedOficina.cod_oficina})` : oficinaSearch}
                            onChange={(e) => {
                                setOficinaSearch(e.target.value);
                                if (selectedOficina) setSelectedOficina(null);
                                setShowOficinaSuggestions(true);
                            }}
                            onFocus={() => setShowOficinaSuggestions(true)}
                        />
                        <svg className="absolute left-3 top-3 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {selectedOficina && (
                            <button
                                onClick={() => {
                                    setSelectedOficina(null);
                                    setOficinaSearch('');
                                }}
                                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {showOficinaSuggestions && filteredOficinas.length > 0 && !selectedOficina && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                            {filteredOficinas.map((o: Oficina) => (
                                <button
                                    key={o.id}
                                    onClick={() => {
                                        setSelectedOficina(o);
                                        setShowOficinaSuggestions(false);
                                    }}
                                    className="w-full px-4 py-2 text-left hover:bg-red-50 transition-colors border-b border-gray-50 last:border-0"
                                >
                                    <div className="font-medium text-sm text-gray-900">{o.nombre}</div>
                                    <div className="text-xs text-gray-500">{o.cod_oficina} - {o.ciudad}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="text-sm text-gray-500 flex items-center px-2">
                    <span className="font-semibold text-red-600 mr-1">{filteredContratos.length}</span> resultados
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-4 font-semibold text-gray-700">Proveedor</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Oficina</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Contrato #</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Valor Mensual</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
                                        <span className="text-gray-500">Cargando contratos...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredContratos.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center text-gray-500 italic">
                                    No se encontraron contratos con los filtros aplicados.
                                </td>
                            </tr>
                        ) : (
                            filteredContratos.map((c: Contrato) => (
                                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{c.proveedor?.nombre}</div>
                                        <div className="text-xs text-gray-500">{c.proveedor?.nit}</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-700">
                                        {c.oficina?.nombre}
                                        <span className="text-xs text-gray-500 ml-1">({c.oficina?.cod_oficina})</span>
                                        <div className="text-xs text-gray-500">{c.oficina?.ciudad}</div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-sm text-gray-600">
                                        {c.num_contrato || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-emerald-600 font-semibold">
                                        {formatCurrency(c.valor_mensual)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                            {c.estado}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
