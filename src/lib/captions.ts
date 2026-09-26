// Client-side caption state. Every server event is applied here as an
// idempotent update keyed by `seq`, so it doesn't matter if events arrive
// late, twice (after a reconnect), or a translation shows up before its
// English line: the transcript always ends up in the teacher's order.

export type CaptionTerm = { en: string; tr: string; gloss?: string };

export type CaptionLine = {
  seq: number;
  en: string;
  // The model's repair of a speech-recognition mistake, if any.
  fix?: string;
  startedAt?: string;
  tr?: { text: string; terms: CaptionTerm[] };
  // pending: waiting for translation; failed: AI failed, show English.
  trStatus: "pending" | "done" | "failed" | "none";
};

export type CaptionState = {
  lines: CaptionLine[];
  interim: string;
  ended: boolean;
};

export type SegmentData = { seq: number; text: string; fixedText?: string | null; startedAt?: string };
export type TranslationData = { seq: number; lang: string; text: string; terms: CaptionTerm[] };

export type CaptionEvent =
  | { type: "snapshot"; data: { segments: (SegmentData & { tr?: { text: string; terms: CaptionTerm[] } | null })[]; ended: boolean } }
  | { type: "segment"; data: SegmentData }
  | { type: "translation"; data: TranslationData }
  | { type: "translation-failed"; data: { seq: number; lang: string } }
  | { type: "fix"; data: { seq: number; text: string } }
  | { type: "interim"; data: { text: string } }
  | { type: "lesson-ended"; data: unknown };

export const emptyCaptions: CaptionState = { lines: [], interim: "", ended: false };

// Insert or update one line, keeping the array sorted by seq.
function upsert(lines: CaptionLine[], seq: number, patch: (line: CaptionLine | undefined) => CaptionLine): CaptionLine[] {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].seq < seq) lo = mid + 1;
    else hi = mid;
  }
  const existing = lines[lo]?.seq === seq ? lines[lo] : undefined;
  const next = lines.slice();
  if (existing) next[lo] = patch(existing);
  else next.splice(lo, 0, patch(undefined));
  return next;
}

// `wantsTranslation` is false for students reading in English (and for
// the teacher), so their lines never show "translating...".
export function applyCaptionEvent(state: CaptionState, event: CaptionEvent, wantsTranslation: boolean): CaptionState {
  switch (event.type) {
    case "snapshot":
      return {
        interim: state.interim,
        ended: event.data.ended,
        lines: [...event.data.segments]
          .sort((a, b) => a.seq - b.seq)
          .map((s) => ({
            seq: s.seq,
            en: s.text,
            fix: s.fixedText ?? undefined,
            startedAt: s.startedAt,
            tr: s.tr ?? undefined,
            trStatus: s.tr ? "done" : wantsTranslation ? "failed" : "none",
          })),
      };
    case "segment": {
      const { seq, text, fixedText, startedAt } = event.data;
      return {
        ...state,
        interim: "",
        lines: upsert(state.lines, seq, (line) => ({
          seq,
          en: text,
          fix: fixedText ?? line?.fix,
          startedAt,
          tr: line?.tr,
          trStatus: line?.tr ? "done" : wantsTranslation ? "pending" : "none",
        })),
      };
    }
    case "translation": {
      const { seq, text, terms } = event.data;
      return {
        ...state,
        lines: upsert(state.lines, seq, (line) => ({ seq, en: line?.en ?? "", fix: line?.fix, startedAt: line?.startedAt, tr: { text, terms }, trStatus: "done" })),
      };
    }
    case "translation-failed": {
      const { seq } = event.data;
      if (!state.lines.some((l) => l.seq === seq)) return state;
      return { ...state, lines: upsert(state.lines, seq, (line) => ({ ...line!, trStatus: line!.tr ? "done" : "failed" })) };
    }
    case "fix": {
      const { seq, text } = event.data;
      if (!state.lines.some((l) => l.seq === seq)) return state;
      return { ...state, lines: upsert(state.lines, seq, (line) => ({ ...line!, fix: text })) };
    }
    case "interim":
      return { ...state, interim: event.data.text };
    case "lesson-ended":
      return { ...state, interim: "", ended: true };
  }
}
