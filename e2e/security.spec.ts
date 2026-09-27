import { expect, test } from "@playwright/test";
import { joinAsStudent, startGuestLesson } from "./helpers";

// The security headers are sent, and the content security policy doesn't
// break any screen (a blocked script or style would show up here).
test("every screen loads under the security headers without a blocked resource", async ({ browser, request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["permissions-policy"]).toContain("microphone=(self)");
  expect(h["x-powered-by"]).toBeUndefined();
  expect((await request.get("/.well-known/security.txt")).ok()).toBe(true);

  const blocked: string[] = [];
  const watch = (page: import("@playwright/test").Page) =>
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(`${page.url()}: ${m.text()}`);
    });

  const { page: teacher, code } = await startGuestLesson(browser);
  watch(teacher);
  await teacher.reload();
  await teacher.getByLabel(/^Join code/).waitFor();
  const student = await joinAsStudent(browser, code, "Sec", "es");
  watch(student);
  await student.reload();
  for (const path of ["/", "/demo", "/join", "/login"]) {
    await teacher.goto(path);
    await teacher.waitForLoadState("networkidle");
  }
  expect(blocked).toEqual([]);
});
