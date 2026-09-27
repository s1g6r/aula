import { describe, expect, it } from "vitest";
import { alignAfter, CHUNK_MAX_WORDS, findCut, SpeechChunker, words } from "./chunking";

// Feeds text to the chunker one word at a time, the way interim results grow.
function speak(chunker: SpeechChunker, text: string) {
  const ws = words(text);
  const pieces: string[] = [];
  let rest = "";
  for (let i = 1; i <= ws.length; i++) {
    const r = chunker.interim(ws.slice(0, i).join(" "));
    pieces.push(...r.pieces);
    rest = r.rest;
  }
  return { pieces, rest };
}

const LONG =
  "so the mitochondria is where the cell makes its energy and it does that through a process called cellular respiration which uses glucose and oxygen to make ATP that the cell can spend";

describe("findCut", () => {
  it("waits until enough words have settled", () => {
    expect(findCut(words("one two three four five six seven eight nine ten"), 0)).toBeNull();
  });

  it("breaks before a joining word when there is one", () => {
    const ws = words("the cell membrane lets water in and keeps the big molecules out of the cell");
    const cut = findCut(ws, 0)!;
    expect(ws[cut]).toBe("and");
  });

  it("cuts at the limit when there is no joining word", () => {
    const ws = words("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen");
    expect(findCut(ws, 0)).toBe(CHUNK_MAX_WORDS);
  });
});

describe("alignAfter", () => {
  it("continues after the sent words", () => {
    expect(alignAfter(words("a b c d e f"), words("a b c"))).toBe(3);
  });

  it("follows the recognizer when it revises an earlier word", () => {
    // "sell" became "cell" and one word was merged: still continue after "membrane lets".
    expect(alignAfter(words("the cell membrane lets water in"), words("the sell mem brane lets"))).toBe(4);
  });
});

describe("SpeechChunker", () => {
  it("sends a long stretch of speech in pieces without losing or repeating words", () => {
    const c = new SpeechChunker();
    const { pieces, rest } = speak(c, LONG);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    const last = c.final(LONG);
    const all = [...pieces, last].filter(Boolean).join(" ");
    expect(all).toBe(LONG);
    expect(rest.length).toBeGreaterThan(0);
    for (const p of pieces) expect(words(p).length).toBeLessThanOrEqual(CHUNK_MAX_WORDS);
  });

  it("leaves short sentences alone", () => {
    const c = new SpeechChunker();
    expect(speak(c, "good morning everyone today we're learning about cells").pieces).toEqual([]);
    expect(c.final("Good morning everyone, today we're learning about cells.")).toBe("Good morning everyone, today we're learning about cells.");
  });

  it("sends only the unsent tail when the final result differs slightly", () => {
    const c = new SpeechChunker();
    const { pieces } = speak(c, LONG);
    const final = LONG.replace("the cell makes", "the cells make");
    const tail = c.final(final)!;
    expect([...pieces, tail].join(" ").split(" ").length).toBe(words(final).length);
    expect(tail.endsWith("the cell can spend")).toBe(true);
  });

  it("starts fresh after a final result", () => {
    const c = new SpeechChunker();
    speak(c, LONG);
    c.final(LONG);
    expect(c.final("next sentence here")).toBe("next sentence here");
  });
});
