import { describe, expect, it } from "vitest";
import { highlight } from "./highlight";

describe("highlight", () => {
  it("wraps terms case-insensitively and keeps the original text", () => {
    expect(highlight("La Fotosíntesis ocurre aquí.", [{ match: "fotosíntesis", term: "photosynthesis" }])).toEqual([
      { text: "La " },
      { text: "Fotosíntesis", term: "photosynthesis" },
      { text: " ocurre aquí." },
    ]);
  });

  it("prefers the longer term and never overlaps", () => {
    const pieces = highlight("the cell membrane of a cell", [
      { match: "cell", term: "cell" },
      { match: "cell membrane", term: "cell membrane" },
    ]);
    expect(pieces.filter((p) => p.term).map((p) => p.text)).toEqual(["cell membrane", "cell"]);
  });

  it("works for Chinese, which has no spaces", () => {
    const pieces = highlight("植物通过光合作用制造食物。", [{ match: "光合作用", term: "photosynthesis" }]);
    expect(pieces.map((p) => p.text).join("")).toBe("植物通过光合作用制造食物。");
    expect(pieces[1]).toEqual({ text: "光合作用", term: "photosynthesis" });
  });

  it("returns the whole line when there's nothing to highlight", () => {
    expect(highlight("Hello", [])).toEqual([{ text: "Hello" }]);
  });
});
