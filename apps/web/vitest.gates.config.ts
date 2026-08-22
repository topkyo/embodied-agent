/**
 * D0 Track C1：仅门闩相关源文件的 coverage 硬门槛。
 * 全量 test:coverage 仍用 vitest.config.ts（无阈值，出报告）。
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const gateInclude = [
  "src/lib/ops-role.ts",
  "src/components/RequireAuth.tsx",
  "src/components/scene-ops/SceneOpsReadinessBadge.tsx",
  "src/layouts/SceneOpsLayout.tsx",
  "src/pages/scene-ops/SceneOpsDisabled.tsx",
  "src/pages/scene-ops/SceneOpsPlatformGate.tsx",
  "src/pages/scene-ops/SceneOpsPlatformDenied.tsx",
  "src/pages/scene-ops/SceneOpsReview.tsx",
  "src/pages/scene-ops/AdminOnlyShell.tsx",
];

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8",
      include: gateInclude,
      exclude: ["**/*.test.*", "test-utils/**"],
      // 门闩目录：lines ≥70%、branches ≥60%（plan Decision Log T3/C1）
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 70,
        statements: 70,
      },
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
