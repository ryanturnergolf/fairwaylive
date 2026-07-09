import { defineConfig, devices } from "@playwright/test";

const webServer = process.env.PLAYWRIGHT_MANAGED_SERVER
  ? undefined
  : {
      command: "node node_modules/next/dist/bin/next start -p 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM" as const, timeout: 1000 },
    };

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
