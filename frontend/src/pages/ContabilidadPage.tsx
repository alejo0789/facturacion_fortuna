import { useState, useEffect, useMemo, useRef } from 'react';
import type { Proveedor, Factura } from '../types';
import DataTable from '../components/DataTable';
import { apiGet, apiPost } from '../utils/apiClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function ContabilidadPage() {
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Modal Historial Facturas
    const [facturasModalOpen, setFacturasModalOpen] = useState(false);
    const [selectedProveedorId, setSelectedProveedorId] = useState<number | null>(null);
    const [proveedorFacturas, setProveedorFacturas] = useState<Factura[]>([]);
    const [loadingFacturas, setLoadingFacturas] = useState(false);
    const [facturasSearch, setFacturasSearch] = useState('');

    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const lastDayStr = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const [fechaDesde, setFechaDesde] = useState(firstDay);
    const [fechaHasta, setFechaHasta] = useState(lastDayStr);

    const openHistorialModal = (item: any) => {
        setSelectedProveedorId(item.id);
        setFacturasModalOpen(true);
        fetchFacturas(item.id, fechaDesde, fechaHasta);
    };

    const fetchFacturas = async (proveedorId: number, desde: string, hasta: string) => {
        setLoadingFacturas(true);
        try {
            const params = new URLSearchParams();
            params.append('proveedor_id', proveedorId.toString());
            if (desde) params.append('fecha_desde', desde);
            if (hasta) params.append('fecha_hasta', hasta);
            
            const res = await apiGet<Factura[]>(`/facturas/?${params.toString()}`);
            setProveedorFacturas(res || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingFacturas(false);
        }
    };

    const filteredFacturas = useMemo(() => {
        if (!facturasSearch.trim()) return proveedorFacturas;
        const term = facturasSearch.toLowerCase();
        return proveedorFacturas.filter(f => 
            f.numero_factura?.toLowerCase().includes(term)
        );
    }, [proveedorFacturas, facturasSearch]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const result = await apiPost<any>('/soportes/upload', formData);
            alert(`✅ ${result.message}\nPáginas procesadas: ${result.detalles.length}`);
            
            if (result.detalles && result.detalles.length > 0) {
                setProveedores(prev => prev.map(p => {
                    const detail = result.detalles.find((d: any) => d.proveedor_id === p.id);
                    if (detail && detail.datos) {
                        return {
                            ...p,
                            banco_origen: detail.datos.banco_origen,
                            cuenta_origen: detail.datos.cuenta_origen,
                            valor_nota: detail.datos.valor,
                            ruta_soporte: detail.ruta,
                            soporte_id: detail.soporte_id
                        };
                    }
                    return p;
                }));
            }
        } catch (error: any) {
            alert("❌ Error al subir el archivo: " + error.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiGet<Proveedor[]>('/proveedores/');
            setProveedores(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { 
        fetchData(); 
    }, []);

    // Client-side filtering
    const filteredData = useMemo(() => {
        if (!search.trim()) return proveedores;
        const term = search.toLowerCase();
        return proveedores.filter(p =>
            p.nit?.toLowerCase().includes(term) ||
            p.nombre?.toLowerCase().includes(term)
        );
    }, [proveedores, search]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(filteredData.map(p => p.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: number) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const isAllSelected = filteredData.length > 0 && selectedIds.length === filteredData.length;

    const columns = [
        {
            key: 'select',
            header: (
                <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    title="Seleccionar todos"
                />
            ),
            render: (item: any) => (
                <input 
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => handleSelectOne(item.id)}
                />
            )
        },
        { key: 'nit', header: 'NIT' },
        { key: 'nombre', header: 'Nombre del Proveedor' },
        { 
            key: 'banco_origen', 
            header: 'Banco Origen',
            render: (item: any) => item.banco_origen || <span className="text-gray-400 italic">No disponible</span>
        },
        { 
            key: 'cuenta_origen', 
            header: 'Cuenta Origen',
            render: (item: any) => item.cuenta_origen || <span className="text-gray-400 italic">No disponible</span>
        },
        { 
            key: 'valor_nota', 
            header: 'Valor',
            render: (item: any) => item.valor_nota 
                ? `$${item.valor_nota.toLocaleString()}` 
                : <span className="text-gray-400 italic">No disponible</span>
        },
        {
            key: 'ver_soporte',
            header: 'Soporte',
            render: (item: any) => item.ruta_soporte ? (
                <a 
                    href={`${API_URL}/soportes/file/${item.soporte_id}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Ver PDF
                </a>
            ) : <span className="text-gray-400 text-sm italic">-</span>
        },
        {
            key: 'acciones',
            header: 'Historial',
            render: (item: any) => (
                <button
                    onClick={() => openHistorialModal(item)}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Ver Facturas
                </button>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Contabilidad</h1>
                    <p className="text-gray-500 mt-1">Control de notas bancarias y valores por proveedor.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        hidden 
                        accept="application/pdf" 
                        onChange={handleFileUpload} 
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors font-medium text-sm disabled:opacity-50"
                    >
                        {uploading ? (
                            <svg className="animate-spin h-5 w-5 text-indigo-600" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                            </svg>
                        ) : (
                            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                        )}
                        {uploading ? 'Procesando PDF...' : 'Subir Soporte Bancario'}
                    </button>
                    <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors font-medium text-sm">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Enviar Emails
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Buscar por NIT o nombre del proveedor..."
                        className="w-full px-4 py-3 pl-11 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <svg className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            <DataTable
                data={filteredData}
                columns={columns}
                loading={loading}
            />

            {/* Modal de Facturas */}
            {facturasModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h2 className="text-xl font-bold text-gray-800">Historial de Facturas del Proveedor</h2>
                            <button onClick={() => setFacturasModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-6 flex-1 overflow-auto bg-gray-50">
                            {/* Filtros */}
                            <div className="flex flex-wrap gap-4 mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                                <div className="flex-1 min-w-[200px]">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Buscar Número Factura</label>
                                    <input 
                                        type="text" 
                                        value={facturasSearch} 
                                        onChange={e => setFacturasSearch(e.target.value)} 
                                        placeholder="Ej: FAC-123" 
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Desde</label>
                                    <input 
                                        type="date" 
                                        value={fechaDesde} 
                                        onChange={e => setFechaDesde(e.target.value)} 
                                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Hasta</label>
                                    <input 
                                        type="date" 
                                        value={fechaHasta} 
                                        onChange={e => setFechaHasta(e.target.value)} 
                                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <button 
                                        onClick={() => selectedProveedorId && fetchFacturas(selectedProveedorId, fechaDesde, fechaHasta)}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-sm transition-colors"
                                    >
                                        Filtrar
                                    </button>
                                </div>
                            </div>
                            
                            {/* Tabla */}
                            {loadingFacturas ? (
                                <div className="text-center py-10">Cargando facturas...</div>
                            ) : filteredFacturas.length === 0 ? (
                                <div className="text-center py-10 text-gray-500 bg-white rounded-lg border border-gray-200">No se encontraron facturas para los filtros seleccionados.</div>
                            ) : (
                                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Factura</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PDF</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Soporte Pago</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredFacturas.map(f => (
                                                <tr key={f.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{f.numero_factura || 'N/A'}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{f.fecha_factura || 'N/A'}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${(f.valor || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                            f.estado === 'PAGADA' ? 'bg-green-100 text-green-800' :
                                                            f.estado === 'EN_TRAMITE' ? 'bg-blue-100 text-blue-800' :
                                                            f.estado === 'ASIGNADA' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                            {f.estado || 'PENDIENTE'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {f.url_factura ? (
                                                            <a href={`${API_URL}/facturas/file/${f.id}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                                Ver PDF
                                                            </a>
                                                        ) : (
                                                            <span className="text-gray-400">Sin PDF</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {f.soportes && f.soportes.length > 0 ? (
                                                            <a href={`${API_URL}/soportes/file/${f.soportes[0].id}`} target="_blank" rel="noreferrer" className="text-green-600 hover:text-green-900 flex items-center gap-1">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                Ver Soporte
                                                            </a>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs italic">Pendiente</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
