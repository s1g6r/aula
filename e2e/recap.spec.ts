import { expect, test } from "@playwright/test";
import { captions, joinAsStudent, S, say, startGuestLesson } from "./helpers";

// P6: ending a lesson produces a recap in each student's language, a public
// "What you missed" page in any language, and a review page for the teacher.
// Uses the mock AI (recaps are "[lang] ..." versions of the English).

test.skip(Boolean(process.env.BASE_URL), "needs the mock AI");

test("lesson end -> recap on the phone, review for the teacher, any language for absent students", async ({ browser }) => {
  test.setTimeout(90_000);
  const { page: teacher, code } = await startGuestLesson(browser);
  const ana = await joinAsStudent(browser, code, "Ana", "es");

  await say(teacher, "Today we are talking about photosynthesis.");
  await say(teacher, "The Calvin cycle uses ATP to make glucose.");
  await expect(captions(ana).getByText("es: The Calvin cycle uses ATP to make glucose.")).toBeVisible({ timeout: 5000 });
  await ana.getByRole("button", { name: S("es").lost }).click();

  await teacher.getByRole("button", { name: "End lesson" }).click();
  await teacher.getByRole("button", { name: "Click again to end" }).click();

  // The student's phone offers the recap in Spanish.
  const read = ana.getByRole("link", { name: S("es").readRecap });
  await expect(read).toBeVisible({ timeout: 20_000 });
  await read.click();
  await expect(ana).toHaveURL(/\/r\/[a-z0-9]+\?lang=es$/);
  await expect(ana.getByText("[es] Recap: Today we are talking about photosynthesis.")).toBeVisible({ timeout: 20_000 });
  await expect(ana.getByText("photosynthesis-es")).toBeVisible();
  await ana.getByText(S("es").showAnswer).first().click();
  await expect(ana.getByText("[es] Answer 1.")).toBeVisible();

  // An absent student opens the same link in Vietnamese: translated on demand.
  const recapUrl = ana.url().replace("?lang=es", "");
  const absent = await (await browser.newContext()).newPage();
  await absent.goto(`${recapUrl}?lang=vi`);
  await expect(absent.getByText("[vi] Recap: Today we are talking about photosynthesis.")).toBeVisible({ timeout: 20_000 });

  // The teacher's review: the confusion timeline and the recap.
  await teacher.getByRole("link", { name: "Review this lesson" }).click();
  await expect(teacher.getByRole("heading", { name: "Where students got lost" })).toBeVisible();
  await expect(teacher.getByRole("button", { name: /1 student lost at "The Calvin cycle uses ATP to make glucose\."/ })).toBeVisible();
  await expect(teacher.getByText("Worth re-teaching tomorrow")).toBeVisible();
  await expect(teacher.getByText("Recap: Today we are talking about photosynthesis.")).toBeVisible();

  // Deleting the lesson removes the recap too.
  await teacher.getByRole("button", { name: "Delete this lesson" }).click();
  await teacher.getByRole("button", { name: "Yes, delete everything" }).click();
  await teacher.waitForURL(/\/teach$/);
  const gone = await absent.goto(recapUrl);
  expect(gone?.status()).toBe(404);
});
