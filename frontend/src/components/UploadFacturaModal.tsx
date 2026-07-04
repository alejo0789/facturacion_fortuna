import { useState, useRef, useEffect } from 'react';
import type { Proveedor } from '../types';
import Modal, { FormField, inputClassName } from './Modal';

import { apiFetch, apiGet } from '../utils/apiClient';

interface TarifaRetencion {
    id: number;
    concepto: string;
    tarifa_pct: number;
    base_minima: number;
    es_default: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const authFetch = (url: string, options?: RequestInit): Promise<Response> => {
    const endpoint = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
    return apiFetch(endpoint, options as never);
};

interface UploadFacturaModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface UploadResult {
    ok: boolean;
    message: string;
    file_url?: string;
    filename?: string;
    factura_id?: number;
    factura?: {
        id: number;
        numero_factura?: string;
        proveedor_nombre?: string;
        proveedor_nit?: string;
        valor?: number;
        estado?: string;
    };
}

export default function UploadFacturaModal({ isOpen, onClose, onSuccess }: UploadFacturaModalProps) {
    const [mode, setMode] = useState<'pdf' | 'manual'>('pdf');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<UploadResult | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Manual form data
    const [formData, setFormData] = useState({
        proveedor_nit: '',
        proveedor_nombre: '',
        numero_factura: '',
        fecha_factura: '',
        fecha_vencimiento: '',
        valor: '',
        observaciones: '',
        // Causación contable
        tiene_iva: true,
        aplica_retefuente: true,
        aplica_reteiva: false,
        aplica_reteica: false,
        concepto_dian: '5002', // default Servicios
    });

    // Provider search
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [showProveedorSuggestions, setShowProveedorSuggestions] = useState(false);
    const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);

