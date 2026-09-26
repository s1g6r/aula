import { expect, test, devices, type Browser, type Page } from "@playwright/test";

// P2 golden path: a guest teacher starts a lesson, a student joins on a
// phone, typed sentences reach the phone, a 10-second Wi-Fi drop loses
// nothing, and ending the lesson reaches the student.

async function startGuestLesson(browser: Browser): Promise<{ page: Page; code: string }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Try it live" }).click();
  await page.waitForURL(/\/teach\?guest=1/);
  await page.getByRole("button", { name: "Start lesson" }).click();
  await page.waitForURL(/\/teach\/[a-z0-9]+$/);
  const label = await page.getByLabel(/^Join code/).getAttribute("aria-label");
  const code = label!.replace("Join code ", "").replace(/\s/g, "");
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return { page, code };
}

async function joinAsStudent(browser: Browser, code: string, nickname: string, language: RegExp): Promise<Page> {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel("Your name or a nickname").fill(nickname);
  await page.getByText(language).click();
  await page.getByRole("button", { name: "Join lesson" }).click();
  await page.waitForURL(new RegExp(`/l/${code}$`));
  return page;
}

async function say(teacher: Page, text: string) {
  const box = teacher.getByLabel("Type a sentence to send to students");
  await box.fill(text);
  await box.press("Enter");
  await expect(teacher.getByText(text, { exact: true })).toBeVisible();
}

test("teacher speech reaches a student's phone, survives a Wi-Fi drop, and ends cleanly", async ({ browser }) => {
  const { page: teacher, code } = await startGuestLesson(browser);
  const student = await joinAsStudent(browser, code, "Ana", /^Español$/);

  await expect(student.getByText("Waiting for your teacher to start talking...")).toBeVisible();
  await expect(teacher.getByRole("heading", { name: "1 student" })).toBeVisible();
  await expect(teacher.getByText("Español")).toBeVisible();

  await say(teacher, "Today we are talking about photosynthesis.");
  await expect(student.getByText("Today we are talking about photosynthesis.")).toBeVisible({ timeout: 5000 });

  // Wi-Fi drops for 10 seconds while the teacher keeps talking.
  await student.context().setOffline(true);
  await expect(student.getByRole("status")).toHaveText(/No connection/);
  await say(teacher, "Plants take in carbon dioxide from the air.");
  await say(teacher, "The green color comes from chlorophyll.");
  await student.waitForTimeout(10_000);
  // Proves the connection really was cut: nothing arrived while offline.
  await expect(student.getByText("Plants take in carbon dioxide from the air.")).toHaveCount(0);
  await student.context().setOffline(false);

  await expect(student.getByText("Plants take in carbon dioxide from the air.")).toBeVisible({ timeout: 15_000 });
  await expect(student.getByText("The green color comes from chlorophyll.")).toBeVisible();
  const order = await student.locator("ol > li").allInnerTexts();
  const joined = order.join("\n");
  expect(joined.indexOf("photosynthesis")).toBeLessThan(joined.indexOf("carbon dioxide"));
  expect(joined.indexOf("carbon dioxide")).toBeLessThan(joined.indexOf("chlorophyll"));

  await teacher.getByRole("button", { name: "End lesson" }).click();
  await teacher.getByRole("button", { name: "Click again to end" }).click();
  await expect(student.getByText("The lesson has ended.").first()).toBeVisible({ timeout: 5000 });
});

test("Arabic students get a right-to-left language label", async ({ browser }) => {
  const { code } = await startGuestLesson(browser);
  const student = await joinAsStudent(browser, code, "Omar", /^العربية$/);
  const chip = student.getByRole("button", { name: /Change language/ });
  await expect(chip.locator("[dir=rtl]")).toHaveText("العربية");
});
