import React, { useEffect, useState } from "react";

/**
 * AuthProvider - Componente para manejar la autenticación global con Saman
 * Verifica la existencia de un objeto 'identity' en localStorage y filtra por correos autorizados.
 */

// Correos autorizados por defecto
const DEFAULT_ALLOWED_EMAILS = [
    "auxiliaradmintic@acertemos.com",
    "ingenieroia@acertemos.com"
];

// Obtener correos adicionales desde variables de entorno (VITE_AUTHORIZED_EMAILS=correo1@test.com,correo2@test.com)
const ENV_ALLOWED_EMAILS = import.meta.env.VITE_AUTHORIZED_EMAILS
    ? import.meta.env.VITE_AUTHORIZED_EMAILS.split(',').map((e: string) => e.trim()).filter((e: string) => e !== '')
    : [];

const ALL_ALLOWED_EMAILS = [...DEFAULT_ALLOWED_EMAILS, ...ENV_ALLOWED_EMAILS];

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkAuth = () => {
            // 1. Bypass para Desarrollo (localhost o 127.0.0.1)
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                setIsAuthenticated(true);
                setIsLoading(false);
                return;
            }

            // 2. Validación de Identidad (Saman ecosystem)
            try {
                const identityStr = localStorage.getItem("identity");
                if (!identityStr) {
                    console.warn("No se encontró el objeto 'identity' en localStorage");
                    throw new Error("No identity foundation");
                }

                const identity = JSON.parse(identityStr);
                if (!identity?.token) {
                    console.warn("El token de identidad no está presente");
                    throw new Error("No valid token found");
                }

                // 3. Validación de correo (Asegurarse de que exista el campo)
                const userEmail = identity.usuario?.notificaciones?.data || identity.usuario?.email;

                if (!userEmail) {
                    console.error("No se pudo extraer el correo electrónico del objeto identity");
                    throw new Error("Email not found in identity object");
                }

                // NOTA: Se eliminó el filtrado por lista blanca (ALL_ALLOWED_EMAILS) 
                // para permitir que el backend gestione el acceso mediante categorías y roles dinámicos.
                
                // Si pasó las validaciones de token e identidad básica
                setIsAuthenticated(true);
            } catch (e) {
                console.error("Error de autenticación:", e);
                // Redirigir al sistema central Saman si falla la validación
                window.location.href = "https://saman.lafortuna.com.co";
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
                <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-600 font-medium animate-pulse">Verificando sesión en Saman...</p>
            </div>
        );
    }

    // Si no está autenticado y ya cargó, no renderizar nada (la redirección ya fue disparada)
    if (!isAuthenticated) return null;

    return <>{children}</>;
}
