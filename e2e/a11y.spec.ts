import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { joinAsStudent, say, startGuestLesson } from "./helpers";

// Automated accessibility audit (WCAG 2.1 A and AA rules) of every main screen.

async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.help} :: ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, `${name} accessibility violations`).toEqual([]);
}

test("public pages have no WCAG A/AA violations", async ({ page }) => {
  for (const path of ["/", "/join", "/login", "/signup"]) {
    await page.goto(path);
    await audit(page, path);
  }
  await page.goto("/demo");
  await page.waitForTimeout(6000); // let captions and translations appear
  await audit(page, "/demo");
});

test("teacher, student and projector screens have no WCAG A/AA violations", async ({ browser }) => {
  const { page: teacher, code } = await startGuestLesson(browser);
  const student = await joinAsStudent(browser, code, "Ana", "es");
  await say(teacher, "Today we are talking about photosynthesis.");
  await expect(student.locator("ol p[lang=es]").first()).toBeVisible({ timeout: 10_000 });
  await audit(teacher, "teacher live");
  await audit(student, "student live");
  const projector = await teacher.context().newPage();
  await projector.goto(teacher.url() + "/present");
  await expect(projector.getByText("Today we are talking about photosynthesis.")).toBeVisible();
  await audit(projector, "projector");
});
