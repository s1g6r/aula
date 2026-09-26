// Splits a caption line into plain text and highlighted terms, so the
// student view can turn each term into a tappable button. Matching is
// case-insensitive, prefers longer terms ("cell membrane" over "cell"), and
// never overlaps. Plain substring matching works for scripts without spaces
// between words, like Chinese.

export type Piece = { text: string; term?: string };

export function highlight(text: string, needles: { match: string; term: string }[]): Piece[] {
  const lower = text.toLowerCase();
  const sorted = needles.filter((n) => n.match.trim().length >= 2).sort((a, b) => b.match.length - a.match.length);
  const taken: { start: number; end: number; term: string }[] = [];
  for (const n of sorted) {
    const m = n.match.toLowerCase();
    let from = 0;
    while (from <= lower.length) {
      const i = lower.indexOf(m, from);
      if (i === -1) break;
      const end = i + m.length;
      if (!taken.some((t) => i < t.end && end > t.start)) {
        taken.push({ start: i, end, term: n.term });
        break; // highlight the first occurrence of each term per line
      }
      from = i + 1;
    }
  }
  taken.sort((a, b) => a.start - b.start);
  const pieces: Piece[] = [];
  let pos = 0;
  for (const t of taken) {
    if (t.start > pos) pieces.push({ text: text.slice(pos, t.start) });
    pieces.push({ text: text.slice(t.start, t.end), term: t.term });
    pos = t.end;
  }
  if (pos < text.length) pieces.push({ text: text.slice(pos) });
  return pieces;
}
