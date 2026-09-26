// Small in-memory rate limiter (one server process, so no Redis needed).
// Each key gets `max` hits per `windowMs`, counted in a sliding window.

export type RateLimiter = {
  check: (key: string) => { ok: boolean; retryAfterMs: number };
};

export function createRateLimiter(opts: { windowMs: number; max: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  return {
    check(key) {
      const t = now();
      // Drop idle keys occasionally so memory doesn't grow forever.
      if (t - lastSweep > opts.windowMs * 5) {
        for (const [k, times] of hits) if (times[times.length - 1] <= t - opts.windowMs) hits.delete(k);
        lastSweep = t;
      }
      const recent = (hits.get(key) ?? []).filter((x) => x > t - opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return { ok: false, retryAfterMs: recent[0] + opts.windowMs - t };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true, retryAfterMs: 0 };
    },
  };
}
