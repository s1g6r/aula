import { describe, expect, it } from "vitest";
import { formatDate } from "./dates";

describe("formatDate", () => {
  it("uses US Eastern time regardless of where it runs (no server/browser mismatch)", () => {
    // 00:47 UTC on Sep 27 is still the evening of Sep 26 in New York.
    expect(formatDate("2026-09-27T00:47:59Z", { month: "long", day: "numeric", year: "numeric" })).toBe("September 26, 2026");
  });

  it("formats in the reader's language", () => {
    expect(formatDate("2026-09-26T15:00:00Z", { month: "long", day: "numeric" }, "es")).toBe("26 de septiembre");
  });
});
