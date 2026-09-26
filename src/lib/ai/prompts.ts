import { getLanguage, type LanguageCode } from "@/lib/languages";

export type ChatMessage = { role: "system" | "user"; content: string };

export type TranslationRequest = {
  subject?: string;
  title?: string;
  // Words the teacher typed or pasted when starting the lesson.
  keyTerms: string[];
  // English of the previous 1-2 segments. Helps with pronouns and with
  // fixing speech-recognition mistakes. Not translated.
  context: string[];
  langs: LanguageCode[];
  // Usually one segment; several when the queue merged a backlog.
  segments: { seq: number; text: string }[];
  // Terms already glossed earlier in this lesson, per language. The model
  // skips their definitions and we reuse the cached ones.
  alreadyGlossed?: Partial<Record<LanguageCode, string[]>>;
};

// The system prompt never changes between calls, so providers that cache
// prompt prefixes can reuse it. Nothing student-identifying ever goes in here
// or in the user message: only lesson text, subject and key terms.
export const TRANSLATE_SYSTEM = `You are Aula's live classroom translator. A teacher is speaking English to a class that includes newcomer English learners. You receive speech-recognition transcript segments and translate each one into several languages at once.

Rules:
1. Translate every segment into every requested language. Use clear, natural, spoken language a 14-year-old understands. Keep numbers, formulas, units and names as they are.
2. Speech recognition makes mistakes. Use the subject, key terms and context to repair obvious ones before translating (for example "sell membrane" should be "cell membrane"). If you repaired the English, put the corrected English sentence in "fix". Otherwise leave "fix" out.
3. Terms: find the academic vocabulary in each segment. Always include any of the teacher's key terms that appear, plus at most 2 other subject words a newcomer should learn. Use the same English terms for every language. For each term give:
   - "en": the term exactly as written in the English segment,
   - "tr": the term exactly as written in your translation,
   - "gloss": one short, simple definition in that language (under 15 words).
   If a term is listed as already glossed for that language, leave out "gloss".
4. Only translate. Never add explanations, answers, opinions or content that is not in the segment.
5. Reply with JSON only, no other text, in exactly this shape:
{"segments":[{"seq":<number>,"fix":"<optional corrected English>","tr":{"<language code>":{"text":"<translation>","terms":[{"en":"...","tr":"...","gloss":"..."}]}}}]}`;

export function buildTranslationMessages(req: TranslationRequest): ChatMessage[] {
  const lines: string[] = [];
  if (req.subject) lines.push(`Subject: ${req.subject}`);
  if (req.title) lines.push(`Lesson: ${req.title}`);
  lines.push(`Key terms: ${req.keyTerms.length ? req.keyTerms.join(", ") : "(none given)"}`);

  const langLines = req.langs.map((code) => {
    const glossed = req.alreadyGlossed?.[code] ?? [];
    const suffix = glossed.length ? ` (already glossed: ${glossed.join(", ")})` : "";
    return `- ${code}: ${getLanguage(code)?.promptName ?? code}${suffix}`;
  });
  lines.push(`Languages:\n${langLines.join("\n")}`);

  if (req.context.length) {
    lines.push(`Earlier in the lesson (context only, do not translate):\n${req.context.map((c) => `"${c}"`).join("\n")}`);
  }

  lines.push(`Segments:\n${JSON.stringify(req.segments.map((s) => ({ seq: s.seq, en: s.text })))}`);

  return [
    { role: "system", content: TRANSLATE_SYSTEM },
    { role: "user", content: lines.join("\n\n") },
  ];
}
