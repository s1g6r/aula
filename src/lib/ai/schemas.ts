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

export const LangTranslationSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  terms: z.array(TermGlossSchema).max(8).default([]),
});

// The brief's per-segment shape ({ "<lang>": { text, terms } }) wrapped in a
// segments array, so a merged batch still maps 1:1 back to caption lines.
export const SegmentTranslationSchema = z.object({
  seq: z.number().int().nonnegative(),
  // Corrected English when speech recognition clearly misheard
  // ("sell membrane" -> "cell membrane"). Omitted when nothing changed.
  fix: z.string().trim().min(1).max(2000).optional(),
  tr: z.record(z.string(), LangTranslationSchema),
});

export const TranslationResponseSchema = z.object({
  segments: z.array(SegmentTranslationSchema).min(1),
});

export type TermGloss = z.infer<typeof TermGlossSchema>;
export type LangTranslation = z.infer<typeof LangTranslationSchema>;
export type SegmentTranslation = z.infer<typeof SegmentTranslationSchema>;
export type TranslationResponse = z.infer<typeof TranslationResponseSchema>;

// Glossary reply: every key term with its translation and a definition.
export const GlossaryResponseSchema = z.object({
  terms: z.array(TermGlossSchema.required({ gloss: true })).min(1),
});

export type GlossaryResponse = z.infer<typeof GlossaryResponseSchema>;

export const QuestionTranslationSchema = z.object({ en: z.string().trim().min(1).max(1000) });
