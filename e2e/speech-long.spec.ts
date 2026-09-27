import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startGuestLesson } from "./helpers";

// A teacher who talks without pausing: the speech is sent in pieces while
// they're still talking (see SpeechChunker), with no words lost or repeated.
// Real Chrome speech with a synthesized voice, like speech.spec.ts:
//   SPEECH=1 npx playwright test e2e/speech-long.spec.ts

const WAV = "test-results/long-voice.wav";
const LONG =
  "okay everyone the mitochondria is where the cell makes its energy and it does that through a process called cellular respiration which uses glucose and oxygen to make a molecule called ATP that the cell spends on moving and growing and dividing";

test.skip(!process.env.SPEECH, "set SPEECH=1 (needs Google Chrome and macOS `say`)");
test.use({
  channel: "chrome",
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${process.cwd()}/${WAV}`] },
});

test.beforeAll(() => {
  if (existsSync(WAV)) return;
  mkdirSync("test-results", { recursive: true });
  execSync(`say -r 170 -o ${WAV} --data-format=LEI16@16000 "${LONG}"`);
});

test("non-stop speech is sent in pieces while the teacher is still talking", async ({ browser }) => {
  const { page } = await startGuestLesson(browser);
  await page.getByRole("button", { name: "Start listening" }).click();
  const lines = page.getByRole("region", { name: "Transcript" }).locator("ol li");
  await expect(lines.first()).toContainText(/mitochondria/i, { timeout: 25_000 });
  await expect.poll(async () => (await lines.allInnerTexts()).join(" "), { timeout: 40_000 }).toMatch(/dividing/i);
  const texts = await lines.allInnerTexts();
  console.log(texts);
  expect(texts.length).toBeGreaterThanOrEqual(2);
  // Up to the end of the recording (the fake mic then loops), nothing was
  // sent twice.
  const once = texts.join(" ").toLowerCase().split("dividing")[0];
  expect(once.match(/mitochondria/g)).toHaveLength(1);
  expect(once.match(/respiration/g)).toHaveLength(1);
});
