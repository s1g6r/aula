import { expect, test } from "@playwright/test";
import { captions, joinAsStudent, say, startGuestLesson } from "./helpers";

// Runs a short real lesson against the real AI provider and prints timings.
// Skipped unless REAL_AI=1, since it costs real requests:
//   BASE_URL=http://localhost:3000 REAL_AI=1 npx playwright test e2e/real-ai.spec.ts

test.skip(!process.env.REAL_AI, "set REAL_AI=1 to run against the real model");
test.setTimeout(180_000);

const SENTENCES = [
  "Okay everyone, today we're talking about photosynthesis, which is how plants make their own food.",
  "Plants take in carbon dioxide from the air and water from the soil.",
  "The green color comes from chlorophyll, which absorbs the energy in sunlight.",
  "Then the Calvin cycle uses that ATP to turn carbon dioxide into glucose.",
];

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];

// Speaks each sentence, waits until every phone shows it translated, and
// reports how long each language took.
async function runLesson(browser: import("@playwright/test").Browser, phones: [string, RegExp][], gapMs: number) {
  const { page: teacher, code } = await startGuestLesson(browser);
  const joined = [];
  for (const [lang, label] of phones) joined.push({ lang, page: await joinAsStudent(browser, code, `S-${lang}`, label) });
  await teacher.waitForTimeout(8000); // students settle in; glossaries build before the teacher starts
  const all: Record<string, number[]> = {};
  for (const sentence of SENTENCES) {
    const sent = Date.now();
    await say(teacher, sentence);
    const row: string[] = [];
    await Promise.all(
      joined.map(async ({ lang, page }) => {
        const line = captions(page).locator("li", { hasText: sentence.slice(0, 40) }).locator(`p[lang=${lang}]`);
        await expect(line).toBeVisible({ timeout: 30_000 });
        const ms = Date.now() - sent;
        (all[lang] ??= []).push(ms);
        row.push(`  ${lang} ${ms}ms: ${await line.innerText()}`);
      }),
    );
    console.log(`\n"${sentence}"\n${row.join("\n")}`);
    await teacher.waitForTimeout(gapMs);
  }
  for (const [lang, xs] of Object.entries(all)) console.log(`${lang}: p50 ${pct(xs, 50)}ms, max ${Math.max(...xs)}ms`);
  return joined;
}

test("fast path: Spanish and Arabic phones", async ({ browser }) => {
  await runLesson(browser, [["es", /^Español$/], ["ar", /^العربية$/]], 5000);
});

test("routed path: Spanish and Somali phones, plus a glossary definition", async ({ browser }) => {
  const [spanish] = await runLesson(browser, [["es", /^Español$/], ["so", /^Soomaali$/]], 5000);
  await captions(spanish.page).getByRole("button", { name: /fotosíntesis/i }).first().click();
  const sheet = spanish.page.getByRole("dialog");
  await expect(sheet.getByText("The definition is on its way...")).toHaveCount(0, { timeout: 60_000 });
  console.log("\nGlossary (es):", (await sheet.innerText()).replace(/\n/g, " | "));
});
