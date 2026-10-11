import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite configuration.
 *
 * The dev server proxies `/api` to the Express backend, so the browser only ever talks to
 * one origin. That removes CORS from the development story entirely and keeps the same
 * relative URLs working in production behind a reverse proxy.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // listen on 0.0.0.0 so containers/VM previews can reach it
    port: 5173,
    strictPort: false,
    // Dev-only convenience: allow tunnel/preview host names (e.g. *.e2b.app) in addition to
    // localhost. Never relevant to a production build, which is served by a static host.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Keep the charting library and the React runtime in their own chunks: the app
        // shell loads immediately and the vendor code stays cacheable between releases.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
