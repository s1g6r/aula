// Translates the student interface (src/i18n/student.ts) into every launch
// language, once, and saves src/i18n/strings/<lang>.json. The result is
// machine translation: the settings sheet says so, and anyone who speaks the
// language can fix a file by hand. Re-run after adding strings:
//   npx tsx --env-file=.env.local scripts/translate-ui.mts [lang ...]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chatComplete, createAiClient } from "@/lib/ai/client";
import { extractJson } from "@/lib/ai/json";
import { STUDENT_STRINGS_EN } from "@/i18n/student";
import { LANGUAGES } from "@/lib/languages";

// What some strings are for, so the translation fits the screen.
const CONTEXT: Record<string, string> = {
  live: "status label: the lesson is happening right now",
  lost: "button a student taps quietly when they don't understand; first person, calm, not alarming",
  slower: "button asking the teacher to speak more slowly; polite",
  ask: "short button label: ask the teacher a question",
  changeLanguage: "button to switch the caption language",
  newLines: "button: jump down to the newest captions",
  hearIt: "button that plays the English pronunciation",
  waitSeconds: "button countdown; keep {s} exactly (a number of seconds)",
  readRecap: "button to open the lesson summary",
  recapTitle: "page title for a student who missed class",
  flagTranslation: "button to report a bad translation of a caption line",
  themeSystem: "option: use the phone's light or dark setting",
  colors: "setting: light or dark colors",
};

const client = createAiClient({ baseURL: process.env.AI_BASE_URL!, apiKey: process.env.AI_API_KEY!, timeoutMs: 120_000 });
const model = process.env.AI_MODEL_QUALITY || process.env.AI_MODEL_TRANSLATE!;
const only = process.argv.slice(2);
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

for (const lang of LANGUAGES.filter((l) => !only.length || only.includes(l.code))) {
  const file = `src/i18n/strings/${lang.code}.json`;
  const existing: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const todo = Object.fromEntries(Object.entries(STUDENT_STRINGS_EN).filter(([k]) => !existing[k]));
  if (!Object.keys(todo).length) {
    console.log(`${lang.code}: up to date`);
    continue;
  }
  const messages = [
    {
      role: "system" as const,
      content: `You translate the interface of Aula, a classroom app used on phones by newcomer high-school students. Translate each value into ${lang.promptName}. Keep them short, natural and friendly, the way a real app in that language would say it. Keep placeholders like {s} exactly. Keep the name "Aula" and the word "AI" untranslated if that is natural. Reply with minified JSON only, with exactly the same keys.`,
    },
    {
      role: "user" as const,
      content: `Notes on some keys:\n${Object.entries(CONTEXT)
        .filter(([k]) => k in todo)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")}\n\nStrings:\n${JSON.stringify(todo)}`,
    },
  ];
  let done: Record<string, string> | null = null;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    const t0 = Date.now();
    const r = await chatComplete(client, { model, messages, maxTokens: 4000, jsonMode: true });
    try {
      const out = extractJson(r.text) as Record<string, unknown>;
      const bad = Object.keys(todo).filter((k) => typeof out[k] !== "string" || !(out[k] as string).trim() || placeholders(out[k] as string) !== placeholders(todo[k]));
      if (bad.length) throw new Error(`missing or broken keys: ${bad.join(", ")}`);
      done = Object.fromEntries(Object.keys(todo).map((k) => [k, (out[k] as string).trim()]));
      console.log(`${lang.code}: ${Object.keys(done).length} strings in ${Date.now() - t0}ms`);
    } catch (err) {
      console.warn(`${lang.code}: attempt ${attempt + 1} failed: ${(err as Error).message}`);
    }
  }
  if (!done) {
    console.error(`${lang.code}: giving up; English will be shown for missing strings`);
    continue;
  }
  const merged = Object.fromEntries(Object.keys(STUDENT_STRINGS_EN).filter((k) => existing[k] || done![k]).map((k) => [k, existing[k] ?? done![k]]));
  writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
}
