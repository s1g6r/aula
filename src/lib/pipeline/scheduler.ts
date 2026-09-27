// Every call to the AI provider goes through one scheduler per process.
//
// Featherless limits how many "concurrency units" we can use at once (our
// plan has 4; a small model costs 1 per request, a big one 2 to 4). The
// scheduler never lets us go over that budget.
//
// It also caps how many calls are in flight at once. Our benchmark showed
// Featherless works through one account's requests one after another, so
// sending a second request early just makes it wait on their side, where our
// priorities can't reach it (and where it looks "stalled"). With maxJobs = 1,
// the next call is always the most urgent one.
//
// Priorities: 0 = live captions and students' questions, 1 = recaps (students
// are waiting for them) and catch-up lines for a new language, 2 = glossaries
// and warm-up calls, 3 = glossaries for lessons that have ended. Within a
// priority, first come, first served.
//
// Preemption: background jobs can be marked preemptible. If a more urgent
// job is waiting and there's no free slot, the least urgent preemptible job
// is cancelled (its promise rejects with PreemptedError) so the caption goes
// out; the background job retries later. One exception: a short job that is
// nearly done (it said how long it usually takes, and less than `graceMs` of
// that is left) may finish first. Otherwise, during non-stop talking, a
// definition would be cancelled every time and never finish, while waiting
// for it costs a caption only a moment.

export class PreemptedError extends Error {
  constructor() {
    super("preempted by a more urgent AI call");
    this.name = "PreemptedError";
  }
}

// Checks the name, not the class: Next.js can load this file once per route
// bundle, and the scheduler (shared through globalThis) may throw another
// bundle's PreemptedError, which `instanceof` wouldn't recognize.
export const isPreempted = (err: unknown): boolean => (err as Error | null)?.name === "PreemptedError";

type Waiter = { cost: number; priority: number; preemptible: boolean; expectedMs?: number; order: number; start: (running: Running) => void };
type Running = {
  priority: number;
  preemptible: boolean;
  controller: AbortController;
  startedAt: number;
  expectedMs?: number;
  grace?: ReturnType<typeof setTimeout>;
};

export class AiScheduler {
  private used = 0;
  private running = new Set<Running>();
  private waiting: Waiter[] = [];
  private counter = 0;

  constructor(
    readonly capacity: number,
    readonly maxJobs: number = Infinity,
    readonly graceMs: number = 0,
  ) {}

  get inUse(): number {
    return this.used;
  }

  get queued(): number {
    return this.waiting.length;
  }

  // Priorities of the jobs running right now (for diagnostics).
  get runningPriorities(): number[] {
    return [...this.running].map((r) => r.priority);
  }

  // `expectedMs`: how long this job usually takes, for the grace rule above.
  async run<T>(opts: { cost: number; priority: number; preemptible?: boolean; expectedMs?: number }, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const cost = Math.min(Math.max(1, opts.cost), this.capacity);
    const running = await new Promise<Running>((resolve) => {
      this.waiting.push({ cost, priority: opts.priority, preemptible: Boolean(opts.preemptible), expectedMs: opts.expectedMs, order: this.counter++, start: resolve });
      this.pump();
    });
    try {
      const result = await fn(running.controller.signal);
      if (running.controller.signal.aborted) throw new PreemptedError();
      return result;
    } catch (err) {
      if (running.controller.signal.aborted) throw new PreemptedError();
      throw err;
    } finally {
      clearTimeout(running.grace);
      this.used -= cost;
      this.running.delete(running);
      this.pump();
    }
  }

  private fits(w: Waiter): boolean {
    return this.running.size < this.maxJobs && this.used + w.cost <= this.capacity;
  }

  private pump() {
    this.waiting.sort((a, b) => a.priority - b.priority || a.order - b.order);
    // Strict order: if the most urgent job doesn't fit yet, nothing jumps
    // ahead of it (otherwise a big recap job could wait forever).
    while (this.waiting.length && this.fits(this.waiting[0])) {
      const next = this.waiting.shift()!;
      const running: Running = { priority: next.priority, preemptible: next.preemptible, controller: new AbortController(), startedAt: Date.now(), expectedMs: next.expectedMs };
      this.used += next.cost;
      this.running.add(running);
      next.start(running);
    }
    // Still blocked? Cancel the least urgent background job below it.
    const top = this.waiting[0];
    if (!top) return;
    const victim = [...this.running]
      .filter((r) => r.preemptible && r.priority > top.priority && !r.controller.signal.aborted)
      .sort((a, b) => b.priority - a.priority)[0];
    if (!victim || victim.grace) return;
    const left = victim.expectedMs === undefined ? Infinity : victim.expectedMs - (Date.now() - victim.startedAt);
    if (left > this.graceMs) {
      victim.controller.abort(new PreemptedError());
      return;
    }
    // Nearly done: give it until it should finish (plus a little), then cancel
    // it if it's still running and something more urgent is still waiting.
    victim.grace = setTimeout(
      () => {
        if (this.running.has(victim) && this.waiting.some((w) => w.priority < victim.priority)) victim.controller.abort(new PreemptedError());
      },
      Math.max(0, left) + 250,
    );
  }
}
