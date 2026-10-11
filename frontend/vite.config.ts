import { execSync } from 'node:child_process';
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
/**
 * Identifies the code the browser is actually running.
 *
 * Shown on the sign-in screen. When something "still fails after the fix", the first thing
 * worth knowing is whether the tab is running the current code or a bundle it kept from an
 * earlier visit — this makes that a one-glance check instead of a guess. Falls back cleanly
 * when the project is not a git checkout (for example a downloaded ZIP).
 */
function buildStamp(): string {
  const at = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return `${sha} · ${at}`;
  } catch {
    return at;
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_BUILD__: JSON.stringify(buildStamp()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // listen on 0.0.0.0 so containers/VM previews can reach it
    port: 5173,
    strictPort: false,
    /**
     * Reflect the caller's origin in development.
     *
     * The dev server is reached both directly (localhost) and through the platform's preview
     * iframe, whose host — and, for `sandbox="allow-scripts"`, whose whole origin — cannot be
     * known in advance. Vite answers the CORS preflight itself, before the proxy sees it, so
     * without this the browser's preflight for `POST /api/...` fails and no request is ever
     * sent. This is a development-server setting only: the API keeps its own allow-list and
     * still authorises every request by JWT.
     */
    cors: { origin: true, credentials: true },
    // Dev-only convenience: allow tunnel/preview host names (e.g. *.e2b.app) in addition to
    // localhost. Never relevant to a production build, which is served by a static host.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000',
        // Rewrite Host to the API's own address …
        changeOrigin: true,
        // … but tell the API which host the browser actually used, so it can recognise a
        // request that is same-origin from the browser's point of view (preview hosts are not
        // knowable in advance) and answer with the right CORS headers.
        xfwd: true,
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
