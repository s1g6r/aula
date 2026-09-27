import { expect, test } from "@playwright/test";
import { captions, joinAsStudent, S, say, startGuestLesson } from "./helpers";

// P3: translations stream to each phone in its own language, key terms are
// highlighted and tappable, and AI problems fall back to English.
// The AI here is e2e/mock-ai.mjs, which "translates" to "<lang>: <English>",
// so these run locally only (real-ai.spec.ts covers the real model).
test.skip(Boolean(process.env.BASE_URL), "needs the mock AI");

test("each phone gets its own language, with tappable key terms", async ({ browser }) => {
  const { page: teacher, code } = await startGuestLesson(browser);
  const spanish = await joinAsStudent(browser, code, "Ana", "es");
  const arabic = await joinAsStudent(browser, code, "Omar", "ar");

  await say(teacher, "Today we are talking about photosynthesis.");

  const esLine = captions(spanish).getByText("es: Today we are talking about photosynthesis.");
  await expect(esLine).toBeVisible({ timeout: 5000 });
  await expect(esLine).toHaveAttribute("lang", "es");
  // Bilingual mode: the English stays underneath.
  await expect(captions(spanish).locator("p[lang=en]", { hasText: "Today we are talking about photosynthesis." })).toBeVisible();

  const arLine = captions(arabic).getByText("ar: Today we are talking about photosynthesis.");
  await expect(arLine).toBeVisible({ timeout: 5000 });
  await expect(arLine).toHaveAttribute("dir", "rtl");

  // Tap the highlighted term: English word, hear it, definition in Spanish.
  await esLine.getByRole("button", { name: "photosynthesis" }).click();
  const sheet = spanish.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "photosynthesis" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: S("es").hearIt })).toBeVisible();
  await expect(sheet.getByText("Definition of photosynthesis in es.")).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByText(S("es").savedToWords)).toBeVisible();
  await spanish.keyboard.press("Escape");

  // Turning bilingual mode off hides the English line.
  await spanish.getByRole("button", { name: S("es").settings }).click();
  await spanish.getByLabel(S("es").showEnglish).uncheck();
  await spanish.keyboard.press("Escape");
  await expect(captions(spanish).locator("p[lang=en]", { hasText: "Today we are talking about photosynthesis." })).toHaveCount(0);
});

test("a misheard key term is repaired before anyone sees or translates it", async ({ browser }) => {
  const { page: teacher, code } = await startGuestLesson(browser);
  const student = await joinAsStudent(browser, code, "Linh", "vi");
  await say(teacher, "Water moves through the sell membrane.");
  // The repaired sentence is what gets translated.
  await expect(captions(student).getByText("vi: Water moves through the cell membrane.")).toBeVisible({ timeout: 5000 });
  await expect(captions(student).locator("p[lang=en]", { hasText: "Water moves through the cell membrane." })).toBeVisible();
  await expect(captions(teacher).getByText("Water moves through the cell membrane.")).toBeVisible();
});

test("when the AI fails or hangs, students still see English, never a blank line", async ({ browser }) => {
  const { page: teacher, code } = await startGuestLesson(browser);
  const student = await joinAsStudent(browser, code, "Ana", "es");

  await say(teacher, "This sentence will [fail] to translate.");
  await expect(captions(student).getByText("This sentence will [fail] to translate.")).toBeVisible({ timeout: 5000 });
  await expect(captions(student).getByText(S("es").translationUnavailable)).toBeVisible({ timeout: 5000 });

  await say(teacher, "This one makes the model [hang] forever.");
  await expect(captions(student).getByText("This one makes the model [hang] forever.")).toBeVisible({ timeout: 5000 });
  await expect(captions(student).getByText(S("es").translationUnavailable)).toHaveCount(2, { timeout: 10_000 });

  // And the next normal sentence still translates.
  await say(teacher, "Back to normal now.");
  await expect(captions(student).getByText("es: Back to normal now.")).toBeVisible({ timeout: 10_000 });
});
