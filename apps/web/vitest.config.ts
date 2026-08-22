import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.*",
        "test-utils/**",
        "main.tsx",
        "design/**",
        "assets/**",
        "i18n/**",
        "domain-packs.runtime.generated.ts",
        "vite-env.d.ts",
      ],
    },
    projects: [
      {
        plugins: [react()],
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "dom",
          environment: "happy-dom",
          setupFiles: ["./src/test-setup.ts"],
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
  },
});
