import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { AuthState, ParentSystemIdentity } from '../types/auth';

// Super admin emails - should match backend .env
const SUPER_ADMIN_EMAILS = ['ingenieroia@acertemos.com'];

interface AuthContextType extends AuthState {
    refreshAuth: () => void;
}

const defaultAuthState: AuthState = {
    user: null,
    isAuthenticated: false,
    isSuperAdmin: false,
    userId: null,
    rolId: null,
    rolNombre: null,
    loading: true
};

const AuthContext = createContext<AuthContextType>({
    ...defaultAuthState,
    refreshAuth: () => { }
});

/**
 * Read user identity from localStorage
 * The parent system stores identity under 'identity' key
 */
function getIdentityFromStorage(): ParentSystemIdentity | null {
    try {
        const stored = localStorage.getItem('identity');
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Error reading identity from localStorage:', e);
    }
    return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>(defaultAuthState);

    const loadAuth = () => {
        const identity = getIdentityFromStorage();

        if (identity) {
            const userObj = identity.usuario || identity;
            const userId = userObj.id as number;
            const rolId = userObj.rol_id ?? userObj.rol?.id ?? null;
            const rolNombre = userObj.rolNombre ?? userObj.rol?.name ?? userObj.rol?.nombre ?? null;
            
            // Try to extract email from notificaciones or flat email field
            const userEmail = userObj.notificaciones?.data || userObj.email || '';
            
            // SECURITY FIX: Only trust explicit email list OR the role name from the identity
            const isEmailAdmin = SUPER_ADMIN_EMAILS.includes(userEmail);
            const isRoleAdmin = rolNombre === 'Super Admin' || userObj.rol?.name === 'Super Admin';
            
            setState({
                user: identity,
                isAuthenticated: true,
                isSuperAdmin: isEmailAdmin || isRoleAdmin,
                userId,
                rolId,
                rolNombre,
                loading: false
            });
        } else {
            // When no identity exists, the user is NOT authenticated and definitely NOT an admin
            setState({
                ...defaultAuthState,
                loading: false
            });
        }
    };

    useEffect(() => {
        loadAuth();

        // Listen for storage changes (in case login happens in another tab)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'identity') {
                loadAuth();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    return (
        <AuthContext.Provider value={{ ...state, refreshAuth: loadAuth }}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook to access authentication state
 */
export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

/**
 * Get auth headers for API requests
 * These headers are used by the backend for role-based filtering
 */
export function getAuthHeaders(): Record<string, string> {
    const identity = getIdentityFromStorage();
    const headers: Record<string, string> = {};

    if (identity) {
        const userObj = identity.usuario || identity;
        if (userObj.id) headers['X-User-Id'] = String(userObj.id);
        
        const rolId = userObj.rol_id ?? userObj.rol?.id;
        if (rolId) headers['X-User-Rol-Id'] = String(rolId);
        
        const name = userObj.name || userObj.primer_nombre ? `${userObj.primer_nombre || ''} ${userObj.primer_apellido || ''}`.trim() : '';
        if (name) headers['X-User-Name'] = name;
        
        const email = userObj.notificaciones?.data || userObj.email;
        if (email) headers['X-User-Email'] = email;
    }

    return headers;
}
