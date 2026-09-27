// Measures how long students wait, in a realistic lesson: a teacher who
// talks without pausing, five students (one reading a "beta" language that
// needs the slower model), then the recap. Real AI, real server, timed from
// the moment the teacher said the words.
//
//   npm run dev            (a freshly started server, so nothing is cached)
//   npx tsx --env-file=.env.local scripts/latency-check.mts [--mode=chunked|final] [--langs=es,ar,vi,zh-Hans,so] [baseUrl]
//
// --mode=final   sends each stretch of speech only when the teacher pauses
//                (how Chrome reports results on its own)
// --mode=chunked feeds the words at speaking pace through SpeechChunker, the
//                way the teacher's page does

import { chromium, devices } from "@playwright/test";
import { db } from "@/lib/db";
import { SpeechChunker, words } from "@/lib/chunking";
import { getLanguage } from "@/lib/languages";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const MODE = opt("mode", "chunked");
const LANGS = opt("langs", "es,ar,vi,zh-Hans,so").split(",");
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const WORD_MS = 380; // about 160 words a minute
const PAUSE_MS = 900; // how long Chrome waits for silence before a final result

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const LESSON = {
  title: "Inside the cell",
  subject: "Biology",
  keyTerms: ["cell membrane", "nucleus", "mitochondria", "ribosome", "cellular respiration", "ATP", "diffusion", "organelle"],
};
// Written the way speech recognition returns it: no punctuation, long runs.
const SPEECH = [
  "okay everyone let's get started today we are going to look inside the cell and talk about the parts that keep it alive which we call organelles",
  "the first one is the cell membrane and it works like a security guard because it decides what gets in and what stays out of the cell",
  "small molecules like oxygen can move through the membrane by diffusion which just means they spread from where there are a lot of them to where there are fewer",
  "in the middle of the cell there is the nucleus and the nucleus holds the DNA which is like the instruction book for everything the cell does",
  "the ribosomes read those instructions and build proteins so you can think of them as tiny factories that are working all the time",
  "now the mitochondria is where the cell makes its energy and it does that through a process called cellular respiration which uses glucose and oxygen",
  "the energy comes out as a molecule called ATP and the cell spends ATP on things like moving and growing and dividing so it is kind of like money for the cell",
  "for homework draw a cell and label the membrane the nucleus the ribosomes and the mitochondria and write one sentence about what each one does",
];

const browser = await chromium.launch();
const teacher = await (await browser.newContext()).newPage();
await teacher.goto(`${BASE}/`);
await teacher.getByRole("button", { name: "Try it live" }).first().click();
await teacher.waitForURL(/\/teach\?guest=1/);
await teacher.locator("#title").fill(LESSON.title);
await teacher.locator("#subject").fill(LESSON.subject);
await teacher.locator("#keyTerms").fill(LESSON.keyTerms.join(", "));
await teacher.getByRole("button", { name: "Start lesson" }).click();
await teacher.waitForURL(/\/teach\/[a-z0-9]+$/);
const lessonId = teacher.url().split("/").pop()!;
const code = (await teacher.getByLabel(/^Join code/).getAttribute("aria-label"))!.replace("Join code ", "").replace(/\s/g, "");
log(`lesson ${lessonId}, mode=${MODE}, languages=${LANGS.join(",")}`);

for (const [i, lang] of LANGS.entries()) {
  const page = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
  await page.goto(`${BASE}/join/${code}`);
  await page.getByLabel("Your name or a nickname").fill(`Student ${i + 1}`);
  await page.getByText(new RegExp(`^${getLanguage(lang)!.native}$`)).click();
  await page.getByRole("button", { name: "Join lesson" }).click();
  await page.waitForURL(new RegExp(`/l/${code}$`));
}
log("students joined; the teacher starts talking right away");

// Sends a line and remembers when its words were spoken.
type Sent = { text: string; firstWordAt: number; lastWordAt: number; sentAt: number };
const sent: Sent[] = [];
const post = async (text: string, firstWordAt: number, lastWordAt: number) => {
  sent.push({ text, firstWordAt, lastWordAt, sentAt: Date.now() });
  const res = await teacher.request.post(`${BASE}/api/lessons/${lessonId}/segments`, { data: { text, startedAt: new Date(firstWordAt).toISOString() } });
  if (!res.ok()) throw new Error(`segment failed: ${res.status()}`);
};

