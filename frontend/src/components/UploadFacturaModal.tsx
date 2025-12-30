import { useState, useRef, useEffect, useCallback } from 'react';
import Modal from './Modal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface UploadFacturaModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface UploadStatus {
    upload_id: string;
    status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
    filename: string;
    error_message?: string;
    created_at?: string;
    processed_at?: string;
    factura?: {
        id: number;
        numero_factura: string;
        proveedor_nombre: string;
        proveedor_nit: string;
        valor: number;
        estado: string;
        oficinas_count: number;
    };
}

export default function UploadFacturaModal({ isOpen, onClose, onSuccess }: UploadFacturaModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [uploadId, setUploadId] = useState<string | null>(null);
    const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setSelectedFile(null);
            setUploading(false);
            setError('');
            setUploadId(null);
            setUploadStatus(null);
        } else {
            // Clear polling when modal closes
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        }
    }, [isOpen]);

    // Polling for upload status
    const pollStatus = useCallback(async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/facturas/upload-status/${id}`);
            if (res.ok) {
                const data: UploadStatus = await res.json();
                setUploadStatus(data);

                // Stop polling if completed or error
                if (data.status === 'COMPLETED' || data.status === 'ERROR') {
                    if (pollingRef.current) {
                        clearInterval(pollingRef.current);
                        pollingRef.current = null;
                    }
                    setUploading(false);

                    if (data.status === 'COMPLETED') {
                        // Notify parent after a short delay to show success
                        setTimeout(() => {
                            onSuccess();
                        }, 2000);
                    }
                }
            }
        } catch (e) {
            console.error('Error polling status:', e);
        }
    }, [onSuccess]);

    // Start polling when we have an upload ID
    useEffect(() => {
        if (uploadId && !pollingRef.current) {
            // Poll every 2 seconds
            pollingRef.current = setInterval(() => {
                pollStatus(uploadId);
            }, 2000);

            // Initial poll
            pollStatus(uploadId);
        }

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [uploadId, pollStatus]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setError('');
        setUploadStatus(null);

        if (file) {
            if (!file.name.toLowerCase().endsWith('.pdf')) {
                setError('Solo se permiten archivos PDF');
                setSelectedFile(null);
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setError('');
        setUploading(true);
        setUploadStatus(null);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const res = await fetch(`${API_URL}/facturas/upload-pdf`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                setUploadId(data.upload_id);
                // Polling will start automatically via useEffect
            } else {
                const errorData = await res.json();
                setError(errorData.detail || 'Error al subir el archivo');
                setUploading(false);
            }
        } catch (e) {
            setError('Error de conexión al servidor');
            setUploading(false);
            console.error('Upload error:', e);
        }
    };

    const handleClose = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        onClose();
    };

    const formatCurrency = (value: number | undefined) => {
        if (!value) return '-';
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(value);
    };

    // Get status display info
    const getStatusInfo = () => {
        if (!uploadStatus) return null;

        switch (uploadStatus.status) {
            case 'UPLOADING':
                return {
                    icon: '📤',
                    text: 'Subiendo archivo...',
                    color: 'text-blue-400',
                    bgColor: 'bg-blue-500/20 border-blue-500'
                };
            case 'PROCESSING':
                return {
                    icon: '⚙️',
                    text: 'Procesando factura con OCR...',
                    color: 'text-yellow-400',
                    bgColor: 'bg-yellow-500/20 border-yellow-500'
                };
            case 'COMPLETED':
                return {
                    icon: '✅',
                    text: '¡Factura procesada correctamente!',
                    color: 'text-green-400',
                    bgColor: 'bg-green-500/20 border-green-500'
                };
            case 'ERROR':
                return {
                    icon: '❌',
                    text: uploadStatus.error_message || 'Error al procesar',
                    color: 'text-red-400',
                    bgColor: 'bg-red-500/20 border-red-500'
                };
            default:
                return null;
        }
    };

    const statusInfo = getStatusInfo();

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Subir Factura PDF"
            onSubmit={handleUpload}
            submitDisabled={uploading || !selectedFile || uploadStatus?.status === 'COMPLETED'}
            submitText={uploading ? 'Procesando...' : 'Subir y Procesar'}
        >
            <div className="space-y-6">
                {/* Error message (only if no status) */}
                {error && !uploadStatus && (
                    <div className="p-4 bg-red-500/20 border border-red-500 rounded-lg flex items-center gap-3">
                        <span className="text-2xl">❌</span>
                        <span className="text-red-300">{error}</span>
                    </div>
                )}

                {/* Status display */}
                {uploadStatus && statusInfo && (
                    <div className={`p-4 border rounded-lg ${statusInfo.bgColor}`}>
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{statusInfo.icon}</span>
                            <div className="flex-1">
                                <p className={`font-medium ${statusInfo.color}`}>{statusInfo.text}</p>
                                {uploadStatus.status === 'PROCESSING' && (
                                    <p className="text-sm text-slate-400 mt-1">
                                        Esto puede tomar unos segundos...
                                    </p>
                                )}
                            </div>
                            {(uploadStatus.status === 'UPLOADING' || uploadStatus.status === 'PROCESSING') && (
                                <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full"></div>
                            )}
                        </div>

                        {/* Factura details when completed */}
                        {uploadStatus.status === 'COMPLETED' && uploadStatus.factura && (
                            <div className="mt-4 pt-4 border-t border-green-500/30 space-y-2">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <span className="text-slate-400">Proveedor:</span>
                                        <p className="text-white font-medium">{uploadStatus.factura.proveedor_nombre}</p>
                                        <p className="text-slate-400 text-xs">{uploadStatus.factura.proveedor_nit}</p>
                                    </div>
                                    <div>
                                        <span className="text-slate-400">N° Factura:</span>
                                        <p className="text-white font-medium">{uploadStatus.factura.numero_factura || '-'}</p>
                                    </div>
                                    <div>
                                        <span className="text-slate-400">Valor:</span>
                                        <p className="text-emerald-400 font-bold">{formatCurrency(uploadStatus.factura.valor)}</p>
                                    </div>
                                    <div>
                                        <span className="text-slate-400">Oficinas:</span>
                                        <p className="text-white font-medium">{uploadStatus.factura.oficinas_count} asignada(s)</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* File upload area - only show if not processing */}
                {(!uploadStatus || uploadStatus.status === 'ERROR') && (
                    <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-red-500 transition-colors">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            onChange={handleFileChange}
                            className="hidden"
                            disabled={uploading}
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
                                    disabled={uploading}
                                >
                                    Cambiar archivo
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full space-y-3"
                                disabled={uploading}
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

                {/* Instructions */}
                {!uploadStatus && (
                    <div className="text-sm text-slate-400 bg-slate-800/50 rounded-lg p-4">
                        <p className="font-medium text-slate-300 mb-2">¿Cómo funciona?</p>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>Sube el PDF de la factura</li>
                            <li>El sistema extrae automáticamente los datos con OCR</li>
                            <li>La factura se crea y asigna a las oficinas correspondientes</li>
                        </ol>
                    </div>
                )}
            </div>
        </Modal>
    );
}
