import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    port: 5173,
    // Default to loopback. Set VITE_HOST=0.0.0.0 only for the explicit LAN
    // dev workflow — binding the dev server to all interfaces on a shared
    // network exposes an unauthenticated frontend with a proxied dev API.
    host: process.env.VITE_HOST || 'localhost',
    proxy: { '/api': 'http://localhost:3001' }
  }
})
