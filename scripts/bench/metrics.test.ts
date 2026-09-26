import { describe, expect, it } from "vitest";
import { highlightable, percentile, termRecall, termsInSentence } from "./metrics";

describe("bench metrics", () => {
  it("percentile uses nearest-rank", () => {
    const xs = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentile(xs, 50)).toBe(500);
    expect(percentile(xs, 95)).toBe(1000);
    expect(percentile([], 50)).toBeNaN();
  });

  it("finds key terms tolerant of plurals and hyphens", () => {
    expect(termsInSentence("Tiny structures called chloroplasts.", ["chloroplast", "ATP"])).toEqual(["chloroplast"]);
    expect(termsInSentence("The y intercept is at -3.", ["y-intercept"])).toEqual(["y-intercept"]);
  });

  it("measures recall and highlightability per language", () => {
    const seg = {
      seq: 1,
      tr: {
        es: { text: "La pendiente es dos.", terms: [{ en: "slope", tr: "pendiente" }] },
        vi: { text: "Độ dốc là hai.", terms: [{ en: "slope", tr: "hệ số góc" }] },
      },
    };
    expect(termRecall(["slope"], seg, ["es", "vi"])).toBe(1);
    expect(highlightable(seg, ["es", "vi"])).toEqual({ ok: 1, total: 2 });
  });
});
