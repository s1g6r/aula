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
// Priorities: 0 = live captions, 1 = glossary / catch-up for a new
// language, 2 = recaps and warm-up calls. Within a priority, first come,
// first served.
//
// Preemption: background jobs can be marked preemptible. If a more urgent
// job is waiting and there's no free slot, the least urgent preemptible job
// is cancelled (its promise rejects with PreemptedError) so the caption goes
// out now; the background job retries later.

export class PreemptedError extends Error {
  constructor() {
    super("preempted by a more urgent AI call");
    this.name = "PreemptedError";
  }
}

type Waiter = { cost: number; priority: number; preemptible: boolean; order: number; start: (running: Running) => void };
type Running = { priority: number; preemptible: boolean; controller: AbortController };

export class AiScheduler {
  private used = 0;
  private running = new Set<Running>();
  private waiting: Waiter[] = [];
  private counter = 0;

  constructor(
    readonly capacity: number,
    readonly maxJobs: number = Infinity,
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

  async run<T>(opts: { cost: number; priority: number; preemptible?: boolean }, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const cost = Math.min(Math.max(1, opts.cost), this.capacity);
    const running = await new Promise<Running>((resolve) => {
      this.waiting.push({ cost, priority: opts.priority, preemptible: Boolean(opts.preemptible), order: this.counter++, start: resolve });
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
      const running: Running = { priority: next.priority, preemptible: next.preemptible, controller: new AbortController() };
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
    victim?.controller.abort(new PreemptedError());
  }
}
