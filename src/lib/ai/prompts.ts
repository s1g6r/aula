import { getLanguage, type LanguageCode } from "@/lib/languages";

export type ChatMessage = { role: "system" | "user"; content: string };

// Nothing student-identifying ever goes into a prompt: only lesson text,
// subject, title and key terms. System prompts never change between calls,
// so providers that cache prompt prefixes can reuse them.

// ---------------------------------------------------------------------------
// Live translation: one finished sentence (or a merged backlog) into one or
// more languages. Kept as small as possible because every output token is
// time a student spends waiting.

export type TranslationRequest = {
  subject?: string;
  title?: string;
  // English of the previous 1-2 segments. Helps with pronouns and with
  // fixing speech-recognition mistakes. Not translated.
  context: string[];
  langs: LanguageCode[];
  // Usually one segment; several when the queue merged a backlog. `terms` are
  // the teacher's key terms we found in that segment (see findKeyTerms).
  segments: { seq: number; text: string; terms: string[] }[];
  // All key terms for the lesson, so the model can also mark one that only
  // appears after it repairs a speech-recognition mistake.
  keyTerms: string[];
};

export const TRANSLATE_SYSTEM = `You are Aula's live classroom translator. A teacher is speaking English to a class that includes newcomer English learners. You receive speech-recognition transcript segments and translate each one into one or more languages.

Rules:
1. Translate every segment into every requested language. Use clear, natural, spoken language a 14-year-old understands. Keep numbers, formulas, units and names as they are.
2. Speech recognition makes mistakes: a word replaced by one that sounds alike (for example "sell membrane" should be "cell membrane"). Translate what the teacher meant. Only if you repaired a misheard word, add the English sentence with just that word corrected as "fix" after the translations. Never rephrase or improve the teacher's wording. If nothing was misheard, do not write a "fix" key at all.
3. Each segment lists the key terms it contains. For each one, give "en" (the term exactly as in the list) and "tr" (the words you used for it, copied exactly from your translation). If your repaired sentence contains another key term from the lesson list, include it too. Do not add any other terms.
4. Only translate. Never add explanations, answers, opinions or content that is not in the segment.
5. Write the languages in the order they are listed.
6. Reply with minified JSON only (no spaces between tokens, no line breaks, no other text), in exactly this shape:
{"segments":[{"seq":<number>,"tr":{"<language code>":{"text":"<translation>","terms":[{"en":"...","tr":"..."}]}},"fix":"<only if you changed a word>"}]}`;

export function buildTranslationMessages(req: TranslationRequest): ChatMessage[] {
  const lines: string[] = [];
  if (req.subject) lines.push(`Subject: ${req.subject}`);
  if (req.title) lines.push(`Lesson: ${req.title}`);
  lines.push(`Lesson key terms: ${req.keyTerms.length ? req.keyTerms.join(", ") : "(none)"}`);
  lines.push(`Languages:\n${req.langs.map((code) => `- ${code}: ${getLanguage(code)?.promptName ?? code}`).join("\n")}`);
  if (req.context.length) {
    lines.push(`Earlier in the lesson (context only, do not translate):\n${req.context.map((c) => `"${c}"`).join("\n")}`);
  }
  lines.push(`Segments:\n${JSON.stringify(req.segments.map((s) => ({ seq: s.seq, en: s.text, terms: s.terms })))}`);
  return [
    { role: "system", content: TRANSLATE_SYSTEM },
    { role: "user", content: lines.join("\n\n") },
  ];
}

// ---------------------------------------------------------------------------
// Glossary: simple definitions of the lesson's key terms in one language.
// Runs once per language per lesson (when the first student of that language
// joins), off the live path, and the result is cached in the Term table.

export type GlossaryRequest = {
  subject?: string;
  title?: string;
  terms: string[];
  // A launch language, or "en" for simple English definitions (students who
  // read the captions in English are learning the words too).
  lang: LanguageCode | "en";
};

export const GLOSSARY_SYSTEM = `You write a student glossary for newcomer English learners. For each English academic term, give its usual translation and one short, simple definition in the student's language, as it is meant in this lesson's subject.

Rules:
1. "tr": the standard term in the student's language that a textbook would use.
2. "gloss": one simple sentence, under 15 words, that a 14-year-old understands. Do not start by repeating the term.
3. Keep the terms in the order given. Include every term once.
4. Reply with minified JSON only, in exactly this shape:
{"terms":[{"en":"<term as given>","tr":"...","gloss":"..."}]}`;

