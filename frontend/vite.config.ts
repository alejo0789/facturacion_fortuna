import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/facturacion_ia/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      host: '192.168.2.91',
      port: 5173,
      protocol: 'ws'
    }
  },
  plugins: [react()]
})