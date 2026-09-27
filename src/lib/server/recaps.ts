import type { Recap, RecapTranslation } from "@/lib/ai/schemas";
import { db } from "@/lib/db";

// Everything the public "What you missed" page shows, in one language.

export type RecapView = {
  recapId: string;
  lesson: { title: string | null; subject: string | null; date: string; keyTerms: string[] };
  lang: string;
  english: Recap;
  translated: RecapTranslation | null;
  // Languages this recap already exists in (besides English).
  available: string[];
  transcript: { seq: number; en: string; tr: string | null }[];
};

export async function getRecapView(recapId: string, lang: string): Promise<RecapView | null> {
  const recap = await db.recap.findUnique({
    where: { id: recapId },
    select: {
      id: true,
      content: true,
      translations: { select: { lang: true, content: true } },
      lesson: {
        select: {
          title: true,
          subject: true,
          startedAt: true,
          keyTerms: true,
          segments: {
            orderBy: { seq: "asc" },
            select: { seq: true, text: true, fixedText: true, translations: { where: { lang }, select: { text: true } } },
          },
        },
      },
    },
  });
  if (!recap) return null;
  const tr = recap.translations.find((t) => t.lang === lang);
  return {
    recapId: recap.id,
    lesson: { title: recap.lesson.title, subject: recap.lesson.subject, date: recap.lesson.startedAt.toISOString(), keyTerms: recap.lesson.keyTerms },
    lang,
    english: recap.content as Recap,
    translated: lang === "en" ? null : ((tr?.content as RecapTranslation | undefined) ?? null),
    available: recap.translations.map((t) => t.lang),
    transcript: recap.lesson.segments.map((s) => ({ seq: s.seq, en: s.fixedText ?? s.text, tr: s.translations[0]?.text ?? null })),
  };
}
