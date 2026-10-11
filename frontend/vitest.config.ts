import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration for the frontend regression suite.
 *
 * The suite runs in jsdom and consumes the source modules directly (no bundle), so it can
 * mount the real `AuthProvider`, the real route guards and the real API client against a
 * stubbed `fetch`. `vite.config.ts` stays reserved for the app build.
 */
export default defineConfig({
  // The root tsconfig is a solution file (references only), so esbuild cannot infer the JSX
  // runtime from it — state it explicitly, matching tsconfig.app.json.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    reporters: ['default'],
  },
});
