// Records the README's Demo Replay GIF and the screenshots for the README and
// Devpost, from a production build with the real AI:
//
//   npm run build && APP_URL=https://aulaapp.xyz npx next start -p 3200   (in another terminal)
//   npx tsx --env-file=.env.local scripts/capture-media.mts [baseUrl]
//
// Writes docs/media/demo.gif and docs/media/*.png. The live part plays a
// short real lesson (students in Spanish, Arabic and Vietnamese, an "I'm
// lost" moment, a question in Spanish, the recap), so the pictures show real
// translations.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { chromium, devices, type Browser, type Page } from "@playwright/test";
import { studentStrings } from "@/i18n/student";
import { getLanguage } from "@/lib/languages";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = "docs/media";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: "light" as const };
const phone = { ...devices["Pixel 7"], deviceScaleFactor: 2, colorScheme: "light" as const };
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

// 1. Landing page.
{
  const page = await (await browser.newContext(desktop)).newPage();
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  await shot(page, "landing");
  log("landing");
}

// 2. The Demo Replay, as a video turned into a GIF: captions arriving, the
// phone switching to Arabic, the lost moment, a tapped key term, the recap.
{
  const videoDir = `${OUT}/.video`;
  rmSync(videoDir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo`);
  const phoneEl = page.getByRole("region", { name: "A student's phone" });
  await page.getByRole("button", { name: /Speed 1x/ }).click();
  await sleep(9000);
  await phoneEl.getByRole("radio", { name: "العربية" }).click();
  await sleep(5000);
  await page.getByRole("button", { name: "Jump to the lost moment" }).click();
  await sleep(6000);
  await phoneEl.getByRole("radio", { name: "Español" }).click();
  await sleep(1500);
  await phoneEl.locator("ol button").first().click();
  await sleep(3500);
  await page.keyboard.press("Escape");
  await page.getByLabel("Replay position").press("End");
  await sleep(4500);
  await ctx.close();
  // A sharp still of the same moment for Devpost.
  const still = await (await browser.newContext(desktop)).newPage();
  await still.goto(`${BASE}/demo`);
  await still.getByRole("region", { name: "A student's phone" }).getByRole("radio", { name: "العربية" }).click();
  await still.getByRole("button", { name: "Jump to the lost moment" }).click();
  await sleep(6000);
  await shot(still, "demo");
  const webm = readdirSync(videoDir).find((f) => f.endsWith(".webm"))!;
  renameSync(`${videoDir}/${webm}`, `${OUT}/demo.webm`);
  rmSync(videoDir, { recursive: true, force: true });
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", "1.5", "-i", `${OUT}/demo.webm`,
    "-vf", "fps=8,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    `${OUT}/demo.gif`,
  ]);
  rmSync(`${OUT}/demo.webm`);
  log("demo gif");
}

// 3. A real lesson through the real AI.
const LESSON = {
  title: "Photosynthesis",
  subject: "Biology",
  keyTerms: ["photosynthesis", "chloroplast", "chlorophyll", "carbon dioxide", "glucose", "ATP", "Calvin cycle"],
};
const SENTENCES = [
  "Good morning everyone, today we're learning about photosynthesis.",
  "Photosynthesis is how plants make their own food, using sunlight.",
  "Inside every leaf there are tiny parts called chloroplasts, and they're green because of chlorophyll.",
  "The light energy is stored in a molecule called ATP, which works like a tiny battery.",
  "Then the Calvin cycle uses that ATP to turn carbon dioxide into glucose.",
  "Let me say that again more simply: the plant uses stored energy to build sugar out of air.",
];

async function join(b: Browser, code: string, nickname: string, lang: string): Promise<Page> {
  const page = await (await b.newContext(phone)).newPage();
  await page.goto(`${BASE}/join/${code}`);
  await page.getByLabel("Your name or a nickname").fill(nickname);
  await page.getByText(new RegExp(`^${getLanguage(lang)!.native}$`)).click();
  await page.getByRole("button", { name: "Join lesson" }).click();
  await page.waitForURL(/\/l\//);
  return page;
}

const teacher = await (await browser.newContext(desktop)).newPage();
await teacher.goto(`${BASE}/`);
await teacher.getByRole("button", { name: "Try it live" }).first().click();
await teacher.waitForURL(/\/teach\?guest=1/);
await teacher.locator("#title").fill(LESSON.title);
await teacher.locator("#subject").fill(LESSON.subject);
await teacher.locator("#keyTerms").fill(LESSON.keyTerms.join(", "));
await shot(teacher, "new-lesson");
await teacher.getByRole("button", { name: "Start lesson" }).click();
await teacher.waitForURL(/\/teach\/[a-z0-9]+$/);
const lessonUrl = teacher.url();
const code = (await teacher.getByLabel(/^Join code/).getAttribute("aria-label"))!.replace("Join code ", "").replace(/\s/g, "");
log("lesson", code);

const es = await join(browser, code, "Ana", "es");
const ar = await join(browser, code, "Omar", "ar");
const vi = await join(browser, code, "Linh", "vi");
log("students joined; letting the definitions build");
await sleep(25_000);

const box = teacher.getByLabel("Type a sentence to send to students");
for (const [i, sentence] of SENTENCES.entries()) {
  await box.fill(sentence);
  await box.press("Enter");
  await sleep(6000);
  if (i === 4) {
    for (const [p, lang] of [[es, "es"], [ar, "ar"], [vi, "vi"]] as const) await p.getByRole("button", { name: studentStrings(lang).lost }).click();
    const t = studentStrings("es");
    await es.getByRole("button", { name: t.ask, exact: true }).click();
    await es.getByRole("textbox", { name: t.askTitle }).fill("¿Por qué la planta necesita ATP?");
    await es.getByRole("button", { name: t.send, exact: true }).click();
    await es.keyboard.press("Escape");
  }
}
// Let the "I'm lost" buttons come back from their 20-second pause.
await sleep(15_000);
await teacher.evaluate(() => window.scrollTo(0, 0));
await shot(teacher, "teacher");
await shot(es, "phone-spanish");
await shot(ar, "phone-arabic");
await shot(vi, "phone-vietnamese");
await es.locator("ol button").first().click();
await sleep(1500);
await shot(es, "phone-key-term");
await es.keyboard.press("Escape");
log("live screens");

const projector = await teacher.context().newPage();
await projector.goto(`${lessonUrl}/present`, { waitUntil: "networkidle" }).catch(() => {});
await sleep(2000);
await shot(projector, "projector");

await teacher.getByRole("button", { name: "End lesson" }).click();
await teacher.getByRole("button", { name: "Click again to end" }).click();
log("ended; waiting for the recap");
const readRecap = vi.getByRole("link", { name: studentStrings("vi").readRecap });
await readRecap.waitFor({ timeout: 120_000 });
await readRecap.click();
await vi.waitForURL(/\/r\//);
await vi.getByText(studentStrings("vi").whatWeLearned).waitFor();
// Wait until the whole recap is in Vietnamese (the "translating" note is gone).
await vi.locator("p[lang=vi]").first().waitFor({ timeout: 120_000 });
await vi.getByText(studentStrings("vi").translatingRecap).waitFor({ state: "detached", timeout: 180_000 });
await sleep(1000);
await shot(vi, "recap-vietnamese");

await teacher.goto(`${lessonUrl}/review`);
await teacher.waitForLoadState("networkidle");
await shot(teacher, "review", true);
log("done:", readdirSync(OUT).join(", "));
await browser.close();
