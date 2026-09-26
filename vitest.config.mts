import { defineConfig } from "vitest/config";

// DB tests (*.db.test.ts) run against TEST_DATABASE_URL, never the dev DB.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: DB tests are skipped.
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    globalSetup: ["./scripts/test/global-setup.ts"],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
    // DB test files share one database, so run files one at a time.
    fileParallelism: false,
  },
});
