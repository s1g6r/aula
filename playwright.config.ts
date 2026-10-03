import { defineConfig, devices } from "@playwright/test";
// we luv sagar bub
// Locally, tests run against a production build on port 3100 whose AI calls
// go to e2e/mock-ai.mjs, so they're fast, free and predictable.
// BASE_URL=https://aulaapp.xyz runs the same tests against production (P9).
const remote = process.env.BASE_URL;
const baseURL = remote ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: remote ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: remote
    ? undefined
    : [
        { command: "node e2e/mock-ai.mjs", port: 4010, reuseExistingServer: true },
        {
          command: "npx next start -p 3100",
          url: "http://localhost:3100/api/health",
          reuseExistingServer: true,
          timeout: 60_000,
          env: {
            AI_BASE_URL: "http://localhost:4010/v1",
            AI_API_KEY: "mock",
            AI_MODEL_TRANSLATE: "mock",
            AI_MODEL_RECAP: "mock",
            AI_TIMEOUT_MS: "3000",
            APP_URL: "",
          },
        },
      ],
});
