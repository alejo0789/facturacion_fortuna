import { useState, useEffect, useMemo } from 'react';
import type { Pago, Contrato } from '../types';
import DataTable from '../components/DataTable';
import Modal, { FormField, inputClassName } from '../components/Modal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface PagoExtended extends Pago {
    contrato?: Contrato;
}

export default function PagosPage() {
    const [pagos, setPagos] = useState<PagoExtended[]>([]);
    const [contratos, setContratos] = useState<Contrato[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Pago>>({});
    const [search, setSearch] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const contratosRes = await fetch(`${API_URL}/contratos/`);
            if (contratosRes.ok) {
                const contratosData: Contrato[] = await contratosRes.json();
                setContratos(contratosData);

                // Build a map of contracts for quick lookup
                const contratoMap = new Map(contratosData.map(c => [c.id, c]));

                const allPagos: PagoExtended[] = [];
                for (const c of contratosData) {
                    const pagosRes = await fetch(`${API_URL}/pagos/contrato/${c.id}`);
                    if (pagosRes.ok) {
                        const pagosData: Pago[] = await pagosRes.json();
                        // Attach contract info to each pago
                        allPagos.push(...pagosData.map(p => ({ ...p, contrato: contratoMap.get(p.contrato_id) })));
                    }
                }
                setPagos(allPagos);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Client-side filtering
    const filteredData = useMemo(() => {
        if (!search.trim()) return pagos;
        const term = search.toLowerCase();
        return pagos.filter(p =>
            p.numero_factura?.toLowerCase().includes(term) ||
            p.periodo?.toLowerCase().includes(term) ||
            p.contrato?.proveedor?.nombre?.toLowerCase().includes(term) ||
            p.contrato?.oficina?.nombre?.toLowerCase().includes(term) ||
            p.contrato?.oficina?.cod_oficina?.toLowerCase().includes(term) ||
            String(p.valor).includes(term)
        );
    }, [pagos, search]);

    const handleSave = async () => {
        await fetch(`${API_URL}/pagos/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        setIsModalOpen(false);
        setFormData({});
        fetchData();
    };

    const openNewModal = () => {
        setFormData({});
        setIsModalOpen(true);
    };

    const columns = [
        {
            key: 'proveedor',
            header: 'Proveedor',
            render: (p: PagoExtended) => p.contrato?.proveedor?.nombre || '-'
        },
        {
            key: 'cod_oficina',
            header: 'Código Oficina',
            render: (p: PagoExtended) => p.contrato?.oficina?.cod_oficina || '-'
        },
        {
            key: 'oficina',
            header: 'Oficina',
            render: (p: PagoExtended) => p.contrato?.oficina?.nombre || '-'
        },
        { key: 'numero_factura', header: 'No. Factura' },
        { key: 'fecha_pago', header: 'Fecha' },
        {
            key: 'valor',
            header: 'Valor',
            render: (p: PagoExtended) => (
                <span className="font-semibold text-green-600">
                    ${p.valor?.toLocaleString()}
                </span>
            )
        },
        { key: 'periodo', header: 'Periodo' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Facturas</h1>
                    <p className="text-gray-500 mt-1">Historial de facturas y pagos realizados.</p>
                </div>
                <button onClick={openNewModal} className="btn-primary">
                    + Nueva Factura
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Buscar por proveedor, oficina, factura, periodo..."
                    className="w-full px-4 py-3 pl-11 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <svg className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            <DataTable
                data={filteredData}
                columns={columns}
                loading={loading}
            />

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Registrar Nueva Factura"
                onSubmit={handleSave}
                submitLabel="Registrar"
            >
                <div className="space-y-4">
                    <FormField label="Contrato" required>
                        <select
                            className={inputClassName}
                            value={formData.contrato_id || ''}
                            onChange={e => setFormData({ ...formData, contrato_id: Number(e.target.value) })}
                        >
                            <option value="">Seleccione un Contrato...</option>
                            {contratos.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.proveedor?.nombre} - {c.oficina?.cod_oficina} - {c.oficina?.nombre}
                                </option>
                            ))}
                        </select>
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Número de Factura">
                            <input
                                className={inputClassName}
                                placeholder="Ej: FAC-001234"
                                value={formData.numero_factura || ''}
                                onChange={e => setFormData({ ...formData, numero_factura: e.target.value })}
                            />
                        </FormField>
                        <FormField label="Fecha de Pago" required>
                            <input
                                type="date"
                                className={inputClassName}
                                value={formData.fecha_pago || ''}
                                onChange={e => setFormData({ ...formData, fecha_pago: e.target.value })}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Valor" required>
                            <input
                                type="number"
                                className={inputClassName}
                                placeholder="60000"
                                value={formData.valor || ''}
                                onChange={e => setFormData({ ...formData, valor: Number(e.target.value) })}
                            />
                        </FormField>
                        <FormField label="Periodo">
                            <input
                                className={inputClassName}
                                placeholder="Ej: Enero 2025"
                                value={formData.periodo || ''}
                                onChange={e => setFormData({ ...formData, periodo: e.target.value })}
                            />
                        </FormField>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
