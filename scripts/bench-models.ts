// Phase 0 model benchmark. Runs realistic classroom sentences through the
// exact prompt and schema the live pipeline uses, against several Featherless
// models, and writes docs/MODEL_BENCHMARK.md plus raw results.
//
//   npm run bench
//   npm run bench -- --models "Qwen/Qwen3-30B-A3B-Instruct-2507,google/gemma-4-26B-A4B-it"
//
// Calls run one at a time so latency numbers aren't distorted by our own
// concurrency. Needs AI_API_KEY in .env.local.

import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import { chatComplete, createAiClient, type ChatResult } from "@/lib/ai/client";
import { parseModelJson } from "@/lib/ai/json";
import { buildTranslationMessages } from "@/lib/ai/prompts";
import { TranslationResponseSchema, type SegmentTranslation } from "@/lib/ai/schemas";
import { getLanguage, type LanguageCode } from "@/lib/languages";
import { BACKTRANSLATE_IDS, BENCH_LESSONS, SPOT_CHECK_IDS } from "./bench/sentences";
import { highlightable, percentile, termRecall, termsInSentence } from "./bench/metrics";

const { values: args } = parseArgs({
  options: {
    models: {
      type: "string",
      default: [
        "Qwen/Qwen3-30B-A3B-Instruct-2507",
        "google/gemma-4-26B-A4B-it",
        "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
        "Qwen/Qwen3.5-9B",
      ].join(","),
    },
    langs: { type: "string", default: "es,ar,zh-Hans,vi" },
    spot: { type: "string", default: "ht,so,fa-AF" },
    judge: { type: "string", default: "deepseek-ai/DeepSeek-V3.2" },
    limit: { type: "string" },
    "no-judge": { type: "boolean", default: false },
  },
});

const BASE_URL = process.env.AI_BASE_URL ?? "https://api.featherless.ai/v1";
const API_KEY = process.env.AI_API_KEY ?? "";
const MODELS = args.models.split(",").map((m) => m.trim()).filter(Boolean);
const LANGS = args.langs.split(",") as LanguageCode[];
const SPOT_LANGS = args.spot.split(",") as LanguageCode[];
const CALL_TIMEOUT_MS = 60_000; // generous: first calls can hit a cold model
const MAX_TOKENS = 1500;

if (!API_KEY) {
  console.error("AI_API_KEY is empty. Add your Featherless key to .env.local, then rerun `npm run bench`.");
  process.exit(1);
}

const client = createAiClient({ baseURL: BASE_URL, apiKey: API_KEY, timeoutMs: CALL_TIMEOUT_MS });

type ModelInfo = { id: string; concurrency_cost?: number; context_length?: number; model_class?: string };

