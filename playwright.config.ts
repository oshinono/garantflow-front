import { defineConfig, devices } from "@playwright/test";

/** E2E на мок-бэкенде (VITE_API_MOCK=true): те же MSW-обработчики, что в unit-тестах и демо. */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure", locale: "ru-RU" },
  webServer: {
    command: "VITE_API_MOCK=true yarn build && yarn preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
