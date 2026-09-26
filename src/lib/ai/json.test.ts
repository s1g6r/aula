import { describe, expect, it } from "vitest";
import { extractJson, parseModelJson } from "./json";
import { TranslationResponseSchema } from "./schemas";

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
