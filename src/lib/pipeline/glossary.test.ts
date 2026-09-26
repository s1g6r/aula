import { describe, expect, it } from "vitest";
import { GlossaryService, type GlossaryEntry } from "./glossary";

function harness(replies: string[], existing: GlossaryEntry[] = []) {
  const prompts: string[] = [];
  const saved: GlossaryEntry[][] = [];
  const published: GlossaryEntry[][] = [];
  const errors: unknown[] = [];
  const svc = new GlossaryService({
    complete: async ({ messages }) => {
      prompts.push(messages[1].content);
      return replies.shift() ?? "";
    },
    schedule: (_p, fn) => fn(),
    load: async () => existing,
    save: async (_l, _lang, e) => void saved.push(e),
    publish: (_l, _lang, e) => void published.push(e),
    onError: (e) => void errors.push(e),
    chunkSize: 2,
  });
  return { svc, prompts, saved, published, errors };
}

const lesson = { id: "L", subject: "Biology", title: "Photosynthesis", keyTerms: ["photosynthesis", "ATP", "glucose"] };

describe("GlossaryService", () => {
  it("defines only the terms that don't have a definition yet, in chunks", async () => {
    const h = harness(
      [JSON.stringify({ terms: [{ en: "atp", tr: "ATP", gloss: "Molécula que guarda energía." }, { en: "glucose", tr: "glucosa", gloss: "Un azúcar." }] })],
      [{ en: "photosynthesis", tr: "fotosíntesis", gloss: "x" }],
    );
    await h.svc.ensure(lesson, "es");
    expect(h.prompts).toHaveLength(1);
    expect(h.prompts[0]).toContain('Terms: ["ATP","glucose"]');
    // Stored with the teacher's spelling ("ATP"), not the model's ("atp").
    expect(h.saved[0].map((e) => e.en)).toEqual(["ATP", "glucose"]);
  });

  it("ignores terms the model invented", async () => {
    const h = harness([JSON.stringify({ terms: [{ en: "photosynthesis", tr: "fotosíntesis", gloss: "g" }, { en: "banana", tr: "plátano", gloss: "g" }] }), "{}"]);
    await h.svc.ensure(lesson, "es");
    expect(h.published[0].map((e) => e.en)).toEqual(["photosynthesis"]);
  });

  it("runs once per lesson and language even if asked twice at the same time", async () => {
    const h = harness([JSON.stringify({ terms: [{ en: "ATP", tr: "ATP", gloss: "g" }] }), JSON.stringify({ terms: [{ en: "glucose", tr: "g", gloss: "g" }] })]);
    await Promise.all([h.svc.ensure(lesson, "vi"), h.svc.ensure(lesson, "vi")]);
    expect(h.prompts).toHaveLength(2); // 3 terms in chunks of 2, once
  });

  it("records a bad reply as an error instead of crashing", async () => {
    const h = harness(["not json", "also not json"]);
    await h.svc.ensure(lesson, "ar");
    expect(h.saved).toHaveLength(0);
    expect(h.errors).toHaveLength(2);
  });

  it("uses simple English for students reading in English", async () => {
    const h = harness([JSON.stringify({ terms: [] })]);
    await h.svc.ensure({ ...lesson, keyTerms: ["ATP"] }, "en");
    expect(h.prompts[0]).toContain("simple English for English learners");
  });
});
