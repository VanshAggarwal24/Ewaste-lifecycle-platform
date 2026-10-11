import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Configuration for the live authentication smoke test.
 *
 * Unlike the hermetic suite (`npm test`, which stubs `fetch`), this one talks to a *running*
 * EcoCycle stack: the Vite dev server proxying `/api` to the backend. It is therefore kept
 * out of the default test run and executed on demand with `npm run test:live`.
 *
 * Point it elsewhere with the `ECOCYCLE_API_URL` environment variable; the default matches the
 * standard development setup from the README.
 */
const apiUrl = process.env.ECOCYCLE_API_URL ?? 'http://127.0.0.1:5173';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // The client resolves its base URL from `import.meta.env.VITE_API_URL` at import time.
    'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/live/**/*.live.{ts,tsx}'],
    testTimeout: 20_000,
  },
});
