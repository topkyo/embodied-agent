/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_TOKEN?: string;
  readonly VITE_API_PROXY?: string;
  /** 营销站基址；DEV 默认 http://127.0.0.1:5170 */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
