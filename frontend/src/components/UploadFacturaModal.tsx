import { useState, useRef, useEffect } from 'react';
import type { Proveedor } from '../types';
import Modal, { FormField, inputClassName } from './Modal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Manual form data
    const [formData, setFormData] = useState({
        proveedor_nit: '',
        proveedor_nombre: '',
        numero_factura: '',
        fecha_factura: '',
        fecha_vencimiento: '',
        valor: '',
        observaciones: ''
    });

    // Provider search
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [showProveedorSuggestions, setShowProveedorSuggestions] = useState(false);
    const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);

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
                observaciones: ''
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
                const res = await fetch(`${API_URL}/proveedores/?limit=100`);
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
            if (!file.name.toLowerCase().endsWith('.pdf')) {
                setError('Solo se permiten archivos PDF');
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

            const res = await fetch(`${API_URL}/facturas/upload-pdf`, {
                method: 'POST',
                body: formDataObj
            });

            const data: UploadResult = await res.json();
            setResult(data);

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
                observaciones: formData.observaciones || undefined
            };

            const res = await fetch(`${API_URL}/facturas/`, {
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
                    <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg flex items-center gap-3">
                        <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-white">{error}</span>
                    </div>
                )}

                {/* Beautiful Loading indicator */}
                {uploading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        {/* Animated circles */}
                        <div className="relative w-20 h-20">
                            <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-red-500 animate-spin"></div>
                            <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-red-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
                            <div className="absolute inset-4 rounded-full border-4 border-transparent border-t-red-300 animate-spin" style={{ animationDuration: '1.5s' }}></div>
                        </div>
                        <p className="mt-6 text-lg font-medium text-white">
                            {mode === 'pdf' ? 'Procesando factura...' : 'Creando factura...'}
                        </p>
                        {mode === 'pdf' && (
                            <p className="mt-2 text-sm text-slate-400">
                                Extrayendo información con OCR
                            </p>
                        )}
                        {/* Animated dots */}
                        <div className="flex gap-1 mt-3">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                    </div>
                )}

                {/* Success Result */}
                {result?.ok && (
                    <div className="flex flex-col items-center justify-center py-8">
                        {/* Animated checkmark */}
                        <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mb-4 animate-pulse">
                            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-xl font-semibold text-white mb-2">¡Listo!</p>
                        <p className="text-slate-300">{result.message}</p>

                        {/* Factura details card */}
                        {result.factura && (
                            <div className="mt-6 w-full bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-slate-400 block mb-1">Proveedor</span>
                                        <p className="text-white font-medium">
                                            {result.factura.proveedor_nombre || '-'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block mb-1">N° Factura</span>
                                        <p className="text-white font-medium">
                                            {result.factura.numero_factura || '-'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block mb-1">Valor</span>
                                        <p className="text-emerald-400 font-bold text-lg">
                                            {formatCurrency(result.factura.valor)}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block mb-1">Estado</span>
                                        <span className="inline-block px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-medium">
                                            {result.factura.estado || '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Error Result */}
                {result && !result.ok && (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center mb-4">
                            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <p className="text-xl font-semibold text-white mb-2">Error</p>
                        <p className="text-slate-300 text-center">{result.message}</p>
                    </div>
                )}

                {/* PDF Upload Mode */}
                {mode === 'pdf' && !uploading && !result && (
                    <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-red-500 transition-colors">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            onChange={handleFileChange}
                            className="hidden"
                        />

                        {selectedFile ? (
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
                                    <span className="text-red-400 font-medium">Click para seleccionar</span> o arrastra un archivo PDF
                                </p>
                                <p className="text-slate-500 text-sm">Solo archivos PDF</p>
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
                    </div>
                )}
            </div>
        </Modal>
    );
}
