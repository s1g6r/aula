// Splits long stretches of speech into caption-sized pieces.
//
// Chrome's speech recognizer only marks a result "final" when the speaker
// pauses. A teacher who talks without stopping can produce one 40-word result
// that isn't sent (or translated) until it ends, 15 seconds after its first
// word. Instead, once enough words have settled in the interim text, we send
// them as their own line, breaking before a joining word ("and", "because")
// when there is one, and keep going. When the final result arrives, only the
// words we haven't sent yet go out.

// Send a piece once this many settled words are waiting.
export const CHUNK_MAX_WORDS = 12;
// Never send a piece shorter than this (tiny fragments translate badly).
const MIN_WORDS = 6;
// The last few interim words still change as the recognizer hears more.
const UNSETTLED = 3;

const BREAK_BEFORE = new Set([
  "and",
  "but",
  "so",
  "because",
  "which",
  "then",
  "when",
  "where",
  "while",
  "or",
  "if",
  "now",
  "after",
  "before",
  "until",
  "since",
  "although",
  "though",
  "who",
  "that",
]);

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");
export const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

// Where to cut the interim words (an index into `ws`), or null to wait.
// Words before `from` were already sent.
export function findCut(ws: string[], from: number): number | null {
  const settled = ws.length - UNSETTLED;
  if (settled - from < CHUNK_MAX_WORDS) return null;
  // The latest joining word in the settled part starts the next piece.
  for (let i = settled - 1; i >= from + MIN_WORDS; i--) {
    if (BREAK_BEFORE.has(norm(ws[i]))) return i;
  }
  return from + CHUNK_MAX_WORDS;
}

// The recognizer may revise words it already gave us, so the words we sent
// won't always line up exactly with the new text. Find where the new text
// continues after them: look for the last two sent words near the expected
// position, then the last one, else assume the same count.
export function alignAfter(ws: string[], sent: string[]): number {
  const k = sent.length;
  if (!k) return 0;
  const near = (match: (j: number) => boolean) => {
    for (let d = 0; d <= 4; d++) {
      for (const j of d ? [k + d, k - d] : [k]) {
        if (j >= 1 && j <= ws.length && match(j)) return j;
      }
    }
    return null;
  };
  const a = norm(sent[k - 1]);
  const b = k > 1 ? norm(sent[k - 2]) : null;
  const pair = b === null ? null : near((j) => j >= 2 && norm(ws[j - 1]) === a && norm(ws[j - 2]) === b);
  return pair ?? near((j) => norm(ws[j - 1]) === a) ?? Math.min(k, ws.length);
}

// One recognizer session's worth of state: which interim words already went
// out as pieces.
export class SpeechChunker {
  private sent: string[] = [];

  // New interim text. Returns the pieces to send now and the words still in
  // progress (to show as the live line).
  interim(text: string): { pieces: string[]; rest: string } {
    const ws = words(text);
    let from = alignAfter(ws, this.sent);
    const pieces: string[] = [];
    for (let cut = findCut(ws, from); cut !== null; cut = findCut(ws, from)) {
      pieces.push(ws.slice(from, cut).join(" "));
      this.sent = ws.slice(0, cut);
      from = cut;
    }
    return { pieces, rest: ws.slice(from).join(" ") };
  }

  // A final result. Returns the part that hasn't been sent yet, if any.
  final(text: string): string | null {
    const ws = words(text);
    const piece = ws.slice(alignAfter(ws, this.sent)).join(" ");
    // Sent words beyond this result belong to the next one.
    this.sent = this.sent.length > ws.length ? this.sent.slice(ws.length) : [];
    return piece || null;
  }

  reset(): void {
    this.sent = [];
  }
}
