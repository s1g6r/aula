import { parseModelJson } from "@/lib/ai/json";
import { buildGlossaryMessages, type ChatMessage } from "@/lib/ai/prompts";
import { GlossaryResponseSchema } from "@/lib/ai/schemas";
import type { LanguageCode } from "@/lib/languages";

// The lesson glossary: for each key term, its translation and a one-line
// definition in the student's language. Built once per language per lesson,
// the first time a student reading that language shows up, and stored so the
// same word always gets the same definition. It runs at lower priority than
// live captions, so it never slows them down.

export type GlossaryEntry = { en: string; tr: string; gloss: string };

export type GlossaryDeps = {
  complete: (args: { messages: ChatMessage[]; signal: AbortSignal; onText: (t: string) => void }) => Promise<string>;
  // Runs the call as a preemptible background job (cost is bound by the caller).
  schedule: <T>(priority: number, fn: (signal: AbortSignal) => Promise<T>) => Promise<T>;
  isPreempted?: (err: unknown) => boolean;
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
    const missing = lesson.keyTerms.filter((t) => !have.has(norm(t)));
    const size = this.d.chunkSize ?? 10;
    let preemptions = 0;
    for (let i = 0; i < missing.length; i += size) {
      const chunk = missing.slice(i, i + size);
      try {
        const text = await this.d.schedule(1, (signal) => {
          const controller = new AbortController();
          signal.addEventListener("abort", () => controller.abort(signal.reason));
          const timer = setTimeout(() => controller.abort(new Error("glossary timeout")), this.d.timeoutMs ?? 20_000);
          return this.d
            .complete({
              messages: buildGlossaryMessages({ subject: lesson.subject ?? undefined, title: lesson.title ?? undefined, terms: chunk, lang: lang as LanguageCode | "en" }),
              signal: controller.signal,
              onText: () => {},
            })
            .finally(() => clearTimeout(timer));
        });
        const parsed = parseModelJson(text, GlossaryResponseSchema);
        if (!parsed.ok) throw new Error(`glossary ${lang}: ${parsed.error}`);
        // Keep only terms we asked for, spelled the way the teacher wrote them.
        const wanted = new Map(chunk.map((t) => [norm(t), t]));
        const entries: GlossaryEntry[] = [];
        for (const e of parsed.data.terms) {
          const original = wanted.get(norm(e.en));
          if (original && !entries.some((x) => x.en === original)) entries.push({ en: original, tr: e.tr, gloss: e.gloss });
        }
        if (entries.length) {
          await this.d.save(lesson.id, lang, entries);
          this.d.publish(lesson.id, lang, entries);
        }
      } catch (err) {
        // Cancelled so a live caption could go first: try this chunk again
        // (it waits until captions are idle).
        if (this.d.isPreempted?.(err) && preemptions++ < 20) {
          i -= size;
          continue;
        }
        this.d.onError?.(err);
      }
    }
  }
}
