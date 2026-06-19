import { useState, useEffect, useMemo } from 'react';
import type { Proveedor } from '../types';
import DataTable from '../components/DataTable';
import Modal, { FormField, inputClassName } from '../components/Modal';
import { apiGet, apiPost, apiPut, apiDelete, apiFetch, ApiError } from '../utils/apiClient';

interface OracleSearchState {
    status: 'idle' | 'searching' | 'found' | 'not_found' | 'already_exists' | 'error';
    message: string;
    nombre: string | null;
    nit: string | null;
}

export default function ProveedoresPage() {
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Proveedor | null>(null);
    const [formData, setFormData] = useState<Partial<Proveedor>>({});
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);

    const [oracleSearch, setOracleSearch] = useState<OracleSearchState>({
        status: 'idle',
        message: '',
        nombre: null,
        nit: null,
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await apiGet<Proveedor[]>('/proveedores/');
            setProveedores(data);
        } catch (err) {
            console.error('Error cargando proveedores:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const filteredData = useMemo(() => {
        if (!search.trim()) return proveedores;
        const term = search.toLowerCase();
        return proveedores.filter((p) =>
            p.nit?.toLowerCase().includes(term) ||
            p.nombre?.toLowerCase().includes(term) ||
            p.nombre_comercial?.toLowerCase().includes(term)
        );
    }, [proveedores, search]);

    const searchInOracle = async (nit: string) => {
        if (!nit || nit.trim().length < 5) {
            setOracleSearch({
                status: 'idle',
                message: 'Ingrese un NIT válido (mínimo 5 dígitos)',
                nombre: null,
                nit: null,
            });
            return;
        }

        setOracleSearch({
            status: 'searching',
            message: 'Buscando en Manager…',
            nombre: null,
            nit: null,
        });

        try {
            const res = await apiFetch(`/proveedores/buscar-oracle/${nit.trim()}`);
            const data = await res.json();

            if (!res.ok) {
                setOracleSearch({
                    status: 'error',
                    message: data.detail || 'Error al consultar Manager',
                    nombre: null,
                    nit: null,
                });
                return;
            }

            if (data.already_exists) {
                setOracleSearch({
                    status: 'already_exists',
                    message: `Este proveedor ya existe: ${data.nombre}`,
                    nombre: data.nombre,
                    nit: data.nit,
                });
            } else if (data.found) {
                setOracleSearch({
                    status: 'found',
                    message: 'Encontrado en Manager',
                    nombre: data.nombre,
                    nit: data.nit,
                });
                setFormData((prev) => ({ ...prev, nombre: data.nombre, nit: data.nit }));
            } else {
                setOracleSearch({
                    status: 'not_found',
                    message: 'No se encontró en Manager (VINCULADO)',
                    nombre: null,
                    nit: data.nit,
                });
            }
        } catch {
            setOracleSearch({
                status: 'error',
                message: 'Error de conexión con el servidor',
                nombre: null,
                nit: null,
            });
        }
    };

    const handleSave = async () => {
        if (!formData.nit) return;
        setSaving(true);
        try {
            const payload = {
                nit: formData.nit,
                nombre: formData.nombre || 'PENDING_ORACLE_LOOKUP',
                nombre_comercial: formData.nombre_comercial || null,
            };
            if (editingItem) await apiPut(`/proveedores/${editingItem.id}`, payload);
            else await apiPost('/proveedores/', payload);
            setIsModalOpen(false);
            setEditingItem(null);
            setFormData({});
            setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
            fetchData();
        } catch (err) {
            alert(err instanceof ApiError ? err.message : 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (item: Proveedor) => {
        setEditingItem(item);
        setFormData(item);
        setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
        setIsModalOpen(true);
    };

    const handleDelete = async (item: Proveedor) => {
        if (!confirm('¿Está seguro de eliminar este proveedor?')) return;
        try {
            await apiDelete(`/proveedores/${item.id}`);
            fetchData();
        } catch (err) {
            alert(err instanceof ApiError ? err.message : 'Error al eliminar');
        }
    };

    const openNewModal = () => {
        setFormData({});
        setEditingItem(null);
        setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
        setIsModalOpen(true);
    };

    const columns = [
        {
            key: 'nit',
            header: 'NIT',
            render: (p: Proveedor) => (
                <span className="font-mono text-[12px]" style={{ color: 'var(--accent)' }}>{p.nit}</span>
            ),
        },
        { key: 'nombre', header: 'Nombre legal' },
        { key: 'nombre_comercial', header: 'Nombre comercial' },
    ];

    const canSave = editingItem
        ? (formData.nit && formData.nombre)
        : (oracleSearch.status === 'found' && oracleSearch.nombre);

    // Estilos de feedback Oracle según estado
    const oracleFeedbackStyle = (() => {
        switch (oracleSearch.status) {
            case 'found':
                return { bg: 'var(--positive-soft)', border: 'var(--positive)', color: 'var(--positive)' };
            case 'already_exists':
                return { bg: 'var(--gold-soft)', border: 'var(--gold)', color: '#7a5e29' };
            case 'searching':
                return { bg: 'var(--accent-soft)', border: 'var(--accent)', color: 'var(--accent)' };
            default:
                return { bg: 'var(--negative-soft)', border: 'var(--negative)', color: 'var(--negative)' };
        }
    })();

    return (
        <div className="space-y-8 max-w-[1480px] mx-auto">
            <div className="anim-fade-up">
                <div className="eyebrow mb-4">Maestros · Terceros</div>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <h1 className="editorial-title text-[3rem] lg:text-[3.5rem]">
                        Proveedores <em>vinculados</em>.
                    </h1>
                    <button onClick={openNewModal} className="btn-accent">
                        + Nuevo proveedor
                    </button>
                </div>
            </div>

            <div className="surface p-4 relative">
                <input
                    type="text"
                    placeholder="Buscar por NIT o nombre del proveedor…"
                    className="input-field pl-10"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <svg
                    className="absolute left-7 top-7 h-4 w-4"
                    style={{ color: 'var(--ink-faint)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            <DataTable
                data={filteredData}
                columns={columns}
                loading={loading}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingItem ? 'Editar proveedor' : 'Nuevo proveedor'}
                onSubmit={handleSave}
                submitDisabled={!canSave || saving}
                submitText={saving ? 'Guardando…' : (editingItem ? 'Guardar cambios' : 'Agregar proveedor')}
            >
                <div className="space-y-4">
                    <FormField label="NIT" required>
                        <div className="flex gap-2">
                            <input
                                className={inputClassName}
                                placeholder="Ej: 900123456"
                                value={formData.nit || ''}
                                onChange={(e) => {
                                    setFormData({ ...formData, nit: e.target.value });
                                    if (!editingItem) {
                                        setOracleSearch({ status: 'idle', message: '', nombre: null, nit: null });
                                    }
                                }}
                                disabled={editingItem !== null}
                            />
                            {!editingItem && (
                                <button
                                    type="button"
                                    onClick={() => searchInOracle(formData.nit || '')}
                                    disabled={oracleSearch.status === 'searching' || !formData.nit}
                                    className="btn-accent whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {oracleSearch.status === 'searching' ? (
                                        <>
                                            <div
                                                className="h-3.5 w-3.5 rounded-full border-2 border-t-transparent"
                                                style={{
                                                    borderColor: 'var(--paper)',
                                                    borderTopColor: 'transparent',
                                                    animation: 'spin-soft 800ms linear infinite',
                                                }}
                                            />
                                            Buscando…
                                        </>
                                    ) : (
                                        <>
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            Buscar en Manager
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </FormField>

                    {!editingItem && oracleSearch.status !== 'idle' && (
                        <div
                            className="p-4 rounded-md"
                            style={{
                                background: oracleFeedbackStyle.bg,
                                border: `1px solid ${oracleFeedbackStyle.border}`,
                            }}
                        >
                            <div
                                className="kicker-accent mb-1"
                                style={{ color: oracleFeedbackStyle.color }}
                            >
                                {oracleSearch.status === 'found' && '✓ Resultado'}
                                {oracleSearch.status === 'already_exists' && 'Ya existe'}
                                {oracleSearch.status === 'searching' && 'Consultando'}
                                {oracleSearch.status === 'not_found' && 'Sin resultado'}
                                {oracleSearch.status === 'error' && 'Error'}
                            </div>
                            <p className="text-[13px]" style={{ color: oracleFeedbackStyle.color }}>
                                {oracleSearch.message}
                            </p>
                            {oracleSearch.nombre && (
                                <p
                                    className="font-display text-[1.1rem] mt-2"
                                    style={{ color: 'var(--ink)', fontVariationSettings: "'SOFT' 30" }}
                                >
                                    {oracleSearch.nombre}
                                </p>
                            )}
                        </div>
                    )}

                    {(editingItem || oracleSearch.status === 'found') && (
                        <FormField label="Nombre del proveedor (legal)" required>
                            <input
                                className={inputClassName}
                                placeholder="Nombre obtenido de Manager"
                                value={formData.nombre || ''}
                                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                readOnly={!editingItem}
                                style={!editingItem ? { background: 'var(--paper-tinted)' } : undefined}
                            />
                            {!editingItem && (
                                <p className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                                    Obtenido automáticamente de Manager (VINCULADO).
                                </p>
                            )}
                        </FormField>
                    )}

                    {(editingItem || oracleSearch.status === 'found') && (
                        <FormField label="Nombre comercial (opcional)">
                            <input
                                className={inputClassName}
                                placeholder="Ej: Claro, Movistar, ETB…"
                                value={formData.nombre_comercial || ''}
                                onChange={(e) => setFormData({ ...formData, nombre_comercial: e.target.value })}
                            />
                            <p className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                                Nombre comercial o de marca. Se usa en búsquedas de contratos, facturas y reportes.
                            </p>
                        </FormField>
                    )}

                    {!editingItem && oracleSearch.status === 'idle' && (
                        <div
                            className="p-4 rounded-md"
                            style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}
                        >
                            <div className="kicker-accent mb-1">Instrucciones</div>
                            <p className="text-[13px]" style={{ color: 'var(--accent-deep)' }}>
                                Ingresa el NIT del proveedor y haz clic en "Buscar en Manager"
                                para verificar que existe y obtener el nombre automáticamente.
                            </p>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
