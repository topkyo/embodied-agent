/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_TOKEN?: string;
  readonly VITE_API_PROXY?: string;
  readonly VITE_WEB_APP_URL?: string;
  readonly VITE_DEMO_API_GREENHOUSE?: string;
  readonly VITE_DEMO_API_ROBOT?: string;
  readonly VITE_DEMO_API_INDUSTRIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
