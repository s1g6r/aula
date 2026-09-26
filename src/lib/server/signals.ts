import { db } from "@/lib/db";
import { bus } from "@/lib/realtime/bus";
import { nextExpiry, summarizeSignals, type SignalEvent, type SignalType } from "@/lib/signals";
import { singleton } from "./singleton";

// Keeps each live lesson's "I'm lost" / "Slower" taps in memory (they're also
// saved for the review timeline) and pushes the teacher an updated summary:
// on every tap, and again when old taps age out of the one-minute window.

const events = singleton("signalEvents", () => new Map<string, SignalEvent[]>());
const loading = singleton("signalLoading", () => new Map<string, Promise<void>>());
const timers = singleton("signalTimers", () => new Map<string, ReturnType<typeof setTimeout>>());

async function load(lessonId: string): Promise<SignalEvent[]> {
  if (!events.has(lessonId)) {
    if (!loading.has(lessonId)) {
      loading.set(
        lessonId,
        db.signal
          .findMany({ where: { lessonId }, select: { type: true, seq: true, createdAt: true, participantId: true } })
          .then((rows) => {
            if (!events.has(lessonId)) events.set(lessonId, rows.map((r) => ({ type: r.type, seq: r.seq, at: r.createdAt.getTime(), participantId: r.participantId })));
          }),
      );
    }
    await loading.get(lessonId);
  }
  return events.get(lessonId)!;
}

// The summary the teacher sees, with the anchor sentence's text attached.
export async function signalSummary(lessonId: string) {
  const summary = summarizeSignals(await load(lessonId), Date.now());
  let anchorText: string | null = null;
  if (summary.anchor) {
    const seg = await db.segment.findUnique({ where: { lessonId_seq: { lessonId, seq: summary.anchor.seq } }, select: { text: true, fixedText: true } });
    anchorText = seg ? (seg.fixedText ?? seg.text) : null;
  }
  return { ...summary, anchorText };
}

async function publish(lessonId: string) {
  bus.publish(lessonId, "signal-summary", await signalSummary(lessonId), "teacher");
  // Push again when the oldest tap ages out, so the pulse fades on time.
  clearTimeout(timers.get(lessonId));
  const next = nextExpiry(events.get(lessonId) ?? [], Date.now());
  if (next) timers.set(lessonId, setTimeout(() => void publish(lessonId), Math.max(250, next - Date.now() + 50)));
}

export async function recordSignal(lessonId: string, participantId: string, type: SignalType, seq: number | null): Promise<void> {
  const list = await load(lessonId);
  const at = new Date();
  await db.signal.create({ data: { lessonId, participantId, type, seq, createdAt: at } });
  list.push({ type, seq, at: at.getTime(), participantId });
  await publish(lessonId);
}

export function forgetSignals(lessonId: string): void {
  clearTimeout(timers.get(lessonId));
  timers.delete(lessonId);
  events.delete(lessonId);
  loading.delete(lessonId);
}
