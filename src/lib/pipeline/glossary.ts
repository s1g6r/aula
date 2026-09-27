import { parseModelJson } from "@/lib/ai/json";
import { buildGlossaryMessages, type ChatMessage } from "@/lib/ai/prompts";
import { GlossaryResponseSchema } from "@/lib/ai/schemas";
import type { LanguageCode } from "@/lib/languages";

// The lesson glossary: for each key term, its translation and a one-line
// definition in the student's language. Built once per language per lesson,
// the first time a student reading that language shows up, and stored so the
// same word always gets the same definition. It runs at lower priority than
// live captions and recaps, so it never slows them down.

export type GlossaryEntry = { en: string; tr: string; gloss: string };

export type GlossaryDeps = {
  // `lang` picks the model: the fast one, or the stronger one for "beta" languages.
  complete: (args: { messages: ChatMessage[]; signal: AbortSignal; onText: (t: string) => void }, lang: string) => Promise<string>;
  // Runs the call as a preemptible background job (cost is bound by the caller).
  schedule: <T>(priority: number, fn: (signal: AbortSignal) => Promise<T>, lang: string) => Promise<T>;
  isPreempted?: (err: unknown) => boolean;
  // Priority for this lesson's glossary work right now. Once a lesson has
  // ended, its recap matters more than the rest of its glossary. null means
  // the lesson was deleted: stop.
  priority?: (lessonId: string) => Promise<number | null>;
  load: (lessonId: string, lang: string) => Promise<GlossaryEntry[]>;
  save: (lessonId: string, lang: string, entries: GlossaryEntry[]) => Promise<void>;
  publish: (lessonId: string, lang: string, entries: GlossaryEntry[]) => void;
  onError?: (err: unknown) => void;
  chunkSize?: number;
  timeoutMs?: number;
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export class GlossaryService {
  private inProgress = new Map<string, Promise<void>>();

  constructor(private readonly d: GlossaryDeps) {}

  ensure(lesson: { id: string; subject: string | null; title: string | null; keyTerms: string[] }, lang: string): Promise<void> {
    const key = `${lesson.id}|${lang}`;
    if (!lesson.keyTerms.length) return Promise.resolve();
    const running = this.inProgress.get(key);
    if (running) return running;
    const job = this.build(lesson, lang).finally(() => this.inProgress.delete(key));
    this.inProgress.set(key, job);
    return job;
  }

  private async build(lesson: { id: string; subject: string | null; title: string | null; keyTerms: string[] }, lang: string) {
    const have = new Set((await this.d.load(lesson.id, lang)).map((e) => norm(e.en)));
    // Two passes: the model sometimes leaves a term out of its reply, so we
    // ask once more for whatever is still missing.
    for (let pass = 0; pass < 2; pass++) {
      const missing = lesson.keyTerms.filter((t) => !have.has(norm(t)));
      if (!missing.length) return;
      await this.pass(lesson, lang, missing, have);
    }
  }

  private async pass(lesson: { id: string; subject: string | null; title: string | null; keyTerms: string[] }, lang: string, missing: string[], have: Set<string>) {
    const size = this.d.chunkSize ?? 10;
    let preemptions = 0;
    let retried = false;
    for (let i = 0; i < missing.length; i += size) {
      const chunk = missing.slice(i, i + size);
      try {
        const priority = this.d.priority ? await this.d.priority(lesson.id) : 2;
        if (priority === null) return;
        const text = await this.d.schedule(priority, (signal) => {
          const controller = new AbortController();
          signal.addEventListener("abort", () => controller.abort(signal.reason));
          const timer = setTimeout(() => controller.abort(new Error("glossary timeout")), this.d.timeoutMs ?? 20_000);
          return this.d
            .complete(
              {
                messages: buildGlossaryMessages({ subject: lesson.subject ?? undefined, title: lesson.title ?? undefined, terms: chunk, lang: lang as LanguageCode | "en" }),
                signal: controller.signal,
                onText: () => {},
              },
              lang,
            )
            .finally(() => clearTimeout(timer));
        }, lang);
        const parsed = parseModelJson(text, GlossaryResponseSchema);
        if (!parsed.ok) {
          // One more try for a malformed reply, then move on.
          if (!retried) {
            retried = true;
            i -= size;
            continue;
          }
          throw new Error(`glossary ${lang}: ${parsed.error}`);
        }
        retried = false;
        // Keep only terms we asked for, spelled the way the teacher wrote them.
        const wanted = new Map(chunk.map((t) => [norm(t), t]));
        const entries: GlossaryEntry[] = [];
        for (const e of parsed.data.terms) {
          const original = wanted.get(norm(e.en));
          if (original && !entries.some((x) => x.en === original)) entries.push({ en: original, tr: e.tr, gloss: e.gloss });
        }
        if (entries.length) {
          for (const e of entries) have.add(norm(e.en));
          await this.d.save(lesson.id, lang, entries);
          this.d.publish(lesson.id, lang, entries);
        }
      } catch (err) {
        // Cancelled so a live caption could go first: try this chunk again
        // the next time the AI is free. During a busy lesson that can take
        // many tries; each one waits for an idle moment, so it costs captions
        // nothing. (The cap only guards against a bug looping forever.)
        if (this.d.isPreempted?.(err) && preemptions++ < 1000) {
          i -= size;
          continue;
        }
        this.d.onError?.(err);
      }
    }
  }
}
