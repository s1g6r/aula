import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, generateCode, normalizeCode } from "./codes";
import { createRateLimiter } from "./rate-limit";

describe("join codes", () => {
  it("never contains look-alike characters", () => {
    for (let i = 0; i < 500; i++) expect(generateCode()).toMatch(/^[^01OIL]{6}$/);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("accepts what students actually type", () => {
    expect(normalizeCode("k7m-2qx")).toBe("K7M2QX");
    expect(normalizeCode(" K7M 2QX ")).toBe("K7M2QX");
    expect(normalizeCode("K7M2Q")).toBeNull();
    expect(normalizeCode("K7M2Q0")).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows max hits per window, then tells you when to retry", () => {
    let t = 0;
    const rl = createRateLimiter({ windowMs: 20_000, max: 1, now: () => t });
    expect(rl.check("p1").ok).toBe(true);
    t = 5_000;
    expect(rl.check("p1")).toEqual({ ok: false, retryAfterMs: 15_000 });
    expect(rl.check("p2").ok).toBe(true);
    t = 20_001;
    expect(rl.check("p1").ok).toBe(true);
  });
});
