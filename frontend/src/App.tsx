/**
 * App.tsx — Shell principal del SaaS.
 *
 * Rutas públicas:
 *   /           → LandingPage
 *   /login      → LoginPage
 *   /register   → RegisterPage (wizard)
 *
 * Rutas protegidas (requieren sesión):
 *   /app                       → DashboardHome
 *   /app/contratos             → Dashboard (contratos)
 *   /app/oficinas              → OficinasPage
 *   /app/proveedores           → ProveedoresPage
 *   /app/pagos                 → PagosPage
 *   /app/facturas              → FacturasPage
 *   /app/facturas/pendientes   → PendientesPorLlegarPage
 *   /app/reportes              → ReportesPage
 *   /app/asistente-buscador    → AsistenteBuscadorPage
 *   /app/mi-equipo             → MiEquipoPage
 *   /app/puc                   → PUCPage
 *   /app/asientos              → AsientosPage
 *   /app/libro-mayor           → LibroMayorPage
 *   /app/balance               → BalancePage
 *   /app/impuestos             → ImpuestosPage
 *   /app/cuentas-bancarias     → CuentasBancariasPage
 *   /app/conciliacion          → ConciliacionBancariaPage
 *   /app/medios-magneticos     → MediosMagneticosPage
 *
 * Las páginas pesadas se cargan con lazy() para reducir el bundle inicial.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useState } from 'react';
import { ProtectedRoute, PublicRoute } from './auth/RouteGuards';
import Sidebar from './components/Sidebar';
import DashboardHome from './pages/DashboardHome';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LandingPage from './pages/LandingPage';

// Lazy-loaded route chunks
const Dashboard = lazy(() => import('./pages/Dashboard'));
const OficinasPage = lazy(() => import('./pages/OficinasPage'));
const ProveedoresPage = lazy(() => import('./pages/ProveedoresPage'));
const PagosPage = lazy(() => import('./pages/PagosPage'));
const FacturasPage = lazy(() => import('./pages/FacturasPage'));
const ReportesPage = lazy(() => import('./pages/ReportesPage'));
const PendientesPorLlegarPage = lazy(() => import('./pages/PendientesPorLlegarPage'));
const AsistenteBuscadorPage = lazy(() => import('./pages/AsistenteBuscadorPage'));
const MiEquipoPage = lazy(() => import('./pages/MiEquipoPage'));
const PUCPage = lazy(() => import('./pages/PUCPage'));
const AsientosPage = lazy(() => import('./pages/AsientosPage'));
const LibroMayorPage = lazy(() => import('./pages/LibroMayorPage'));
const BalancePage = lazy(() => import('./pages/BalancePage'));
const ImpuestosPage = lazy(() => import('./pages/ImpuestosPage'));
const CuentasBancariasPage = lazy(() => import('./pages/CuentasBancariasPage'));
const ConciliacionBancariaPage = lazy(() => import('./pages/ConciliacionBancariaPage'));
const MediosMagneticosPage = lazy(() => import('./pages/MediosMagneticosPage'));

function LoadingFallback() {
    return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-pulse text-slate-400 text-sm">Cargando...</div>
        </div>
    );
}

function AppShell() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            <main className={`flex-1 p-4 lg:p-6 xl:p-8 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
                <Suspense fallback={<LoadingFallback />}>
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
                        <Route path="cuentas-bancarias" element={<CuentasBancariasPage />} />
                        <Route path="conciliacion" element={<ConciliacionBancariaPage />} />
                        <Route path="medios-magneticos" element={<MediosMagneticosPage />} />
                        <Route path="*" element={<Navigate to="/app" replace />} />
                    </Routes>
                </Suspense>
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