export function buildGlossaryMessages(req: GlossaryRequest): ChatMessage[] {
  const lines: string[] = [];
  if (req.subject) lines.push(`Subject: ${req.subject}`);
  if (req.title) lines.push(`Lesson: ${req.title}`);
  const langName = req.lang === "en" ? "simple English for English learners" : (getLanguage(req.lang)?.promptName ?? req.lang);
  lines.push(`Student's language: ${langName} (${req.lang})`);
  lines.push(`Terms: ${JSON.stringify(req.terms)}`);
  return [
    { role: "system", content: GLOSSARY_SYSTEM },
    { role: "user", content: lines.join("\n\n") },
  ];
}

// ---------------------------------------------------------------------------
// Student questions: a student types in their own language; the teacher
// reads it in English. The model only translates. The teacher answers.

export const QUESTION_SYSTEM = `A student typed a question or comment for their teacher, possibly in another language. Translate it into clear, natural English for the teacher.

Rules:
1. Only translate. Never answer the question, never add advice, and never add anything that isn't in the student's message.
2. If it's already English, return it with spelling fixed.
3. Reply with minified JSON only, in exactly this shape: {"en":"<English>"}`;

export function buildQuestionMessages(req: { text: string; lang: string; subject?: string }): ChatMessage[] {
  const langName = req.lang === "en" ? "English" : (getLanguage(req.lang)?.promptName ?? req.lang);
  return [
    { role: "system", content: QUESTION_SYSTEM },
    { role: "user", content: `${req.subject ? `Class subject: ${req.subject}\n` : ""}Student's language: ${langName}\nMessage: ${JSON.stringify(req.text)}` },
  ];
}

// ---------------------------------------------------------------------------
// Recap: written once when the lesson ends, from the transcript only.

export const RECAP_SYSTEM = `You write a lesson recap for high-school students, including newcomer English learners and students who were absent. You get the transcript of what the teacher said.

Rules:
1. Use only what is in the transcript. Never add facts, examples or topics the teacher did not cover.
2. "summary": 3 to 5 short sentences in simple English, covering the main ideas in the order they were taught. Put each sentence in its own array item: ["First idea.","Second idea.","Third idea."].
3. "keyTerms": up to 8 of the most important academic words from the lesson (always include the teacher's key terms that were actually discussed), each with a one-sentence definition based on how the teacher explained it.
4. "checkQuestions": exactly 3 short questions that check understanding of what was taught, each with a short answer taken from the transcript. Never write questions about anything the teacher did not explain, and never include homework answers.
5. Reply with minified JSON only, in exactly this shape:
{"summary":["..."],"keyTerms":[{"term":"...","definition":"..."}],"checkQuestions":[{"q":"...","answer":"..."}]}`;

export function buildRecapMessages(req: { subject?: string; title?: string; keyTerms: string[]; transcript: string[] }): ChatMessage[] {
  const lines: string[] = [];
  if (req.subject) lines.push(`Subject: ${req.subject}`);
  if (req.title) lines.push(`Lesson: ${req.title}`);
  lines.push(`Teacher's key terms: ${req.keyTerms.length ? req.keyTerms.join(", ") : "(none)"}`);
  lines.push(`Transcript:\n${req.transcript.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
  return [
    { role: "system", content: RECAP_SYSTEM },
    { role: "user", content: lines.join("\n\n") },
  ];
}

export const RECAP_TRANSLATE_SYSTEM = `You translate a lesson recap for a high-school student. You get the recap as JSON in English.

Rules:
1. Translate every summary sentence, definition, question and answer into the requested language. Use simple, clear language a 14-year-old understands.
2. For each key term keep "term" exactly as it is in English, and add "tr": the standard translation a textbook would use.
3. Do not add or remove anything.
4. Reply with minified JSON only, in exactly this shape:
{"summary":["..."],"keyTerms":[{"term":"<English>","tr":"...","definition":"..."}],"checkQuestions":[{"q":"...","answer":"..."}]}`;

export function buildRecapTranslationMessages(req: { recap: unknown; lang: string }): ChatMessage[] {
  const langName = getLanguage(req.lang)?.promptName ?? req.lang;
  return [
    { role: "system", content: RECAP_TRANSLATE_SYSTEM },
    { role: "user", content: `Language: ${langName} (${req.lang})\n\nRecap:\n${JSON.stringify(req.recap)}` },
  ];
}
