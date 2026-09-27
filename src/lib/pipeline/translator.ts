import { scanTranslationStream } from "@/lib/ai/json";
import { buildTranslationMessages, type ChatMessage } from "@/lib/ai/prompts";
import { LiveLangSchema, type LangTranslation } from "@/lib/ai/schemas";
import type { LanguageCode } from "@/lib/languages";
import { acceptFix } from "./fix";
import { translationCacheKey, type Lru } from "./lru";
import type { ModelChoice } from "./routing";

// Translates one lesson's sentences as they arrive.
//
//   enqueue(sentence) -> one queue per model -> one AI call at a time per lesson
//
// While a call is running, new sentences wait. When it finishes, what's
// waiting goes out together in one call ("merging"), so a fast talker never
// builds a long line of separate requests. Each call streams back JSON; the
// moment one language's part is complete we validate it and send it to the
// students reading that language.
//
// Languages that need the stronger, slower model (Somali, Haitian Creole,
// Dari) have their own queue. The queues take turns, oldest line first, so a
// student reading Somali doesn't make Spanish wait for the slow model, and
// the slow queue merges its lines into fewer calls.
//
// Nothing here ever leaves a student with a blank line: if the AI is slow,
// fails, or returns something invalid, that language gets a
// "translation-failed" event and phones keep showing the English.

export type PendingSegment = { id: string; seq: number; text: string; at: number };

export type TranslatorDeps = {
  // Which model to use for a call, given the languages it covers. Aula uses
  // a fast model, and a stronger one when a lower-resource ("beta") language
  // is in the call (see MODEL_BENCHMARK.md).
  pickModel: (langs: string[]) => ModelChoice;
  lesson: { subject: string | null; title: string | null; keyTerms: string[] };
  // Streams one completion. Must call onText with the full text so far.
  complete: (model: string, args: { messages: ChatMessage[]; signal: AbortSignal; onText: (textSoFar: string) => void }) => Promise<string>;
  // Wraps the call in the process-wide AI scheduler.
  schedule: <T>(priority: number, cost: number, fn: (signal: AbortSignal) => Promise<T>) => Promise<T>;
  activeLangs: () => string[];
  publish: (type: string, data: unknown, audience: "all" | { lang: string }) => void;
  saveTranslation: (segmentId: string, lang: string, tr: LangTranslation, latencyMs: number, model: string) => Promise<void>;
  saveFix: (segmentId: string, text: string) => Promise<void>;
  cache: Lru<string, LangTranslation>;
  now?: () => number;
  // Give up if no new text arrives for this long.
  stallMs?: number;
  // Hard cap on one call.
  maxMs?: number;
  // Lines older than this when their turn comes are skipped (shown in
  // English) so captions catch up to what the teacher is saying now.
  maxLagMs?: number;
  // At most this many sentences in one merged call...
  maxBatch?: number;
  // ...and at most about this many tokens of reply. Featherless writes about
  // 30 tokens a second for our whole account, so a big merged call keeps
  // every student waiting for its last language.
  maxBatchTokens?: number;
  // Calls in flight per lesson. Featherless processes one account's calls
  // one after another, so 1 plus merging is fastest (see MODEL_BENCHMARK).
  concurrency?: number;
  onLatency?: (lang: string, ms: number) => void;
  onError?: (err: unknown) => void;
  // One record per AI call, for the stats endpoint.
  onCall?: (call: CallRecord) => void;
};

