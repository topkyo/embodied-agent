import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "../../scripts/lib/**/*.test.ts"],
    setupFiles: ["./src/test/vitest-setup.ts"],
    fileParallelism: false,
  },
});
