import { devices, expect, type Browser, type Page } from "@playwright/test";
import { studentStrings } from "../src/i18n/student";
import { getLanguage } from "../src/lib/languages";

// The student interface in a given language: tests click buttons by the
// words a student in that language actually sees.
export const S = (lang: string) => studentStrings(lang);
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "Wait {s}s" -> a regex matching "Wait 17s" in that language.
export const waitRe = (lang: string) => new RegExp(escapeRe(S(lang).waitSeconds).replace("\\{s\\}", "\\d+"));

export async function startGuestLesson(browser: Browser): Promise<{ page: Page; code: string }> {
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Try it live" }).first().click();
  await page.waitForURL(/\/teach\?guest=1/);
  await page.getByRole("button", { name: "Start lesson" }).click();
  await page.waitForURL(/\/teach\/[a-z0-9]+$/);
  const label = await page.getByLabel(/^Join code/).getAttribute("aria-label");
  const code = label!.replace("Join code ", "").replace(/\s/g, "");
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return { page, code };
}

export async function joinAsStudent(browser: Browser, code: string, nickname: string, lang: string): Promise<Page> {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel("Your name or a nickname").fill(nickname);
  const label = lang === "en" ? "English" : getLanguage(lang)!.native;
  await page.getByText(new RegExp(`^${escapeRe(label)}$`)).click();
  await page.getByRole("button", { name: "Join lesson" }).click();
  await page.waitForURL(new RegExp(`/l/${code}$`));
  await expect(page.getByRole("banner").getByRole("status")).toHaveText(S(lang).live);
  return page;
}

export async function say(teacher: Page, text: string) {
  const box = teacher.getByLabel("Type a sentence to send to students");
  await box.fill(text);
  await box.press("Enter");
  await expect(teacher.getByText(text, { exact: true }).first()).toBeVisible();
}

// The on-screen caption list (the screen-reader announcer repeats lines, so
// assertions should look here).
export const captions = (page: Page) => page.locator("ol");
