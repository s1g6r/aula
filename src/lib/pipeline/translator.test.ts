import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/ai/prompts";
import type { LangTranslation } from "@/lib/ai/schemas";
import { Lru } from "./lru";
import { LessonTranslator, type TranslatorDeps } from "./translator";

// A fake AI whose streaming we control chunk by chunk.
type Call = { messages: ChatMessage[]; push: (text: string) => void; finish: () => void; fail: (err: unknown) => void; signal: AbortSignal };

function harness(overrides: Partial<TranslatorDeps> = {}) {
  const calls: (Call & { model: string })[] = [];
  const events: { type: string; data: Record<string, unknown>; audience: unknown }[] = [];
  const saved: { segmentId: string; lang: string; tr: LangTranslation }[] = [];
  const fixes: { segmentId: string; text: string }[] = [];
  let langs = ["es", "ar"];
  const t = new LessonTranslator({
    pickModel: (l) => (l.includes("so") ? { model: "quality-model", cost: 2 } : { model: "fast-model", cost: 1 }),
    lesson: { subject: "Biology", title: "Photosynthesis", keyTerms: ["photosynthesis", "ATP", "cell membrane"] },
    complete: (model, { messages, signal, onText }) =>
      new Promise<string>((resolve, reject) => {
        let text = "";
        signal.addEventListener("abort", () => reject(signal.reason));
        calls.push({
          model,
          messages,
          signal,
          push: (chunk) => {
            text += chunk;
            onText(text);
          },
          finish: () => resolve(text),
          fail: reject,
        });
      }),
    schedule: (_p, _cost, fn) => fn(new AbortController().signal),
    activeLangs: () => langs,
    publish: (type, data, audience) => events.push({ type, data: data as Record<string, unknown>, audience }),
    saveTranslation: async (segmentId, lang, tr) => void saved.push({ segmentId, lang, tr }),
    saveFix: async (segmentId, text) => void fixes.push({ segmentId, text }),
    cache: new Lru(100),
    ...overrides,
  });
  return { t, calls, events, saved, fixes, setLangs: (l: string[]) => (langs = l) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const reply = (seq: number, tr: Record<string, unknown>, fix?: string) => JSON.stringify({ segments: [{ seq, tr, ...(fix ? { fix } : {}) }] });

describe("LessonTranslator", () => {
  it("sends each language to students as soon as its part of the stream is complete", async () => {
    const h = harness();
    h.t.enqueue({ id: "s1", seq: 1, text: "Today we study photosynthesis." });
    await tick();
    const full = reply(1, {
      es: { text: "Hoy estudiamos la fotosíntesis.", terms: [{ en: "photosynthesis", tr: "fotosíntesis" }] },
      ar: { text: "اليوم ندرس التمثيل الضوئي.", terms: [] },
    });
    const cut = full.indexOf('"ar"');
    h.calls[0].push(full.slice(0, cut));
    expect(h.events.map((e) => [e.type, e.data.lang])).toEqual([["translation", "es"]]);
    expect(h.events[0].audience).toEqual({ lang: "es" });
    h.calls[0].push(full.slice(cut));
    h.calls[0].finish();
    await tick();
    expect(h.events.map((e) => [e.type, e.data.lang])).toEqual([
      ["translation", "es"],
      ["translation", "ar"],
    ]);
    expect(h.saved.map((s) => s.lang)).toEqual(["es", "ar"]);
  });

  it("merges sentences that arrive while a call is running into one call", async () => {
    const h = harness();
    h.t.enqueue({ id: "s1", seq: 1, text: "First." });
    await tick();
    h.t.enqueue({ id: "s2", seq: 2, text: "Second." });
    h.t.enqueue({ id: "s3", seq: 3, text: "Third." });
    expect(h.calls).toHaveLength(1);
    h.calls[0].push(reply(1, { es: { text: "Primero." }, ar: { text: "أولا." } }));
    h.calls[0].finish();
    await tick();
    await tick();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].messages[1].content).toContain('"seq":2');
    expect(h.calls[1].messages[1].content).toContain('"seq":3');
  });

  it("reuses the cached translation when the teacher repeats a sentence", async () => {
    const h = harness();
    h.setLangs(["es"]);
    h.t.enqueue({ id: "s1", seq: 1, text: "Any questions?" });
    await tick();
    h.calls[0].push(reply(1, { es: { text: "¿Alguna pregunta?" } }));
    h.calls[0].finish();
    await tick();
    h.t.enqueue({ id: "s2", seq: 2, text: "any questions" });
    await tick();
    expect(h.calls).toHaveLength(1);
    expect(h.events.filter((e) => e.type === "translation").map((e) => e.data.seq)).toEqual([1, 2]);
  });

  it("an invalid language fails alone; the others still arrive", async () => {
    const h = harness();
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello class." });
    await tick();
    h.calls[0].push(reply(1, { es: { text: "Hola clase." }, ar: { text: "" } }));
    h.calls[0].finish();
    await tick();
    expect(h.events.map((e) => [e.type, e.data.lang])).toEqual([
      ["translation", "es"],
      ["translation-failed", "ar"],
    ]);
  });

  it("if the AI errors (twice), every language falls back to English (never a blank line)", async () => {
    const h = harness();
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello class." });
    await tick();
    h.calls[0].fail(Object.assign(new Error("server error"), { status: 500 }));
    await tick();
    expect(h.events).toEqual([]); // one more try first
    h.calls[1].fail(Object.assign(new Error("server error"), { status: 500 }));
    await tick();
    expect(h.events.map((e) => [e.type, e.data.lang])).toEqual([
      ["translation-failed", "es"],
      ["translation-failed", "ar"],
    ]);
  });

  it("keeps what arrived from a stalled stream and tries once more for the rest", async () => {
    const h = harness({ stallMs: 30 });
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello class." });
    await tick();
    const full = reply(1, { es: { text: "Hola clase." }, ar: { text: "مرحبا" } });
    h.calls[0].push(full.slice(0, full.indexOf('"ar"')));
    while (h.calls.length < 2) await new Promise((r) => setTimeout(r, 5));
    expect(h.calls[0].signal.aborted).toBe(true);
    // The second try asks only for Arabic.
    const retry = h.calls[1].messages.at(-1)!.content;
    expect(retry).toContain("- ar:");
    expect(retry).not.toContain("- es:");
    // It stalls too: Arabic falls back to English, Spanish is kept.
    await new Promise((r) => setTimeout(r, 60));
    expect(h.events.map((e) => [e.type, e.data.lang])).toEqual([
      ["translation", "es"],
      ["translation-failed", "ar"],
    ]);
  });

  it("retries once on HTTP 429 when nothing was delivered yet", async () => {
    const h = harness();
    h.setLangs(["es"]);
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello." });
    await tick();
    h.calls[0].fail(Object.assign(new Error("rate limited"), { status: 429 }));
    await new Promise((r) => setTimeout(r, 1600));
    expect(h.calls).toHaveLength(2);
    h.calls[1].push(reply(1, { es: { text: "Hola." } }));
    h.calls[1].finish();
    await tick();
    expect(h.events.map((e) => e.type)).toEqual(["translation"]);
  });

  it("publishes a speech-recognition fix only when the English actually changed", async () => {
    const h = harness();
    h.setLangs(["es"]);
    h.t.enqueue({ id: "s1", seq: 1, text: "Water goes through the sell membrane." });
    await tick();
    h.calls[0].push(reply(1, { es: { text: "El agua pasa por la membrana celular." } }, "Water goes through the cell membrane."));
    h.calls[0].finish();
    await tick();
    h.t.enqueue({ id: "s2", seq: 2, text: "Good." });
    await tick();
    h.calls[1].push(reply(2, { es: { text: "Bien." } }, "Good."));
    h.calls[1].finish();
    await tick();
    expect(h.events.filter((e) => e.type === "fix").map((e) => e.data)).toEqual([{ seq: 1, text: "Water goes through the cell membrane." }]);
    expect(h.fixes).toEqual([{ segmentId: "s1", text: "Water goes through the cell membrane." }]);
  });

  it("skips lines it's too far behind on so captions catch up", async () => {
    let now = 0;
    const h = harness({ now: () => now, maxLagMs: 20_000 });
    h.setLangs(["es"]);
    h.t.enqueue({ id: "s1", seq: 1, text: "One." });
    await tick();
    h.t.enqueue({ id: "s2", seq: 2, text: "Two." });
    h.t.enqueue({ id: "s3", seq: 3, text: "Three." });
    now = 25_000;
    h.t.enqueue({ id: "s4", seq: 4, text: "Four." });
    h.calls[0].push(reply(1, { es: { text: "Uno." } }));
    h.calls[0].finish();
    await tick();
    await tick();
    expect(h.events.filter((e) => e.type === "translation-failed").map((e) => [e.data.seq, e.data.reason])).toEqual([
      [2, "behind"],
      [3, "behind"],
    ]);
    expect(h.calls[1].messages[1].content).toContain('"seq":4');
  });

  it("doesn't call the AI when nobody needs a translation", async () => {
    const h = harness();
    h.setLangs([]);
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello." });
    await tick();
    expect(h.calls).toHaveLength(0);
  });

  it("keeps only the teacher's key terms, and only if they appear in the translation", async () => {
    const h = harness();
    h.setLangs(["es"]);
    h.t.enqueue({ id: "s1", seq: 1, text: "The Calvin cycle uses ATP." });
    await tick();
    h.calls[0].push(
      reply(1, {
        es: {
          text: "El ciclo de Calvin usa ATP.",
          terms: [
            { en: "ATP", tr: "ATP" },
            { en: "Calvin cycle", tr: "ciclo de Calvin" }, // not a key term
            { en: "photosynthesis", tr: "fotosíntesis" }, // not in the text
            { en: "ATP", tr: "ATP" }, // duplicate
          ],
        },
      }),
    );
    h.calls[0].finish();
    await tick();
    expect(h.events[0].data.terms).toEqual([{ en: "ATP", tr: "ATP" }]);
  });

  it("backfills recent lines for a newly joined language", async () => {
    const h = harness();
    h.setLangs([]);
    h.t.enqueue({ id: "s1", seq: 1, text: "One." });
    h.t.enqueue({ id: "s2", seq: 2, text: "Two." });
    void h.t.backfill("vi");
    await tick();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].messages[1].content).toContain("- vi: Vietnamese");
    expect(h.calls[0].messages[1].content).toContain('"seq":1');
  });

  it("gives a beta language its own call on the stronger model, after the others", async () => {
    const h = harness();
    h.setLangs(["es", "so", "ar"]);
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello." });
    await tick();
    expect(h.calls.map((c) => c.model)).toEqual(["fast-model"]);
    expect(h.calls[0].messages.at(-1)!.content).not.toContain("Somali");
    h.calls[0].push(reply(1, { es: "Hola.", ar: "مرحبا." }));
    h.calls[0].finish();
    await tick();
    expect(h.events.map((e) => e.data.lang)).toEqual(["es", "ar"]);
    expect(h.calls.map((c) => c.model)).toEqual(["fast-model", "quality-model"]);
    h.calls[1].push(reply(1, { so: "Salaan." }));
    h.calls[1].finish();
    await tick();
    expect(h.events.map((e) => [e.type, e.data.lang])).toContainEqual(["translation", "so"]);
  });

  it("takes turns between the fast and slow queues, and the slow one merges what piled up", async () => {
    let now = 1000;
    const h = harness({ now: () => now });
    h.setLangs(["es", "so"]);
    h.t.enqueue({ id: "s1", seq: 1, text: "One." });
    await tick();
    now = 2000;
    h.t.enqueue({ id: "s2", seq: 2, text: "Two." });
    now = 3000;
    h.t.enqueue({ id: "s3", seq: 3, text: "Three." });
    h.calls[0].push(reply(1, { es: "Uno." }));
    h.calls[0].finish(); // es for line 1
    await tick();
    // Line 1 has waited longest for Somali, so the slow queue goes next, with everything it has.
    expect(h.calls[1].model).toBe("quality-model");
    expect(h.calls[1].messages.at(-1)!.content).toMatch(/"seq":1[\s\S]*"seq":2[\s\S]*"seq":3/);
    h.calls[1].push(JSON.stringify({ segments: [1, 2, 3].map((seq) => ({ seq, tr: { so: `Somali ${seq}.` } })) }));
    h.calls[1].finish();
    await tick();
    expect(h.calls[2].model).toBe("fast-model");
    expect(h.calls[2].messages.at(-1)!.content).toContain('"seq":2');
  });

  it("merges waiting lines only up to about one quick call's worth", async () => {
    const h = harness();
    h.setLangs(["es", "ar", "vi", "zh-Hans"]);
    const long = "the mitochondria is where the cell makes its energy through cellular respiration";
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello." });
    await tick();
    for (let i = 2; i <= 5; i++) h.t.enqueue({ id: `s${i}`, seq: i, text: long });
    h.calls[0].push(reply(1, { es: "Hola.", ar: "مرحبا.", vi: "Xin chào.", "zh-Hans": "你好。" }));
    h.calls[0].finish();
    await tick();
    // Four languages times three long lines is about 350 tokens; a fourth
    // line waits for the next call.
    const second = h.calls[1].messages.at(-1)!.content;
    expect(second).toContain('"seq":4');
    expect(second).not.toContain('"seq":5');
  });

  it("retries once when the provider never starts answering", async () => {
    const h = harness({ stallMs: 30 });
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello." });
    // The first call stays silent until it counts as stalled.
    while (h.calls.length < 2) await new Promise((r) => setTimeout(r, 5));
    h.calls[1].push(reply(1, { es: "Hola.", ar: "مرحبا." }));
    h.calls[1].finish();
    await tick();
    expect(h.events.map((e) => e.type)).toEqual(["translation", "translation"]);
  });

  it("retries a stalled call even when the stream ends quietly instead of throwing", async () => {
    let n = 0;
    const h = harness({
      stallMs: 30,
      complete: (_model, { signal, onText }) =>
        new Promise<string>((resolve) => {
          n++;
          if (n === 1) signal.addEventListener("abort", () => resolve("")); // ends quietly
          else {
            const text = reply(1, { es: "Hola.", ar: "مرحبا." });
            onText(text);
            resolve(text);
          }
        }),
    });
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello." });
    while (n < 2) await new Promise((r) => setTimeout(r, 5));
    await tick();
    expect(h.events.map((e) => e.type)).toEqual(["translation", "translation"]);
  });

  it("stops a call that keeps going after everything was delivered", async () => {
    const h = harness();
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello." });
    await tick();
    h.calls[0].push(reply(1, { es: "Hola.", ar: "مرحبا." }));
    h.calls[0].push("   \n\t   "); // trailing junk, never finishing
    await new Promise((r) => setTimeout(r, 1600));
    expect(h.calls[0].signal.aborted).toBe(true);
    expect(h.events.map((e) => e.type)).toEqual(["translation", "translation"]);
  });

  it("tells the model the glossary's word for each key term in the line", async () => {
    const asked: [string[], string[]][] = [];
    const h = harness({
      termTranslations: async (langs, terms) => {
        asked.push([langs, terms]);
        return { ar: { photosynthesis: "التمثيل الضوئي" } };
      },
    });
    h.t.enqueue({ id: "s1", seq: 1, text: "Photosynthesis is how plants make food." });
    await tick();
    await tick();
    expect(asked).toEqual([[["es", "ar"], ["photosynthesis"]]]);
    expect(h.calls[0].messages.at(-1)!.content).toContain("Key terms to use:\n- ar: photosynthesis = التمثيل الضوئي");
  });

  it("reports each call's timing and outcome", async () => {
    let now = 1000;
    const records: import("./translator").CallRecord[] = [];
    const h = harness({ now: () => now, onCall: (c) => void records.push(c) });
    h.setLangs(["es"]);
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello." });
    await tick();
    now = 1400;
    h.calls[0].push(reply(1, { es: { text: "Hola." } }));
    now = 2200;
    h.calls[0].finish();
    await tick();
    expect(records[0]).toMatchObject({ model: "fast-model", langs: ["es"], seqs: [1], waitMs: 0, firstTextMs: 400, totalMs: 1200, delivered: 1, failed: 0, outcome: "ok" });
  });
});
