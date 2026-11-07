import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { pwa } from './scripts/pwa'

export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === 'pages' && pwa()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
  },
  worker: { format: 'es' },
  build: {
    chunkSizeWarningLimit: 1600,
  },
}))
