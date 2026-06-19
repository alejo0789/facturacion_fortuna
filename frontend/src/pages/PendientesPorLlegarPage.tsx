import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Contrato, Oficina } from '../types';
import { formatCOP } from '../utils/format';

import { apiFetch } from '../utils/apiClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const authFetch = (url: string, options?: RequestInit): Promise<Response> => {
    const endpoint = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
    return apiFetch(endpoint, options as never);
};

export default function PendientesPorLlegarPage() {
    const [contratos, setContratos] = useState<Contrato[]>([]);
    const [loading, setLoading] = useState(true);

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
            const res = await authFetch(`${API_URL}/facturas/stats/contratos-pendientes`);
            if (res.ok) setContratos(await res.json());
        } catch (error) {
            console.error('Failed to fetch pending contracts', error);
        } finally {
            setLoading(false);
        }
    };

    const loadOficinas = async () => {
        try {
            const res = await authFetch(`${API_URL}/oficinas/?limit=1000`);
            if (res.ok) setAllOficinas(await res.json());
        } catch (error) {
            console.error('Failed to load oficinas', error);
        }
    };

    useEffect(() => {
        fetchPendientes();
        loadOficinas();
    }, []);

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

    const filteredContratos = contratos.filter((c: Contrato) => {
        const matchesSearch = search === '' ||
            c.proveedor?.nombre.toLowerCase().includes(search.toLowerCase()) ||
            c.proveedor?.nit.toLowerCase().includes(search.toLowerCase()) ||
            c.num_contrato?.toLowerCase().includes(search.toLowerCase());
        const matchesOficina = !selectedOficina || c.oficina_id === selectedOficina.id;
        return matchesSearch && matchesOficina;
    });

    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <button
                    onClick={() => navigate('/app/facturas')}
                    className="btn-ghost text-[13px] mb-4"
                >
                    ← Volver a facturas
                </button>
                <div className="eyebrow mb-4">Operación · Seguimiento contractual</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Pendientes por <em>llegar</em>.
                    </h1>
                    <p className="text-[13px] max-w-md" style={{ color: 'var(--ink-soft)' }}>
                        Contratos activos sin factura registrada en el mes en curso.
                    </p>
                </div>
            </div>

            <div className="surface p-4 flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Buscar por proveedor o NIT…"
                        className="input-field pl-10"
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

                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Filtrar por oficina…"
                        className="input-field pl-10"
                        value={selectedOficina ? `${selectedOficina.nombre} (${selectedOficina.cod_oficina})` : oficinaSearch}
                        onChange={(e) => {
                            setOficinaSearch(e.target.value);
                            if (selectedOficina) setSelectedOficina(null);
                            setShowOficinaSuggestions(true);
                        }}
                        onFocus={() => setShowOficinaSuggestions(true)}
                    />
                    <svg
                        className="absolute left-3 top-3 h-4 w-4"
                        style={{ color: 'var(--ink-faint)' }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    {selectedOficina && (
                        <button
                            onClick={() => { setSelectedOficina(null); setOficinaSearch(''); }}
                            className="absolute right-3 top-3"
                            style={{ color: 'var(--ink-faint)' }}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                    {showOficinaSuggestions && filteredOficinas.length > 0 && !selectedOficina && (
                        <div className="absolute z-10 w-full mt-1.5 surface-raised max-h-60 overflow-y-auto py-1">
                            {filteredOficinas.map((o: Oficina) => (
                                <button
                                    key={o.id}
                                    onClick={() => { setSelectedOficina(o); setShowOficinaSuggestions(false); }}
                                    className="w-full px-3 py-2 text-left transition-colors"
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-soft)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <div className="text-[13px] font-medium">{o.nombre}</div>
                                    <div className="text-[11px] font-mono" style={{ color: 'var(--ink-faint)' }}>
                                        {o.cod_oficina} · {o.ciudad}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center px-3 kicker whitespace-nowrap">
                    <span className="numeral text-[1.4rem] mr-2" style={{ color: 'var(--negative)' }}>
                        {filteredContratos.length}
                    </span>
                    resultados
                </div>
            </div>

            <div className="surface-raised overflow-hidden">
                <table className="w-full text-left">
                    <thead style={{ background: 'var(--paper-tinted)' }}>
                        <tr>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>Proveedor</th>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>Oficina</th>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>Contrato</th>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>Valor mensual</th>
                            <th className="kicker px-6 py-3" style={{ background: 'var(--paper-tinted)' }}>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center">
                                    <div
                                        className="h-8 w-8 mx-auto rounded-full border-2 border-t-transparent"
                                        style={{
                                            borderColor: 'var(--accent)',
                                            borderTopColor: 'transparent',
                                            animation: 'spin-soft 800ms linear infinite',
                                        }}
                                    />
                                    <div className="kicker mt-3">Cargando contratos</div>
                                </td>
                            </tr>
                        ) : filteredContratos.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-16 text-center">
                                    <div
                                        className="font-display text-[2.5rem]"
                                        style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                    >
                                        —
                                    </div>
                                    <div className="kicker mt-2">Sin contratos con los filtros aplicados</div>
                                </td>
                            </tr>
                        ) : (
                            filteredContratos.map((c: Contrato, idx) => (
                                <tr
                                    key={c.id}
                                    style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                    className="transition-colors"
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <td className="px-6 py-3.5">
                                        <div className="font-display text-[14px]" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                            {c.proveedor?.nombre}
                                        </div>
                                        <div className="text-[11px] font-mono" style={{ color: 'var(--accent)' }}>
                                            {c.proveedor?.nit}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3.5 text-[13px]">
                                        {c.oficina?.nombre}
                                        <span className="text-[11px] font-mono ml-1" style={{ color: 'var(--ink-faint)' }}>
                                            ({c.oficina?.cod_oficina})
                                        </span>
                                        <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                                            {c.oficina?.ciudad}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3.5 font-mono text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                                        {c.num_contrato || '—'}
                                    </td>
                                    <td className="px-6 py-3.5">
                                        <span className="numeral text-[1.1rem]" style={{ color: 'var(--positive)' }}>
                                            {formatCOP(c.valor_mensual)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3.5">
                                        <span className="tag tag-positive">{c.estado}</span>
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