    // Tarifas de retención (catálogo DIAN 2026) — cargadas del backend
    const [tarifasRetefuente, setTarifasRetefuente] = useState<TarifaRetencion[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        apiGet<TarifaRetencion[]>('/impuestos/tarifas?tipo=RETEFUENTE')
            .then(setTarifasRetefuente)
            .catch((e) => console.error('Error cargando tarifas:', e));
    }, [isOpen]);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setMode('pdf');
            setSelectedFile(null);
            setUploading(false);
            setError('');
            setResult(null);
            setFormData({
                proveedor_nit: '',
                proveedor_nombre: '',
                numero_factura: '',
                fecha_factura: '',
                fecha_vencimiento: '',
                valor: '',
                observaciones: '',
                tiene_iva: true,
                aplica_retefuente: true,
                aplica_reteiva: false,
                aplica_reteica: false,
                concepto_dian: '5002',
            });
            setSelectedProveedor(null);
            setProveedores([]);
        }
    }, [isOpen]);

    // Search providers
    useEffect(() => {
        const searchProveedores = async () => {
            if (formData.proveedor_nit.length < 2) {
                setProveedores([]);
                return;
            }

            try {
                const res = await authFetch(`${API_URL}/proveedores/?limit=100`);
                if (res.ok) {
                    const data: Proveedor[] = await res.json();
                    const searchTerm = formData.proveedor_nit.toLowerCase();
                    const filtered = data.filter(p =>
                        p.nit.toLowerCase().includes(searchTerm) ||
                        p.nombre.toLowerCase().includes(searchTerm)
                    );
                    setProveedores(filtered);
                }
            } catch (e) {
                console.error('Error searching proveedores:', e);
            }
        };

        const timer = setTimeout(searchProveedores, 300);
        return () => clearTimeout(timer);
    }, [formData.proveedor_nit]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setError('');
        setResult(null);

        if (file) {
            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith('.pdf') && !fileName.endsWith('.zip') && !fileName.match(/\.(jpg|jpeg|png)$/)) {
                setError('Solo se permiten archivos PDF, ZIP o Imágenes (JPG, PNG)');
                setSelectedFile(null);
                return;
            }
            setSelectedFile(file);
        }
    };

    // Drag and Drop handlers
    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        setError('');
        setResult(null);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith('.pdf') && !fileName.endsWith('.zip') && !fileName.match(/\.(jpg|jpeg|png)$/)) {
                setError('Solo se permiten archivos PDF, ZIP o Imágenes (JPG, PNG)');
                setSelectedFile(null);
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleSelectProveedor = (proveedor: Proveedor) => {
        setSelectedProveedor(proveedor);
        setFormData({
            ...formData,
            proveedor_nit: proveedor.nit,
            proveedor_nombre: proveedor.nombre
        });
        setShowProveedorSuggestions(false);
    };

    const handleUploadPdf = async () => {
        if (!selectedFile) return;

        setError('');
        setUploading(true);
        setResult(null);

        try {
            const formDataObj = new FormData();
            formDataObj.append('file', selectedFile);

            // Determine endpoint based on file type — apiFetch arma la URL
            // contra VITE_API_URL + prefix /api/ e inyecta Authorization JWT
            // + X-Empresa-Id del tenant activo.
            const isZip = selectedFile.name.toLowerCase().endsWith('.zip');
            const endpoint = isZip ? '/facturas/upload-zip' : '/facturas/upload-pdf';

            const res = await apiFetch(endpoint, {
                method: 'POST',
                body: formDataObj,
            });

            const data = await res.json();

            // Handle ZIP response differently
            if (isZip) {
                setResult({
                    ok: data.ok,
                    message: data.message,
                    factura: data.successful > 0 ? {
                        id: 0,
                        numero_factura: `${data.successful} facturas procesadas`,
                        valor: undefined,
                        estado: data.failed > 0 ? 'Con errores' : 'Completado'
                    } : undefined
                });
            } else {
                setResult(data);
            }

            if (data.ok) {
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 1500);
            }
        } catch (e) {
            setError('Error de conexión al servidor');
            console.error('Upload error:', e);
        } finally {
            setUploading(false);
        }
    };

    const handleManualSubmit = async () => {
        if (!formData.proveedor_nit) {
            setError('Debe ingresar el NIT del proveedor');
            return;
        }

        setError('');
        setUploading(true);
        setResult(null);

        try {
            const fechaFactura = formData.fecha_factura || null;
            const fechaVencimiento = formData.fecha_vencimiento || null;

            const body = {
                proveedor_nit: formData.proveedor_nit,
                proveedor_nombre: formData.proveedor_nombre || undefined,
                numero_factura: formData.numero_factura || undefined,
                fecha_factura: fechaFactura,
                fecha_vencimiento: fechaVencimiento,
                valor: formData.valor ? parseFloat(formData.valor) : undefined,
                observaciones: formData.observaciones || undefined,
                // Causación contable + retenciones Régimen Ordinario
                tiene_iva: formData.tiene_iva,
                aplica_retefuente: formData.aplica_retefuente,
                aplica_reteiva: formData.aplica_reteiva,
                aplica_reteica: formData.aplica_reteica,
                concepto_dian: formData.concepto_dian || undefined,
                generar_asiento: true,
            };

            const res = await authFetch(`${API_URL}/facturas/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const factura = await res.json();
                setResult({
                    ok: true,
                    message: 'Factura creada correctamente',
                    factura_id: factura.id,
                    factura: {
                        id: factura.id,
                        numero_factura: factura.numero_factura,
                        proveedor_nombre: factura.proveedor?.nombre,
                        proveedor_nit: factura.proveedor?.nit,
                        valor: factura.valor,
                        estado: factura.estado
                    }
                });

                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 1500);
            } else {
                const errorData = await res.json();
                setError(errorData.detail || 'Error al crear la factura');
            }
        } catch (e) {
            setError('Error de conexión al servidor');
            console.error('Submit error:', e);
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = () => {
        if (mode === 'pdf') {
            handleUploadPdf();
        } else {
            handleManualSubmit();
        }
    };

    const formatCurrency = (value: number | undefined) => {
        if (!value) return '-';
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(value);
    };

    const isSubmitDisabled = () => {
        if (uploading || result?.ok === true) return true;
        if (mode === 'pdf') return !selectedFile;
        if (mode === 'manual') return !formData.proveedor_nit;
        return false;
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Subir Factura"
            onSubmit={handleSubmit}
            submitDisabled={isSubmitDisabled()}
            submitText={uploading ? 'Procesando...' : (mode === 'pdf' ? 'Subir y Procesar' : 'Crear Factura')}
        >
            <div className="space-y-6">
                {/* Mode tabs */}
                <div className="flex rounded-lg overflow-hidden border border-slate-600">
                    <button
                        type="button"
                        onClick={() => { setMode('pdf'); setError(''); setResult(null); }}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${mode === 'pdf'
                            ? 'bg-gradient-to-r from-red-600 to-red-700 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                            }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            Subir PDF
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode('manual'); setError(''); setResult(null); }}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${mode === 'manual'
                            ? 'bg-gradient-to-r from-red-600 to-red-700 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                            }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Ingreso Manual
                        </div>
                    </button>
                </div>

                {/* Error message */}
                {error && (
                    <div
                        className="px-4 py-3 rounded-md flex items-start gap-3 text-[13px]"
                        style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative)', color: 'var(--negative)' }}
                    >
                        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                {/* Loading editorial — spinner serif + estados secuenciales */}
                {uploading && (
                    <div className="flex flex-col items-center justify-center py-12 anim-fade-up">
                        <div className="relative w-20 h-20">
                            <div
                                className="absolute inset-0 rounded-full border-2"
                                style={{ borderColor: 'var(--rule)' }}
                            />
                            <div
                                className="absolute inset-0 rounded-full border-2 border-t-transparent"
                                style={{
                                    borderColor: 'var(--accent)',
                                    borderTopColor: 'transparent',
                                    animation: 'spin-soft 900ms linear infinite',
                                }}
                            />
                            <div
                                className="absolute inset-0 flex items-center justify-center font-display-wonk text-[1.8rem]"
                                style={{ color: 'var(--accent)' }}
                            >
                                ƒ
                            </div>
                        </div>
                        <div className="kicker-accent mt-6">Procesando</div>
                        <p
                            className="mt-1 font-display text-[1.4rem] tracking-tight"
                            style={{ fontVariationSettings: "'SOFT' 30" }}
                        >
                            {mode === 'pdf' ? 'Extrayendo datos con IA…' : 'Creando factura…'}
                        </p>
                        {mode === 'pdf' && (
                            <p className="mt-2 text-[12px] max-w-sm text-center" style={{ color: 'var(--ink-faint)' }}>
                                El workflow n8n está leyendo el PDF y devolverá los datos extraídos en
                                unos segundos.
                            </p>
                        )}
                    </div>
                )}

                {/* Success — confirmación editorial con datos extraídos */}
                {result?.ok && (
                    <div className="flex flex-col items-center justify-center py-8 anim-fade-up">
                        <div
                            className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
                            style={{
                                background: 'var(--positive-soft)',
                                border: '1.5px solid var(--positive)',
                            }}
                        >
                            <svg
                                className="w-8 h-8"
                                style={{ color: 'var(--positive)' }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div className="kicker-accent" style={{ color: 'var(--positive)' }}>
                            Factura procesada
                        </div>
                        <p
                            className="font-display text-[1.6rem] tracking-tight mt-1 text-center"
                            style={{ fontVariationSettings: "'SOFT' 30" }}
                        >
                            {result.message}
                        </p>

                        {result.factura && (
                            <div className="mt-6 w-full ledger paper-grain p-5">
                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <div className="kicker mb-1">Proveedor</div>
                                        <div className="font-display text-[1rem]" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                            {result.factura.proveedor_nombre || '—'}
                                        </div>
                                        {result.factura.proveedor_nit && (
                                            <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--accent)' }}>
                                                NIT {result.factura.proveedor_nit}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="kicker mb-1">N° Factura</div>
                                        <div className="font-mono text-[14px]">
                                            {result.factura.numero_factura || '—'}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="kicker mb-1">Valor</div>
                                        <div className="numeral text-[1.5rem] leading-none" style={{ color: 'var(--positive)' }}>
                                            {formatCurrency(result.factura.valor)}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="kicker mb-1">Estado</div>
                                        <span className="tag tag-accent">{result.factura.estado || '—'}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Error — feedback editorial */}
                {result && !result.ok && (
                    <div className="flex flex-col items-center justify-center py-8 anim-fade-up">
                        <div
                            className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
                            style={{
                                background: 'var(--negative-soft)',
                                border: '1.5px solid var(--negative)',
                            }}
                        >
                            <svg
                                className="w-8 h-8"
                                style={{ color: 'var(--negative)' }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <div className="kicker-accent" style={{ color: 'var(--negative)' }}>
                            Falló el procesamiento
                        </div>
                        <p
                            className="font-display text-[1.3rem] tracking-tight mt-1 text-center max-w-md"
                            style={{ fontVariationSettings: "'SOFT' 30" }}
                        >
                            {result.message}
                        </p>
                    </div>
                )}

                {/* PDF Upload Mode */}
                {mode === 'pdf' && !uploading && !result && (
                    <div
                        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${isDragging
                            ? 'border-green-400 bg-green-500/10 scale-[1.02]'
                            : 'border-slate-600 hover:border-red-500'
                            }`}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.zip,application/pdf,application/zip,image/jpeg,image/png"
                            onChange={handleFileChange}
                            className="hidden"
                        />

                        {isDragging ? (
                            <div className="space-y-3 py-4">
                                <div className="flex items-center justify-center">
                                    <svg className="w-16 h-16 text-green-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3-3m0 0l3 3m-3-3v12" />
                                    </svg>
                                </div>
                                <p className="text-green-400 font-medium text-lg">¡Suelta el archivo aquí!</p>
                                <p className="text-slate-400 text-sm">Archivos PDF, ZIP o Imágenes</p>
                            </div>
                        ) : selectedFile ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-center gap-3">
                                    <svg className="w-12 h-12 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <p className="text-white font-medium">{selectedFile.name}</p>
                                <p className="text-slate-400 text-sm">
                                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedFile(null);
                                        setError('');
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="text-red-400 text-sm hover:text-red-300 transition-colors"
                                >
                                    Cambiar archivo
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full space-y-3"
                            >
                                <div className="flex items-center justify-center">
                                    <svg className="w-16 h-16 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                </div>
                                <p className="text-slate-300">
                                    <span className="text-red-400 font-medium">Click para seleccionar</span> o arrastra un archivo
                                </p>
                                <p className="text-slate-500 text-sm">Archivos PDF, ZIP o Imágenes (JPG o PNG)</p>
                            </button>
                        )}
                    </div>
                )}

                {/* Manual Entry Mode */}
                {mode === 'manual' && !uploading && !result && (
                    <div className="space-y-4">
                        {/* Provider search */}
                        <div className="relative">
                            <FormField label="NIT / Proveedor *">
                                <input
                                    type="text"
                                    className={inputClassName}
                                    placeholder="Buscar por NIT o nombre..."
                                    value={formData.proveedor_nit}
                                    onChange={e => {
                                        setFormData({ ...formData, proveedor_nit: e.target.value, proveedor_nombre: '' });
                                        setSelectedProveedor(null);
                                        setShowProveedorSuggestions(true);
                                    }}
                                    onFocus={() => setShowProveedorSuggestions(true)}
                                />
                            </FormField>

                            {showProveedorSuggestions && proveedores.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {proveedores.map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => handleSelectProveedor(p)}
                                            className="w-full px-3 py-2 text-left hover:bg-slate-600 transition-colors"
                                        >
                                            <div className="text-sm text-white">{p.nombre}</div>
                                            <div className="text-xs text-slate-400">{p.nit}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedProveedor && (
                            <div className="p-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-white font-medium">{selectedProveedor.nombre}</span>
                                    <span className="text-slate-400">({selectedProveedor.nit})</span>
                                </div>
                            </div>
                        )}

                        {!selectedProveedor && formData.proveedor_nit && (
                            <FormField label="Nombre del Proveedor (para crear nuevo)">
                                <input
                                    type="text"
                                    className={inputClassName}
                                    placeholder="Nombre del proveedor"
                                    value={formData.proveedor_nombre}
                                    onChange={e => setFormData({ ...formData, proveedor_nombre: e.target.value })}
                                />
                            </FormField>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Número de Factura">
                                <input
                                    type="text"
                                    className={inputClassName}
                                    placeholder="FAC-001"
                                    value={formData.numero_factura}
                                    onChange={e => setFormData({ ...formData, numero_factura: e.target.value })}
                                />
                            </FormField>
                            <FormField label="Valor">
                                <input
                                    type="number"
                                    className={inputClassName}
                                    placeholder="0"
                                    value={formData.valor}
                                    onChange={e => setFormData({ ...formData, valor: e.target.value })}
                                />
                            </FormField>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Fecha Factura">
                                <input
                                    type="date"
                                    className={inputClassName}
                                    value={formData.fecha_factura}
                                    onChange={e => setFormData({ ...formData, fecha_factura: e.target.value })}
                                />
                            </FormField>
                            <FormField label="Fecha Vencimiento">
                                <input
                                    type="date"
                                    className={inputClassName}
                                    value={formData.fecha_vencimiento}
                                    onChange={e => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                                />
                            </FormField>
                        </div>

                        <FormField label="Observaciones">
                            <textarea
                                className={`${inputClassName} min-h-[60px] resize-y`}
                                placeholder="Observaciones..."
                                value={formData.observaciones}
                                onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                                rows={2}
                            />
                        </FormField>

                        {/* Causación contable + retenciones */}
                        <div className="border-t border-gray-200 pt-4 mt-2">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">
                                Causación contable
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label={`Concepto retención DIAN ${tarifasRetefuente.length ? `(${tarifasRetefuente.length} oficiales 2026)` : ''}`}>
                                    <select
                                        className={inputClassName}
                                        value={formData.concepto_dian}
                                        onChange={e => setFormData({ ...formData, concepto_dian: e.target.value })}
                                    >
                                        <option value="">— Sin concepto específico (tarifa default) —</option>
                                        {tarifasRetefuente.length === 0 ? (
                                            <>
                                                <option value="5001">5001 — Honorarios (11%)</option>
                                                <option value="5002">5002 — Servicios (4–6%)</option>
                                                <option value="5003">5003 — Compras (2.5%)</option>
                                                <option value="5004">5004 — Arrendamientos (3.5%)</option>
                                            </>
                                        ) : (
                                            tarifasRetefuente
                                                .filter((t) => !t.es_default)
                                                .map((t) => {
                                                    const baseLbl = t.base_minima > 0
                                                        ? `base $${t.base_minima.toLocaleString('es-CO')}`
                                                        : 'sin base mínima';
                                                    return (
                                                        <option key={t.id} value={t.concepto.split(' ')[0]}>
                                                            {t.concepto} — {t.tarifa_pct}% ({baseLbl})
                                                        </option>
                                                    );
                                                })
                                        )}
                                    </select>
                                </FormField>
                                <div className="flex flex-col justify-end gap-2 pb-2">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={formData.tiene_iva}
                                            onChange={e => setFormData({ ...formData, tiene_iva: e.target.checked })}
                                        />
                                        Tiene IVA (19%)
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={formData.aplica_retefuente}
                                            onChange={e => setFormData({ ...formData, aplica_retefuente: e.target.checked })}
                                        />
                                        Aplica retefuente
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={formData.aplica_reteiva}
                                            onChange={e => setFormData({ ...formData, aplica_reteiva: e.target.checked })}
                                        />
                                        ReteIVA (15% sobre IVA — Gran Contribuyente)
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={formData.aplica_reteica}
                                            onChange={e => setFormData({ ...formData, aplica_reteica: e.target.checked })}
                                        />
                                        ReteICA (depende del municipio)
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
