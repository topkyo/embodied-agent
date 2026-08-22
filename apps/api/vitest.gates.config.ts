/**
 * API 鉴权与安全关键路径 coverage 硬门槛。
 * 全量 test:coverage 仍用 vitest.config.ts（无阈值，出报告）。
 */
import { defineConfig } from "vitest/config";

const gateInclude = [
  "src/routes/admin-auth.ts",
  "src/settings/admin-tokens.ts",
  "src/settings/require-production.ts",
  "src/auth/auth.ts",
  "src/auth/web-session/web-session.ts",
  "src/auth/ensure-principal.ts",
  "src/platform-architecture-gate.ts",
  "src/cors.ts",
];

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "../../scripts/lib/**/*.test.ts"],
    setupFiles: ["./src/test/vitest-setup.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: gateInclude,
      exclude: ["**/*.test.*"],
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 70,
        statements: 70,
      },
    },
  },
});
