// Records the Demo Replay by running the scripted lesson through the real
// app: a guest teacher, four students in four languages, real Featherless
// translations, glossary, speech-recognition repair, signals, a question and
// the recap. Everything the phones and the teacher's screen received is read
// back from the database and written to src/demo/replay.json, with the
// delays we actually measured.
//
//   npm run dev            (in another terminal, with AI_API_KEY set)
//   npx tsx --env-file=.env.local scripts/generate-replay.mts [baseUrl]

import { writeFileSync } from "node:fs";
import { chromium, devices, type Page } from "@playwright/test";
import { db } from "@/lib/db";
import { DEMO_ACTIONS, DEMO_LESSON, DEMO_SENTENCES, DEMO_STUDENTS, sentenceTimings } from "@/demo/lesson-script";

const BASE = process.argv[2] ?? "http://localhost:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const browser = await chromium.launch();

// Teacher: guest session, new lesson with our title, subject and key terms.
const teacher = await (await browser.newContext()).newPage();
await teacher.goto(`${BASE}/`);
await teacher.getByRole("button", { name: "Try it live" }).click();
await teacher.waitForURL(/\/teach\?guest=1/);
await teacher.locator("#title").fill(DEMO_LESSON.title);
await teacher.locator("#subject").fill(DEMO_LESSON.subject);
await teacher.locator("#keyTerms").fill(DEMO_LESSON.keyTerms.join(", "));
await teacher.getByRole("button", { name: "Start lesson" }).click();
await teacher.waitForURL(/\/teach\/[a-z0-9]+$/);
const lessonId = teacher.url().split("/").pop()!;
const code = (await teacher.getByLabel(/^Join code/).getAttribute("aria-label"))!.replace("Join code ", "").replace(/\s/g, "");
log("lesson", lessonId, code);

// Students join in their languages.
const phones: Record<string, Page> = {};
for (const s of DEMO_STUDENTS) {
  const page = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
  await page.goto(`${BASE}/join/${code}`);
  await page.getByLabel("Your name or a nickname").fill(s.nickname);
  await page.getByText(new RegExp(`^${s.label}$`)).click();
  await page.getByRole("button", { name: "Join lesson" }).click();
  await page.waitForURL(new RegExp(`/l/${code}$`));
  phones[s.lang] = page;
  log("joined", s.nickname, s.lang);
}
log("letting glossaries start before the lesson...");
await sleep(20_000);

// The lesson, at speaking pace.
const box = teacher.getByLabel("Type a sentence to send to students");
const timings = sentenceTimings();
const t0 = Date.now();
for (let i = 0; i < DEMO_SENTENCES.length; i++) {
  const wait = timings[i].endMs - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  await box.fill(DEMO_SENTENCES[i]);
  await box.press("Enter");
  log(`#${i + 1}`, DEMO_SENTENCES[i]);
  const n = i + 1;
  if (n === DEMO_ACTIONS.slower.after) {
    await sleep(1500);
    await phones[DEMO_ACTIONS.slower.by].getByRole("button", { name: "Slower, please" }).click();
  }
  if (n === DEMO_ACTIONS.lost.after) {
    for (const lang of DEMO_ACTIONS.lost.by) {
      await sleep(1200);
      await phones[lang].getByRole("button", { name: "I'm lost" }).click();
    }
  }
  if (n === DEMO_ACTIONS.question.after) {
    const p = phones[DEMO_ACTIONS.question.by];
    await p.getByRole("button", { name: "Ask" }).click();
    await p.getByRole("textbox", { name: "Ask your teacher" }).fill(DEMO_ACTIONS.question.text);
    await p.getByRole("button", { name: "Send" }).click();
    await p.keyboard.press("Escape");
  }
}
await sleep(8000); // let the last translations land
await teacher.getByRole("button", { name: "End lesson" }).click();
await teacher.getByRole("button", { name: "Click again to end" }).click();
log("lesson ended; waiting for recap, its translations and every glossary...");

