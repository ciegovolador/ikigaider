import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// sql.js ships a .wasm that must be served as an asset; exclude from optimizeDeps
// so Vite serves the wasm alongside the JS glue instead of pre-bundling it.
export default defineConfig({
  base: '/',
  plugins: [react()],
  css: { preprocessorOptions: { scss: { api: 'modern-compiler' } } },
  build: {
    chunkSizeWarningLimit: 6500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
