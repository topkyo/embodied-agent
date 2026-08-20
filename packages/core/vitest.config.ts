import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.*", "**/schemas/**"],
      thresholds: {
        lines: 20,
        branches: 15,
        functions: 20,
        statements: 20,
      },
    },
  },
});
