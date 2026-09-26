import { describe, expect, it } from "vitest";
import { isProfane } from "./profanity";

describe("isProfane", () => {
  it("catches common swear words, including simple disguises", () => {
    expect(isProfane("this is sh1t")).toBe(true);
    expect(isProfane("¡Qué MIERDA!")).toBe(true);
    expect(isProfane("f*ck")).toBe(false); // light filter: doesn't try to catch everything
  });

  it("matches whole words only", () => {
    expect(isProfane("Can you explain the class assignment?")).toBe(false);
    expect(isProfane("I live in Scunthorpe")).toBe(false);
    expect(isProfane("¿Qué es la fotosíntesis?")).toBe(false);
  });
});
