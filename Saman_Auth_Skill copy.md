# Skill: Integración de Autenticación Saman (Global)

## Contexto
Este skill permite integrar aplicaciones frontend (React, Vue, Vite, etc.) con el ecosistema de "Saman". 
La autenticación se basa en la existencia de un objeto `identity` en el `localStorage`, compartido desde el dominio principal (`saman.lafortuna.com.co`).

## Requerimientos
1. **Auth Guard Global:** Mecanismo para bloquear el acceso total a la app si el usuario no está autenticado.
2. **Validación de Token:** Verificar que el objeto `identity` contenga un `token` válido.
3. **Filtrado por Correo (Whitelist):** Solo permitir el acceso a correos electrónicos específicos en entornos de producción.
4. **Bypass en Desarrollo:** Permitir el acceso sin restricciones si se detecta `localhost` o `127.0.0.1`.
5. **Configuración Dinámica:** Permitir agregar correos autorizados mediante variables de entorno (`.env`).
6. **Redirección:** Si la validación falla, redirigir al usuario a `https://saman.lafortuna.com.co`.
7. **Botón de Retorno:** Incluir un enlace a "CÉNTRICA" (`https://saman.lafortuna.com.co/#/home`) en la navegación lateral o superior.

## Configuración (.env)
Para agregar correos adicionales a la lista blanca, use la variable:
```env
VITE_AUTHORIZED_EMAILS=usuario1@acertemos.com,usuario2@acertemos.com
```

## Implementación en React/Vite

### 1. Crear el AuthProvider (`src/components/AuthProvider.tsx`)
```tsx
import React, { useEffect, useState } from "react";

// Correos autorizados de base
const BASE_ALLOWED_EMAILS = [
  "auxiliaradmintic@acertemos.com",
  "ingenieroia@acertemos.com"
];

// Correos desde variables de entorno
const ENV_ALLOWED_EMAILS = import.meta.env.VITE_AUTHORIZED_EMAILS 
  ? import.meta.env.VITE_AUTHORIZED_EMAILS.split(',').map((e: string) => e.trim())
  : [];

const AUTHORIZED_EMAILS = [...BASE_ALLOWED_EMAILS, ...ENV_ALLOWED_EMAILS];

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Bypass para Localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    // 2. Validación de Identidad
    try {
      const identityStr = localStorage.getItem("identity");
      if (!identityStr) throw new Error("No identity foundation");
      
      const identity = JSON.parse(identityStr);
      if (!identity?.token) throw new Error("No valid token");

      // 3. Filtrado por Correo (Estructura Saman: usuario.notificaciones.data)
      const userEmail = identity.usuario?.notificaciones?.data;
      
      if (!userEmail || !AUTHORIZED_EMAILS.includes(userEmail)) {
          throw new Error(`Email ${userEmail} no autorizado`);
      }

      setIsAuthenticated(true);
    } catch (e) {
      console.error("Auth Fail:", e);
      window.location.href = "https://saman.lafortuna.com.co";
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (isLoading) return <div>Verificando acceso...</div>;
  if (!isAuthenticated) return null;

  return <>{children}</>;
}
```

### 2. Uso Global (`src/main.tsx`)
```tsx
import App from './App';
import AuthProvider from './components/AuthProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
```

### 3. Botón "Volver a Céntrica" (Sidebar)
Añadir este enlace en el Sidebar con el icono de flecha hacia atrás:
- **URL:** `https://saman.lafortuna.com.co/#/home`
- **Texto:** "CÉNTRICA"
