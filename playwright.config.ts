import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./scripts",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:1420",
    ...devices["Desktop Chrome"],
    channel: "chrome",
    viewport: { width: 1536, height: 1024 },
  },
  webServer: {
    command: "bun run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
});
