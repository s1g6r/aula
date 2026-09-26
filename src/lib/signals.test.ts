import { describe, expect, it } from "vitest";
import { nextExpiry, summarizeSignals, type SignalEvent } from "./signals";

const lost = (participantId: string, seq: number | null, at: number): SignalEvent => ({ type: "LOST", seq, at, participantId });
const slower = (participantId: string, at: number): SignalEvent => ({ type: "SLOWER", seq: null, at, participantId });

describe("summarizeSignals", () => {
  it("counts students, not taps", () => {
    const s = summarizeSignals([lost("a", 3, 1000), lost("a", 4, 25_000), lost("b", 4, 26_000)], 30_000);
    expect(s.lost).toBe(2);
  });

  it("anchors the pulse to the sentence most students were lost at", () => {
    const s = summarizeSignals([lost("a", 3, 1000), lost("b", 5, 2000), lost("c", 5, 3000), lost("d", 6, 4000)], 10_000);
    expect(s.anchor).toEqual({ seq: 5, count: 2 });
  });

  it("breaks ties toward the more recent sentence", () => {
    const s = summarizeSignals([lost("a", 3, 1000), lost("b", 7, 2000)], 10_000);
    expect(s.anchor).toEqual({ seq: 7, count: 1 });
  });

  it("forgets taps older than a minute, but keeps lesson totals", () => {
    const events = [lost("a", 2, 0), lost("b", 2, 1000), slower("c", 50_000)];
    const s = summarizeSignals(events, 61_500);
    expect(s.lost).toBe(0);
    expect(s.anchor).toBeNull();
    expect(s.slower).toBe(1);
    expect(s.totals).toEqual({ 2: 2 });
  });

  it("counts 'slower' separately and ignores lost taps with no sentence for the anchor", () => {
    const s = summarizeSignals([slower("a", 1000), slower("a", 30_000), lost("b", null, 2000)], 40_000);
    expect(s).toMatchObject({ lost: 1, slower: 1, anchor: null });
  });
});

describe("nextExpiry", () => {
  it("returns when the oldest tap in the window ages out", () => {
    expect(nextExpiry([lost("a", 1, 5000), lost("b", 1, 9000)], 10_000)).toBe(65_000);
    expect(nextExpiry([lost("a", 1, 0)], 70_000)).toBeNull();
  });
});
