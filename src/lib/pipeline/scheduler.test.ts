import { describe, expect, it } from "vitest";
import { Lru, translationCacheKey } from "./lru";
import { AiScheduler } from "./scheduler";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("AiScheduler", () => {
  it("never uses more units than the plan allows", async () => {
    const s = new AiScheduler(4);
    const gates = [deferred(), deferred(), deferred()];
    let maxUsed = 0;
    const jobs = gates.map((g) =>
      s.run({ cost: 2, priority: 0 }, async () => {
        maxUsed = Math.max(maxUsed, s.inUse);
        await g.promise;
      }),
    );
    await tick();
    expect(s.inUse).toBe(4);
    expect(s.queued).toBe(1);
    gates.forEach((g) => g.resolve());
    await Promise.all(jobs);
    expect(maxUsed).toBe(4);
    expect(s.inUse).toBe(0);
  });

  it("runs live captions before glossary and recap work", async () => {
    const s = new AiScheduler(1);
    const order: string[] = [];
    const block = deferred();
    const first = s.run({ cost: 1, priority: 0 }, () => block.promise);
    await tick();
    const jobs = [
      s.run({ cost: 1, priority: 2 }, async () => void order.push("recap")),
      s.run({ cost: 1, priority: 1 }, async () => void order.push("glossary")),
      s.run({ cost: 1, priority: 0 }, async () => void order.push("caption-1")),
      s.run({ cost: 1, priority: 0 }, async () => void order.push("caption-2")),
    ];
    block.resolve();
    await Promise.all([first, ...jobs]);
    expect(order).toEqual(["caption-1", "caption-2", "glossary", "recap"]);
  });

  it("frees units even when a job throws", async () => {
    const s = new AiScheduler(1);
    await expect(s.run({ cost: 1, priority: 0 }, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(s.inUse).toBe(0);
  });
});

describe("translation cache", () => {
  it("evicts the least recently used entry", () => {
    const c = new Lru<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
  });

  it("treats the same sentence with different punctuation or case as one entry", () => {
    expect(translationCacheKey("Any questions?", "es", "m")).toBe(translationCacheKey("any questions", "es", "m"));
    expect(translationCacheKey("Any questions?", "es", "m")).not.toBe(translationCacheKey("Any questions?", "ar", "m"));
  });
});