const t0 = Date.now();
for (const utterance of SPEECH) {
  const ws = words(utterance);
  const spokenAt: number[] = [];
  const chunker = new SpeechChunker();
  let pieceStart = 0; // index of the first word not yet sent
  for (let i = 0; i < ws.length; i++) {
    await sleep(WORD_MS);
    spokenAt.push(Date.now());
    if (MODE === "chunked") {
      for (const piece of chunker.interim(ws.slice(0, i + 1).join(" ")).pieces) {
        const n = words(piece).length;
        void post(piece, spokenAt[pieceStart], spokenAt[pieceStart + n - 1]);
        pieceStart += n;
      }
    }
  }
  await sleep(PAUSE_MS);
  const rest = MODE === "chunked" ? chunker.final(utterance) : utterance;
  if (rest) void post(rest, spokenAt[pieceStart] ?? spokenAt[0], spokenAt[spokenAt.length - 1]);
}
log(`teacher finished talking after ${((Date.now() - t0) / 1000).toFixed(0)}s; waiting for the last translations`);
await sleep(12_000);

await teacher.request.post(`${BASE}/api/lessons/${lessonId}/end`);
const endedAt = Date.now();
log("lesson ended; waiting for the recap in every language");
// Poll the recap page's API like each student's phone does, noting when
// their summary (draft) and the whole recap first show up in their language.
const summaryAt: Record<string, number> = {};
const fullAt: Record<string, number> = {};
for (let i = 0; i < 240; i++) {
  const recap = await db.recap.findUnique({ where: { lessonId }, select: { id: true } });
  if (recap) {
    await Promise.all(
      LANGS.map(async (lang) => {
        if (fullAt[lang]) return;
        const view = (await (await fetch(`${BASE}/api/recaps/${recap.id}?lang=${lang}`)).json()) as { translated: unknown; draft?: unknown };
        if (view.translated) fullAt[lang] = Date.now();
        if ((view.draft || view.translated) && !summaryAt[lang]) summaryAt[lang] = Date.now();
      }),
    );
    if (LANGS.every((l) => fullAt[l])) break;
  }
  await sleep(1000);
}
await browser.close();

// Read back what was delivered, and when.
const lesson = await db.lesson.findUniqueOrThrow({
  where: { id: lessonId },
  include: {
    segments: { orderBy: { seq: "asc" }, include: { translations: { select: { lang: true, createdAt: true, model: true } } } },
    terms: { select: { lang: true, createdAt: true } },
    recap: { include: { translations: { select: { lang: true, createdAt: true } } } },
  },
});
const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const sec = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : "-");

const rows: Record<string, Record<string, string | number>> = {};
const allAfterWords: number[] = [];
let missing = 0;
for (const lang of LANGS) {
  const afterLastWord: number[] = [];
  const afterFirstWord: number[] = [];
  lesson.segments.forEach((seg) => {
    const s = sent.find((x) => x.text === seg.text);
    const tr = seg.translations.find((t) => t.lang === lang);
    if (!s) return;
    if (!tr) {
      missing++;
      return;
    }
    afterLastWord.push(tr.createdAt.getTime() - s.lastWordAt);
    afterFirstWord.push(tr.createdAt.getTime() - s.firstWordAt);
  });
  allAfterWords.push(...afterLastWord);
  const glossaryDone = lesson.terms.filter((t) => t.lang === lang).map((t) => t.createdAt.getTime());
  const recapTr = lesson.recap?.translations.find((t) => t.lang === lang);
  rows[lang] = {
    lines: `${afterLastWord.length}/${lesson.segments.length}`,
    "after last word p50": sec(pct(afterLastWord, 50)),
    "after last word p95": sec(pct(afterLastWord, 95)),
    "after first word p50": sec(pct(afterFirstWord, 50)),
    "after first word max": sec(Math.max(...afterFirstWord)),
    "definitions": glossaryDone.length ? `${glossaryDone.length}/${LESSON.keyTerms.length} by ${sec(Math.max(...glossaryDone) - t0)}` : "none",
    "recap summary": summaryAt[lang] ? sec(summaryAt[lang] - endedAt) : "-",
    "recap complete": recapTr ? sec(recapTr.createdAt.getTime() - endedAt) : "-",
  };
}
console.log(`\nmode=${MODE}  lines sent=${lesson.segments.length}  English recap ready ${lesson.recap ? sec(lesson.recap.createdAt.getTime() - endedAt) : "never"} after End`);
console.table(rows);
console.log(`all languages: caption shown p50 ${sec(pct(allAfterWords, 50))}, p95 ${sec(pct(allAfterWords, 95))} after the teacher said its last word; ${missing} line(s) stayed in English`);
await db.$disconnect();
