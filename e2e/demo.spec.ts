import { expect, test } from "@playwright/test";

// P7: the Demo Replay works with zero setup (no login, no database, no AI).

test("the demo replay tells the whole story", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Watch a live demo" }).first().click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByText(/9th-grade Biology class/)).toBeVisible();

  const phone = page.getByRole("region", { name: "A student's phone" });
  const teacher = page.getByRole("region", { name: "The teacher's screen" });

  // Captions arrive on the phone in Spanish.
  await expect(phone.locator("p[lang=es]").first()).toBeVisible({ timeout: 15_000 });

  // Switching the phone's language is instant, and Arabic reads right to left.
  await phone.getByRole("radio", { name: "العربية" }).click();
  await expect(phone.locator("p[lang=ar][dir=rtl]").first()).toBeVisible();

  // Jump to the moment students get lost: the teacher sees it.
  await page.getByRole("button", { name: "Jump to the lost moment" }).click();
  await expect(teacher.getByText(/3 students lost/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/tap “I'm lost”/)).toBeVisible();

  // Tap a key term on the phone: meaning in the phone's language.
  await phone.getByRole("radio", { name: "Español" }).click();
  await phone.locator("ol button").first().click();
  await expect(phone.getByRole("dialog")).toContainText("Hear it");

  // Skip to the end: the recap opens on the phone.
  await page.getByLabel("Replay position").press("End");
  await expect(phone.getByText("What we learned")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Replay of a lesson processed by Aula/)).toBeVisible();
});
