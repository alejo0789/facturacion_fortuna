import { useEffect, useState, useCallback } from 'react';
import type { Factura, Oficina, Proveedor, OficinaConContrato } from '../types';
import Modal, { FormField, inputClassName } from '../components/Modal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Type for oficina with valor assignment form
interface OficinaAsignacion {
    oficina_id: number;
    oficina_nombre: string;
    oficina_ciudad: string;
    contrato_num?: string;
    contrato_estado?: string;
    valor: string;
}

export default function FacturasPage() {
    const [facturas, setFacturas] = useState<Factura[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [filterEstado, setFilterEstado] = useState<string>('');
    const ITEMS_PER_PAGE = 20;

    // Date filters
    const [filterFechaDesde, setFilterFechaDesde] = useState('');
    const [filterFechaHasta, setFilterFechaHasta] = useState('');
    const [filterPeriodo, setFilterPeriodo] = useState<string>(''); // 'este_mes', 'mes_anterior', 'custom'

    // Oficina filter with autocomplete
    const [filterOficinaId, setFilterOficinaId] = useState<number | null>(null);
    const [filterOficinaSearch, setFilterOficinaSearch] = useState('');
    const [filterOficinaSelected, setFilterOficinaSelected] = useState<Oficina | null>(null);
    const [allOficinas, setAllOficinas] = useState<Oficina[]>([]);
    const [filteredOficinas, setFilteredOficinas] = useState<Oficina[]>([]);
    const [showOficinaSuggestions, setShowOficinaSuggestions] = useState(false);


    // Assign Multiple Oficinas Modal states
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
    const [oficinasConContrato, setOficinasConContrato] = useState<OficinaConContrato[]>([]);
    const [loadingOficinasConContrato, setLoadingOficinasConContrato] = useState(false);
    const [oficinasSeleccionadas, setOficinasSeleccionadas] = useState<OficinaAsignacion[]>([]);
    const [assigning, setAssigning] = useState(false);

    // PDF Viewer modal
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');

    // Edit modal states
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingFactura, setEditingFactura] = useState<Factura | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        proveedor_id: 0,
        oficina_id: null as number | null,
        numero_factura: '',
        cufe: '',
        fecha_factura: '',
        fecha_vencimiento: '',
        valor: '',
        estado: 'PENDIENTE',
        url_factura: '',
        observaciones: ''
    });

    // Edit modal - proveedor/oficina search states
    const [editProveedores, setEditProveedores] = useState<Proveedor[]>([]);
    const [editProveedorSearch, setEditProveedorSearch] = useState('');
    const [loadingProveedores, setLoadingProveedores] = useState(false);
    const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);

    // Edit modal - oficinas con contrato
    const [editOficinasConContrato, setEditOficinasConContrato] = useState<OficinaConContrato[]>([]);
    const [loadingEditOficinasConContrato, setLoadingEditOficinasConContrato] = useState(false);
    const [selectedOficinaConContrato, setSelectedOficinaConContrato] = useState<OficinaConContrato | null>(null);

    // Legacy edit oficina states (keep for fallback search)
    const [editOficinas, setEditOficinas] = useState<Oficina[]>([]);
    const [editOficinaSearch, setEditOficinaSearch] = useState('');
    const [loadingEditOficinas, setLoadingEditOficinas] = useState(false);
    const [selectedOficina, setSelectedOficina] = useState<Oficina | null>(null);

    // Stats
    const [stats, setStats] = useState<{
        total: number;
        pendientes: number;
        asignadas: number;
        pagadas: number;
        sin_contrato: number;
    } | null>(null);

    // Multi-select for consolidado
    const [selectedFacturaIds, setSelectedFacturaIds] = useState<Set<number>>(new Set());
    const [generatingConsolidado, setGeneratingConsolidado] = useState(false);

    // Archivo Plano generation
    const [generatingArchivoPlano, setGeneratingArchivoPlano] = useState(false);
    const [isArchivoPlanoModalOpen, setIsArchivoPlanoModalOpen] = useState(false);
    const [archivoPlanoConfig, setArchivoPlanoConfig] = useState({
        tiene_iva: true,
        porcentaje_retefuente: 0,  // 0 = sin retefuente, 4 = 4%, 6 = 6%
        numedoc: 1290
    });
    const [loadingConsecutivo, setLoadingConsecutivo] = useState(false);
    const [consecutivoManager, setConsecutivoManager] = useState<{
        consecutivo: number | null;
        nombre_documento: string | null;
        cargado: boolean;
    }>({ consecutivo: null, nombre_documento: null, cargado: false });

    // Historial modal - previous invoices for same proveedor + oficina
    const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
    const [historialFacturas, setHistorialFacturas] = useState<Factura[]>([]);
    const [loadingHistorial, setLoadingHistorial] = useState(false);
    const [historialInfo, setHistorialInfo] = useState<{
        proveedorNombre: string;
        oficinaNombre: string;
        proveedorId: number;
        oficinaId: number;
    } | null>(null);

    // Load historical invoices for a proveedor + oficina
    const loadHistorialFacturas = async (
        proveedorId: number,
        oficinaId: number,
        proveedorNombre: string,
        oficinaNombre: string
    ) => {
        setLoadingHistorial(true);
        setHistorialInfo({ proveedorId, oficinaId, proveedorNombre, oficinaNombre });
        setIsHistorialModalOpen(true);

        try {
            const params = new URLSearchParams({
                proveedor_id: proveedorId.toString(),
                oficina_id: oficinaId.toString(),
                limit: '50'
            });
            const res = await fetch(`${API_URL}/facturas/?${params}`);
            if (res.ok) {
                setHistorialFacturas(await res.json());
            }
        } catch (error) {
            console.error("Failed to load historial", error);
        } finally {
            setLoadingHistorial(false);
        }
    };

    // Toggle factura selection
    const toggleFacturaSelection = (facturaId: number) => {
        setSelectedFacturaIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(facturaId)) {
                newSet.delete(facturaId);
            } else {
                newSet.add(facturaId);
            }
            return newSet;
        });
    };

    // Select/deselect all visible facturas
    const toggleSelectAll = () => {
        if (selectedFacturaIds.size === facturas.length) {
            setSelectedFacturaIds(new Set());
        } else {
            setSelectedFacturaIds(new Set(facturas.map(f => f.id)));
        }
    };

    // Clear selection
    const clearSelection = () => {
        setSelectedFacturaIds(new Set());
    };

    // Generate consolidado Excel
    const generateConsolidado = async () => {
        if (selectedFacturaIds.size === 0) return;

        setGeneratingConsolidado(true);
        try {
            const res = await fetch(`${API_URL}/consolidado/generar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ factura_ids: Array.from(selectedFacturaIds) })
            });

            if (res.ok) {
                // Get filename from Content-Disposition header
                const contentDisposition = res.headers.get('Content-Disposition');
                let filename = '';

                if (contentDisposition) {
                    // Try UTF-8 encoded format first: filename*=UTF-8''encoded_name
                    const utf8Match = contentDisposition.match(/filename\*=UTF-8''(.+)/);
                    if (utf8Match) {
                        filename = decodeURIComponent(utf8Match[1]);
                    } else {
                        // Try standard format: filename="name"
                        const standardMatch = contentDisposition.match(/filename="(.+)"/);
                        if (standardMatch) filename = standardMatch[1];
                    }
                }

                // Fallback: generate filename on frontend if header parsing failed
                if (!filename) {
                    const now = new Date();
                    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
                    const dia = String(now.getDate()).padStart(2, '0');
                    const mes = meses[now.getMonth()];
                    const anio = now.getFullYear();
                    filename = `${dia}-${mes}-${anio}-FO-GFI-02RelaciondeFacturasEntregadasV.2.xlsx`;
                }

                // Download the file
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                // Clear selection after download
                clearSelection();
            } else {
                console.error('Failed to generate consolidado');
            }
        } catch (error) {
            console.error('Error generating consolidado', error);
        } finally {
            setGeneratingConsolidado(false);
        }
    };

    // Generate Archivo Plano Excel
    const generateArchivoPlano = async () => {
        if (selectedFacturaIds.size === 0) return;

        // Get selected facturas
        const selectedFacturasData = facturas.filter(f => selectedFacturaIds.has(f.id));

        // Validate: all must be from same proveedor
        const proveedores = new Set(selectedFacturasData.map(f => f.proveedor_id));
        if (proveedores.size > 1) {
            alert('Todas las facturas seleccionadas deben ser del mismo proveedor');
            return;
        }

        // Check that at least one factura has assigned offices
        let hasOfficinas = false;
        for (const factura of selectedFacturasData) {
            if (factura.oficinas_asignadas && factura.oficinas_asignadas.length > 0) {
                for (const oa of factura.oficinas_asignadas) {
                    if (oa.oficina?.cod_oficina && oa.valor) {
                        hasOfficinas = true;
                        break;
                    }
                }
            }
            if (hasOfficinas) break;
        }

        if (!hasOfficinas) {
            alert('Las facturas seleccionadas no tienen oficinas asignadas con código y valor');
            return;
        }

        // Open config modal
        setIsArchivoPlanoModalOpen(true);

        // Load consecutive from Manager
        loadConsecutivoManager();
    };

    // Load consecutive from Manager Oracle
    const loadConsecutivoManager = async () => {
        setLoadingConsecutivo(true);
        setConsecutivoManager({ consecutivo: null, nombre_documento: null, cargado: false });
        try {
            const res = await fetch(`${API_URL}/consecutivo-documento/DC07`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data) {
                    const nuevoConsecutivo = (data.data.consecutivo_actual || 0) + 1;
                    setConsecutivoManager({
                        consecutivo: nuevoConsecutivo,
                        nombre_documento: data.data.nombre_documento,
                        cargado: true
                    });
                    // Update the numedoc in config
                    setArchivoPlanoConfig(prev => ({
                        ...prev,
                        numedoc: nuevoConsecutivo
                    }));
                }
            }
        } catch (error) {
            console.error('Error loading consecutivo from Manager', error);
        } finally {
            setLoadingConsecutivo(false);
        }
    };

    // Actually generate the file after configuration
    const doGenerateArchivoPlano = async () => {
        setGeneratingArchivoPlano(true);
        setIsArchivoPlanoModalOpen(false);

        try {
            const selectedFacturasData = facturas.filter(f => selectedFacturaIds.has(f.id));
            const firstFactura = selectedFacturasData[0];
            const proveedorNit = firstFactura.proveedor?.nit || '';
            const proveedorNombre = firstFactura.proveedor?.nombre || '';

            // Build facturas array with grouped offices
            const facturasForRequest: Array<{
                numero_factura: string;
                fecha_factura: string | null;
                oficinas: Array<{ cod_oficina: string; valor: number; nombre_oficina: string }>;
            }> = [];

            for (const factura of selectedFacturasData) {
                const oficinas: Array<{ cod_oficina: string; valor: number; nombre_oficina: string }> = [];
                if (factura.oficinas_asignadas && factura.oficinas_asignadas.length > 0) {
                    for (const oa of factura.oficinas_asignadas) {
                        if (oa.oficina?.cod_oficina && oa.valor) {
                            oficinas.push({
                                cod_oficina: oa.oficina.cod_oficina,
                                valor: oa.valor,
                                nombre_oficina: oa.oficina.nombre || oa.oficina.cod_oficina
                            });
                        }
                    }
                }
                if (oficinas.length > 0) {
                    facturasForRequest.push({
                        numero_factura: factura.numero_factura || '',
                        fecha_factura: factura.fecha_factura || null,
                        oficinas: oficinas
                    });
                }
            }

            const requestBody = {
                proveedor_nit: proveedorNit,
                proveedor_nombre: proveedorNombre,
                tiene_iva: archivoPlanoConfig.tiene_iva,
                porcentaje_retefuente: archivoPlanoConfig.porcentaje_retefuente,
                numedoc: archivoPlanoConfig.numedoc,
                facturas: facturasForRequest
            };

            const res = await fetch(`${API_URL}/archivo-plano/generar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (res.ok) {
                const contentDisposition = res.headers.get('Content-Disposition');
                let filename = `archivo_plano_${proveedorNit}.xlsx`;

                if (contentDisposition) {
                    const match = contentDisposition.match(/filename="?([^"]+)"?/);
                    if (match) filename = match[1];
                }

                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                clearSelection();
            } else {
                const error = await res.json();
                alert(`Error: ${error.detail || 'No se pudo generar el archivo plano'}`);
            }
        } catch (error) {
            console.error('Error generating archivo plano', error);
            alert('Error al generar el archivo plano');
        } finally {
            setGeneratingArchivoPlano(false);
        }
    };

    const fetchFacturas = useCallback(async (searchQuery: string, pageNum: number) => {
        setLoading(true);
        try {
            const skip = (pageNum - 1) * ITEMS_PER_PAGE;
            const params = new URLSearchParams({
                skip: skip.toString(),
                limit: ITEMS_PER_PAGE.toString(),
            });

            if (searchQuery.trim()) {
                params.append('search', searchQuery.trim());
            }
            if (filterEstado) {
                params.append('estado', filterEstado);
            }
            if (filterFechaDesde) {
                params.append('fecha_desde', filterFechaDesde);
            }
            if (filterFechaHasta) {
                params.append('fecha_hasta', filterFechaHasta);
            }
            if (filterOficinaId) {
                params.append('oficina_id', filterOficinaId.toString());
            }

            const res = await fetch(`${API_URL}/facturas/?${params}`);
            if (res.ok) {
                const data = await res.json();
                setFacturas(data);
                setHasMore(data.length === ITEMS_PER_PAGE);
            }
        } catch (error) {
            console.error("Failed to fetch facturas", error);
        } finally {
            setLoading(false);
        }
    }, [filterEstado, filterFechaDesde, filterFechaHasta, filterOficinaId]);

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_URL}/facturas/stats/resumen`);
            if (res.ok) {
                setStats(await res.json());
            }
        } catch (error) {
            console.error("Failed to fetch stats", error);
        }
    };

    // Load all oficinas for filter dropdown
    const loadAllOficinas = async () => {
        try {
            const res = await fetch(`${API_URL}/oficinas/?limit=500`);
            if (res.ok) {
                setAllOficinas(await res.json());
            }
        } catch (error) {
            console.error("Failed to load oficinas", error);
        }
    };

    // Handle periodo change - set fechas automatically
    const handlePeriodoChange = (periodo: string) => {
        setFilterPeriodo(periodo);
        const now = new Date();

        if (periodo === 'este_mes') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setFilterFechaDesde(firstDay.toISOString().split('T')[0]);
            setFilterFechaHasta(lastDay.toISOString().split('T')[0]);
        } else if (periodo === 'mes_anterior') {
            const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            setFilterFechaDesde(firstDay.toISOString().split('T')[0]);
            setFilterFechaHasta(lastDay.toISOString().split('T')[0]);
        } else if (periodo === '') {
            setFilterFechaDesde('');
            setFilterFechaHasta('');
        }
        // If 'custom', don't change the dates - let user pick manually
    };

    // Debounced search effect
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchFacturas(search, 1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, filterEstado, filterFechaDesde, filterFechaHasta, filterOficinaId]);

    useEffect(() => {
        fetchStats();
        loadAllOficinas();
    }, []);

    // Filter oficinas based on search input - show all when empty, filter when typing
    useEffect(() => {
        if (filterOficinaSearch.trim() === '') {
            // Show all when empty (will be triggered on focus)
            setFilteredOficinas(allOficinas.slice(0, 15)); // Show first 15
        } else {
            const searchLower = filterOficinaSearch.toLowerCase();
            const filtered = allOficinas.filter(o =>
                (o.nombre || '').toLowerCase().includes(searchLower) ||
                (o.ciudad || '').toLowerCase().includes(searchLower)
            ).slice(0, 15); // Limit to 15 suggestions
            setFilteredOficinas(filtered);
        }
    }, [filterOficinaSearch, allOficinas]);

    // Handle oficina selection from autocomplete
    const handleSelectOficina = (oficina: Oficina) => {
        setFilterOficinaId(oficina.id);
        setFilterOficinaSelected(oficina);
        setFilterOficinaSearch(oficina.nombre || '');
        setShowOficinaSuggestions(false);
    };

    // Clear oficina filter
    const clearOficinaFilter = () => {
        setFilterOficinaId(null);
        setFilterOficinaSelected(null);
        setFilterOficinaSearch('');
        setShowOficinaSuggestions(false);
    };

    // Page change effect
    const [isInitialMount, setIsInitialMount] = useState(true);
    useEffect(() => {
        if (isInitialMount) {
            setIsInitialMount(false);
            return;
        }
        fetchFacturas(search, page);
    }, [page]);

    // Load oficinas with contracts for a specific proveedor
    const loadOficinasConContrato = async (proveedorId: number) => {
        setLoadingOficinasConContrato(true);
        try {
            const res = await fetch(`${API_URL}/contratos/proveedor/${proveedorId}/oficinas`);
            if (res.ok) {
                const data: OficinaConContrato[] = await res.json();
                setOficinasConContrato(data);
            }
        } catch (error) {
            console.error("Failed to load oficinas con contrato", error);
        } finally {
            setLoadingOficinasConContrato(false);
        }
    };

    const openAssignModal = (factura: Factura) => {
        setSelectedFactura(factura);
        setOficinasConContrato([]);

        // Initialize with existing oficinas_asignadas
        const existing: OficinaAsignacion[] = (factura.oficinas_asignadas || []).map(oa => ({
            oficina_id: oa.oficina_id,
            oficina_nombre: oa.oficina?.nombre || '',
            oficina_ciudad: oa.oficina?.ciudad || '',
            contrato_num: oa.contrato?.num_contrato,
            contrato_estado: oa.contrato?.estado,
            valor: oa.valor?.toString() || '0'
        }));
        setOficinasSeleccionadas(existing);

        // Load oficinas with contracts for this proveedor
        if (factura.proveedor_id) {
            loadOficinasConContrato(factura.proveedor_id);
        }
        setIsAssignModalOpen(true);
    };

    // Toggle oficina selection - using functional setState to avoid stale state
    const toggleOficinaSelection = (oc: OficinaConContrato) => {
        setOficinasSeleccionadas(prev => {
            const exists = prev.find(o => o.oficina_id === oc.oficina_id);
            if (exists) {
                // Remove
                return prev.filter(o => o.oficina_id !== oc.oficina_id);
            } else {
                // Add with suggested valor from contract
                return [...prev, {
                    oficina_id: oc.oficina_id,
                    oficina_nombre: oc.oficina_nombre || '',
                    oficina_ciudad: oc.oficina_ciudad || '',
                    contrato_num: oc.contrato_num,
                    contrato_estado: oc.contrato_estado,
                    valor: oc.valor_mensual?.toString() || '0'
                }];
            }
        });
    };

    // Update valor for a selected oficina
    const updateOficinaValor = (oficina_id: number, valor: string) => {
        setOficinasSeleccionadas(prev =>
            prev.map(o => o.oficina_id === oficina_id ? { ...o, valor } : o)
        );
    };

    // Calculate total of selected oficinas
    const getTotalSeleccionado = () => {
        return oficinasSeleccionadas.reduce((sum, o) => sum + (parseFloat(o.valor) || 0), 0);
    };

    const assignMultipleOficinas = async () => {
        if (!selectedFactura || oficinasSeleccionadas.length === 0) return;

        setAssigning(true);
        try {
            const body = {
                oficinas: oficinasSeleccionadas.map(o => ({
                    oficina_id: o.oficina_id,
                    valor: parseFloat(o.valor) || 0
                }))
            };

            const res = await fetch(`${API_URL}/facturas/${selectedFactura.id}/oficinas-multiples`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setIsAssignModalOpen(false);
                setOficinasSeleccionadas([]);
                fetchFacturas(search, page);
                fetchStats();
            }
        } catch (error) {
            console.error("Failed to assign oficinas", error);
        } finally {
            setAssigning(false);
        }
    };

    const openPdfViewer = (url: string) => {
        setPdfUrl(url);
        setIsPdfModalOpen(true);
    };

    const cambiarEstado = async (factura: Factura, nuevoEstado: string) => {
        try {
            await fetch(`${API_URL}/facturas/${factura.id}/estado?nuevo_estado=${nuevoEstado}`, {
                method: 'PUT'
            });
            fetchFacturas(search, page);
            fetchStats();
        } catch (error) {
            console.error("Failed to change estado", error);
        }
    };

    const getEstadoColor = (estado?: string) => {
        switch (estado) {
            case 'PENDIENTE':
                return 'bg-yellow-100 text-yellow-800 border-yellow-300';
            case 'ASIGNADA':
                return 'bg-blue-100 text-blue-800 border-blue-300';
            case 'PAGADA':
                return 'bg-green-100 text-green-800 border-green-300';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    const getBorderColor = (estado?: string) => {
        switch (estado) {
            case 'PENDIENTE':
                return 'border-yellow-500';
            case 'ASIGNADA':
                return 'border-blue-500';
            case 'PAGADA':
                return 'border-green-500';
            default:
                return 'border-gray-300';
        }
    };

    // Load oficinas with contracts for edit modal
    const loadEditOficinasConContrato = async (proveedorId: number) => {
        setLoadingEditOficinasConContrato(true);
        try {
            const res = await fetch(`${API_URL}/contratos/proveedor/${proveedorId}/oficinas`);
            if (res.ok) {
                const data: OficinaConContrato[] = await res.json();
                setEditOficinasConContrato(data);
                // If there's a current oficina, find its contract info
                if (editForm.oficina_id) {
                    const found = data.find(o => o.oficina_id === editForm.oficina_id);
                    setSelectedOficinaConContrato(found || null);
                }
            }
        } catch (error) {
            console.error("Failed to load oficinas con contrato for edit", error);
        } finally {
            setLoadingEditOficinasConContrato(false);
        }
    };

    // Edit modal functions
    const openEditModal = (factura: Factura) => {
        setEditingFactura(factura);
        setSelectedProveedor(factura.proveedor || null);
        setSelectedOficina(factura.oficina || null);
        setSelectedOficinaConContrato(null);
        setEditProveedorSearch('');
        setEditOficinaSearch('');
        setEditProveedores([]);
        setEditOficinas([]);
        setEditOficinasConContrato([]);
        setEditForm({
            proveedor_id: factura.proveedor_id,
            oficina_id: factura.oficina_id || null,
            numero_factura: factura.numero_factura || '',
            cufe: factura.cufe || '',
            fecha_factura: factura.fecha_factura || '',
            fecha_vencimiento: factura.fecha_vencimiento || '',
            valor: factura.valor?.toString() || '',
            estado: factura.estado || 'PENDIENTE',
            url_factura: factura.url_factura || '',
            observaciones: factura.observaciones || ''
        });
        // Load oficinas with contracts for this proveedor
        if (factura.proveedor_id) {
            loadEditOficinasConContrato(factura.proveedor_id);
        }
        setIsEditModalOpen(true);
    };

    // Search proveedores for edit modal
    const searchProveedores = async (query: string) => {
        if (query.length < 2) return;
        setLoadingProveedores(true);
        try {
            const res = await fetch(`${API_URL}/proveedores/?limit=100`);
            if (res.ok) {
                const data: Proveedor[] = await res.json();
                const filtered = data.filter(p =>
                    p.nombre.toLowerCase().includes(query.toLowerCase()) ||
                    p.nit.toLowerCase().includes(query.toLowerCase())
                );
                setEditProveedores(filtered);
            }
        } catch (error) {
            console.error("Failed to search proveedores", error);
        } finally {
            setLoadingProveedores(false);
        }
    };

    // Search oficinas for edit modal
    const searchEditOficinas = async (query: string) => {
        if (query.length < 2) return;
        setLoadingEditOficinas(true);
        try {
            const params = new URLSearchParams({ search: query, limit: '50' });
            const res = await fetch(`${API_URL}/oficinas/?${params}`);
            if (res.ok) {
                setEditOficinas(await res.json());
            }
        } catch (error) {
            console.error("Failed to search oficinas", error);
        } finally {
            setLoadingEditOficinas(false);
        }
    };

    // Debounce search for proveedores
    useEffect(() => {
        if (editProveedorSearch.length >= 2) {
            const timer = setTimeout(() => searchProveedores(editProveedorSearch), 300);
            return () => clearTimeout(timer);
        } else {
            setEditProveedores([]);
        }
    }, [editProveedorSearch]);

    // Debounce search for oficinas in edit modal
    useEffect(() => {
        if (editOficinaSearch.length >= 2) {
            const timer = setTimeout(() => searchEditOficinas(editOficinaSearch), 300);
            return () => clearTimeout(timer);
        } else {
            setEditOficinas([]);
        }
    }, [editOficinaSearch]);

    const saveFactura = async () => {
        if (!editingFactura || !editForm.proveedor_id) return;

        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/facturas/${editingFactura.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    proveedor_id: editForm.proveedor_id,
                    oficina_id: editForm.oficina_id,
                    contrato_id: null,
                    numero_factura: editForm.numero_factura || null,
                    cufe: editForm.cufe || null,
                    fecha_factura: editForm.fecha_factura || null,
                    fecha_vencimiento: editForm.fecha_vencimiento || null,
                    valor: editForm.valor ? parseFloat(editForm.valor) : null,
                    estado: editForm.estado,
                    url_factura: editForm.url_factura || null,
                    observaciones: editForm.observaciones || null
                })
            });

            if (res.ok) {
                // If oficina was set, call asignar-oficina to auto-detect contrato
                if (editForm.oficina_id) {
                    await fetch(`${API_URL}/facturas/${editingFactura.id}/asignar-oficina`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ oficina_id: editForm.oficina_id })
                    });
                }
                setIsEditModalOpen(false);
                setEditingFactura(null);
                setSelectedProveedor(null);
                setSelectedOficina(null);
                fetchFacturas(search, page);
                fetchStats();
            } else {
                console.error("Failed to save factura");
            }
        } catch (error) {
            console.error("Failed to save factura", error);
        } finally {
            setSaving(false);
        }
    };

    const deleteFactura = async (factura: Factura) => {
        if (!confirm(`¿Está seguro de eliminar la factura ${factura.numero_factura || factura.id}?`)) {
            return;
        }

        try {
            const res = await fetch(`${API_URL}/facturas/${factura.id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                fetchFacturas(search, page);
                fetchStats();
            }
        } catch (error) {
            console.error("Failed to delete factura", error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header with Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Facturas</h1>
                    <p className="text-gray-500 mt-1">Gestiona las facturas de proveedores</p>
                </div>

                {/* Stats Cards */}
                {stats && (
                    <div className="flex gap-3">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-center">
                            <div className="text-2xl font-bold text-yellow-700">{stats.pendientes}</div>
                            <div className="text-xs text-yellow-600">Pendientes</div>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-center">
                            <div className="text-2xl font-bold text-blue-700">{stats.asignadas}</div>
                            <div className="text-xs text-blue-600">Asignadas</div>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-center">
                            <div className="text-2xl font-bold text-green-700">{stats.pagadas}</div>
                            <div className="text-xs text-green-600">Pagadas</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Action Panel - 3 buttons */}
            {selectedFacturaIds.size > 0 && (
                <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 bg-gray-900 text-white p-4 rounded-xl shadow-2xl">
                    {/* Header with count */}
                    <div className="flex items-center justify-between gap-4 pb-2 border-b border-gray-700">
                        <div className="flex items-center gap-2">
                            <span className="bg-emerald-500 px-2 py-1 rounded-lg font-bold text-sm">
                                {selectedFacturaIds.size}
                            </span>
                            <span className="text-sm text-gray-300">facturas seleccionadas</span>
                        </div>
                        <button
                            onClick={clearSelection}
                            className="text-gray-400 hover:text-white p-1"
                            title="Limpiar selección"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 pt-1">
                        {/* Generar Consolidado */}
                        <button
                            onClick={generateConsolidado}
                            disabled={generatingConsolidado}
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            {generatingConsolidado ? (
                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            )}
                            Generar Consolidado
                        </button>

                        {/* Generar Archivo Plano */}
                        <button
                            onClick={generateArchivoPlano}
                            disabled={generatingArchivoPlano}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            {generatingArchivoPlano ? (
                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            )}
                            Generar Archivo Plano
                        </button>

                        {/* Generar Causación en Manager */}
                        <button
                            onClick={() => alert('Funcionalidad pendiente: Generar Causación en Manager')}
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                            Causación en Manager
                        </button>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                {/* Search Bar */}
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Buscar por proveedor, NIT, factura, CUFE..."
                        className="w-full px-4 py-3 pl-11 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <svg className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {loading && (
                        <div className="absolute right-4 top-3.5">
                            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                        </div>
                    )}
                </div>

                {/* Estado Filter */}
                <select
                    className="px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500"
                    value={filterEstado}
                    onChange={(e) => setFilterEstado(e.target.value)}
                >
                    <option value="">Todos los estados</option>
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="ASIGNADA">Asignada</option>
                    <option value="PAGADA">Pagada</option>
                </select>

                {/* Periodo Filter - filters by when invoice was received */}
                <select
                    className="px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500"
                    value={filterPeriodo}
                    onChange={(e) => handlePeriodoChange(e.target.value)}
                >
                    <option value="">Fecha recepción: Todas</option>
                    <option value="este_mes">Recibidas este mes</option>
                    <option value="mes_anterior">Recibidas mes anterior</option>
                    <option value="custom">Fecha personalizada</option>
                </select>

                {/* Custom Date Range - only show when periodo is 'custom' */}
                {filterPeriodo === 'custom' && (
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={filterFechaDesde}
                            onChange={(e) => setFilterFechaDesde(e.target.value)}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <span className="text-gray-500">-</span>
                        <input
                            type="date"
                            value={filterFechaHasta}
                            onChange={(e) => setFilterFechaHasta(e.target.value)}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>
                )}

                {/* Oficina Filter with Autocomplete */}
                <div className="relative">
                    <div className="flex items-center">
                        <input
                            type="text"
                            placeholder="Buscar oficina..."
                            className={`px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 w-48 ${filterOficinaSelected ? 'pr-8' : ''}`}
                            value={filterOficinaSearch}
                            onChange={(e) => {
                                setFilterOficinaSearch(e.target.value);
                                setShowOficinaSuggestions(true);
                                if (e.target.value === '') {
                                    setFilterOficinaId(null);
                                    setFilterOficinaSelected(null);
                                }
                            }}
                            onFocus={() => setShowOficinaSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowOficinaSuggestions(false), 200)}
                        />
                        {filterOficinaSelected && (
                            <button
                                type="button"
                                onClick={clearOficinaFilter}
                                className="absolute right-2 text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Suggestions dropdown */}
                    {showOficinaSuggestions && filteredOficinas.length > 0 && (
                        <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                            {filteredOficinas.map(o => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => handleSelectOficina(o)}
                                    className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors border-b last:border-b-0"
                                >
                                    <div className="font-medium text-gray-800">{o.nombre}</div>
                                    <div className="text-xs text-gray-500">{o.ciudad}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Facturas List */}
            <div className="space-y-4">
                {facturas.length === 0 && !loading ? (
                    <div className="text-center py-10 text-gray-500 bg-white rounded-xl shadow-sm border border-gray-100">
                        No se encontraron facturas.
                    </div>
                ) : (
                    facturas.map((f) => (
                        <div
                            key={f.id}
                            className={`card hover:shadow-xl transition-shadow duration-300 border-l-4 ${getBorderColor(f.estado)} ${selectedFacturaIds.has(f.id) ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                        >
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                {/* Selection Checkbox */}
                                <div className="flex items-start">
                                    <input
                                        type="checkbox"
                                        checked={selectedFacturaIds.has(f.id)}
                                        onChange={() => toggleFacturaSelection(f.id)}
                                        className="w-5 h-5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer mt-1"
                                    />
                                </div>
                                {/* Provider Info */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-xl font-bold text-gray-800">
                                            {f.proveedor?.nombre || 'Sin Proveedor'}
                                        </h3>
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getEstadoColor(f.estado)}`}>
                                            {f.estado || 'PENDIENTE'}
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-500 font-medium">
                                        NIT: {f.proveedor?.nit || '-'}
                                    </div>

                                    {/* Oficinas Asignadas */}
                                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                        {f.oficinas_asignadas && f.oficinas_asignadas.length > 0 ? (
                                            <div className="space-y-2">
                                                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                    </svg>
                                                    Oficinas Asignadas ({f.oficinas_asignadas.length})
                                                </div>
                                                {f.oficinas_asignadas.map((oa) => (
                                                    <div key={oa.id} className="flex justify-between items-center bg-white rounded-md p-2 border border-gray-100">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-gray-800 text-sm truncate">
                                                                {oa.oficina?.nombre || 'Oficina'}
                                                            </div>
                                                            <div className="text-xs text-gray-500 flex items-center gap-2">
                                                                <span>{oa.oficina?.ciudad || ''}</span>
                                                                {oa.contrato && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span className="font-mono">{oa.contrato.num_contrato}</span>
                                                                        <span className={`px-1.5 py-0.5 rounded text-xs ${oa.contrato.estado === 'ACTIVO'
                                                                            ? 'bg-green-100 text-green-700'
                                                                            : 'bg-red-100 text-red-700'
                                                                            }`}>
                                                                            {oa.contrato.estado}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {/* Historial button */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    loadHistorialFacturas(
                                                                        f.proveedor_id,
                                                                        oa.oficina_id,
                                                                        f.proveedor?.nombre || 'Proveedor',
                                                                        oa.oficina?.nombre || 'Oficina'
                                                                    );
                                                                }}
                                                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                                                            >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                                Historial
                                                            </button>
                                                            <div className="font-bold text-gray-900">
                                                                ${Number(oa.valor || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {/* Total suma de valores asignados */}
                                                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                                    <span className="text-xs font-medium text-gray-600">Total asignado:</span>
                                                    <span className="font-bold text-gray-900">
                                                        ${f.oficinas_asignadas.reduce((sum, oa) => sum + (Number(oa.valor) || 0), 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : f.oficina ? (
                                            // Fallback: Legacy single oficina display
                                            <>
                                                <div className="text-sm">
                                                    <span className="font-semibold text-gray-700">Oficina:</span>{' '}
                                                    <span className="text-gray-600">{f.oficina.nombre} ({f.oficina.ciudad})</span>
                                                </div>
                                                {f.contrato && (
                                                    <div className="text-sm mt-1">
                                                        <span className="font-semibold text-gray-700">Contrato:</span>{' '}
                                                        <span className="text-gray-600 font-mono">{f.contrato.num_contrato}</span>
                                                        <span className={`ml-2 px-2 py-0.5 rounded text-xs ${f.contrato.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                            }`}>
                                                            {f.contrato.estado}
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-sm text-yellow-600 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                                Sin oficinas asignadas
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Invoice Details */}
                                <div className="flex-1 border-l border-gray-100 md:pl-6">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <span className="block text-gray-400 text-xs uppercase">Factura #</span>
                                            <span className="font-mono text-gray-700">{f.numero_factura || '-'}</span>
                                        </div>
                                        <div>
                                            <span className="block text-gray-400 text-xs uppercase">Valor</span>
                                            <span className="text-lg font-bold text-gray-900">
                                                ${Number(f.valor || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-gray-400 text-xs uppercase">Fecha Factura</span>
                                            <span className="text-gray-700">{f.fecha_factura || '-'}</span>
                                        </div>
                                        <div>
                                            <span className="block text-gray-400 text-xs uppercase">Vencimiento</span>
                                            <span className="text-gray-700">{f.fecha_vencimiento || '-'}</span>
                                        </div>
                                    </div>

                                    {f.cufe && (
                                        <div className="mt-2">
                                            <span className="block text-gray-400 text-xs uppercase">CUFE</span>
                                            <span className="font-mono text-xs text-gray-500 break-all">{f.cufe}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col justify-center gap-2 md:w-40">
                                    {/* Edit Button */}
                                    <button
                                        onClick={() => openEditModal(f)}
                                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Editar
                                    </button>

                                    {/* Assign Oficinas Button */}
                                    <button
                                        onClick={() => openAssignModal(f)}
                                        className={`flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${(f.oficinas_asignadas && f.oficinas_asignadas.length > 0) || f.oficina_id
                                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                                            }`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                        {f.oficinas_asignadas && f.oficinas_asignadas.length > 0
                                            ? `Oficinas (${f.oficinas_asignadas.length})`
                                            : f.oficina_id
                                                ? 'Cambiar Oficina'
                                                : 'Asignar Oficinas'}
                                    </button>

                                    {/* View Invoice Button */}
                                    {f.url_factura && (
                                        <button
                                            onClick={() => {
                                                setPdfUrl(`${API_URL}/facturas/${f.id}/ver`);
                                                setIsPdfModalOpen(true);
                                            }}
                                            className="flex items-center justify-center gap-1 px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                            </svg>
                                            Ver Factura
                                        </button>
                                    )}

                                    {/* Estado Toggle */}
                                    {f.estado === 'ASIGNADA' && (
                                        <button
                                            onClick={() => cambiarEstado(f, 'PAGADA')}
                                            className="flex items-center justify-center gap-1 px-3 py-2 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            Marcar Pagada
                                        </button>
                                    )}

                                    {/* Delete Button */}
                                    <button
                                        onClick={() => deleteFactura(f)}
                                        className="flex items-center justify-center gap-1 px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors opacity-60 hover:opacity-100"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Eliminar
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-center items-center gap-4 py-4">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    ← Anterior
                </button>

                <span className="text-sm text-gray-600">
                    Página {page}
                </span>

                <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={!hasMore || loading}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Siguiente →
                </button>
            </div>

            {/* Assign Multiple Oficinas Modal */}
            <Modal
                isOpen={isAssignModalOpen}
                onClose={() => { setIsAssignModalOpen(false); setOficinasSeleccionadas([]); }}
                title="Asignar Oficinas"
                onSubmit={assignMultipleOficinas}
                submitLabel={assigning ? 'Guardando...' : `Guardar (${oficinasSeleccionadas.length} oficinas)`}
                submitDisabled={oficinasSeleccionadas.length === 0 || assigning}
            >
                <div className="space-y-4">
                    {/* Info banner */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-700">
                            Seleccione las oficinas y asigne un valor a cada una. Los contratos se detectan automáticamente.
                        </p>
                    </div>

                    {/* Factura info */}
                    {selectedFactura && (
                        <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-sm">
                                        <span className="font-semibold">Proveedor:</span>{' '}
                                        {selectedFactura.proveedor?.nombre}
                                    </div>
                                    <div className="text-sm">
                                        <span className="font-semibold">Factura:</span>{' '}
                                        {selectedFactura.numero_factura || 'Sin número'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm text-gray-600">Valor total:</div>
                                    <div className="font-bold text-lg">${Number(selectedFactura.valor || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Selected oficinas with values */}
                    {oficinasSeleccionadas.length > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="text-sm font-semibold text-green-800 mb-2">
                                Oficinas seleccionadas ({oficinasSeleccionadas.length}):
                            </div>
                            <div className="space-y-2">
                                {oficinasSeleccionadas.map((os) => (
                                    <div key={os.oficina_id} className="flex items-center gap-2 bg-white rounded p-2 border border-green-200">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-gray-900 text-sm truncate">{os.oficina_nombre}</div>
                                            <div className="text-xs text-gray-500">{os.oficina_ciudad} • {os.contrato_num || 'Sin contrato'}</div>
                                        </div>
                                        <input
                                            type="number"
                                            value={os.valor}
                                            onChange={(e) => updateOficinaValor(os.oficina_id, e.target.value)}
                                            className="w-28 px-2 py-1 border rounded text-sm text-right"
                                            placeholder="Valor"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setOficinasSeleccionadas(prev => prev.filter(o => o.oficina_id !== os.oficina_id))}
                                            className="text-red-500 hover:text-red-700 p-1"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 pt-2 border-t border-green-200 flex justify-between items-center">
                                <span className="text-sm font-medium text-green-800">Total asignado:</span>
                                <span className="font-bold text-green-800">${getTotalSeleccionado().toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    )}

                    {/* Available oficinas to select */}
                    {loadingOficinasConContrato ? (
                        <div className="text-center py-4">
                            <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                            <p className="text-sm text-gray-500 mt-2">Cargando oficinas con contratos...</p>
                        </div>
                    ) : oficinasConContrato.length > 0 ? (
                        <>
                            {/* Header with "Asignar Todas" checkbox */}
                            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border">
                                <span className="text-sm font-medium text-gray-700">
                                    Oficinas disponibles ({oficinasConContrato.length})
                                </span>
                                <label className="flex items-center gap-2 cursor-pointer bg-green-100 hover:bg-green-200 px-3 py-2 rounded-lg transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={oficinasSeleccionadas.length === oficinasConContrato.length && oficinasConContrato.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setOficinasSeleccionadas(oficinasConContrato.map(oc => ({
                                                    oficina_id: oc.oficina_id,
                                                    oficina_nombre: oc.oficina_nombre || '',
                                                    oficina_ciudad: oc.oficina_ciudad || '',
                                                    contrato_num: oc.contrato_num,
                                                    contrato_estado: oc.contrato_estado,
                                                    valor: oc.valor_mensual?.toString() || '0'
                                                })));
                                            } else {
                                                setOficinasSeleccionadas([]);
                                            }
                                        }}
                                        className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                    />
                                    <span className="text-sm font-semibold text-green-800">Asignar todas</span>
                                </label>
                            </div>
                            <div className="max-h-48 overflow-y-auto border rounded-lg">
                                {oficinasConContrato.map((oc) => {
                                    const isSelected = oficinasSeleccionadas.some(o => o.oficina_id === oc.oficina_id);
                                    return (
                                        <button
                                            key={`${oc.oficina_id}-${oc.contrato_id}`}
                                            type="button"
                                            onClick={() => toggleOficinaSelection(oc)}
                                            className={`w-full text-left px-4 py-3 border-b last:border-b-0 transition-all ${isSelected
                                                ? 'bg-green-50 border-l-4 border-l-green-500'
                                                : 'hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'
                                                        }`}>
                                                        {isSelected && (
                                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-gray-900">{oc.oficina_nombre}</div>
                                                        <div className="text-sm text-gray-500">
                                                            {oc.oficina_ciudad}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${oc.contrato_estado === 'ACTIVO'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-red-100 text-red-700'
                                                        }`}>
                                                        {oc.contrato_estado}
                                                    </span>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {oc.contrato_num}
                                                    </div>
                                                    {oc.valor_mensual && (
                                                        <div className="text-xs text-blue-600 font-medium">
                                                            ${oc.valor_mensual.toLocaleString()}/mes
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <p className="text-sm text-yellow-700">
                                Este proveedor no tiene contratos asociados a oficinas.
                            </p>
                        </div>
                    )}
                </div>
            </Modal>

            {/* PDF Viewer Modal */}
            {isPdfModalOpen && (
                <div className="fixed inset-0 z-[60] overflow-hidden">
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => setIsPdfModalOpen(false)}
                    />
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="relative w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50">
                                <h2 className="text-xl font-semibold text-gray-900">Visor de Factura</h2>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={pdfUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Abrir en nueva pestaña
                                    </a>
                                    <button
                                        onClick={() => setIsPdfModalOpen(false)}
                                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                                    >
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* PDF iframe */}
                            <iframe
                                src={pdfUrl}
                                className="w-full h-[calc(100%-65px)]"
                                title="Visor de Factura"
                            />
                        </div>
                    </div>
                </div>
            )}

            <Modal
                isOpen={isEditModalOpen}
                onClose={() => { setIsEditModalOpen(false); setEditingFactura(null); setSelectedProveedor(null); setSelectedOficina(null); }}
                title="Editar Factura"
                onSubmit={saveFactura}
                submitLabel={saving ? 'Guardando...' : 'Guardar'}
                submitDisabled={saving || !editForm.proveedor_id}
            >
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {/* Proveedor Selector */}
                    <FormField label="Proveedor" required>
                        {/* Current selection */}
                        {selectedProveedor && (
                            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                                <div>
                                    <div className="font-medium text-gray-900">{selectedProveedor.nombre}</div>
                                    <div className="text-sm text-gray-500">NIT: {selectedProveedor.nit}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedProveedor(null);
                                        setEditForm({ ...editForm, proveedor_id: 0 });
                                    }}
                                    className="text-red-500 hover:text-red-700 text-sm"
                                >
                                    Cambiar
                                </button>
                            </div>
                        )}

                        {/* Search input */}
                        {!selectedProveedor && (
                            <>
                                <input
                                    type="text"
                                    placeholder="Buscar proveedor por nombre o NIT..."
                                    className={inputClassName}
                                    value={editProveedorSearch}
                                    onChange={(e) => setEditProveedorSearch(e.target.value)}
                                />
                                {loadingProveedores && (
                                    <div className="text-center py-2">
                                        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                                    </div>
                                )}
                                {editProveedores.length > 0 && (
                                    <div className="max-h-40 overflow-y-auto border rounded-lg mt-2">
                                        {editProveedores.map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedProveedor(p);
                                                    setEditForm({ ...editForm, proveedor_id: p.id });
                                                    setEditProveedorSearch('');
                                                    setEditProveedores([]);
                                                }}
                                                className="w-full text-left px-4 py-2 border-b last:border-b-0 hover:bg-gray-50"
                                            >
                                                <div className="font-medium text-gray-900">{p.nombre}</div>
                                                <div className="text-sm text-gray-500">NIT: {p.nit}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </FormField>

                    {/* Oficina Selector */}
                    <FormField label="Oficina">
                        {/* Current selection with contract info */}
                        {(selectedOficinaConContrato || selectedOficina) && (
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3 mb-2">
                                <div>
                                    <div className="font-medium text-gray-900">
                                        {selectedOficinaConContrato?.oficina_nombre || selectedOficina?.nombre}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {selectedOficinaConContrato?.oficina_ciudad || selectedOficina?.ciudad} - {selectedOficinaConContrato?.oficina_direccion || selectedOficina?.direccion || 'Sin dirección'}
                                    </div>
                                    {selectedOficinaConContrato && (
                                        <div className="text-xs text-gray-600 mt-1">
                                            <span className="font-medium">Contrato:</span>{' '}
                                            <span className="font-mono">{selectedOficinaConContrato.contrato_num}</span>
                                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${selectedOficinaConContrato.contrato_estado === 'ACTIVO'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-red-100 text-red-700'
                                                }`}>
                                                {selectedOficinaConContrato.contrato_estado}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedOficina(null);
                                        setSelectedOficinaConContrato(null);
                                        setEditForm({ ...editForm, oficina_id: null });
                                    }}
                                    className="text-red-500 hover:text-red-700 text-sm"
                                >
                                    Quitar
                                </button>
                            </div>
                        )}

                        {/* Oficinas with contracts for this proveedor */}
                        {!selectedOficinaConContrato && !selectedOficina && selectedProveedor && (
                            <>
                                {loadingEditOficinasConContrato ? (
                                    <div className="text-center py-4">
                                        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                                        <p className="text-xs text-gray-500 mt-1">Cargando oficinas...</p>
                                    </div>
                                ) : editOficinasConContrato.length > 0 ? (
                                    <>
                                        <div className="text-xs font-medium text-gray-600 mb-2">
                                            Oficinas con contrato:
                                        </div>
                                        <div className="max-h-40 overflow-y-auto border rounded-lg">
                                            {editOficinasConContrato.map((oc) => (
                                                <button
                                                    key={`${oc.oficina_id}-${oc.contrato_id}`}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedOficinaConContrato(oc);
                                                        setEditForm({ ...editForm, oficina_id: oc.oficina_id });
                                                    }}
                                                    className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-gray-50"
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="font-medium text-gray-900 text-sm">{oc.oficina_nombre}</div>
                                                        <span className={`px-2 py-0.5 rounded text-xs ${oc.contrato_estado === 'ACTIVO'
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-red-100 text-red-700'
                                                            }`}>
                                                            {oc.contrato_estado}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {oc.oficina_ciudad} • Contrato: {oc.contrato_num}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                                        Este proveedor no tiene contratos. Puede buscar oficinas manualmente.
                                    </div>
                                )}

                                {/* Fallback search for oficinas without contracts */}
                                {editOficinasConContrato.length === 0 && (
                                    <>
                                        <input
                                            type="text"
                                            placeholder="Buscar oficina por nombre, ciudad..."
                                            className={`${inputClassName} mt-2`}
                                            value={editOficinaSearch}
                                            onChange={(e) => setEditOficinaSearch(e.target.value)}
                                        />
                                        {loadingEditOficinas && (
                                            <div className="text-center py-2">
                                                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                                            </div>
                                        )}
                                        {editOficinas.length > 0 && (
                                            <div className="max-h-40 overflow-y-auto border rounded-lg mt-2">
                                                {editOficinas.map((o) => (
                                                    <button
                                                        key={o.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedOficina(o);
                                                            setEditForm({ ...editForm, oficina_id: o.id });
                                                            setEditOficinaSearch('');
                                                            setEditOficinas([]);
                                                        }}
                                                        className="w-full text-left px-4 py-2 border-b last:border-b-0 hover:bg-gray-50"
                                                    >
                                                        <div className="font-medium text-gray-900">{o.nombre}</div>
                                                        <div className="text-sm text-gray-500">{o.ciudad} - {o.direccion || 'Sin dirección'}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {!selectedProveedor && (
                            <p className="text-sm text-gray-500">Seleccione primero un proveedor</p>
                        )}
                    </FormField>

                    {/* Contrato Info (if detected) */}
                    {editingFactura?.contrato && (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div className="text-sm">
                                <span className="font-semibold text-gray-700">Contrato detectado:</span>{' '}
                                <span className="text-gray-600 font-mono">{editingFactura.contrato.num_contrato}</span>
                                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${editingFactura.contrato.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                    {editingFactura.contrato.estado}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Número de Factura */}
                    <FormField label="Número de Factura">
                        <input
                            type="text"
                            className={inputClassName}
                            value={editForm.numero_factura}
                            onChange={(e) => setEditForm({ ...editForm, numero_factura: e.target.value })}
                            placeholder="Ej: FAC-2024-001234"
                        />
                    </FormField>

                    {/* CUFE */}
                    <FormField label="CUFE">
                        <input
                            type="text"
                            className={inputClassName}
                            value={editForm.cufe}
                            onChange={(e) => setEditForm({ ...editForm, cufe: e.target.value })}
                            placeholder="Código único de factura electrónica"
                        />
                    </FormField>

                    {/* Fechas */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Fecha Factura">
                            <input
                                type="date"
                                className={inputClassName}
                                value={editForm.fecha_factura}
                                onChange={(e) => setEditForm({ ...editForm, fecha_factura: e.target.value })}
                            />
                        </FormField>
                        <FormField label="Fecha Vencimiento">
                            <input
                                type="date"
                                className={inputClassName}
                                value={editForm.fecha_vencimiento}
                                onChange={(e) => setEditForm({ ...editForm, fecha_vencimiento: e.target.value })}
                            />
                        </FormField>
                    </div>

                    {/* Valor */}
                    <FormField label="Valor">
                        <input
                            type="number"
                            step="0.01"
                            className={inputClassName}
                            value={editForm.valor}
                            onChange={(e) => setEditForm({ ...editForm, valor: e.target.value })}
                            placeholder="Ej: 150000.00"
                        />
                    </FormField>

                    {/* Estado */}
                    <FormField label="Estado">
                        <select
                            className={inputClassName}
                            value={editForm.estado}
                            onChange={(e) => setEditForm({ ...editForm, estado: e.target.value })}
                        >
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="ASIGNADA">Asignada</option>
                            <option value="PAGADA">Pagada</option>
                        </select>
                    </FormField>

                    {/* URL Factura */}
                    <FormField label="URL de la Factura">
                        <input
                            type="url"
                            className={inputClassName}
                            value={editForm.url_factura}
                            onChange={(e) => setEditForm({ ...editForm, url_factura: e.target.value })}
                            placeholder="https://..."
                        />
                        {editForm.url_factura && (
                            <a
                                href={editForm.url_factura}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                            >
                                Ver factura actual →
                            </a>
                        )}
                    </FormField>

                    {/* Observaciones */}
                    <FormField label="Observaciones">
                        <textarea
                            className={inputClassName}
                            rows={3}
                            value={editForm.observaciones}
                            onChange={(e) => setEditForm({ ...editForm, observaciones: e.target.value })}
                            placeholder="Notas adicionales..."
                        />
                    </FormField>
                </div>
            </Modal>

            {/* Historial Modal - Previous invoices for proveedor + oficina */}
            {isHistorialModalOpen && (
                <div className="fixed inset-0 z-50 overflow-hidden">
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setIsHistorialModalOpen(false)}
                    />
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="relative w-full max-w-3xl max-h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50">
                                <div>
                                    <h2 className="text-xl font-semibold text-gray-900">Historial de Facturas</h2>
                                    {historialInfo && (
                                        <p className="text-sm text-gray-500 mt-1">
                                            {historialInfo.proveedorNombre} • {historialInfo.oficinaNombre}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => setIsHistorialModalOpen(false)}
                                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                                >
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Content */}
                            <div className="overflow-y-auto max-h-[calc(80vh-100px)] p-6">
                                {loadingHistorial ? (
                                    <div className="flex justify-center py-10">
                                        <div className="animate-spin h-8 w-8 border-3 border-blue-500 border-t-transparent rounded-full"></div>
                                    </div>
                                ) : historialFacturas.length === 0 ? (
                                    <div className="text-center py-10 text-gray-500">
                                        No se encontraron facturas anteriores para esta combinación.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {historialFacturas.map((hf) => (
                                            <div
                                                key={hf.id}
                                                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors"
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono font-medium text-gray-800">
                                                            {hf.numero_factura || `#${hf.id}`}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${hf.estado === 'PAGADA' ? 'bg-green-100 text-green-700' :
                                                            hf.estado === 'ASIGNADA' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {hf.estado}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-gray-500 mt-1">
                                                        Fecha: {hf.fecha_factura || '-'} | Recibida: {hf.created_at?.split('T')[0] || '-'}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {/* Show value assigned to this specific oficina */}
                                                    {(() => {
                                                        const asignacion = hf.oficinas_asignadas?.find(
                                                            oa => oa.oficina_id === historialInfo?.oficinaId
                                                        );
                                                        const valorOficina = asignacion ? Number(asignacion.valor) : 0;
                                                        return (
                                                            <>
                                                                <div className="font-bold text-lg text-gray-900">
                                                                    ${valorOficina.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                                                                </div>
                                                                {Number(hf.valor) !== valorOficina && (
                                                                    <div className="text-xs text-gray-400">
                                                                        Total fact: ${Number(hf.valor || 0).toLocaleString('es-CO')}
                                                                    </div>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                    {hf.url_factura && (
                                                        <button
                                                            onClick={() => {
                                                                setPdfUrl(`${API_URL}/facturas/${hf.id}/ver`);
                                                                setIsPdfModalOpen(true);
                                                            }}
                                                            className="text-sm text-blue-600 hover:underline"
                                                        >
                                                            Ver PDF
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Archivo Plano Configuration Modal */}
            {isArchivoPlanoModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="text-xl font-bold text-gray-900">Configurar Archivo Plano</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Configura las opciones antes de generar el archivo
                            </p>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Manager Consecutivo Info */}
                            {loadingConsecutivo ? (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                                    <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                    <span className="text-blue-700 text-sm">Consultando consecutivo en Manager...</span>
                                </div>
                            ) : consecutivoManager.cargado && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="font-semibold text-emerald-700">Extraído de Manager ERP</span>
                                    </div>
                                    <p className="text-sm text-emerald-600 mb-1">
                                        Tipo: <span className="font-medium">{consecutivoManager.nombre_documento || 'DC07'}</span>
                                    </p>
                                    <p className="text-sm text-emerald-600">
                                        Siguiente consecutivo disponible: <span className="font-bold text-lg">{consecutivoManager.consecutivo}</span>
                                    </p>
                                </div>
                            )}

                            {/* Numero Documento */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Número de Documento (NUMEDOC)
                                </label>
                                <input
                                    type="number"
                                    value={archivoPlanoConfig.numedoc}
                                    onChange={(e) => setArchivoPlanoConfig(prev => ({
                                        ...prev,
                                        numedoc: parseInt(e.target.value) || 0
                                    }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                {consecutivoManager.cargado && archivoPlanoConfig.numedoc === consecutivoManager.consecutivo && (
                                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                        Valor sincronizado con Manager
                                    </p>
                                )}
                            </div>

                            {/* Info about auto-generated description */}
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <p className="text-sm text-gray-600">
                                    <span className="font-medium">Descripción:</span> Se genera automáticamente con el formato:<br />
                                    <code className="text-xs bg-gray-200 px-1 py-0.5 rounded">FACT [número] SERVICIO DE INTERNET [oficina] MES [mes]</code>
                                </p>
                            </div>

                            {/* Checkboxes for IVA and Retefuente */}
                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={archivoPlanoConfig.tiene_iva}
                                        onChange={(e) => setArchivoPlanoConfig(prev => ({
                                            ...prev,
                                            tiene_iva: e.target.checked
                                        }))}
                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                        <span className="font-medium text-gray-800">Tiene IVA (19%)</span>
                                        <p className="text-xs text-gray-500">Cuenta '24081003</p>
                                    </div>
                                </label>

                                {/* Retefuente selector */}
                                <div className="mt-3">
                                    <span className="font-medium text-gray-800 block mb-2">Retefuente</span>
                                    <p className="text-xs text-gray-500 mb-2">Cuenta '23652501</p>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="retefuente"
                                                value="0"
                                                checked={archivoPlanoConfig.porcentaje_retefuente === 0}
                                                onChange={() => setArchivoPlanoConfig(prev => ({
                                                    ...prev,
                                                    porcentaje_retefuente: 0
                                                }))}
                                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">Sin retefuente</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="retefuente"
                                                value="4"
                                                checked={archivoPlanoConfig.porcentaje_retefuente === 4}
                                                onChange={() => setArchivoPlanoConfig(prev => ({
                                                    ...prev,
                                                    porcentaje_retefuente: 4
                                                }))}
                                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">4%</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="retefuente"
                                                value="6"
                                                checked={archivoPlanoConfig.porcentaje_retefuente === 6}
                                                onChange={() => setArchivoPlanoConfig(prev => ({
                                                    ...prev,
                                                    porcentaje_retefuente: 6
                                                }))}
                                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">6%</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                onClick={() => setIsArchivoPlanoModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={doGenerateArchivoPlano}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Generar Excel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