export type CallRecord = {
  at: number;
  priority: number;
  model: string;
  langs: string[];
  seqs: number[];
  waitMs: number; // queued in our scheduler
  firstTextMs: number | null; // from start of call
  totalMs: number;
  delivered: number;
  failed: number;
  outcome: "ok" | "error";
  error?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Why we cut a call short once everything in it has been delivered: models
// sometimes keep going (whitespace, repeats) after the JSON is complete, and
// every second of that is a second the next caption waits.
const FINISHED = new Error("everything delivered");

// Rough size of the reply: translations run about 1.6 tokens per English
// word (more for Arabic or Vietnamese, less for Chinese), plus the JSON around
// each line.
export function estimateTokens(segs: { text: string }[], langCount: number): number {
  const words = segs.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  return Math.round((words * 1.6 + segs.length * 8) * langCount);
}

type Group = { langs: string[]; cost: number };

export class LessonTranslator {
  // Waiting lines, one queue per model.
  private lanes = new Map<string, PendingSegment[]>();
  private inFlight = 0;
  private history: PendingSegment[] = [];
  private readonly d: Required<Omit<TranslatorDeps, "onLatency" | "onError" | "onCall">> & Pick<TranslatorDeps, "onLatency" | "onError" | "onCall">;

  constructor(deps: TranslatorDeps) {
    this.d = { now: Date.now, stallMs: 8000, maxMs: 15_000, maxLagMs: 20_000, maxBatch: 4, maxBatchTokens: 360, concurrency: 1, ...deps };
  }

  enqueue(seg: Omit<PendingSegment, "at"> & { at?: number }): void {
    const s = { ...seg, at: seg.at ?? this.d.now() };
    for (const model of this.groups().keys()) {
      const lane = this.lanes.get(model) ?? [];
      lane.push(s);
      lane.sort((a, b) => a.seq - b.seq);
      this.lanes.set(model, lane);
    }
    this.history.push(s);
    if (this.history.length > 12) this.history.shift();
    this.pump();
  }

  get queueLength(): number {
    return Math.max(0, ...[...this.lanes.values()].map((l) => l.length));
  }

  // The languages in the room, grouped by the model that translates them.
  private groups(): Map<string, Group> {
    const groups = new Map<string, Group>();
    for (const lang of this.d.activeLangs()) {
      const { model, cost } = this.d.pickModel([lang]);
      const g = groups.get(model) ?? { langs: [], cost };
      g.langs.push(lang);
      groups.set(model, g);
    }
    return groups;
  }

  // A student switched to (or joined with) a language nobody else reads:
  // translate the last few lines for them so they have some context.
  backfill(lang: string, count = 3): Promise<void> {
    const recent = this.history.slice(-count);
    if (!recent.length) return Promise.resolve();
    return this.runBatch(recent, [lang], 1);
  }

  private pump(): void {
    while (this.inFlight < this.d.concurrency) {
      const groups = this.groups();
      const now = this.d.now();
      for (const [model, lane] of this.lanes) {
        const group = groups.get(model);
        if (!group) {
          this.lanes.delete(model); // nobody reads these languages any more
          continue;
        }
        // Freshness over completeness: skip lines we're too far behind on.
        while (lane.length > 1 && now - lane[0].at > this.d.maxLagMs) {
          const skipped = lane.shift()!;
          for (const lang of group.langs) this.d.publish("translation-failed", { seq: skipped.seq, lang, reason: "behind" }, { lang });
        }
      }
      // The queue whose oldest line has waited longest; ties go to the faster model.
      const next = [...this.lanes.entries()]
        .filter(([, lane]) => lane.length)
        .sort(([ma, a], [mb, b]) => a[0].at - b[0].at || groups.get(ma)!.cost - groups.get(mb)!.cost)[0];
      if (!next) return;
      const [model, lane] = next;
      const langs = groups.get(model)!.langs;
      const batch = this.takeBatch(lane, langs.length);
      this.inFlight++;
      void this.runBatch(batch, langs, 0).finally(() => {
        this.inFlight--;
        this.pump();
      });
    }
  }

  // The oldest waiting lines, as many as fit in one reasonably quick call.
  private takeBatch(lane: PendingSegment[], langCount: number): PendingSegment[] {
    let n = 1;
    while (n < Math.min(this.d.maxBatch, lane.length) && estimateTokens(lane.slice(0, n + 1), langCount) <= this.d.maxBatchTokens) n++;
    return lane.splice(0, n);
  }

  private deliver(seg: PendingSegment, lang: string, tr: LangTranslation, model: string, fromCache: boolean): void {
    const latency = this.d.now() - seg.at;
    this.d.publish("translation", { seq: seg.seq, lang, text: tr.text, terms: tr.terms }, { lang });
    if (!fromCache) this.d.cache.set(translationCacheKey(seg.text, lang, model), tr);
    this.d.onLatency?.(lang, latency);
    this.d.saveTranslation(seg.id, lang, tr, Math.round(latency), model).catch((err) => this.d.onError?.(err));
  }

  // Keep only terms the teacher listed, and only if the model's `tr` really
  // appears in the translation (otherwise we can't highlight it).
  private cleanTerms(seg: PendingSegment, tr: LangTranslation): LangTranslation {
    const allowed = new Set(this.d.lesson.keyTerms.map(norm));
    const text = tr.text.toLowerCase();
    const seen = new Set<string>();
    const terms = tr.terms.filter((t) => {
      const key = norm(t.en);
      if (!allowed.has(key) || seen.has(key) || !text.includes(t.tr.toLowerCase())) return false;
      seen.add(key);
      return true;
    });
    return { text: tr.text, terms: terms.map(({ en, tr }) => ({ en, tr })) };
  }

  // `done`: on a second try, the line/language pairs that already arrived.
  private async runBatch(batch: PendingSegment[], langs: string[], priority: number, done?: Set<string>): Promise<void> {
    const { model, cost } = this.d.pickModel(langs);
    // 1. Cache hits go out immediately.
    const needed = new Map<number, Set<string>>();
    for (const seg of batch) {
      const want = new Set<string>();
      for (const lang of langs) {
        if (done?.has(`${seg.seq}|${lang}`)) continue;
        const hit = this.d.cache.get(translationCacheKey(seg.text, lang, model));
        if (hit) this.deliver(seg, lang, hit, model, true);
        else want.add(lang);
      }
      if (want.size) needed.set(seg.seq, want);
    }
    if (!needed.size) return;

    const segs = batch.filter((s) => needed.has(s.seq));
    const callLangs = langs.filter((l) => segs.some((s) => needed.get(s.seq)!.has(l)));
    const firstIdx = this.history.findIndex((h) => h.seq === segs[0].seq);
    const context = (firstIdx > 0 ? this.history.slice(Math.max(0, firstIdx - 2), firstIdx) : []).map((h) => h.text);
    const messages = buildTranslationMessages({
      subject: this.d.lesson.subject ?? undefined,
      title: this.d.lesson.title ?? undefined,
      keyTerms: this.d.lesson.keyTerms,
      context,
      langs: callLangs as LanguageCode[],
      segments: segs.map((s) => ({ seq: s.seq, text: s.text })),
    });

    const delivered = new Set<string>();
    const bySeq = new Map(segs.map((s, i) => [s.seq, { seg: s, index: i }]));
    let fixes = new Map<number, string>();

    const onText = (textSoFar: string) => {
      const scanned = scanTranslationStream(textSoFar);
      scanned.forEach((part, i) => {
        // Prefer the seq the model wrote; fall back to position.
        const entry = (part.seq !== undefined && bySeq.get(part.seq)) || (segs[i] && bySeq.get(segs[i].seq));
        if (!entry) return;
        const { seg } = entry;
        if (part.fix) fixes.set(seg.seq, part.fix);
        for (const [lang, raw] of Object.entries(part.langs)) {
          const key = `${seg.seq}|${lang}`;
          if (delivered.has(key) || !needed.get(seg.seq)?.has(lang)) continue;
          let parsed: LangTranslation | null = null;
          try {
            const r = LiveLangSchema.safeParse(JSON.parse(raw));
            if (r.success) parsed = r.data;
          } catch {
            parsed = null;
          }
          delivered.add(key); // even if invalid: don't retry mid-stream
          if (parsed) this.deliver(seg, lang, this.cleanTerms(seg, parsed), model, false);
          else this.d.publish("translation-failed", { seq: seg.seq, lang, reason: "invalid" }, { lang });
        }
      });
    };

    const expected = [...needed.values()].reduce((n, langs) => n + langs.size, 0);
    const queuedAt = this.d.now();
    let startedAt = queuedAt;
    let firstTextAt: number | null = null;
    let lastError: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      fixes = new Map();
      const controller = new AbortController();
      let stall: ReturnType<typeof setTimeout> | undefined;
      const armStall = () => {
        clearTimeout(stall);
        stall = setTimeout(() => controller.abort(new Error("stalled")), this.d.stallMs);
      };
      let hardCap: ReturnType<typeof setTimeout> | undefined;
      let wrapUp: ReturnType<typeof setTimeout> | undefined;
      try {
        await this.d.schedule(priority, cost, async (schedulerSignal) => {
          schedulerSignal.addEventListener("abort", () => controller.abort(schedulerSignal.reason));
          // Timers start when the call starts, not while it waits its turn.
          // A bigger reply gets more time (about 60ms a token, up to 45s).
          if (attempt === 0) startedAt = this.d.now();
          const capMs = Math.min(45_000, Math.max(this.d.maxMs, estimateTokens(segs, callLangs.length) * 60 + 4000));
          hardCap = setTimeout(() => controller.abort(new Error("too slow")), capMs);
          armStall();
          await this.d.complete(model, {
            messages,
            signal: controller.signal,
            onText: (t) => {
              armStall();
              firstTextAt ??= this.d.now();
              onText(t);
              // All delivered: allow a moment for a trailing "fix", then stop.
              if (delivered.size >= expected && !wrapUp) wrapUp = setTimeout(() => controller.abort(FINISHED), 1500);
            },
          });
          // A stream cut off by our own timers can end quietly instead of
          // throwing; treat that like the error it is.
          if (controller.signal.aborted && controller.signal.reason !== FINISHED) throw controller.signal.reason;
        });
        break;
      } catch (err) {
        if (controller.signal.reason === FINISHED) break;
        const status = (err as { status?: number }).status;
        // "Too many requests" before anything arrived: wait a moment and retry.
        if (status === 429 && attempt === 0 && delivered.size === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        lastError = (err as Error).message;
        this.d.onError?.(err);
        break;
      } finally {
        clearTimeout(stall);
        clearTimeout(hardCap);
        clearTimeout(wrapUp);
      }
    }

    const missing = segs.flatMap((seg) => [...needed.get(seg.seq)!].filter((lang) => !delivered.has(`${seg.seq}|${lang}`)).map((lang) => ({ seg, lang })));
    // One more try for whatever didn't arrive (the provider stalled, or the
    // reply trailed off before every language), while the lines are fresh.
    const retry = missing.length > 0 && !done && this.d.now() - segs[0].at < this.d.maxLagMs / 2;
    for (const seg of segs) {
      const fix = fixes.get(seg.seq);
      if (fix && acceptFix(seg.text, fix, this.d.lesson.keyTerms)) {
        this.d.publish("fix", { seq: seg.seq, text: fix }, "all");
        this.d.saveFix(seg.id, fix).catch((err) => this.d.onError?.(err));
      }
    }
    const end = this.d.now();
    this.d.onCall?.({
      at: queuedAt,
      priority,
      model,
      langs: callLangs,
      seqs: segs.map((x) => x.seq),
      waitMs: startedAt - queuedAt,
      firstTextMs: firstTextAt === null ? null : firstTextAt - startedAt,
      totalMs: end - startedAt,
      delivered: delivered.size,
      failed: missing.length,
      outcome: lastError || missing.length ? "error" : "ok",
      error: lastError ?? (missing.length ? "incomplete reply" : undefined),
    });
    if (retry) {
      const sent = new Set([...(done ?? []), ...delivered]);
      for (const seg of batch) for (const lang of langs) if (!needed.get(seg.seq)?.has(lang)) sent.add(`${seg.seq}|${lang}`);
      return this.runBatch(
        segs.filter((s) => missing.some((m) => m.seg === s)),
        callLangs.filter((l) => missing.some((m) => m.lang === l)),
        priority,
        sent,
      );
    }
    // Anything not delivered falls back to English on the phones.
    for (const { seg, lang } of missing) this.d.publish("translation-failed", { seq: seg.seq, lang, reason: "failed" }, { lang });
  }
}
