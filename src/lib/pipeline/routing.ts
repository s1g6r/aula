import { getLanguage } from "@/lib/languages";

export type ModelChoice = { model: string; cost: number };

// Model routing, decided by our benchmark (docs/MODEL_BENCHMARK.md): the fast
// model for live captions, the stronger one whenever a call includes a
// lower-resource ("beta") language like Somali or Haitian Creole, where the
// fast model's output wasn't usable, or Hindi, which the stronger model
// writes in a third of the tokens.
export function pickModelFor(langs: string[], models: { fast: ModelChoice; quality: ModelChoice }): ModelChoice {
  return langs.some((l) => getLanguage(l)?.beta || getLanguage(l)?.strongModel) ? models.quality : models.fast;
}
