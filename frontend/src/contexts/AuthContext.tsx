import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { AuthState, ParentSystemIdentity } from '../types/auth';

// Super admin user IDs - should match backend .env
const SUPER_ADMIN_USER_IDS = [725];

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
            const userId = identity.id;
            const rolId = identity.rol_id ?? identity.rol?.id ?? null;
            const rolNombre = identity.rol?.nombre ?? null;

            setState({
                user: identity,
                isAuthenticated: true,
                isSuperAdmin: SUPER_ADMIN_USER_IDS.includes(userId),
                userId,
                rolId,
                rolNombre,
                loading: false
            });
        } else {
            // Default to super admin for localhost development when no identity exists
            setState({
                user: null,
                isAuthenticated: true,
                isSuperAdmin: true,  // Default super admin for dev
                userId: null,
                rolId: null,
                rolNombre: 'Super Admin (Dev)',
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
        headers['X-User-Id'] = String(identity.id);
        if (identity.rol_id ?? identity.rol?.id) {
            headers['X-User-Rol-Id'] = String(identity.rol_id ?? identity.rol?.id);
        }
        if (identity.primer_nombre) {
            headers['X-User-Name'] = `${identity.primer_nombre} ${identity.primer_apellido || ''}`.trim();
        }
    }

    return headers;
}
