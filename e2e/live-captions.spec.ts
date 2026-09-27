import { expect, test } from "@playwright/test";
import { captions, joinAsStudent, say, startGuestLesson } from "./helpers";

// P2 golden path: a guest teacher starts a lesson, a student joins on a
// phone, typed sentences reach the phone, a 10-second Wi-Fi drop loses
// nothing, and ending the lesson reaches the student.

test("teacher speech reaches a student's phone, survives a Wi-Fi drop, and ends cleanly", async ({ browser }) => {
  test.setTimeout(90_000); // includes a deliberate 10s outage; production is slower than local
  const { page: teacher, code } = await startGuestLesson(browser);
  const student = await joinAsStudent(browser, code, "Ana", /^Español$/);

  await expect(student.getByText("Waiting for your teacher to start talking...")).toBeVisible();
  await expect(teacher.getByRole("heading", { name: "1 student" })).toBeVisible();
  await expect(teacher.getByText("Español")).toBeVisible();

  await say(teacher, "Today we are talking about photosynthesis.");
  await expect(captions(student).getByText("Today we are talking about photosynthesis.").first()).toBeVisible({ timeout: 5000 });

  // Wi-Fi drops for 10 seconds while the teacher keeps talking.
  await student.context().setOffline(true);
  await expect(student.getByRole("banner").getByRole("status")).toHaveText(/No connection/);
  await say(teacher, "Plants take in carbon dioxide from the air.");
  await say(teacher, "The green color comes from chlorophyll.");
  await student.waitForTimeout(10_000);
  // Proves the connection really was cut: nothing arrived while offline.
  await expect(captions(student).getByText("Plants take in carbon dioxide from the air.").first()).toHaveCount(0);
  await student.context().setOffline(false);

  await expect(captions(student).getByText("Plants take in carbon dioxide from the air.").first()).toBeVisible({ timeout: 15_000 });
  await expect(captions(student).getByText("The green color comes from chlorophyll.").first()).toBeVisible();
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
