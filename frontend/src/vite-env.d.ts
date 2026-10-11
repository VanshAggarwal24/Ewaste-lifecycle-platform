/// <reference types="vite/client" />

/** Injected by Vite's `define` (see vite.config.ts); absent when modules run outside Vite. */
declare const __APP_BUILD__: string | undefined;

interface ImportMetaEnv {
  /** Base URL of the EcoCycle API. Empty in development so the Vite proxy is used. */
  readonly VITE_API_URL?: string;
  /** Where the dev-server proxy forwards `/api` requests. */
  readonly VITE_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