const langs = DEMO_STUDENTS.map((s) => s.lang);
for (let i = 0; i < 90; i++) {
  const [recap, terms] = await Promise.all([
    db.recap.findUnique({ where: { lessonId }, include: { translations: { select: { lang: true } } } }),
    db.term.groupBy({ by: ["lang"], where: { lessonId }, _count: true }),
  ]);
  const glossaryDone = langs.every((l) => (terms.find((t) => t.lang === l)?._count ?? 0) >= DEMO_LESSON.keyTerms.length);
  const recapDone = recap && langs.every((l) => recap.translations.some((t) => t.lang === l));
  if (glossaryDone && recapDone) break;
  if (i % 6 === 0) log("waiting...", { recap: Boolean(recap), recapLangs: recap?.translations.map((t) => t.lang), glossary: terms.map((t) => `${t.lang}:${t._count}`) });
  await sleep(5000);
}
await browser.close();

// Read back what the real pipeline produced.
const lesson = await db.lesson.findUniqueOrThrow({
  where: { id: lessonId },
  include: {
    segments: { orderBy: { seq: "asc" }, include: { translations: true } },
    terms: true,
    signals: { include: { participant: { select: { lang: true } } } },
    questions: { include: { participant: { select: { lang: true, nickname: true } } } },
    recap: { include: { translations: true } },
  },
});

const replay = {
  note: "Recorded by scripts/generate-replay.mts: the scripted lesson played through Aula's live pipeline. Translations, definitions, the speech-recognition repair and the recap are real AI output; delays are the ones measured. The teacher's sentences were typed at speaking pace instead of spoken.",
  generatedAt: new Date().toISOString(),
  models: { translate: process.env.AI_MODEL_TRANSLATE, glossaryAndRecap: process.env.AI_MODEL_RECAP },
  lesson: DEMO_LESSON,
  languages: langs,
  timings,
  segments: lesson.segments.map((s) => ({
    seq: s.seq,
    text: s.text,
    fixedText: s.fixedText,
    translations: Object.fromEntries(s.translations.map((t) => [t.lang, { text: t.text, terms: t.terms, latencyMs: t.latencyMs }])),
  })),
  glossary: Object.fromEntries(langs.map((l) => [l, lesson.terms.filter((t) => t.lang === l).map((t) => ({ en: t.en, tr: t.tr, gloss: t.gloss }))])),
  signals: lesson.signals.map((s) => ({ type: s.type, seq: s.seq, lang: s.participant.lang })),
  questions: lesson.questions.map((q) => ({ lang: q.lang, nickname: q.participant.nickname, original: q.original, english: q.english })),
  recap: lesson.recap && {
    english: lesson.recap.content,
    translations: Object.fromEntries(lesson.recap.translations.map((t) => [t.lang, t.content])),
  },
};
writeFileSync("src/demo/replay.json", JSON.stringify(replay, null, 2) + "\n");
// Guard: translations served from the in-memory cache (the same sentences
// recorded twice on one server) land in ~0ms, which would misrepresent the
// delays. Record on a freshly started server.
const cached = replay.segments.flatMap((s) => langs.filter((l) => (s.translations[l]?.latencyMs ?? 999) < 100).map((l) => `#${s.seq}/${l}`));
if (cached.length) {
  console.error(`\nWARNING: ${cached.length} translations look cached (${cached.slice(0, 6).join(", ")}...). Restart the dev server and record again.`);
  process.exitCode = 1;
}
const missing = replay.segments.flatMap((s) => langs.filter((l) => !s.translations[l]).map((l) => `#${s.seq}/${l}`));
log(`wrote src/demo/replay.json: ${replay.segments.length} sentences, fix on #${replay.segments.find((s) => s.fixedText)?.seq ?? "none"}, missing translations: ${missing.join(", ") || "none"}, recap langs: ${Object.keys(replay.recap?.translations ?? {}).join(",")}`);
await db.$disconnect();
