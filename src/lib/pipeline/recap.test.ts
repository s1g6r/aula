import { describe, expect, it } from "vitest";
import { PreemptedError } from "./scheduler";
import { translateRecap, translateRecapSummary, trimTranscript, writeRecap, type RecapDeps } from "./recap";

const recap = {
  summary: ["Plants make food with light.", "This is called photosynthesis.", "It happens in chloroplasts."],
  keyTerms: [{ term: "photosynthesis", definition: "How plants make food from light." }],
  checkQuestions: [{ q: "Where does photosynthesis happen?", answer: "In the chloroplasts." }],
};

function deps(replies: (string | Error)[]): RecapDeps & { prompts: string[]; models: string[] } {
  const prompts: string[] = [];
  const models: string[] = [];
  return {
    prompts,
    models,
    complete: async (model, { messages }) => {
      models.push(model);
      prompts.push(messages[1].content);
      const r = replies.shift();
      if (r instanceof Error) throw r;
      return r ?? "";
    },
    schedule: (_p, _c, fn) => fn(new AbortController().signal),
    recapModel: { model: "gemma", cost: 2 },
    modelForLang: (lang) => (lang === "so" ? { model: "gemma", cost: 2 } : { model: "qwen", cost: 1 }),
    isPreempted: (e) => e instanceof PreemptedError,
  };
}

describe("writeRecap", () => {
  it("builds the recap from a numbered transcript and validates it", async () => {
    const d = deps([JSON.stringify(recap)]);
    const r = await writeRecap(d, { subject: "Biology", title: "Photosynthesis", keyTerms: ["photosynthesis"], transcript: ["Plants make food.", "It uses light."] });
    expect(r?.summary).toHaveLength(3);
    expect(d.prompts[0]).toContain("Transcript:\n1. Plants make food.\n2. It uses light.");
    expect(d.models).toEqual(["gemma"]);
  });

  it("retries after being pre-empted by a live caption, and once after a malformed reply", async () => {
    const d = deps([new PreemptedError(), "not json", JSON.stringify(recap)]);
    expect(await writeRecap(d, { keyTerms: [], transcript: ["x"] })).not.toBeNull();
    expect(d.prompts).toHaveLength(3);
  });

  it("gives up (null) after two malformed replies", async () => {
    const d = deps(["{}", "{}"]);
    expect(await writeRecap(d, { keyTerms: [], transcript: ["x"] })).toBeNull();
  });
});

describe("translateRecap", () => {
  const details = { keyTerms: [{ term: "photosynthesis", tr: "sawir-qaadis", definition: "..." }], checkQuestions: [{ q: "?", answer: "." }] };

  it("translates the summary first, then the details, with the language's model", async () => {
    const d = deps([JSON.stringify({ summary: ["Dhirtu..."] }), JSON.stringify(details)]);
    const r = await translateRecap(d, recap, "so");
    expect(r).toEqual({ summary: ["Dhirtu..."], ...details });
    expect(d.models).toEqual(["gemma", "gemma"]);
    expect(d.prompts[0]).toContain("Language: Somali (so)");
    // Each call carries only its own part of the recap.
    expect(d.prompts[0]).toContain('"summary"');
    expect(d.prompts[0]).not.toContain('"keyTerms"');
    expect(d.prompts[1]).toContain('"keyTerms"');
    expect(d.prompts[1]).not.toContain('"summary"');
  });

  it("reuses a summary that was already translated", async () => {
    const d = deps([JSON.stringify(details)]);
    const r = await translateRecap(d, recap, "es", { summary: ["Las plantas..."] });
    expect(r?.summary).toEqual(["Las plantas..."]);
    expect(d.prompts).toHaveLength(1);
  });

  it("keeps the summary on its own when asked for just that", async () => {
    const d = deps([JSON.stringify({ summary: ["Las plantas..."] })]);
    expect(await translateRecapSummary(d, recap, "es")).toEqual({ summary: ["Las plantas..."] });
    expect(d.models).toEqual(["qwen"]);
  });
});

describe("trimTranscript", () => {
  it("keeps short lessons whole and long ones' beginning and end", () => {
    expect(trimTranscript(["a", "b"])).toEqual(["a", "b"]);
    const long = Array.from({ length: 100 }, (_, i) => `line ${i} ${"x".repeat(50)}`);
    const t = trimTranscript(long, 1000);
    expect(t[0]).toContain("line 0 ");
    expect(t.at(-1)).toContain("line 99 ");
    expect(t).toContain("[...]");
  });
});
