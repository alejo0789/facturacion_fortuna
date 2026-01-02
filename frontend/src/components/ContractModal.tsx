import { useState, useEffect, useRef } from 'react';
import type { Contrato, Proveedor, Oficina } from '../types';
import Modal, { FormField, inputClassName } from './Modal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface ContractModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    contract?: Contrato;
}

// Componente de búsqueda con autocompletado
interface SearchableSelectProps<T> {
    items: T[];
    value: number;
    onChange: (id: number) => void;
    getLabel: (item: T) => string;
    getSearchText: (item: T) => string;
    placeholder: string;
    selectedItem?: T;
}

function SearchableSelect<T extends { id: number }>({
    items,
    value,
    onChange,
    getLabel,
    getSearchText,
    placeholder,
}: SearchableSelectProps<T>) {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedItem = items.find(item => item.id === value);

    const filteredItems = items.filter(item => {
        const searchLower = search.toLowerCase();
        return getSearchText(item).toLowerCase().includes(searchLower);
    });

    useEffect(() => {
        if (selectedItem && !isOpen) {
            setSearch(getLabel(selectedItem));
        }
    }, [selectedItem, isOpen]);

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
    }, [selectedItem]);

    const handleSelect = (item: T) => {
        onChange(item.id);
        setSearch(getLabel(item));
        setIsOpen(false);
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
                    if (selectedItem) {
                        setSearch(getLabel(selectedItem));
                    }
                    break;
            }
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <input
                ref={inputRef}
                type="text"
                className={inputClassName}
                placeholder={placeholder}
                value={search}
                onChange={e => {
                    setSearch(e.target.value);
                    setIsOpen(true);
                    setHighlightedIndex(0);
                    if (e.target.value === '') {
                        onChange(0);
                    }
                }}
                onFocus={() => {
                    setIsOpen(true);
                    setSearch('');
                }}
                onKeyDown={handleKeyDown}
            />
            {isOpen && filteredItems.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredItems.map((item, index) => (
                        <div
                            key={item.id}
                            className={`px-3 py-2 cursor-pointer text-sm ${index === highlightedIndex
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-200 hover:bg-slate-600'
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
                <div className="absolute z-50 w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg p-3 text-sm text-slate-400">
                    No se encontraron resultados
                </div>
            )}
        </div>
    );
}

export default function ContractModal({ isOpen, onClose, onSave, contract }: ContractModalProps) {
    const [formData, setFormData] = useState<Partial<Contrato>>({
        proveedor_id: 0,
        oficina_id: 0,
        estado: 'ACTIVO',
        valor_mensual: 0,
        tiene_iva: 'no',
        tiene_retefuente: 'no',
        retefuente_pct: undefined
    });

    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [oficinas, setOficinas] = useState<Oficina[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileError, setFileError] = useState<string>('');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch(`${API_URL}/proveedores/`).then(r => r.json()).then(setProveedores);
        fetch(`${API_URL}/oficinas/`).then(r => r.json()).then(setOficinas);
    }, []);

    useEffect(() => {
        if (contract) {
            setFormData(contract);
        } else {
            setFormData({ proveedor_id: 0, oficina_id: 0, estado: 'ACTIVO', valor_mensual: 0 });
        }
        setSelectedFile(null);
        setFileError('');
    }, [contract, isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setFileError('');

        if (file) {
            // Validate PDF
            if (!file.name.toLowerCase().endsWith('.pdf')) {
                setFileError('Solo se permiten archivos PDF');
                setSelectedFile(null);
                return;
            }
            if (file.type !== 'application/pdf') {
                setFileError('El archivo debe ser un PDF válido');
                setSelectedFile(null);
                return;
            }
            setSelectedFile(file);
        }
    };

    const uploadFile = async (contratoId: number) => {
        if (!selectedFile) return true;

        const formDataFile = new FormData();
        formDataFile.append('file', selectedFile);

        try {
            const res = await fetch(`${API_URL}/contratos/${contratoId}/upload-pdf`, {
                method: 'POST',
                body: formDataFile
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.detail || 'Error al subir el archivo');
            }
            return true;
        } catch (error) {
            console.error('Error uploading file:', error);
            setFileError(error instanceof Error ? error.message : 'Error al subir el archivo');
            return false;
        }
    };

    const handleSubmit = async () => {
        setUploading(true);
        try {
            const url = contract
                ? `${API_URL}/contratos/${contract.id}`
                : `${API_URL}/contratos/`;

            const res = await fetch(url, {
                method: contract ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                const savedContract = await res.json();

                // Upload file if selected
                if (selectedFile) {
                    const uploadSuccess = await uploadFile(savedContract.id);
                    if (!uploadSuccess) {
                        setUploading(false);
                        return; // Don't close modal if upload failed
                    }
                }

                onSave();
                onClose();
            } else {
                alert('Error al guardar el contrato');
            }
        } finally {
            setUploading(false);
        }
    };

    const handleViewPdf = () => {
        if (contract?.id) {
            window.open(`${API_URL}/contratos/${contract.id}/pdf`, '_blank');
        }
    };

    const handleDeletePdf = async () => {
        if (!contract?.id || !confirm('¿Está seguro de eliminar el archivo adjunto?')) return;

        try {
            const res = await fetch(`${API_URL}/contratos/${contract.id}/pdf`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setFormData({ ...formData, archivo_contrato: undefined });
                onSave(); // Refresh the list
            }
        } catch (error) {
            console.error('Error deleting file:', error);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={contract ? 'Editar Contrato' : 'Nuevo Contrato'}
            onSubmit={handleSubmit}
            submitDisabled={uploading}
            submitText={uploading ? 'Guardando...' : 'Guardar'}
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Proveedor (buscar por nombre o NIT)" required>
                        <SearchableSelect
                            items={proveedores}
                            value={formData.proveedor_id || 0}
                            onChange={id => setFormData({ ...formData, proveedor_id: id })}
                            getLabel={p => `${p.nombre} (${p.nit})`}
                            getSearchText={p => `${p.nombre} ${p.nit}`}
                            placeholder="Buscar proveedor..."
                        />
                    </FormField>

                    <FormField label="Oficina (buscar por código o nombre)" required>
                        <SearchableSelect
                            items={oficinas}
                            value={formData.oficina_id || 0}
                            onChange={id => setFormData({ ...formData, oficina_id: id })}
                            getLabel={o => `${o.cod_oficina || ''} - ${o.nombre || ''}`}
                            getSearchText={o => `${o.cod_oficina || ''} ${o.nombre || ''} ${o.ciudad || ''}`}
                            placeholder="Buscar oficina..."
                        />
                    </FormField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Número de Contrato">
                        <input
                            className={inputClassName}
                            placeholder="Ej: CONT-001"
                            value={formData.num_contrato || ''}
                            onChange={e => setFormData({ ...formData, num_contrato: e.target.value })}
                        />
                    </FormField>

                    <FormField label="Nombre del Titular">
                        <input
                            className={inputClassName}
                            placeholder="Ej: LA FORTUNA S.A"
                            value={formData.titular_nombre || ''}
                            onChange={e => setFormData({ ...formData, titular_nombre: e.target.value })}
                        />
                    </FormField>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <FormField label="Valor Mensual">
                        <input
                            type="number"
                            className={inputClassName}
                            placeholder="60000"
                            value={formData.valor_mensual || ''}
                            onChange={e => setFormData({ ...formData, valor_mensual: Number(e.target.value) })}
                        />
                    </FormField>

                    <FormField label="Estado">
                        <select
                            className={inputClassName}
                            value={formData.estado || 'ACTIVO'}
                            onChange={e => setFormData({ ...formData, estado: e.target.value })}
                        >
                            <option value="ACTIVO">ACTIVO</option>
                            <option value="EN TRAMITE">EN TRAMITE</option>
                            <option value="CANCELADO">CANCELADO</option>
                        </select>
                    </FormField>

                    <FormField label="Tipo">
                        <select
                            className={inputClassName}
                            value={formData.tipo || ''}
                            onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                        >
                            <option value="">Seleccionar...</option>
                            <option value="FIJO">Fijo</option>
                            <option value="MOVIL">Móvil</option>
                            <option value="COLABORACION">Colaboración</option>
                            <option value="LEASING">Leasing</option>
                        </select>
                    </FormField>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <FormField label="IVA">
                        <select
                            className={inputClassName}
                            value={formData.tiene_iva || 'no'}
                            onChange={e => setFormData({ ...formData, tiene_iva: e.target.value })}
                        >
                            <option value="no">No</option>
                            <option value="si">Sí</option>
                        </select>
                    </FormField>

                    <FormField label="Retefuente">
                        <select
                            className={inputClassName}
                            value={formData.tiene_retefuente || 'no'}
                            onChange={e => {
                                const val = e.target.value;
                                setFormData({
                                    ...formData,
                                    tiene_retefuente: val,
                                    retefuente_pct: val === 'no' ? undefined : formData.retefuente_pct || 4
                                });
                            }}
                        >
                            <option value="no">No</option>
                            <option value="si">Sí</option>
                        </select>
                    </FormField>

                    {formData.tiene_retefuente === 'si' && (
                        <FormField label="% Retefuente">
                            <select
                                className={inputClassName}
                                value={formData.retefuente_pct || 4}
                                onChange={e => setFormData({ ...formData, retefuente_pct: Number(e.target.value) })}
                            >
                                <option value={4}>4%</option>
                                <option value={6}>6%</option>
                            </select>
                        </FormField>
                    )}
                </div>

                <FormField label="Plan / Tipo de Canal">
                    <div className="grid grid-cols-2 gap-4">
                        <input
                            className={inputClassName}
                            placeholder="Ej: 10 MEGAS"
                            value={formData.tipo_plan || ''}
                            onChange={e => setFormData({ ...formData, tipo_plan: e.target.value })}
                        />
                        <input
                            className={inputClassName}
                            placeholder="Ej: BANDA ANCHA"
                            value={formData.tipo_canal || ''}
                            onChange={e => setFormData({ ...formData, tipo_canal: e.target.value })}
                        />
                    </div>
                </FormField>

                <FormField label="Observaciones">
                    <textarea
                        className={`${inputClassName} min-h-[80px] resize-y`}
                        placeholder="Notas o comentarios adicionales sobre el contrato..."
                        value={formData.observaciones || ''}
                        onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                        rows={3}
                    />
                </FormField>

                {/* File Upload Section */}
                <FormField label="Archivo del Contrato (PDF)">
                    <div className="space-y-2">
                        {/* Show existing file info */}
                        {contract?.archivo_contrato && !selectedFile && (
                            <div className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg">
                                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm text-slate-300 flex-1 truncate">
                                    {contract.archivo_contrato.split('/').pop()}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleViewPdf}
                                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                                >
                                    Ver PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeletePdf}
                                    className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
                                >
                                    Eliminar
                                </button>
                            </div>
                        )}

                        {/* File input */}
                        <div className="flex items-center gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,application/pdf"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className={`flex-1 py-2 px-4 border-2 border-dashed rounded-lg text-sm transition-colors ${selectedFile
                                    ? 'border-green-500 bg-green-500/10 text-green-400'
                                    : 'border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-300'
                                    }`}
                            >
                                {selectedFile ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        {selectedFile.name}
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        {contract?.archivo_contrato ? 'Reemplazar archivo' : 'Seleccionar archivo PDF'}
                                    </span>
                                )}
                            </button>
                            {selectedFile && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>

                        {/* Error message */}
                        {fileError && (
                            <p className="text-sm text-red-400 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                {fileError}
                            </p>
                        )}

                        <p className="text-xs text-slate-500">
                            Solo archivos PDF. El archivo se guardará en una carpeta con el nombre del proveedor.
                        </p>
                    </div>
                </FormField>
            </div>
        </Modal>
    );
}
