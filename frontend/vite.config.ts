import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Base condicional:
//   - dev (vite serve)   → base: '/'
//   - build (prod)       → toma `VITE_BASE_PATH` de env (default '/facturacion_ia/'
//                          para no romper el deploy Apache actual). Railway,
//                          Vercel u otros deploys en la raíz del dominio deben
//                          setear `VITE_BASE_PATH=/`.
//
// Ejemplos:
//   Apache (path /facturacion_ia/):   sin VITE_BASE_PATH → '/facturacion_ia/'
//   Railway (subdomain root):         VITE_BASE_PATH=/ → '/'
export default defineConfig(({ command }) => ({
  base: command === 'build'
    ? (process.env.VITE_BASE_PATH ?? '/facturacion_ia/')
    : '/',
  server: {
    host: '0.0.0.0',
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    allowedHosts: ['saman.lafortuna.com.co', '.railway.app', '.up.railway.app']
  },
  plugins: [react()]
}))
