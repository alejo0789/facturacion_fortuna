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
    usuarios?: CategoriaUsuario[];
}

// Simple category for dropdowns
export interface CategoriaSimple {
    id: number;
    nombre: string;
    color?: string;
}

// User assignment to category by email
export interface CategoriaUsuario {
    id: number;
    categoria_id: number;
    email: string;
    created_at?: string;
}

// Role assignment to category
export interface CategoriaRol {
    id: number;
    categoria_id: number;
    rol_id: number;
    rol_nombre: string;
    created_at?: string;
}

// Module specific role assignment
export interface ModuloAccesoRol {
    id: number;
    modulo: string;
    rol_id: number;
    rol_nombre: string;
    created_at?: string;
}

// Module specific user assignment
export interface ModuloAccesoUsuario {
    id: number;
    modulo: string;
    email: string;
    created_at?: string;
}

export interface ParentSystemUser {
    id: number;
    name?: string;
    email?: string;
    cedula?: number;
    rol?: { id: number; name?: string; nombre?: string };
    notificaciones?: { tipo: string; data: string };
    [key: string]: any;
}

// User identity from parent system (stored in localStorage)
export interface ParentSystemIdentity {
    token?: string;
    usuario?: ParentSystemUser;
    
    // Legacy fallbacks
    id?: number;
    primer_nombre?: string;
    segundo_nombre?: string;
    primer_apellido?: string;
    segundo_apellido?: string;
    cedula?: string;
    rol?: ParentSystemRole;
    rol_id?: number;
    [key: string]: any; // Allow for other fields
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
