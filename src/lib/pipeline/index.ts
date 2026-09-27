import OpenAI from "openai";
import { chatComplete, createAiClient } from "@/lib/ai/client";
import { parseModelJson } from "@/lib/ai/json";
import { buildQuestionMessages, type ChatMessage } from "@/lib/ai/prompts";
import { QuestionTranslationSchema, type LangTranslation, type Recap } from "@/lib/ai/schemas";
import { db } from "@/lib/db";
import { bus } from "@/lib/realtime/bus";
import { env } from "@/lib/server/env";
import { getLesson } from "@/lib/server/lessons";
import { singleton } from "@/lib/server/singleton";
import { GlossaryService, type GlossaryEntry } from "./glossary";
import { Lru } from "./lru";
import { translateRecap, writeRecap, type RecapDeps } from "./recap";
import { pickModelFor } from "./routing";
import { AiScheduler, PreemptedError } from "./scheduler";
import { LessonTranslator, type CallRecord } from "./translator";

// Connects the translation pipeline to the real world: the Featherless
// client, the database, and the live event bus. Everything is one instance
// per server process.

const scheduler = singleton("aiScheduler", () => new AiScheduler(env.aiConcurrencyUnits, env.aiMaxInflight));
const cache = singleton("translationCache", () => new Lru<string, LangTranslation>(2000));
const translators = singleton("translators", () => new Map<string, LessonTranslator>());
const latencies = singleton("latencies", () => new Map<string, number[]>());
const jsonModeOff = singleton("jsonModeOff", () => new Set<string>());
const backfilledAt = singleton("backfilledAt", () => new Map<string, number>());
const calls = singleton("aiCalls", () => [] as (CallRecord & { lessonId: string })[]);

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

// Live captions (priority 0) are never preempted; everything else is
// background work that yields to them. Long waits are logged, so a caption
// stuck behind something is visible in the server log.
const schedule = <T>(priority: number, cost: number, fn: (signal: AbortSignal) => Promise<T>) => {
  const queuedAt = Date.now();
  return scheduler.run({ cost, priority, preemptible: priority > 0 }, (signal) => {
    const waited = Date.now() - queuedAt;
    if (priority === 0 && waited > 2000) log(`caption waited ${waited}ms for an AI slot`);
    return fn(signal);
  });
};

const pickModel = (langs: string[]) =>
  pickModelFor(langs, {
    fast: { model: env.aiModelTranslate, cost: env.aiTranslateCost },
    quality: { model: env.aiModelQuality, cost: env.aiQualityCost },
  });

