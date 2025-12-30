import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './components/Sidebar';
import DashboardHome from './pages/DashboardHome';
import Dashboard from './pages/Dashboard';
import OficinasPage from './pages/OficinasPage';
import ProveedoresPage from './pages/ProveedoresPage';
import PagosPage from './pages/PagosPage';
import FacturasPage from './pages/FacturasPage';
import ReportesPage from './pages/ReportesPage';
import PendientesPorLlegarPage from './pages/PendientesPorLlegarPage';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main className={`flex-1 p-4 lg:p-6 xl:p-8 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/contratos" element={<Dashboard />} />
            <Route path="/oficinas" element={<OficinasPage />} />
            <Route path="/proveedores" element={<ProveedoresPage />} />
            <Route path="/pagos" element={<PagosPage />} />
            <Route path="/facturas" element={<FacturasPage />} />
            <Route path="/facturas/pendientes" element={<PendientesPorLlegarPage />} />
            <Route path="/reportes" element={<ReportesPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
