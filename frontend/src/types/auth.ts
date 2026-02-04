/**
 * Types for category-based access control system
 */

// Category for invoice classification
export interface Categoria {
    id: number;
    nombre: string;
    descripcion?: string;
    color?: string;
    activa?: boolean;
    created_at?: string;
    created_by?: string;
    roles?: CategoriaRol[];
}

// Simple category for dropdowns
export interface CategoriaSimple {
    id: number;
    nombre: string;
    color?: string;
}

// Role assignment to category
export interface CategoriaRol {
    id: number;
    categoria_id: number;
    rol_id: number;
    rol_nombre: string;
    created_at?: string;
}

// User identity from parent system (stored in localStorage)
export interface ParentSystemIdentity {
    token: string;
    id: number;
    primer_nombre: string;
    segundo_nombre?: string;
    primer_apellido: string;
    segundo_apellido?: string;
    cedula: string;
    rol: ParentSystemRole;
    rol_id: number;
    [key: string]: unknown; // Allow for other fields
}

// Role from parent system
export interface ParentSystemRole {
    id: number;
    nombre: string;
    descripcion?: string;
    [key: string]: unknown;
}

// Auth state for the application
export interface AuthState {
    user: ParentSystemIdentity | null;
    isAuthenticated: boolean;
    isSuperAdmin: boolean;
    userId: number | null;
    rolId: number | null;
    rolNombre: string | null;
    loading: boolean;
}
