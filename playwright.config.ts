import { defineConfig, devices } from "@playwright/test";

const webBaseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const siteBaseUrl = process.env.E2E_SITE_URL ?? "http://127.0.0.1:5170";
const apiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  // CI：有限并行 + 1 次重试（产 trace）；seed 邮箱用 TEST_PARALLEL_INDEX 隔离。
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  webServer: [
    {
      command: "bash scripts/e2e-api-server.sh",
      url: `${apiUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "bash scripts/e2e-web-server.sh",
      url: webBaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "bash scripts/e2e-site-server.sh",
      url: siteBaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  use: {
    trace: "on-first-retry",
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  projects: [
    {
      name: "web",
      testMatch: /web-(smoke|dogfood)\.spec\.ts|wechat-bind-golden\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: webBaseUrl },
    },
    {
      name: "site",
      testMatch: /site-(smoke|dogfood)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: siteBaseUrl },
    },
  ],
});
