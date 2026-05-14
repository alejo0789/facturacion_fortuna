import { useState, useEffect, useMemo, useRef } from 'react';
import type { Proveedor } from '../types';
import DataTable from '../components/DataTable';
import { apiGet, apiPost } from '../utils/apiClient';

export default function ContabilidadPage() {
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                    href={`http://localhost:8000/api/soportes/file/${item.soporte_id}`} 
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
        </div>
    );
}
