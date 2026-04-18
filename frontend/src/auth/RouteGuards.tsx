/**
 * Guards de ruta para React Router.
 *
 *   <ProtectedRoute>...</ProtectedRoute>  → sólo usuarios autenticados.
 *   <PublicRoute>...</PublicRoute>        → sólo anónimos (login/register).
 *                                           Si ya hay sesión, redirige al dashboard.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

function LoadingScreen() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
            <p className="text-slate-600 text-sm">Cargando sesión…</p>
        </div>
    );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) return <LoadingScreen />;
    if (!isAuthenticated) {
        // Guardamos la ruta original para redirigir de vuelta tras login
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    return <>{children}</>;
}

export function PublicRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading) return <LoadingScreen />;
    if (isAuthenticated) return <Navigate to="/app" replace />;
    return <>{children}</>;
}
