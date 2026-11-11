/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `vite build --mode standalone` builds the app with no server: an in-browser
// copy of the API (src/standalone) and every asset inlined, so the output can be
// published as one static page.
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
  plugins: [react()],
  define: { 'import.meta.env.VITE_STANDALONE': JSON.stringify(standalone ? '1' : '') },
  base: standalone ? './' : '/',
  build: standalone
    ? { outDir: 'dist-standalone', assetsInlineLimit: Number.MAX_SAFE_INTEGER, rollupOptions: { output: { inlineDynamicImports: true } } }
    : {},
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api': 'http://localhost:8080' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
