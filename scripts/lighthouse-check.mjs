// Lighthouse audit of Aula's main screens on a simulated mid-range phone
// (Lighthouse's default mobile profile: slow 4G, 4x CPU slowdown).
// Signs in as a guest teacher and joins as a student first, so the teacher
// and student screens are measured too.
//   node scripts/lighthouse-check.mjs https://aulaapp.xyz
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const BASE = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const OUT = "test-results/lighthouse";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const teacherCtx = await browser.newContext();
const teacher = await teacherCtx.newPage();
await teacher.goto(`${BASE}/`);
await teacher.getByRole("button", { name: "Try it live" }).first().click();
await teacher.waitForURL(/\/teach\?guest=1/);
await teacher.getByRole("button", { name: "Start lesson" }).click();
await teacher.waitForURL(/\/teach\/[a-z0-9]+$/);
const lessonUrl = teacher.url();
const code = (await teacher.getByLabel(/^Join code/).getAttribute("aria-label")).replace("Join code ", "").replace(/\s/g, "");
const studentCtx = await browser.newContext({ ...devices["Pixel 7"] });
const student = await studentCtx.newPage();
await student.goto(`${BASE}/join/${code}`);
await student.getByLabel("Your name or a nickname").fill("Audit");
await student.getByText(/^Español$/).click();
await student.getByRole("button", { name: "Join lesson" }).click();
await student.waitForURL(new RegExp(`/l/${code}$`));
const cookieHeader = async (ctx) => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const teacherCookie = await cookieHeader(teacherCtx);
const studentCookie = await cookieHeader(studentCtx);
await browser.close();

const pages = [
  ["landing", `${BASE}/`, ""],
  ["demo", `${BASE}/demo`, ""],
  ["join", `${BASE}/join/${code}`, ""],
  ["student", `${BASE}/l/${code}`, studentCookie],
  ["teacher", lessonUrl, teacherCookie],
];
const rows = [];
for (const [name, url, cookie] of pages) {
  const args = [
    "-y", "lighthouse@12", url, "--quiet", "--chrome-flags=--headless=new",
    "--only-categories=performance,accessibility,best-practices,seo",
    "--output=json", `--output-path=${OUT}/${name}.json`, "--max-wait-for-load=30000",
  ];
  if (cookie) args.push(`--extra-headers=${JSON.stringify({ Cookie: cookie })}`);
  try {
    execFileSync("npx", args, { stdio: "pipe", timeout: 180_000 });
    const r = JSON.parse(readFileSync(`${OUT}/${name}.json`, "utf8"));
    const s = (k) => Math.round((r.categories[k]?.score ?? 0) * 100);
    const a = r.audits;
    rows.push({ page: name, performance: s("performance"), accessibility: s("accessibility"), bestPractices: s("best-practices"), seo: s("seo"), FCP: a["first-contentful-paint"]?.displayValue, LCP: a["largest-contentful-paint"]?.displayValue, TBT: a["total-blocking-time"]?.displayValue, CLS: a["cumulative-layout-shift"]?.displayValue });
    const failed = Object.values(r.audits).filter((x) => x.score !== null && x.score < 1 && r.categories.accessibility.auditRefs.some((ref) => ref.id === x.id && ref.weight > 0));
    if (failed.length) console.log(`${name} accessibility issues:`, failed.map((x) => x.id).join(", "));
  } catch (err) {
    rows.push({ page: name, error: String(err.message).slice(0, 200) });
  }
}
console.table(rows);
