import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_PROXY ?? "http://127.0.0.1:3001";

  return {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 800,
    },
    server: {
      host: "0.0.0.0",
      port: Number(env.SITE_PORT ?? env.WEB_PORT ?? 5170),
      proxy: {
        "/admin": { target: apiTarget, changeOrigin: true },
        "/integrations": { target: apiTarget, changeOrigin: true },
        "/health": { target: apiTarget, changeOrigin: true },
        "/lang-suggest": { target: apiTarget, changeOrigin: true },
        "/domain-packs": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
