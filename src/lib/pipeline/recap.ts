import { parseModelJson } from "@/lib/ai/json";
import { buildRecapMessages, buildRecapTranslationMessages, type ChatMessage } from "@/lib/ai/prompts";
import { RecapSchema, RecapTranslationSchema, type Recap, type RecapTranslation } from "@/lib/ai/schemas";
import type { ModelChoice } from "./routing";

// Writes the end-of-lesson recap and translates it. These run in the
// background at low priority: live captions in other classrooms always go
// first (a recap call that gets pre-empted simply tries again).

export type RecapDeps = {
  complete: (model: string, args: { messages: ChatMessage[]; signal: AbortSignal; onText: (t: string) => void }, maxTokens: number) => Promise<string>;
  schedule: <T>(priority: number, cost: number, fn: (signal: AbortSignal) => Promise<T>) => Promise<T>;
  recapModel: ModelChoice;
  modelForLang: (lang: string) => ModelChoice;
  isPreempted: (err: unknown) => boolean;
  timeoutMs?: number;
};

// Keep the prompt comfortably inside the model's context: very long lessons
// keep their first and last parts (most summaries need the arc).
export function trimTranscript(lines: string[], maxChars = 24_000): string[] {
  const total = lines.reduce((n, l) => n + l.length + 4, 0);
  if (total <= maxChars) return lines;
  const out: string[] = [];
  let used = 0;
  let i = 0;
  let j = lines.length - 1;
  const head: string[] = [];
  const tail: string[] = [];
  while (i <= j && used < maxChars) {
    head.push(lines[i]);
    used += lines[i++].length + 4;
    if (i <= j && used < maxChars) {
      tail.unshift(lines[j]);
      used += lines[j--].length + 4;
    }
  }
  out.push(...head, "[...]", ...tail);
  return out;
}

async function ask<T>(deps: RecapDeps, choice: ModelChoice, messages: ChatMessage[], maxTokens: number, schema: import("zod").ZodType<T>): Promise<T | null> {
  let invalid = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const text = await deps.schedule(2, choice.cost, (signal) =>
        deps.complete(choice.model, { messages, signal: AbortSignal.any([signal, AbortSignal.timeout(deps.timeoutMs ?? 90_000)]), onText: () => {} }, maxTokens),
      );
      const parsed = parseModelJson(text, schema);
      if (parsed.ok) return parsed.data;
      if (++invalid >= 2) return null; // one retry for a malformed reply
    } catch (err) {
      if (deps.isPreempted(err)) continue; // a live caption went first; try again
      throw err;
    }
  }
  return null;
}

export function writeRecap(deps: RecapDeps, input: { subject?: string; title?: string; keyTerms: string[]; transcript: string[] }): Promise<Recap | null> {
  return ask(deps, deps.recapModel, buildRecapMessages({ ...input, transcript: trimTranscript(input.transcript) }), 1500, RecapSchema);
}

export function translateRecap(deps: RecapDeps, recap: Recap, lang: string): Promise<RecapTranslation | null> {
  return ask(deps, deps.modelForLang(lang), buildRecapTranslationMessages({ recap, lang }), 2000, RecapTranslationSchema);
}