async function fetchModelInfo(): Promise<Map<string, ModelInfo>> {
  const res = await fetch(`${BASE_URL}/models`);
  const body = (await res.json()) as { data: ModelInfo[] };
  return new Map(body.data.map((m) => [m.id, m]));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// JSON mode support differs per provider/model; detect it once per model.
const jsonModeByModel = new Map<string, boolean>();

async function call(model: string, messages: ReturnType<typeof buildTranslationMessages>): Promise<ChatResult & { retries429: number }> {
  let retries429 = 0;
  for (let attempt = 0; ; attempt++) {
    const jsonMode = jsonModeByModel.get(model) ?? true;
    try {
      const r = await chatComplete(client, { model, messages, maxTokens: MAX_TOKENS, jsonMode });
      jsonModeByModel.set(model, jsonMode);
      return { ...r, retries429 };
    } catch (err) {
      if (err instanceof OpenAI.APIError && err.status === 400 && jsonMode && /response_format|json/i.test(err.message)) {
        jsonModeByModel.set(model, false);
        continue;
      }
      if (err instanceof OpenAI.APIError && err.status === 429 && attempt < 5) {
        retries429++;
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

type SentenceResult = {
  id: number;
  lesson: string;
  english: string;
  ms: number | null;
  status: "valid" | "partial" | "invalid" | "error";
  error?: string;
  raw?: string;
  seg?: SegmentTranslation;
  completionTokens?: number;
  retries429: number;
  termRecall: number;
  highlight: { ok: number; total: number };
  asrExpected?: string;
  asrRepaired?: boolean;
};

async function translateOne(
  model: string,
  lesson: (typeof BENCH_LESSONS)[number],
  idx: number,
  langs: LanguageCode[],
  glossed: Map<LanguageCode, Set<string>>,
): Promise<SentenceResult> {
  const sentence = lesson.sentences[idx];
  const context = lesson.sentences.slice(Math.max(0, idx - 2), idx).map((s) => s.text);
  const alreadyGlossed = Object.fromEntries(langs.map((l) => [l, [...(glossed.get(l) ?? [])]]));
  const messages = buildTranslationMessages({
    subject: lesson.subject,
    title: lesson.title,
    keyTerms: lesson.keyTerms,
    context,
    langs,
    segments: [{ seq: sentence.id, text: sentence.text }],
    alreadyGlossed,
  });

  const correctedText = sentence.asrError
    ? sentence.text.replace(sentence.asrError.split(" -> ")[0], sentence.asrError.split(" -> ")[1])
    : sentence.text;
  const expectedTerms = termsInSentence(correctedText, lesson.keyTerms);
  const base = { id: sentence.id, lesson: lesson.title, english: sentence.text, retries429: 0, termRecall: NaN, highlight: { ok: 0, total: 0 } };

  let r: Awaited<ReturnType<typeof call>>;
  try {
    r = await call(model, messages);
  } catch (err) {
    return { ...base, ms: null, status: "error", error: (err as Error).message.slice(0, 300) };
  }

  const parsed = parseModelJson(r.text, TranslationResponseSchema);
  if (!parsed.ok) {
    return { ...base, ms: r.ms, status: "invalid", error: parsed.error, raw: r.text.slice(0, 600), completionTokens: r.completionTokens, retries429: r.retries429 };
  }
  const seg = parsed.data.segments.find((s) => s.seq === sentence.id) ?? parsed.data.segments[0];
  const missing = langs.filter((l) => !seg.tr[l]);
  for (const l of langs) {
    for (const t of seg.tr[l]?.terms ?? []) if (t.gloss) (glossed.get(l) ?? glossed.set(l, new Set()).get(l)!).add(t.en);
  }
  const result: SentenceResult = {
    ...base,
    ms: r.ms,
    status: missing.length ? "partial" : "valid",
    seg,
    completionTokens: r.completionTokens,
    retries429: r.retries429,
    termRecall: termRecall(expectedTerms, seg, langs),
    highlight: highlightable(seg, langs),
  };
  if (sentence.asrError) {
    const fixed = sentence.asrError.split(" -> ")[1].toLowerCase();
    result.asrExpected = sentence.asrError;
    result.asrRepaired = (seg.fix ?? "").toLowerCase().replace(/-/g, " ").includes(fixed.replace(/-/g, " "));
  }
  return result;
}

async function backTranslate(judge: string, seg: SegmentTranslation, langs: LanguageCode[]): Promise<Record<string, string>> {
  const texts = Object.fromEntries(langs.filter((l) => seg.tr[l]).map((l) => [l, seg.tr[l].text]));
  const messages = [
    {
      role: "system" as const,
      content:
        'Translate each text into English as literally as possible, keeping its meaning and any errors. Reply with JSON only: {"<language code>": "<English>"}.',
    },
    { role: "user" as const, content: JSON.stringify(texts) },
  ];
  const r = await call(judge, messages);
  try {
    const obj = JSON.parse(r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1)) as Record<string, string>;
    return obj;
  } catch {
    return {};
  }
}

type ModelRun = {
  model: string;
  info?: ModelInfo;
  jsonMode?: boolean;
  coldMs: number | null;
  coldError?: string;
  results: SentenceResult[];
  spot: SentenceResult[];
  back: Record<number, Record<string, string>>;
};

async function runModel(model: string, info: ModelInfo | undefined): Promise<ModelRun> {
  const run: ModelRun = { model, info, coldMs: null, results: [], spot: [], back: {} };
  console.log(`\n=== ${model} (units: ${info?.concurrency_cost ?? "?"})`);

  // Warm-up: Featherless may need to load a model that nobody is using.
  // We report this first call separately instead of mixing it into p50/p95.
  const warm = await translateOne(model, BENCH_LESSONS[0], 0, LANGS, new Map());
  run.coldMs = warm.ms;
  if (warm.status === "error") run.coldError = warm.error;
  console.log(`  cold first call: ${warm.ms ? Math.round(warm.ms) + "ms" : "error " + warm.error}`);

  const limit = args.limit ? Number(args.limit) : Infinity;
  let count = 0;
  for (const lesson of BENCH_LESSONS) {
    const glossed = new Map<LanguageCode, Set<string>>();
    for (let i = 0; i < lesson.sentences.length && count < limit; i++, count++) {
      const r = await translateOne(model, lesson, i, LANGS, glossed);
      run.results.push(r);
      console.log(`  #${r.id} ${r.status} ${r.ms ? Math.round(r.ms) + "ms" : ""} ${r.error ?? ""}`);
    }
  }
  run.jsonMode = jsonModeByModel.get(model);

  for (const lesson of BENCH_LESSONS) {
    for (let i = 0; i < lesson.sentences.length; i++) {
      if (!SPOT_CHECK_IDS.includes(lesson.sentences[i].id)) continue;
      const r = await translateOne(model, lesson, i, SPOT_LANGS, new Map());
      run.spot.push(r);
      console.log(`  spot #${r.id} ${r.status} ${r.ms ? Math.round(r.ms) + "ms" : ""}`);
    }
  }
  return run;
}

// ---------- report ----------

const fmtMs = (v: number) => (Number.isFinite(v) ? `${(v / 1000).toFixed(2)}s` : "n/a");
const pct = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : "n/a");
const cell = (s: string | undefined) => (s ?? "(missing)").replace(/\|/g, "\\|").replace(/\n/g, " ");

function summarize(run: ModelRun) {
  const ok = run.results.filter((r) => r.ms !== null && r.status !== "error");
  const latencies = ok.map((r) => r.ms!);
  const valid = run.results.filter((r) => r.status === "valid").length;
  const recalls = run.results.map((r) => r.termRecall).filter(Number.isFinite);
  const hl = run.results.reduce((a, r) => ({ ok: a.ok + r.highlight.ok, total: a.total + r.highlight.total }), { ok: 0, total: 0 });
  const asr = run.results.filter((r) => r.asrExpected);
  const tokens = ok.map((r) => r.completionTokens ?? 0).filter((t) => t > 0);
  return {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    validRate: run.results.length ? valid / run.results.length : NaN,
    recall: recalls.length ? recalls.reduce((a, b) => a + b, 0) / recalls.length : NaN,
    highlight: hl.total ? hl.ok / hl.total : NaN,
    asr: `${asr.filter((r) => r.asrRepaired).length}/${asr.length}`,
    avgTokens: tokens.length ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : NaN,
    retries429: run.results.reduce((a, r) => a + r.retries429, 0),
  };
}

function report(runs: ModelRun[], judge: string | null): string {
  const date = new Date().toISOString().slice(0, 10);
  const langNames = LANGS.map((l) => getLanguage(l)?.name ?? l).join(", ");
  const out: string[] = [];
  out.push(`# Model benchmark`);
  out.push(``);
  out.push(`Run on ${date} against Featherless.ai (${BASE_URL}). Generated by \`scripts/bench-models.ts\`; raw outputs are in \`docs/bench/raw-results.json\`.`);
  out.push(``);
  out.push(`## What we measured`);
  out.push(``);
  out.push(`We sent 20 sentences written the way teachers actually talk (8 Biology, 6 Algebra, 6 US History) through the exact prompt and validation schema Aula uses live. Each call asks for ${langNames} at once, just like the real pipeline. Each call also includes the two previous sentences as context and the teacher's key terms. Calls ran one at a time, so the latency is what one lesson would see.`);
  out.push(``);
  out.push(`- **p50 / p95**: median and 95th-percentile time for one call (all ${LANGS.length} languages). The first call to each model is reported separately as "cold", because Featherless may need to load the model.`);
  out.push(`- **Valid JSON**: the reply parsed and passed our zod schema with every language present. Anything else would fall back to English for students.`);
  out.push(`- **Term recall**: of the teacher's key terms that appeared in a sentence, how many the model marked for highlighting.`);
  out.push(`- **Highlightable**: of the terms returned, how many can actually be found in the translated line (so we can highlight them).`);
  out.push(`- **ASR repairs**: two sentences contain deliberate speech-recognition mistakes ("sell membrane", "why intercept"). This counts how many the model fixed.`);
  out.push(`- **Units**: Featherless concurrency cost per request. Our plan has 4 units in total.`);
  out.push(``);
  out.push(`## Results`);
  out.push(``);
  out.push(`| Model | Units | Cold first call | p50 | p95 | Valid JSON | Term recall | Highlightable | ASR repairs | Avg output tokens | 429s |`);
  out.push(`|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const run of runs) {
    const s = summarize(run);
    out.push(
      `| \`${run.model}\` | ${run.info?.concurrency_cost ?? "?"} | ${run.coldMs ? fmtMs(run.coldMs) : "error"} | ${fmtMs(s.p50)} | ${fmtMs(s.p95)} | ${pct(s.validRate)} | ${pct(s.recall)} | ${pct(s.highlight)} | ${s.asr} | ${s.avgTokens} | ${s.retries429} |`,
    );
  }
  out.push(``);

  const sampleIds = [1, 7, 12, 17];
  out.push(`## Sample outputs`);
  out.push(``);
  for (const id of sampleIds) {
    const english = runs[0]?.results.find((r) => r.id === id)?.english;
    if (!english) continue;
    out.push(`### #${id}: "${english}"`);
    out.push(``);
    out.push(`| Model | ${LANGS.map((l) => getLanguage(l)?.name ?? l).join(" | ")} | Terms (es) | Fix |`);
    out.push(`|---|${LANGS.map(() => "---").join("|")}|---|---|`);
    for (const run of runs) {
      const r = run.results.find((x) => x.id === id);
      const seg = r?.seg;
      const terms = (seg?.tr.es?.terms ?? []).map((t) => `${t.en} → ${t.tr}${t.gloss ? `: ${t.gloss}` : ""}`).join("; ");
      out.push(`| \`${run.model.split("/")[1]}\` | ${LANGS.map((l) => cell(seg?.tr[l]?.text ?? (r ? `(${r.status})` : undefined))).join(" | ")} | ${cell(terms || "none")} | ${cell(seg?.fix ?? "")} |`);
    }
    out.push(``);
  }

  if (judge) {
    out.push(`## Round-trip check (back-translation)`);
    out.push(``);
    out.push(`To judge meaning in languages we can't all read, a separate, larger model (\`${judge}\`) translated each output back into English as literally as possible. If the back-translation says the same thing as the teacher's sentence, the meaning survived.`);
    out.push(``);
    for (const id of BACKTRANSLATE_IDS) {
      const english = runs[0]?.results.find((r) => r.id === id)?.english;
      if (!english) continue;
      out.push(`### #${id}: "${english}"`);
      out.push(``);
      out.push(`| Model | ${LANGS.map((l) => getLanguage(l)?.name ?? l).join(" | ")} |`);
      out.push(`|---|${LANGS.map(() => "---").join("|")}|`);
      for (const run of runs) {
        const back = run.back[id] ?? {};
        out.push(`| \`${run.model.split("/")[1]}\` | ${LANGS.map((l) => cell(back[l])).join(" | ")} |`);
      }
      out.push(``);
    }
  }

  out.push(`## Beta languages spot check`);
  out.push(``);
  out.push(`${SPOT_LANGS.map((l) => getLanguage(l)?.name ?? l).join(", ")} have much less training data, which is why Aula marks them "beta". Five sentences each:`);
  out.push(``);
  out.push(`| Model | Sentence | ${SPOT_LANGS.map((l) => getLanguage(l)?.name ?? l).join(" | ")} | Latency |`);
  out.push(`|---|---|${SPOT_LANGS.map(() => "---").join("|")}|---|`);
  for (const run of runs) {
    for (const r of run.spot) {
      out.push(`| \`${run.model.split("/")[1]}\` | #${r.id} | ${SPOT_LANGS.map((l) => cell(r.seg?.tr[l]?.text ?? `(${r.status})`)).join(" | ")} | ${r.ms ? fmtMs(r.ms) : "error"} |`);
    }
  }
  out.push(``);
  out.push(`## Decision`);
  out.push(``);
  out.push(`_To be filled in together after reviewing the results above._`);
  out.push(``);
  return out.join("\n");
}

async function main() {
  const info = await fetchModelInfo();
  for (const m of [...MODELS, ...(args["no-judge"] ? [] : [args.judge])]) {
    if (!info.has(m)) console.warn(`warning: ${m} not found in Featherless /v1/models`);
  }

  const runs: ModelRun[] = [];
  for (const model of MODELS) runs.push(await runModel(model, info.get(model)));

  const judge = args["no-judge"] ? null : args.judge;
  if (judge) {
    console.log(`\n=== back-translation with ${judge}`);
    for (const run of runs) {
      for (const id of BACKTRANSLATE_IDS) {
        const seg = run.results.find((r) => r.id === id)?.seg;
        if (!seg) continue;
        try {
          run.back[id] = await backTranslate(judge, seg, LANGS);
          console.log(`  ${run.model} #${id} ok`);
        } catch (err) {
          console.log(`  ${run.model} #${id} error ${(err as Error).message.slice(0, 120)}`);
        }
      }
    }
  }

  mkdirSync("docs/bench", { recursive: true });
  writeFileSync("docs/bench/raw-results.json", JSON.stringify({ date: new Date().toISOString(), langs: LANGS, spotLangs: SPOT_LANGS, judge, runs }, null, 2));
  writeFileSync("docs/MODEL_BENCHMARK.md", report(runs, judge));
  console.log("\nWrote docs/MODEL_BENCHMARK.md and docs/bench/raw-results.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
