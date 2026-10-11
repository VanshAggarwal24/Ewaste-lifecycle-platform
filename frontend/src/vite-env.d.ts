/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the EcoCycle API. Empty in development so the Vite proxy is used. */
  readonly VITE_API_URL?: string;
  /** Where the dev-server proxy forwards `/api` requests. */
  readonly VITE_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
