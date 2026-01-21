import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/facturacion_ia/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['saman.lafortuna.com.co']
  },
  plugins: [react()]
})