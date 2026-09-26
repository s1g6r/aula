import { defineConfig, devices } from "@playwright/test";

// BASE_URL points the suite at prod (P9); locally it starts the dev server.
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const isLocal = !process.env.BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: isLocal ? 0 : 1,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: isLocal
    ? { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
