import { defineConfig, env } from "prisma/config";

// Prisma 7 doesn't load env files itself. Next.js reads .env.local at runtime,
// so the CLI reads the same file here. In prod, Render injects real env vars.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (CI / Render): fall back to the process environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
