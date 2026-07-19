/**
 * AuthContext - Estado global de autenticación SaaS multi-tenant.
 *
 * Maneja:
 *  - JWT (access + refresh) persistidos en localStorage
 *  - Usuario logueado + lista de empresas a las que tiene acceso
 *  - Empresa activa (se envía como header X-Empresa-Id en todas las requests)
 *  - login / register / logout / switchEmpresa
 *
 * Expone el hook `useAuth()` para consumir el estado desde cualquier componente.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

// ---------------------------------------------------------------
// Tipos (espejo de los schemas de Pydantic en backend/schemas_auth.py)
// ---------------------------------------------------------------
export interface UserInfo {
    id: number;
    email: string;
    nombre: string;
    es_superadmin: boolean;
}

export interface EmpresaInfo {
    id: number;
    nombre: string;
    nombre_comercial?: string | null;
    nit: string;
    rol: string;
    logo_url?: string | null;
}

export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    user: UserInfo;
    empresas: EmpresaInfo[];
}

export interface RegisterPayload {
    firma_nombre: string;
    firma_nit: string;
    email: string;
    nombre: string;
    password: string;
    empresa_nombre?: string;
    empresa_nit?: string;
}

// ---------------------------------------------------------------
// Keys de localStorage
// ---------------------------------------------------------------
const LS_ACCESS = 'fortuna.access_token';
const LS_REFRESH = 'fortuna.refresh_token';
const LS_USER = 'fortuna.user';
const LS_EMPRESAS = 'fortuna.empresas';
const LS_EMPRESA_ACTIVA = 'fortuna.empresa_activa_id';

// ---------------------------------------------------------------
// Helpers de storage (exportados para que el interceptor los use)
// ---------------------------------------------------------------
export const authStorage = {
    getAccessToken: () => localStorage.getItem(LS_ACCESS),
    getRefreshToken: () => localStorage.getItem(LS_REFRESH),
    getEmpresaActivaId: (): number | null => {
        const raw = localStorage.getItem(LS_EMPRESA_ACTIVA);
        return raw ? Number(raw) : null;
    },
    clear: () => {
        localStorage.removeItem(LS_ACCESS);
        localStorage.removeItem(LS_REFRESH);
        localStorage.removeItem(LS_USER);
        localStorage.removeItem(LS_EMPRESAS);
        localStorage.removeItem(LS_EMPRESA_ACTIVA);
    },
};

// ---------------------------------------------------------------
// API base URL
// ---------------------------------------------------------------
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ---------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------
interface AuthContextValue {
    user: UserInfo | null;
    empresas: EmpresaInfo[];
    empresaActiva: EmpresaInfo | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string, totp_code?: string) => Promise<void>;
    register: (payload: RegisterPayload) => Promise<void>;
    logout: () => Promise<void>;
    switchEmpresa: (empresaId: number) => void;
    refreshEmpresas: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
    return ctx;
}

// ---------------------------------------------------------------
// Provider
// ---------------------------------------------------------------
export default function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [empresas, setEmpresas] = useState<EmpresaInfo[]>([]);
    const [empresaActivaId, setEmpresaActivaId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // ---- Hidratar desde localStorage al montar ----
    useEffect(() => {
        try {
            const userRaw = localStorage.getItem(LS_USER);
            const empresasRaw = localStorage.getItem(LS_EMPRESAS);
            const token = localStorage.getItem(LS_ACCESS);
            if (userRaw && token) {
                setUser(JSON.parse(userRaw));
                if (empresasRaw) setEmpresas(JSON.parse(empresasRaw));
                const activaRaw = localStorage.getItem(LS_EMPRESA_ACTIVA);
                if (activaRaw) setEmpresaActivaId(Number(activaRaw));
            }
        } catch (e) {
            console.warn('Error hidratando auth desde localStorage:', e);
            authStorage.clear();
        } finally {
            setIsLoading(false);
        }

        // Listener global: cuando el interceptor detecta 401 limpia storage y
        // dispara este evento; respondemos desmontando la sesión.
        const handleLogout = () => {
            setUser(null);
            setEmpresas([]);
            setEmpresaActivaId(null);
        };
        window.addEventListener('fortuna:logout', handleLogout);
        return () => window.removeEventListener('fortuna:logout', handleLogout);
    }, []);

    // ---- Persist helpers ----
    const persistSession = (data: TokenResponse) => {
        localStorage.setItem(LS_ACCESS, data.access_token);
        localStorage.setItem(LS_REFRESH, data.refresh_token);
        localStorage.setItem(LS_USER, JSON.stringify(data.user));
        localStorage.setItem(LS_EMPRESAS, JSON.stringify(data.empresas));

        setUser(data.user);
        setEmpresas(data.empresas);

        // Si hay empresas, por defecto activamos la primera
        if (data.empresas.length > 0) {
            const firstId = data.empresas[0].id;
            localStorage.setItem(LS_EMPRESA_ACTIVA, String(firstId));
            setEmpresaActivaId(firstId);
        }
    };

    // ---- login ----
    // Si el backend responde 401 con code='2fa_required', lanzamos un error
    // tipado que la UI puede detectar para pedir el código TOTP.
    const login = async (email: string, password: string, totp_code?: string) => {
        const body: Record<string, unknown> = { email, password };
        if (totp_code) body.totp_code = totp_code;

        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const raw = await res.json().catch(() => ({ detail: 'Error de login' }));
            // detail puede ser string (default) o object { detail, code } (2FA)
            const innerDetail = typeof raw.detail === 'object' ? raw.detail : null;
            const message =
                (innerDetail?.detail as string | undefined) ||
                (typeof raw.detail === 'string' ? raw.detail : undefined) ||
                `HTTP ${res.status}`;
            const err = new Error(message) as Error & { code?: string };
            err.code = innerDetail?.code;
            throw err;
        }
        const data: TokenResponse = await res.json();
        persistSession(data);
    };

    // ---- register ----
    const register = async (payload: RegisterPayload) => {
        const res = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({ detail: 'Error de registro' }));
            throw new Error(detail.detail || `HTTP ${res.status}`);
        }
        const data: TokenResponse = await res.json();
        persistSession(data);
    };

    // ---- logout ----
    // Llama al backend para revocar el JWT (por jti). El fetch va con el
    // token actual — si falla (offline, backend caído), limpiamos el storage
    // igual: mejor limpiar el cliente que dejarlo en un estado zombie.
    const logout = useCallback(async () => {
        const token = authStorage.getAccessToken();
        if (token) {
            try {
                await fetch(`${API_URL}/api/auth/logout`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch { /* offline OK — limpieza local sigue */ }
        }
        authStorage.clear();
        setUser(null);
        setEmpresas([]);
        setEmpresaActivaId(null);
    }, []);

    // ---- switchEmpresa ----
    const switchEmpresa = useCallback((empresaId: number) => {
        const exists = empresas.some(e => e.id === empresaId);
        if (!exists) return;
        localStorage.setItem(LS_EMPRESA_ACTIVA, String(empresaId));
        setEmpresaActivaId(empresaId);
    }, [empresas]);

    // ---- refreshEmpresas (por si crean una nueva en sesión) ----
    const refreshEmpresas = async () => {
        const token = authStorage.getAccessToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/api/auth/empresas`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: EmpresaInfo[] = await res.json();
        setEmpresas(data);
        localStorage.setItem(LS_EMPRESAS, JSON.stringify(data));
        // Si no hay empresa activa o la activa ya no existe, selecciona la primera
        if (!empresaActivaId || !data.some(e => e.id === empresaActivaId)) {
            if (data.length > 0) {
                localStorage.setItem(LS_EMPRESA_ACTIVA, String(data[0].id));
                setEmpresaActivaId(data[0].id);
            }
        }
    };

    const empresaActiva = empresas.find(e => e.id === empresaActivaId) || null;

    return (
        <AuthContext.Provider
            value={{
                user,
                empresas,
                empresaActiva,
                isAuthenticated: !!user,
                isLoading,
                login,
                register,
                logout,
                switchEmpresa,
                refreshEmpresas,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
