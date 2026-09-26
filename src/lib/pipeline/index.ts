import OpenAI from "openai";
import { chatComplete, createAiClient } from "@/lib/ai/client";
import type { ChatMessage } from "@/lib/ai/prompts";
import type { LangTranslation } from "@/lib/ai/schemas";
import { db } from "@/lib/db";
import { bus } from "@/lib/realtime/bus";
import { env } from "@/lib/server/env";
import { getLesson } from "@/lib/server/lessons";
import { singleton } from "@/lib/server/singleton";
import { GlossaryService, type GlossaryEntry } from "./glossary";
import { Lru } from "./lru";
import { AiScheduler } from "./scheduler";
import { LessonTranslator } from "./translator";

// Connects the translation pipeline to the real world: the Featherless
// client, the database, and the live event bus. Everything is one instance
// per server process.

const scheduler = singleton("aiScheduler", () => new AiScheduler(env.aiConcurrencyUnits));
const cache = singleton("translationCache", () => new Lru<string, LangTranslation>(2000));
const translators = singleton("translators", () => new Map<string, LessonTranslator>());
const latencies = singleton("latencies", () => new Map<string, number[]>());
const jsonModeOff = singleton("jsonModeOff", () => new Set<string>());

let client: OpenAI | null = null;
const ai = () => (client ??= createAiClient({ baseURL: env.aiBaseUrl, apiKey: env.aiApiKey, timeoutMs: 60_000 }));

export const aiEnabled = () => Boolean(env.aiApiKey && env.aiModelTranslate);

const log = (...args: unknown[]) => console.error("[pipeline]", ...args);

// One streamed completion. Tries JSON mode first and remembers if a model
// rejects it.
async function complete(model: string, args: { messages: ChatMessage[]; signal: AbortSignal; onText: (t: string) => void }, maxTokens = 1200): Promise<string> {
  const jsonMode = !jsonModeOff.has(model);
  try {
    const r = await chatComplete(ai(), { model, messages: args.messages, maxTokens, jsonMode, signal: args.signal, onText: args.onText });
    return r.text;
  } catch (err) {
    if (jsonMode && err instanceof OpenAI.APIError && err.status === 400) {
      jsonModeOff.add(model);
      return complete(model, args, maxTokens);
    }
    throw err;
  }
}

const schedule = <T>(priority: number, fn: () => Promise<T>) => scheduler.run({ cost: env.aiTranslateCost, priority }, fn);

const glossary = singleton(
  "glossary",
  () =>
    new GlossaryService({
      complete: (args) => complete(env.aiModelTranslate, args, 1500),
      schedule,
      load: async (lessonId, lang) => db.term.findMany({ where: { lessonId, lang }, select: { en: true, tr: true, gloss: true } }),
      save: async (lessonId, lang, entries) => {
        await db.term.createMany({ data: entries.map((e) => ({ lessonId, lang, en: e.en.toLowerCase(), tr: e.tr, gloss: e.gloss })), skipDuplicates: true });
      },
      publish: (lessonId, lang, entries) => bus.publish(lessonId, "glossary", { lang, terms: entries }, { lang }),
      onError: (err) => log("glossary", (err as Error).message),
    }),
);

async function translatorFor(lessonId: string): Promise<LessonTranslator | null> {
  const existing = translators.get(lessonId);
  if (existing) return existing;
  const lesson = await getLesson(lessonId);
  if (!lesson) return null;
  const t = new LessonTranslator({
    model: env.aiModelTranslate,
    lesson: { subject: lesson.subject, title: lesson.title, keyTerms: lesson.keyTerms },
    complete: (args) => complete(env.aiModelTranslate, args),
    schedule,
    activeLangs: () => bus.activeLangs(lessonId),
    publish: (type, data, audience) => bus.publish(lessonId, type, data, audience),
    saveTranslation: async (segmentId, lang, tr, latencyMs) => {
      await db.translation.upsert({
        where: { segmentId_lang: { segmentId, lang } },
        create: { segmentId, lang, text: tr.text, terms: tr.terms, model: env.aiModelTranslate, latencyMs },
        update: { text: tr.text, terms: tr.terms, model: env.aiModelTranslate, latencyMs },
      });
    },
    saveFix: async (segmentId, text) => {
      await db.segment.update({ where: { id: segmentId }, data: { fixedText: text } });
    },
    cache,
    stallMs: env.aiTimeoutMs,
    concurrency: env.lessonConcurrency,
    onLatency: (_lang, ms) => {
      const list = latencies.get(lessonId) ?? [];
      list.push(ms);
      if (list.length > 50) list.shift();
      latencies.set(lessonId, list);
    },
    onError: (err) => log(lessonId, (err as Error).message),
  });
  translators.set(lessonId, t);
  return t;
}

// A finished sentence: translate it for whoever is in the room.
export async function translateSegment(lessonId: string, seg: { id: string; seq: number; text: string }): Promise<void> {
  const langs = bus.activeLangs(lessonId);
  if (!langs.length) return;
  if (!aiEnabled()) {
    for (const lang of langs) bus.publish(lessonId, "translation-failed", { seq: seg.seq, lang, reason: "disabled" }, { lang });
    return;
  }
  (await translatorFor(lessonId))?.enqueue(seg);
}

// A student arrived reading `lang`. Build the glossary for that language if
// needed, and if they're the only one reading it, translate the last few
// lines so they're not starting from nothing.
export async function languageJoined(lessonId: string, lang: string): Promise<void> {
  if (!aiEnabled()) return;
  const lesson = await getLesson(lessonId);
  if (!lesson || lesson.status !== "LIVE") return;
  void glossary.ensure(lesson, lang);
  if (lang !== "en" && (bus.presence(lessonId).langs[lang] ?? 0) <= 1) {
    const t = await translatorFor(lessonId);
    void t?.backfill(lang).catch((err) => log("backfill", (err as Error).message));
  }
}

export async function lessonGlossary(lessonId: string, lang: string): Promise<GlossaryEntry[]> {
  return db.term.findMany({ where: { lessonId, lang }, select: { en: true, tr: true, gloss: true } });
}

// Load the model before the first sentence: a cold model on Featherless
// can take 10+ seconds to answer its first request.
export function warmUp(): void {
  if (!aiEnabled()) return;
  void scheduler
    .run({ cost: env.aiTranslateCost, priority: 2 }, () =>
      chatComplete(ai(), { model: env.aiModelTranslate, messages: [{ role: "user", content: "Reply with OK." }], maxTokens: 3, jsonMode: false }),
    )
    .catch((err) => log("warm-up", (err as Error).message));
}

export function translationStats(lessonId: string): { p50: number | null; count: number } {
  const list = [...(latencies.get(lessonId) ?? [])].sort((a, b) => a - b);
  return { p50: list.length ? list[Math.floor((list.length - 1) / 2)] : null, count: list.length };
}

export function forgetLessonPipeline(lessonId: string): void {
  translators.delete(lessonId);
  latencies.delete(lessonId);
}
