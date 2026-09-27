import { describe, expect, it } from "vitest";
import { beatAt, buildTimeline, interimAt, linesAt, signalsAt, type ReplayData } from "./replay-engine";

const seg = (seq: number, text: string, es: number | null, fixedText: string | null = null): ReplayData["segments"][number] => ({
  seq,
  text,
  fixedText,
  translations: es === null ? {} : { es: { text: `es:${text}`, terms: [], latencyMs: es } },
});

const data: ReplayData = {
  note: "",
  generatedAt: "",
  models: {},
  lesson: { title: "T", subject: "S", keyTerms: [] },
  languages: ["es"],
  timings: [
    { startMs: 0, endMs: 1000 },
    { startMs: 2000, endMs: 3000 },
    { startMs: 4000, endMs: 5000 },
  ],
  segments: [seg(1, "one two three four", 2000), seg(2, "the sell membrane", 1500, "the cell membrane"), seg(3, "three", null)],
  glossary: {},
  signals: [
    { type: "LOST", seq: 2, lang: "es" },
    { type: "LOST", seq: 2, lang: "vi" },
    { type: "SLOWER", seq: null, lang: "ar" },
  ],
  questions: [{ lang: "es", nickname: "Ana", original: "¿Qué?", english: "What?" }],
  recap: null,
};
const tl = buildTimeline(data, { slowerAfter: 1, lostAfter: 2, questionAfter: 2 });

describe("replay engine", () => {
  it("types out the sentence the teacher is saying", () => {
    expect(interimAt(data, 500)).toBe("one two");
    expect(interimAt(data, 1500)).toBe("");
  });

  it("shows English first, then the translation after its measured delay", () => {
    expect(linesAt(data, tl, 1500, "es")[0]).toMatchObject({ seq: 1, trStatus: "pending", tr: undefined });
    expect(linesAt(data, tl, 3000, "es")[0]).toMatchObject({ trStatus: "done", tr: { text: "es:one two three four" } });
  });

  it("marks a line with no recorded translation as failed (English stays)", () => {
    const line = linesAt(data, tl, 5000 + 8000, "es").find((l) => l.seq === 3);
    expect(line).toMatchObject({ trStatus: "failed", en: "three" });
  });

  it("shows a key-term repair as soon as the sentence arrives", () => {
    expect(linesAt(data, tl, 2999, "en")[1]).toBeUndefined();
    expect(linesAt(data, tl, 3000, "en")[1].fix).toBe("the cell membrane");
  });

  it("counts lost taps in a one-minute window and keeps lesson totals", () => {
    const first = tl.lostTaps[0].atMs;
    expect(signalsAt(data, tl, first - 1).lost).toBe(0);
    expect(signalsAt(data, tl, first + 1300)).toMatchObject({ lost: 2, anchor: { seq: 2, count: 2 }, anchorText: "the sell membrane" });
    expect(signalsAt(data, tl, first + 70_000)).toMatchObject({ lost: 0, totals: { 2: 2 } });
  });

  it("narrates the moment and ends with the recap", () => {
    expect(beatAt(tl, 0).text).toMatch(/Biology class/);
    expect(beatAt(tl, tl.recapReadyMs + 1).text).toMatch(/every student's language/);
    expect(tl.durationMs).toBeGreaterThan(tl.recapReadyMs);
  });
});
