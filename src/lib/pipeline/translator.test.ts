import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/ai/prompts";
import type { LangTranslation } from "@/lib/ai/schemas";
import { Lru } from "./lru";
import { LessonTranslator, type TranslatorDeps } from "./translator";

// A fake AI whose streaming we control chunk by chunk.
type Call = { messages: ChatMessage[]; push: (text: string) => void; finish: () => void; fail: (err: unknown) => void; signal: AbortSignal };

function harness(overrides: Partial<TranslatorDeps> = {}) {
  const calls: Call[] = [];
  const events: { type: string; data: Record<string, unknown>; audience: unknown }[] = [];
  const saved: { segmentId: string; lang: string; tr: LangTranslation }[] = [];
  const fixes: { segmentId: string; text: string }[] = [];
  let langs = ["es", "ar"];
  const t = new LessonTranslator({
    model: "test-model",
    lesson: { subject: "Biology", title: "Photosynthesis", keyTerms: ["photosynthesis", "ATP", "cell membrane"] },
    complete: ({ messages, signal, onText }) =>
      new Promise<string>((resolve, reject) => {
        let text = "";
        signal.addEventListener("abort", () => reject(signal.reason));
        calls.push({
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
    schedule: (_p, fn) => fn(),
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

  it("if the AI errors, every language falls back to English (never a blank line)", async () => {
    const h = harness();
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello class." });
    await tick();
    h.calls[0].fail(Object.assign(new Error("server error"), { status: 500 }));
    await tick();
    expect(h.events.map((e) => [e.type, e.data.lang])).toEqual([
      ["translation-failed", "es"],
      ["translation-failed", "ar"],
    ]);
  });

  it("gives up on a stalled stream but keeps what already arrived", async () => {
    const h = harness({ stallMs: 30 });
    h.t.enqueue({ id: "s1", seq: 1, text: "Hello class." });
    await tick();
    const full = reply(1, { es: { text: "Hola clase." }, ar: { text: "مرحبا" } });
    h.calls[0].push(full.slice(0, full.indexOf('"ar"')));
    await new Promise((r) => setTimeout(r, 60));
    expect(h.calls[0].signal.aborted).toBe(true);
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
});
