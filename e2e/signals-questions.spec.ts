import { expect, test } from "@playwright/test";
import { captions, joinAsStudent, say, startGuestLesson } from "./helpers";

// P4: "I'm lost" / "Slower" reach the teacher as anonymous counts anchored
// to a sentence, and questions in any language reach the teacher in English.
// Runs against the mock AI locally and the real one in production (BASE_URL).

const mockAi = !process.env.BASE_URL;

test("lost and slower signals show up as counts on the right sentence", async ({ browser }) => {
  const { page: teacher, code } = await startGuestLesson(browser);
  const ana = await joinAsStudent(browser, code, "Ana", /^Español$/);
  const omar = await joinAsStudent(browser, code, "Omar", /^العربية$/);

  await say(teacher, "Photosynthesis happens in the chloroplast.");
  await say(teacher, "Then the Calvin cycle uses that ATP to make glucose.");
  await expect(captions(ana).getByText("Then the Calvin cycle uses that ATP to make glucose.").first()).toBeVisible({ timeout: 15_000 });
  await expect(captions(omar).getByText("Then the Calvin cycle uses that ATP to make glucose.").first()).toBeVisible({ timeout: 15_000 });

  const pulse = teacher.getByRole("region", { name: /Understanding/ });
  await expect(pulse).toContainText("No signals right now");

  await ana.getByRole("button", { name: "I'm lost" }).click();
  await expect(ana.getByText("Sent. Your teacher sees how many students are lost, never who.")).toBeVisible();
  await expect(pulse).toContainText("1 student lost");
  await expect(pulse).toContainText("Then the Calvin cycle uses that ATP to make glucose.");

  await omar.getByRole("button", { name: "I'm lost" }).click();
  await expect(pulse).toContainText("2 students lost");
  await expect(captions(teacher).locator("li", { hasText: "Calvin cycle" })).toContainText("2 lost");

  // A second tap within 20 seconds is blocked (and wouldn't count twice anyway).
  await expect(ana.getByRole("button", { name: /Wait \d+s/ })).toBeDisabled();

  await omar.getByRole("button", { name: "Slower, please" }).click();
  await expect(pulse).toContainText("1 student asked you to slow down");

  // Students never see each other's names.
  await expect(ana.getByText("Omar")).toHaveCount(0);
});

test("a question in Spanish reaches the teacher in English and can be answered", async ({ browser }) => {
  const { page: teacher, code } = await startGuestLesson(browser);
  const ana = await joinAsStudent(browser, code, "Ana", /^Español$/);
  const omar = await joinAsStudent(browser, code, "Omar", /^العربية$/);
  const panel = teacher.getByRole("region", { name: /Questions/ });

  await ana.getByRole("button", { name: "Ask" }).click();
  await ana.getByRole("textbox", { name: "Ask your teacher" }).fill("¿Qué es el ATP?");
  await ana.getByRole("button", { name: "Send" }).click();
  await expect(ana.getByRole("dialog").getByText("Sent")).toBeVisible();

  const english = mockAi ? panel.getByText("EN: ¿Qué es el ATP?") : panel.getByText(/what is (the )?ATP/i);
  await expect(english).toBeVisible({ timeout: 15_000 });
  await expect(panel.locator("p[lang=es]", { hasText: "¿Qué es el ATP?" })).toBeVisible();
  await expect(panel).toContainText("Ana · Spanish");

  await panel.getByRole("button", { name: "Mark answered" }).click();
  await expect(ana.getByRole("dialog").getByText("Your teacher answered")).toBeVisible({ timeout: 5000 });

  // The light profanity filter keeps this off the teacher's screen.
  await omar.getByRole("button", { name: "Ask" }).click();
  await omar.getByRole("textbox", { name: "Ask your teacher" }).fill("this class is shit");
  await omar.getByRole("button", { name: "Send" }).click();
  await expect(omar.getByRole("dialog").getByText("Sent")).toBeVisible();
  await teacher.waitForTimeout(mockAi ? 1000 : 8000);
  await expect(panel).not.toContainText("shit");

  // Muting hides a student's questions.
  await panel.getByRole("button", { name: "Mute" }).click();
  await panel.getByRole("button", { name: "Hide all from Ana?" }).click();
  await expect(english).toHaveCount(0, { timeout: 5000 });
});