const glossary = singleton(
  "glossary",
  () =>
    new GlossaryService({
      // Glossaries run once per language and aren't time-critical, so they
      // always use the stronger model (it completed 12/12 in the benchmark).
      complete: (args) => complete(env.aiModelQuality, args, 1500),
      schedule: (priority, fn) => schedule(priority, env.aiQualityCost, fn),
      isPreempted: (err) => err instanceof PreemptedError,
      // Small chunks, so a live caption never waits long behind a glossary call.
      chunkSize: 3,
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
    pickModel,
    lesson: { subject: lesson.subject, title: lesson.title, keyTerms: lesson.keyTerms },
    complete: (model, args) => complete(model, args),
    schedule,
    activeLangs: () => bus.activeLangs(lessonId),
    publish: (type, data, audience) => bus.publish(lessonId, type, data, audience),
    saveTranslation: async (segmentId, lang, tr, latencyMs, model) => {
      await db.translation.upsert({
        where: { segmentId_lang: { segmentId, lang } },
        create: { segmentId, lang, text: tr.text, terms: tr.terms, model, latencyMs },
        update: { text: tr.text, terms: tr.terms, model, latencyMs },
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
    onCall: (call) => {
      calls.push({ ...call, lessonId });
      if (calls.length > 300) calls.shift();
      if (call.outcome === "error" || call.totalMs > 8000) log(lessonId, `slow/failed call ${JSON.stringify(call)}`);
    },
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
  // Only once per language every 10 minutes, so a phone that reconnects
  // after a Wi-Fi blip doesn't trigger it again.
  const key = `${lessonId}|${lang}`;
  const recently = Date.now() - (backfilledAt.get(key) ?? 0) < 10 * 60_000;
  if (lang !== "en" && !recently && (bus.presence(lessonId).langs[lang] ?? 0) <= 1) {
    backfilledAt.set(key, Date.now());
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
  const models = new Map([
    [env.aiModelTranslate, env.aiTranslateCost],
    [env.aiModelQuality, env.aiQualityCost],
  ]);
  for (const [model, cost] of models) {
    void schedule(2, cost, (signal) => {
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
      return chatComplete(ai(), { model, messages: [{ role: "user", content: "Reply with OK." }], maxTokens: 3, jsonMode: false, signal: timeout });
    }).catch((err) => {
      if (!(err instanceof PreemptedError)) log("warm-up", model, (err as Error).message);
    });
  }
}

export function translationStats(lessonId: string): { p50: number | null; count: number } {
  const list = [...(latencies.get(lessonId) ?? [])].sort((a, b) => a - b);
  return { p50: list.length ? list[Math.floor((list.length - 1) / 2)] : null, count: list.length };
}

export function forgetLessonPipeline(lessonId: string): void {
  translators.delete(lessonId);
  latencies.delete(lessonId);
}

// A student's question, into English for the teacher. Runs with live-caption
// priority (a question is time-sensitive) and a 12-second limit. Returns null
// if it can't be translated; the teacher then sees the original.
export async function translateQuestion(text: string, lang: string, subject: string | null): Promise<string | null> {
  if (!aiEnabled()) return null;
  const { model, cost } = pickModel([lang]);
  try {
    const reply = await schedule(0, cost, (signal) =>
      complete(model, { messages: buildQuestionMessages({ text, lang, subject: subject ?? undefined }), signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]), onText: () => {} }, 400),
    );
    const parsed = parseModelJson(reply, QuestionTranslationSchema);
    return parsed.ok ? parsed.data.en : null;
  } catch (err) {
    log("question", (err as Error).message);
    return null;
  }
}

// What the teacher-only stats endpoint reports: recent AI calls for this
// lesson and the state of the shared scheduler.
export function pipelineStats(lessonId: string) {
  const mine = calls.filter((c) => c.lessonId === lessonId).slice(-30);
  return {
    translation: translationStats(lessonId),
    scheduler: { inUse: scheduler.inUse, queued: scheduler.queued, running: scheduler.runningPriorities },
    calls: mine.map((c) => ({ ...c, lessonId: undefined })),
  };
}

// ---------------------------------------------------------------------------
// Recaps

const recapJobs = singleton("recapJobs", () => new Map<string, Promise<void>>());

const recapDeps = (): RecapDeps => ({
  complete: (model, args, maxTokens) => complete(model, args, maxTokens),
  schedule,
  recapModel: { model: env.aiModelRecap, cost: env.aiRecapCost },
  modelForLang: (lang) => pickModel([lang]),
  isPreempted: (err) => err instanceof PreemptedError,
});

// Writes the English recap for an ended lesson, then translates it into every
// language a student used during the lesson. Safe to call twice.
export function generateLessonRecap(lessonId: string): Promise<void> {
  const running = recapJobs.get(lessonId);
  if (running) return running;
  const job = (async () => {
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      select: { subject: true, title: true, keyTerms: true, recap: { select: { id: true } }, participants: { select: { lang: true } }, segments: { orderBy: { seq: "asc" }, select: { text: true, fixedText: true } } },
    });
    if (!lesson || lesson.recap) return;
    if (!lesson.segments.length || !aiEnabled()) {
      await db.lesson.update({ where: { id: lessonId }, data: { recapStatus: lesson.segments.length ? "FAILED" : "NONE" } });
      bus.publish(lessonId, "recap", { status: lesson.segments.length ? "FAILED" : "NONE" });
      return;
    }
    await db.lesson.update({ where: { id: lessonId }, data: { recapStatus: "GENERATING" } });
    bus.publish(lessonId, "recap", { status: "GENERATING" });
    let content: Recap | null = null;
    try {
      content = await writeRecap(recapDeps(), {
        subject: lesson.subject ?? undefined,
        title: lesson.title ?? undefined,
        keyTerms: lesson.keyTerms,
        transcript: lesson.segments.map((s) => s.fixedText ?? s.text),
      });
    } catch (err) {
      log("recap", (err as Error).message);
    }
    if (!content) {
      await db.lesson.update({ where: { id: lessonId }, data: { recapStatus: "FAILED" } });
      bus.publish(lessonId, "recap", { status: "FAILED" });
      return;
    }
    const recap = await db.recap.create({ data: { lessonId, content, model: env.aiModelRecap } });
    await db.lesson.update({ where: { id: lessonId }, data: { recapStatus: "READY" } });
    bus.publish(lessonId, "recap", { status: "READY", recapId: recap.id });
    const langs = [...new Set(lesson.participants.map((p) => p.lang))].filter((l) => l !== "en");
    for (const lang of langs) await ensureRecapTranslation(recap.id, lang);
  })()
    .catch((err) => log("recap", (err as Error).message))
    .finally(() => recapJobs.delete(lessonId));
  recapJobs.set(lessonId, job);
  return job;
}

const recapTranslationJobs = singleton("recapTranslationJobs", () => new Map<string, Promise<boolean>>());

// Translates a recap into one language if it isn't already. Used after a
// lesson (for the languages in the room) and on demand, when someone opens a
// "What you missed" link in a new language.
export function ensureRecapTranslation(recapId: string, lang: string): Promise<boolean> {
  const key = `${recapId}|${lang}`;
  const running = recapTranslationJobs.get(key);
  if (running) return running;
  const job = (async () => {
    const existing = await db.recapTranslation.findUnique({ where: { recapId_lang: { recapId, lang } }, select: { id: true } });
    if (existing) return true;
    const recap = await db.recap.findUnique({ where: { id: recapId }, select: { content: true } });
    if (!recap || !aiEnabled()) return false;
    const tr = await translateRecap(recapDeps(), recap.content as Recap, lang).catch((err) => {
      log("recap translation", lang, (err as Error).message);
      return null;
    });
    if (!tr) return false;
    await db.recapTranslation.upsert({ where: { recapId_lang: { recapId, lang } }, create: { recapId, lang, content: tr }, update: { content: tr } });
    return true;
  })().finally(() => recapTranslationJobs.delete(key));
  recapTranslationJobs.set(key, job);
  return job;
}

export function recapTranslationPending(recapId: string, lang: string): boolean {
  return recapTranslationJobs.has(`${recapId}|${lang}`);
}
