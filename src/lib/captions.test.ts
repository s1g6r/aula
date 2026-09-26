import { describe, expect, it } from "vitest";
import { applyCaptionEvent, emptyCaptions, type CaptionEvent, type CaptionState } from "./captions";

const run = (events: CaptionEvent[], wants = true): CaptionState => events.reduce((s, e) => applyCaptionEvent(s, e, wants), emptyCaptions);
const seg = (seq: number, text = `line ${seq}`): CaptionEvent => ({ type: "segment", data: { seq, text } });
const tr = (seq: number, text = `línea ${seq}`): CaptionEvent => ({ type: "translation", data: { seq, lang: "es", text, terms: [] } });

describe("applyCaptionEvent", () => {
  it("keeps lines in seq order even when translations arrive out of order", () => {
    const s = run([seg(1), seg(2), seg(3), tr(3), tr(1), tr(2)]);
    expect(s.lines.map((l) => [l.seq, l.tr?.text])).toEqual([
      [1, "línea 1"],
      [2, "línea 2"],
      [3, "línea 3"],
    ]);
  });

  it("places a late segment in the middle, not at the end", () => {
    const s = run([seg(1), seg(3), seg(2)]);
    expect(s.lines.map((l) => l.seq)).toEqual([1, 2, 3]);
  });

  it("handles a translation arriving before its English line", () => {
    const s = run([tr(5), seg(5, "Hello")]);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ seq: 5, en: "Hello", trStatus: "done", tr: { text: "línea 5" } });
  });

  it("is idempotent when events are replayed after a reconnect", () => {
    const once = run([seg(1), tr(1), seg(2)]);
    const twice = run([seg(1), tr(1), seg(2), seg(1), tr(1), seg(2)]);
    expect(twice).toEqual(once);
  });

  it("marks lines pending until translated, and failed lines fall back to English", () => {
    let s = run([seg(1), seg(2)]);
    expect(s.lines.map((l) => l.trStatus)).toEqual(["pending", "pending"]);
    s = applyCaptionEvent(s, { type: "translation-failed", data: { seq: 2, lang: "es" } }, true);
    expect(s.lines.map((l) => l.trStatus)).toEqual(["pending", "failed"]);
    expect(s.lines[1].en).toBe("line 2");
  });

  it("never shows 'translating' to a student reading in English", () => {
    expect(run([seg(1)], false).lines[0].trStatus).toBe("none");
  });

  it("clears the interim line when the sentence is finalized", () => {
    const s = run([{ type: "interim", data: { text: "Today we" } }, seg(1, "Today we start.")]);
    expect(s.interim).toBe("");
  });

  it("a snapshot replaces everything and keeps the order", () => {
    const s = run([
      seg(9),
      { type: "snapshot", data: { ended: false, segments: [{ seq: 2, text: "b", tr: { text: "B", terms: [] } }, { seq: 1, text: "a" }] } },
    ]);
    expect(s.lines.map((l) => [l.seq, l.trStatus])).toEqual([
      [1, "failed"],
      [2, "done"],
    ]);
  });

  it("applies a speech-recognition fix to an existing line", () => {
    const s = run([seg(7, "the sell membrane"), { type: "fix", data: { seq: 7, text: "the cell membrane" } }]);
    expect(s.lines[0]).toMatchObject({ en: "the sell membrane", fix: "the cell membrane" });
  });
});
