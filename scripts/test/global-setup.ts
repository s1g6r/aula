import { execSync } from "node:child_process";

// Brings the test database's schema up to date before DB tests run.
// Refuses anything that doesn't look like a test database, so a typo can
// never point the tests at real data.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  if (!/test/.test(new URL(url).pathname)) {
    throw new Error(`TEST_DATABASE_URL must point at a database with "test" in its name, got ${url}`);
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
