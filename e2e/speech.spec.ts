import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startGuestLesson } from "./helpers";

// The real speech path: a synthesized voice (macOS `say`) is played into
// Google Chrome as its microphone, and the words must show up as a caption.
// Needs Chrome (not Playwright's bundled Chromium, which has no speech
// service) and macOS, so it's opt-in:
//   SPEECH=1 npx playwright test e2e/speech.spec.ts

const WAV = "test-results/lesson-voice.wav";

test.skip(!process.env.SPEECH, "set SPEECH=1 (needs Google Chrome and macOS `say`)");
test.use({
  channel: "chrome",
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${process.cwd()}/${WAV}`] },
});

test.beforeAll(() => {
  if (existsSync(WAV)) return;
  mkdirSync("test-results", { recursive: true });
  execSync(`say -o ${WAV} --data-format=LEI16@16000 "Today we are talking about photosynthesis. Plants make their own food from sunlight."`);
});

test("the teacher's voice becomes a caption", async ({ browser }) => {
  const { page } = await startGuestLesson(browser);
  await page.getByRole("button", { name: "Start listening" }).click();
  await expect(page.getByText(/^Listening/)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("ol li", { hasText: /photosynthesis/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Microphone")).toBeVisible();
});
