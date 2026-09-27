import { z } from "zod";

// Every AI response is untrusted text until it passes these schemas.
// Anything that fails is dropped and the student sees the English fallback.

// One highlighted key term inside a translated line.
//   en:    the teacher's key term
//   tr:    the words used for it in the translated line (so we can highlight it)
//   gloss: a short, simple definition in the student's language. Live
//          translations leave it out; it comes from the lesson glossary.
export const TermGlossSchema = z.object({
  en: z.string().trim().min(1).max(80),
  tr: z.string().trim().min(1).max(80),
  gloss: z.string().trim().min(1).max(300).optional(),
});

export type TermGloss = z.infer<typeof TermGlossSchema>;

export const LangTranslationSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  terms: z.array(TermGlossSchema).max(8).default([]),
});

// Live replies give each language as a plain string (the lean format, about a
// third fewer tokens than objects with term lists). Older replies used
// { text, terms }; both normalize to { text, terms }. Highlights are matched
// on the phone from the lesson glossary.
export const LiveLangSchema = z.union([
  z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .transform((text) => ({ text, terms: [] as TermGloss[] })),
  LangTranslationSchema,
]);

// Per-segment translations wrapped in a segments array, so a merged batch
// still maps 1:1 back to caption lines.
export const SegmentTranslationSchema = z.object({
  seq: z.number().int().nonnegative(),
  // Corrected English when speech recognition clearly misheard
  // ("sell membrane" -> "cell membrane"). Omitted when nothing changed.
  fix: z.string().trim().min(1).max(2000).optional(),
  tr: z.record(z.string(), LiveLangSchema),
});

export const TranslationResponseSchema = z.object({
  segments: z.array(SegmentTranslationSchema).min(1),
});

export type LangTranslation = z.infer<typeof LangTranslationSchema>;
export type SegmentTranslation = z.infer<typeof SegmentTranslationSchema>;
export type TranslationResponse = z.infer<typeof TranslationResponseSchema>;

// Glossary reply: every key term with its translation and a definition.
export const GlossaryResponseSchema = z.object({
  terms: z.array(TermGlossSchema.required({ gloss: true })).min(1),
});

export type GlossaryResponse = z.infer<typeof GlossaryResponseSchema>;

export const QuestionTranslationSchema = z.object({ en: z.string().trim().min(1).max(1000) });

// Models sometimes return the whole summary as one string of several
// sentences. Split it into one sentence per item rather than rejecting a
// good recap (seen with Gemma in testing).
export function splitSummary(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== "string") return value;
  const parts = value[0].split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).map((x: string) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, 6) : value;
}

// Lesson recap, written in English from the transcript when a lesson ends.
export const RecapSchema = z.object({
  summary: z.preprocess(splitSummary, z.array(z.string().trim().min(1).max(400)).min(2).max(6)),
  keyTerms: z.array(z.object({ term: z.string().trim().min(1).max(80), definition: z.string().trim().min(1).max(300) })).max(10),
  checkQuestions: z.array(z.object({ q: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(400) })).min(1).max(5),
});

// The same recap in a student's language. Key terms keep their English form
// (so students learn it) plus the translation.
export const RecapTranslationSchema = z.object({
  summary: z.array(z.string().trim().min(1).max(600)).min(1).max(6),
  keyTerms: z.array(z.object({ term: z.string().trim().min(1).max(80), tr: z.string().trim().min(1).max(120), definition: z.string().trim().min(1).max(400) })).max(10),
  checkQuestions: z.array(z.object({ q: z.string().trim().min(1).max(500), answer: z.string().trim().min(1).max(600) })).min(1).max(5),
});

export const RecapSummaryTranslationSchema = RecapTranslationSchema.pick({ summary: true });
export const RecapDetailsTranslationSchema = RecapTranslationSchema.pick({ keyTerms: true, checkQuestions: true });

export type Recap = z.infer<typeof RecapSchema>;
export type RecapTranslation = z.infer<typeof RecapTranslationSchema>;
export type RecapSummaryTranslation = z.infer<typeof RecapSummaryTranslationSchema>;
