/**
 * App.tsx — Shell principal del SaaS.
 *
 * Rutas públicas:
 *   /           → LandingPage
 *   /login      → LoginPage
 *   /register   → RegisterPage (wizard)
 *
 * Rutas protegidas (requieren sesión):
 *   /app                      → DashboardHome
 *   /app/contratos            → Dashboard (contratos)
 *   /app/oficinas             → OficinasPage
 *   /app/proveedores          → ProveedoresPage
 *   /app/pagos                → PagosPage
 *   /app/facturas             → FacturasPage
 *   /app/facturas/pendientes  → PendientesPorLlegarPage
 *   /app/reportes             → ReportesPage
 *   /app/asistente-buscador   → AsistenteBuscadorPage
 *   /app/mi-equipo            → MiEquipoPage
 *   /app/puc                  → PUCPage
 *   /app/asientos             → AsientosPage
 *   /app/libro-mayor          → LibroMayorPage
 *   /app/balance              → BalancePage
 *   /app/impuestos            → ImpuestosPage
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { ProtectedRoute, PublicRoute } from './auth/RouteGuards';
import Sidebar from './components/Sidebar';
import DashboardHome from './pages/DashboardHome';
import Dashboard from './pages/Dashboard';
import OficinasPage from './pages/OficinasPage';
import ProveedoresPage from './pages/ProveedoresPage';
import PagosPage from './pages/PagosPage';
import FacturasPage from './pages/FacturasPage';
import ReportesPage from './pages/ReportesPage';
import PendientesPorLlegarPage from './pages/PendientesPorLlegarPage';
import AsistenteBuscadorPage from './pages/AsistenteBuscadorPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LandingPage from './pages/LandingPage';
import MiEquipoPage from './pages/MiEquipoPage';
import PUCPage from './pages/PUCPage';
import AsientosPage from './pages/AsientosPage';
import LibroMayorPage from './pages/LibroMayorPage';
import BalancePage from './pages/BalancePage';
import ImpuestosPage from './pages/ImpuestosPage';

function AppShell() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            <main className={`flex-1 p-4 lg:p-6 xl:p-8 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
                <Routes>
                    <Route index element={<DashboardHome />} />
                    <Route path="contratos" element={<Dashboard />} />
                    <Route path="oficinas" element={<OficinasPage />} />
                    <Route path="proveedores" element={<ProveedoresPage />} />
                    <Route path="pagos" element={<PagosPage />} />
                    <Route path="facturas" element={<FacturasPage />} />
                    <Route path="facturas/pendientes" element={<PendientesPorLlegarPage />} />
                    <Route path="reportes" element={<ReportesPage />} />
                    <Route path="asistente-buscador" element={<AsistenteBuscadorPage />} />
                    <Route path="mi-equipo" element={<MiEquipoPage />} />
                    <Route path="puc" element={<PUCPage />} />
                    <Route path="asientos" element={<AsientosPage />} />
                    <Route path="libro-mayor" element={<LibroMayorPage />} />
                    <Route path="balance" element={<BalancePage />} />
                    <Route path="impuestos" element={<ImpuestosPage />} />
                    <Route path="*" element={<Navigate to="/app" replace />} />
                </Routes>
            </main>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Rutas públicas */}
                <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
                <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

                {/* Rutas protegidas (shell autenticado) */}
                <Route path="/app/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
