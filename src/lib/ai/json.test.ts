import { describe, expect, it } from "vitest";
import { extractJson, parseModelJson, scanTranslationStream } from "./json";
import { RecapSchema, TranslationResponseSchema } from "./schemas";

const good = {
  segments: [
    {
      seq: 3,
      tr: {
        es: { text: "La fotosíntesis es cómo las plantas hacen su comida.", terms: [{ en: "photosynthesis", tr: "fotosíntesis", gloss: "Proceso de las plantas." }] },
        ar: { text: "البناء الضوئي هو كيف تصنع النباتات غذاءها.", terms: [] },
      },
    },
  ],
};

describe("extractJson", () => {
  it("parses bare JSON", () => {
    expect(extractJson(JSON.stringify(good))).toEqual(good);
  });

  it("strips ```json fences and surrounding prose", () => {
    const raw = "Here you go:\n```json\n" + JSON.stringify(good) + "\n```\nHope that helps!";
    expect(extractJson(raw)).toEqual(good);
  });

  it("strips <think> blocks that reasoning models emit", () => {
    const raw = "<think>The user wants {Spanish}...</think>" + JSON.stringify(good);
    expect(extractJson(raw)).toEqual(good);
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("Sorry, I can't help with that.")).toThrow();
  });
});

describe("parseModelJson with the translation schema", () => {
  it("accepts a valid response and defaults missing terms to []", () => {
    const raw = JSON.stringify({ segments: [{ seq: 1, tr: { vi: { text: "Xin chào" } } }] });
    const r = parseModelJson(raw, TranslationResponseSchema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.segments[0].tr.vi.terms).toEqual([]);
  });

  it("keeps the optional ASR fix", () => {
    const raw = JSON.stringify({ segments: [{ seq: 7, fix: "the cell membrane", tr: { es: { text: "la membrana celular" } } }] });
    const r = parseModelJson(raw, TranslationResponseSchema);
    expect(r.ok && r.data.segments[0].fix).toBe("the cell membrane");
  });

  it("rejects truncated JSON (e.g. the model hit max_tokens)", () => {
    const raw = JSON.stringify(good).slice(0, 60);
    const r = parseModelJson(raw, TranslationResponseSchema);
    expect(r.ok).toBe(false);
  });

  it("rejects an empty translation line rather than showing a blank", () => {
    const raw = JSON.stringify({ segments: [{ seq: 1, tr: { es: { text: "   " } } }] });
    expect(parseModelJson(raw, TranslationResponseSchema).ok).toBe(false);
  });

  it("rejects the wrong shape (a bare language map without segments)", () => {
    const raw = JSON.stringify({ es: { text: "hola", terms: [] } });
    const r = parseModelJson(raw, TranslationResponseSchema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/schema mismatch/);
  });

  it("rejects terms missing their translated form", () => {
    const raw = JSON.stringify({ segments: [{ seq: 1, tr: { es: { text: "hola", terms: [{ en: "slope" }] } } }] });
    expect(parseModelJson(raw, TranslationResponseSchema).ok).toBe(false);
  });
});

describe("scanTranslationStream", () => {
  const full =
    '{"segments":[{"seq":7,"fix":"the cell membrane","tr":{"es":{"text":"Dijo \\"hola\\" {no}","terms":[]},"ar":{"text":"مرحبا","terms":[{"en":"cell membrane","tr":"الغشاء","gloss":"x"}]}}}]}';

  it("finds every finished language in a complete reply", () => {
    const [s] = scanTranslationStream(full);
    expect(s.seq).toBe(7);
    expect(s.fix).toBe("the cell membrane");
    expect(Object.keys(s.langs)).toEqual(["es", "ar"]);
    expect(JSON.parse(s.langs.es).text).toBe('Dijo "hola" {no}');
  });

  it("reports Spanish as soon as it closes, while Arabic is still streaming", () => {
    const cut = full.indexOf('"ar"') + 12;
    const [s] = scanTranslationStream(full.slice(0, cut));
    expect(Object.keys(s.langs)).toEqual(["es"]);
    expect(s.ends.es).toBeLessThan(cut);
  });

  it("ignores braces and quotes inside strings", () => {
    const [s] = scanTranslationStream(full);
    expect(JSON.parse(s.langs.es)).toEqual({ text: 'Dijo "hola" {no}', terms: [] });
  });

  it("handles merged batches with several segments", () => {
    const two = '{"segments":[{"seq":1,"tr":{"vi":{"text":"a"}}},{"seq":2,"tr":{"vi":{"text":"b"}}}]}';
    const segs = scanTranslationStream(two);
    expect(segs.map((s) => [s.seq, JSON.parse(s.langs.vi).text])).toEqual([[1, "a"], [2, "b"]]);
  });

  it("works with pretty-printed JSON and returns nothing for an empty start", () => {
    const pretty = JSON.stringify(JSON.parse(full), null, 2);
    expect(Object.keys(scanTranslationStream(pretty)[0].langs)).toEqual(["es", "ar"]);
    expect(scanTranslationStream('{"segm')).toEqual([]);
  });

  it("waits for a number that may still be growing", () => {
    expect(scanTranslationStream('{"segments":[{"seq":1')[0]).toBeUndefined();
    expect(scanTranslationStream('{"segments":[{"seq":12,')[0].seq).toBe(12);
  });
});

describe("RecapSchema", () => {
  const base = { keyTerms: [], checkQuestions: [{ q: "What is ATP?", answer: "An energy molecule." }] };

  it("splits a summary that came back as one string of sentences", () => {
    const r = RecapSchema.safeParse({ ...base, summary: ["Plants make food. They use sunlight! Where? In chloroplasts."] });
    expect(r.success && r.data.summary).toEqual(["Plants make food.", "They use sunlight!", "Where?", "In chloroplasts."]);
  });

  it("still rejects a one-sentence summary", () => {
    expect(RecapSchema.safeParse({ ...base, summary: ["Plants make food."] }).success).toBe(false);
  });
});
