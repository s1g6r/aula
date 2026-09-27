import { scanTranslationStream } from "@/lib/ai/json";
import { buildTranslationMessages, type ChatMessage } from "@/lib/ai/prompts";
import { LangTranslationSchema, type LangTranslation } from "@/lib/ai/schemas";
import type { LanguageCode } from "@/lib/languages";
import { findKeyTerms } from "@/lib/terms";
import { acceptFix } from "./fix";
import { translationCacheKey, type Lru } from "./lru";
import type { ModelChoice } from "./routing";

// Translates one lesson's sentences as they arrive.
//
//   enqueue(sentence) -> pending queue -> one AI call at a time per lesson
//
// While a call is running, new sentences wait. When it finishes, everything
// waiting goes out together in one call ("merging"), so a fast talker never
// builds a long line of separate requests. Each call streams back JSON; the
// moment one language's part is complete we validate it and send it to the
// students reading that language.
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
  // At most this many sentences in one merged call.
  maxBatch?: number;
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

export class LessonTranslator {
  private pending: PendingSegment[] = [];
  private inFlight = 0;
  private history: PendingSegment[] = [];
  private readonly d: Required<Omit<TranslatorDeps, "onLatency" | "onError" | "onCall">> & Pick<TranslatorDeps, "onLatency" | "onError" | "onCall">;

  constructor(deps: TranslatorDeps) {
    this.d = { now: Date.now, stallMs: 8000, maxMs: 15_000, maxLagMs: 20_000, maxBatch: 4, concurrency: 1, ...deps };
  }

  enqueue(seg: Omit<PendingSegment, "at"> & { at?: number }): void {
    const s = { ...seg, at: seg.at ?? this.d.now() };
    this.pending.push(s);
    this.pending.sort((a, b) => a.seq - b.seq);
    this.history.push(s);
    if (this.history.length > 12) this.history.shift();
    this.pump();
  }

  get queueLength(): number {
    return this.pending.length;
  }

  // A student switched to (or joined with) a language nobody else reads:
  // translate the last few lines for them so they have some context.
  backfill(lang: string, count = 3): Promise<void> {
    const recent = this.history.slice(-count);
    if (!recent.length) return Promise.resolve();
    return this.runBatch(recent, [lang], 1);
  }

  private pump(): void {
    while (this.inFlight < this.d.concurrency && this.pending.length) {
      const now = this.d.now();
      // Freshness over completeness: skip lines we're too far behind on.
      while (this.pending.length > 1 && now - this.pending[0].at > this.d.maxLagMs) {
        const skipped = this.pending.shift()!;
        for (const lang of this.d.activeLangs()) this.d.publish("translation-failed", { seq: skipped.seq, lang, reason: "behind" }, { lang });
      }
      const batch = this.pending.splice(0, this.d.maxBatch);
      const langs = this.d.activeLangs();
      if (!langs.length) continue; // nobody needs a translation right now
      this.inFlight++;
      void this.runBatch(batch, langs, 0).finally(() => {
        this.inFlight--;
        this.pump();
      });
    }
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

  private async runBatch(batch: PendingSegment[], langs: string[], priority: number): Promise<void> {
    const { model, cost } = this.d.pickModel(langs);
    // 1. Cache hits go out immediately.
    const needed = new Map<number, Set<string>>();
    for (const seg of batch) {
      const want = new Set<string>();
      for (const lang of langs) {
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
      segments: segs.map((s) => ({ seq: s.seq, text: s.text, terms: findKeyTerms(s.text, this.d.lesson.keyTerms) })),
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
            const r = LangTranslationSchema.safeParse(JSON.parse(raw));
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
      try {
        await this.d.schedule(priority, cost, async (schedulerSignal) => {
          schedulerSignal.addEventListener("abort", () => controller.abort(schedulerSignal.reason));
          // Timers start when the call starts, not while it waits its turn.
          if (attempt === 0) startedAt = this.d.now();
          hardCap = setTimeout(() => controller.abort(new Error("too slow")), this.d.maxMs);
          armStall();
          await this.d.complete(model, {
            messages,
            signal: controller.signal,
            onText: (t) => {
              armStall();
              firstTextAt ??= this.d.now();
              onText(t);
            },
          });
        });
        break;
      } catch (err) {
        const status = (err as { status?: number }).status;
        // Retry once on "too many requests", but only if nothing reached
        // students yet (a retry would otherwise duplicate lines).
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
      }
    }

    let failed = 0;
    // Anything not delivered falls back to English on the phones.
    for (const seg of segs) {
      failed += [...(needed.get(seg.seq) ?? [])].filter((lang) => !delivered.has(`${seg.seq}|${lang}`)).length;
      for (const lang of needed.get(seg.seq) ?? []) {
        if (!delivered.has(`${seg.seq}|${lang}`)) this.d.publish("translation-failed", { seq: seg.seq, lang, reason: "failed" }, { lang });
      }
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
      failed,
      outcome: lastError ? "error" : "ok",
      error: lastError,
    });
  }
}
