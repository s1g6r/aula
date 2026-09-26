// In-memory publish/subscribe for live lessons.
//
// Aula runs as a single Node process, so every open SSE connection lives in
// this one object. Each lesson has a channel with:
//   - its subscribers (the teacher's screen and each student's phone),
//   - a ring buffer of the last 500 events, each with an id like "k3f9-57".
// When a phone reconnects after a Wi-Fi drop, it sends the last id it saw
// (the browser does this automatically via Last-Event-ID) and we replay
// everything after it. If the gap is too old, or the server restarted
// (different epoch), the caller sends a fresh snapshot from the database.
//
// Scaling to several server instances would move this to Redis pub/sub; see
// docs/ARCHITECTURE.md.

export type Audience = "all" | "teacher" | "students" | { lang: string };

export type StoredEvent = {
  id: string | null; // null = ephemeral (interim text): not buffered, not replayed
  n: number;
  type: string;
  data: unknown;
  audience: Audience;
};

export type Subscriber = {
  role: "teacher" | "student";
  lang?: string;
  participantId?: string;
  send: (event: StoredEvent) => void;
};

type Channel = {
  counter: number;
  buffer: StoredEvent[];
  subs: Set<Subscriber>;
  // Students whose connection dropped recently, kept "present" for a grace
  // period so their language keeps being translated while they reconnect.
  recentlyLeft: Map<string, { lang: string; until: number }>;
};

export function matchesAudience(audience: Audience, sub: Pick<Subscriber, "role" | "lang">): boolean {
  if (audience === "all") return true;
  if (audience === "teacher") return sub.role === "teacher";
  if (audience === "students") return sub.role === "student";
  return sub.role === "student" && sub.lang === audience.lang;
}

export class Bus {
  private channels = new Map<string, Channel>();

  constructor(
    readonly epoch: string = Math.random().toString(36).slice(2, 6),
    private readonly bufferSize = 500,
    private readonly graceMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  private channel(lessonId: string): Channel {
    let ch = this.channels.get(lessonId);
    if (!ch) {
      ch = { counter: 0, buffer: [], subs: new Set(), recentlyLeft: new Map() };
      this.channels.set(lessonId, ch);
    }
    return ch;
  }

  currentId(lessonId: string): string {
    return `${this.epoch}-${this.channel(lessonId).counter}`;
  }

  publish(lessonId: string, type: string, data: unknown, audience: Audience = "all", opts: { ephemeral?: boolean } = {}): StoredEvent {
    const ch = this.channel(lessonId);
    let event: StoredEvent;
    if (opts.ephemeral) {
      event = { id: null, n: ch.counter, type, data, audience };
    } else {
      ch.counter += 1;
      event = { id: `${this.epoch}-${ch.counter}`, n: ch.counter, type, data, audience };
      ch.buffer.push(event);
      if (ch.buffer.length > this.bufferSize) ch.buffer.shift();
    }
    for (const sub of ch.subs) if (matchesAudience(audience, sub)) sub.send(event);
    return event;
  }

  subscribe(lessonId: string, sub: Subscriber): { unsubscribe: () => void; atN: number } {
    const ch = this.channel(lessonId);
    ch.subs.add(sub);
    if (sub.participantId) ch.recentlyLeft.delete(sub.participantId);
    return {
      atN: ch.counter,
      unsubscribe: () => {
        ch.subs.delete(sub);
        const stillHere = sub.participantId && [...ch.subs].some((s) => s.participantId === sub.participantId);
        if (sub.role === "student" && sub.participantId && sub.lang && !stillHere) {
          ch.recentlyLeft.set(sub.participantId, { lang: sub.lang, until: this.now() + this.graceMs });
        }
      },
    };
  }

  // Events after `lastEventId` that this subscriber should see, or null when
  // they can't be replayed (unknown id, server restarted, or the gap is older
  // than the buffer) and the caller must send a snapshot instead.
  replaySince(lessonId: string, lastEventId: string, sub: Pick<Subscriber, "role" | "lang">, upToN?: number): StoredEvent[] | null {
    const [epoch, nStr] = lastEventId.split("-");
    const lastN = Number(nStr);
    if (epoch !== this.epoch || !Number.isInteger(lastN)) return null;
    const ch = this.channel(lessonId);
    if (lastN > ch.counter) return null;
    const oldest = ch.buffer[0]?.n ?? ch.counter + 1;
    if (lastN < oldest - 1) return null;
    const limit = upToN ?? ch.counter;
    return ch.buffer.filter((e) => e.n > lastN && e.n <= limit && matchesAudience(e.audience, sub));
  }

  // Who is in the room right now: unique students per language, counting
  // anyone who dropped off within the grace period.
  presence(lessonId: string): { students: number; langs: Record<string, number>; participantIds: string[] } {
    const ch = this.channel(lessonId);
    const byParticipant = new Map<string, string>();
    for (const s of ch.subs) if (s.role === "student" && s.participantId && s.lang) byParticipant.set(s.participantId, s.lang);
    const now = this.now();
    for (const [pid, left] of ch.recentlyLeft) {
      if (left.until < now) ch.recentlyLeft.delete(pid);
      else if (!byParticipant.has(pid)) byParticipant.set(pid, left.lang);
    }
    const langs: Record<string, number> = {};
    for (const lang of byParticipant.values()) langs[lang] = (langs[lang] ?? 0) + 1;
    return { students: byParticipant.size, langs, participantIds: [...byParticipant.keys()] };
  }

  // Languages that need translating, most students first.
  activeLangs(lessonId: string): string[] {
    const { langs } = this.presence(lessonId);
    return Object.entries(langs)
      .filter(([lang]) => lang !== "en")
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang);
  }

  subscriberCount(lessonId: string): number {
    return this.channels.get(lessonId)?.subs.size ?? 0;
  }

  forget(lessonId: string): void {
    this.channels.delete(lessonId);
  }
}

// One bus per process. Parked on globalThis so Next's dev hot reload and
// separately bundled route handlers all share the same instance.
const g = globalThis as unknown as { __aulaBus?: Bus };
export const bus: Bus = g.__aulaBus ?? (g.__aulaBus = new Bus());
