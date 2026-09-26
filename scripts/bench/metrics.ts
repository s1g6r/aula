import type { SegmentTranslation } from "@/lib/ai/schemas";

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const norm = (s: string) => s.toLowerCase().replace(/[-\s]+/g, " ").trim();

// Key terms the sentence actually contains (plural and hyphen tolerant).
// Uses the corrected phrase for sentences with a deliberate ASR mistake.
export function termsInSentence(sentence: string, keyTerms: string[]): string[] {
  const s = norm(sentence);
  return keyTerms.filter((t) => s.includes(norm(t)));
}

// Share of expected key terms the model returned, per language.
export function termRecall(expected: string[], seg: SegmentTranslation, langs: string[]): number {
  if (expected.length === 0) return NaN;
  let hit = 0;
  let total = 0;
  for (const lang of langs) {
    const got = (seg.tr[lang]?.terms ?? []).map((t) => norm(t.en));
    for (const term of expected) {
      total++;
      if (got.some((g) => g.includes(norm(term)) || norm(term).includes(g))) hit++;
    }
  }
  return total ? hit / total : NaN;
}

// Share of returned terms whose translated form really appears in the
// translated line. If it doesn't, we can't highlight it for the student.
export function highlightable(seg: SegmentTranslation, langs: string[]): { ok: number; total: number } {
  let ok = 0;
  let total = 0;
  for (const lang of langs) {
    const t = seg.tr[lang];
    if (!t) continue;
    const text = t.text.toLowerCase();
    for (const term of t.terms) {
      total++;
      if (text.includes(term.tr.toLowerCase())) ok++;
    }
  }
  return { ok, total };
}
