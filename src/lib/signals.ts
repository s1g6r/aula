// Turns students' "I'm lost" / "Slower, please" taps into what the teacher
// sees: how many students (never who) in the last minute, and the sentence
// most of them were on when they got lost.

export type SignalType = "LOST" | "SLOWER";
export type SignalEvent = { type: SignalType; seq: number | null; at: number; participantId: string };

export type SignalSummary = {
  // Unique students who tapped in the window.
  lost: number;
  slower: number;
  // The sentence with the most "lost" students in the window (ties go to the
  // more recent sentence), or null if nobody is lost right now.
  anchor: { seq: number; count: number } | null;
  // All lesson long: unique lost students per sentence (for the transcript
  // markers and the review timeline).
  totals: Record<number, number>;
};

export const SIGNAL_WINDOW_MS = 60_000;

function uniqueBy<T>(items: T[], key: (t: T) => string): number {
  return new Set(items.map(key)).size;
}

export function summarizeSignals(events: SignalEvent[], now: number, windowMs = SIGNAL_WINDOW_MS): SignalSummary {
  const recent = events.filter((e) => e.at > now - windowMs && e.at <= now);
  const lostRecent = recent.filter((e) => e.type === "LOST");

  const bySeq = new Map<number, Set<string>>();
  for (const e of lostRecent) {
    if (e.seq === null) continue;
    (bySeq.get(e.seq) ?? bySeq.set(e.seq, new Set()).get(e.seq)!).add(e.participantId);
  }
  let anchor: SignalSummary["anchor"] = null;
  for (const [seq, who] of bySeq) {
    if (!anchor || who.size > anchor.count || (who.size === anchor.count && seq > anchor.seq)) anchor = { seq, count: who.size };
  }

  const totalsSets = new Map<number, Set<string>>();
  for (const e of events) {
    if (e.type !== "LOST" || e.seq === null) continue;
    (totalsSets.get(e.seq) ?? totalsSets.set(e.seq, new Set()).get(e.seq)!).add(e.participantId);
  }

  return {
    lost: uniqueBy(lostRecent, (e) => e.participantId),
    slower: uniqueBy(
      recent.filter((e) => e.type === "SLOWER"),
      (e) => e.participantId,
    ),
    anchor,
    totals: Object.fromEntries([...totalsSets].map(([seq, who]) => [seq, who.size])),
  };
}

// When the summary will next change on its own (the oldest tap in the window
// ages out), so the server can push an update then. Null if nothing's pending.
export function nextExpiry(events: SignalEvent[], now: number, windowMs = SIGNAL_WINDOW_MS): number | null {
  const pending = events.filter((e) => e.at > now - windowMs).map((e) => e.at + windowMs);
  return pending.length ? Math.min(...pending) : null;
}
