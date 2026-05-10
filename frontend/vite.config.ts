import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Base condicional por modo:
//   - dev (vite serve)         → base: '/'  → URLs limpias en localhost
//                                 (http://localhost:5173/app, /login, etc.)
//   - build/preview (prod)     → base: '/facturacion_ia/'  → la app se sirve
//                                 bajo el subpath en saman.lafortuna.com.co.
//
// Razón del fix: hostear con base='/facturacion_ia/' en dev hacía que cualquier
// URL fuera del subpath (ej. /app/proveedores) devolviera "did you mean
// /facturacion_ia/app/proveedores", impidiendo que React Router tomara control
// del routing y dejando las pantallas internas vacías o con la landing.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/facturacion_ia/' : '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['saman.lafortuna.com.co']
  },
  plugins: [react()]
}))
