// Every call to the AI provider goes through one scheduler per process.
//
// Featherless limits how many "concurrency units" we can use at once (our
// plan has 4; a small model costs 1 per request, a big one 4). The scheduler
// never lets us go over that budget, so we don't get HTTP 429 errors.
//
// When several jobs are waiting, the most urgent goes first:
//   0 = live captions, 1 = glossary / catch-up for a new language,
//   2 = recaps and warm-up calls.
// Within the same priority it's first come, first served.

type Waiter = { cost: number; priority: number; order: number; start: () => void };

export class AiScheduler {
  private used = 0;
  private waiting: Waiter[] = [];
  private counter = 0;

  constructor(readonly capacity: number) {}

  get inUse(): number {
    return this.used;
  }

  get queued(): number {
    return this.waiting.length;
  }

  async run<T>(opts: { cost: number; priority: number }, fn: () => Promise<T>): Promise<T> {
    const cost = Math.min(Math.max(1, opts.cost), this.capacity);
    await new Promise<void>((resolve) => {
      this.waiting.push({ cost, priority: opts.priority, order: this.counter++, start: resolve });
      this.pump();
    });
    try {
      return await fn();
    } finally {
      this.used -= cost;
      this.pump();
    }
  }

  private pump() {
    this.waiting.sort((a, b) => a.priority - b.priority || a.order - b.order);
    // Strict order: if the most urgent job doesn't fit yet, nothing jumps
    // ahead of it (otherwise a big recap job could wait forever).
    while (this.waiting.length && this.used + this.waiting[0].cost <= this.capacity) {
      const next = this.waiting.shift()!;
      this.used += next.cost;
      next.start();
    }
  }
}
