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
import { parseModelJson, scanTranslationStream } from "@/lib/ai/json";
import { buildGlossaryMessages, buildTranslationMessages, type ChatMessage } from "@/lib/ai/prompts";
import { GlossaryResponseSchema, TranslationResponseSchema, type GlossaryResponse, type SegmentTranslation } from "@/lib/ai/schemas";
import { findKeyTerms } from "@/lib/terms";
import { getLanguage, type LanguageCode } from "@/lib/languages";
import { BACKTRANSLATE_IDS, BENCH_LESSONS, SPOT_CHECK_IDS } from "./bench/sentences";
import { highlightable, percentile, termRecall } from "./bench/metrics";

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
    "no-spot": { type: "boolean", default: false },
    // combined: one call returns every language (the brief's design).
    // split: one call per language, all in parallel (uses more concurrency).
    mode: { type: "string", default: "combined" },
  },
});

const BASE_URL = process.env.AI_BASE_URL ?? "https://api.featherless.ai/v1";
const API_KEY = process.env.AI_API_KEY ?? "";
const MODELS = args.models.split(",").map((m) => m.trim()).filter(Boolean);
const LANGS = args.langs.split(",") as LanguageCode[];
const SPOT_LANGS = args.spot.split(",") as LanguageCode[];
const CALL_TIMEOUT_MS = 60_000; // generous: first calls can hit a cold model
const MAX_TOKENS = 1500;
const MODE = args.mode === "split" ? "split" : "combined";
const OUT_SUFFIX = MODE === "split" ? "-split" : "";

if (!API_KEY) {
  console.error("AI_API_KEY is empty. Add your Featherless key to .env.local, then rerun `npm run bench`.");
  process.exit(1);
}

const client = createAiClient({ baseURL: BASE_URL, apiKey: API_KEY, timeoutMs: CALL_TIMEOUT_MS });

type ModelInfo = { id: string; concurrency_cost?: number; context_length?: number; model_class?: string };

async function fetchModelInfo(): Promise<Map<string, ModelInfo>> {
  // Featherless rejects the default "node" user-agent on this endpoint.
  const res = await fetch(`${BASE_URL}/models`, { headers: { "User-Agent": "aula-bench/1.0" } });
  const body = (await res.json()) as { data: ModelInfo[] };
  return new Map(body.data.map((m) => [m.id, m]));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// JSON mode support differs per provider/model; detect it once per model.
const jsonModeByModel = new Map<string, boolean>();

async function call(model: string, messages: ChatMessage[]): Promise<ChatResult & { retries429: number }> {
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
  // Time until every language was complete.
  ms: number | null;
  ttftMs?: number | null;
  // Time until the first language was complete (what the biggest group of
  // students waits for when we stream).
  firstLangMs?: number | null;
  langReadyMs?: Record<string, number>;
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
): Promise<SentenceResult> {
  const sentence = lesson.sentences[idx];
  const context = lesson.sentences.slice(Math.max(0, idx - 2), idx).map((s) => s.text);
  const messages = buildTranslationMessages({
    subject: lesson.subject,
    title: lesson.title,
    keyTerms: lesson.keyTerms,
    context,
    langs,
    segments: [{ seq: sentence.id, text: sentence.text, terms: findKeyTerms(sentence.text, lesson.keyTerms) }],
  });

  // Recall is measured against the corrected sentence, so a misheard term
  // only counts as found if the model repaired it and marked it.
  const correctedText = sentence.asrError
    ? sentence.text.replace(sentence.asrError.split(" -> ")[0], sentence.asrError.split(" -> ")[1])
    : sentence.text;
  const expectedTerms = findKeyTerms(correctedText, lesson.keyTerms);
  const base = { id: sentence.id, lesson: lesson.title, english: sentence.text, retries429: 0, termRecall: NaN, highlight: { ok: 0, total: 0 } };

  let r: Awaited<ReturnType<typeof call>>;
  try {
    r = await call(model, messages);
  } catch (err) {
    return { ...base, ms: null, status: "error", error: (err as Error).message.slice(0, 300) };
  }

  // When did each language's part of the reply finish arriving?
  const langReadyMs: Record<string, number> = {};
  const scanned = scanTranslationStream(r.text)[0];
  for (const [lang, end] of Object.entries(scanned?.ends ?? {})) {
    const mark = r.marks.find(([len]) => len >= end);
    if (mark) langReadyMs[lang] = mark[1];
  }
  const readyTimes = Object.values(langReadyMs);
  const timing = { ttftMs: r.ttftMs, langReadyMs, firstLangMs: readyTimes.length ? Math.min(...readyTimes) : null };

  const parsed = parseModelJson(r.text, TranslationResponseSchema);
  if (!parsed.ok) {
    return { ...base, ...timing, ms: r.ms, status: "invalid", error: parsed.error, raw: r.text.slice(0, 600), completionTokens: r.completionTokens, retries429: r.retries429 };
  }
  const seg = parsed.data.segments.find((s) => s.seq === sentence.id) ?? parsed.data.segments[0];
  const missing = langs.filter((l) => !seg.tr[l]);
  const result: SentenceResult = {
    ...base,
    ...timing,
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

// Split mode: one call per language, all at once. Students of each language
// get their line when their own call finishes.
async function translateSplit(
  model: string,
  lesson: (typeof BENCH_LESSONS)[number],
  idx: number,
  langs: LanguageCode[],
): Promise<SentenceResult> {
  const parts = await Promise.all(langs.map((l) => translateOne(model, lesson, idx, [l])));
  const ok = parts.filter((p) => p.seg);
  const tr = Object.assign({}, ...ok.map((p) => p.seg!.tr));
  const seg = ok.length ? { ...ok[0].seg!, tr } : undefined;
  const errored = parts.find((p) => p.status === "error" || p.status === "invalid");
  const done = parts.map((p) => p.ms).filter((m): m is number => m !== null);
  const expected = findKeyTerms(parts[0].english, lesson.keyTerms);
  return {
    ...parts[0],
    ms: done.length === parts.length ? Math.max(...done) : null,
    ttftMs: Math.min(...parts.map((p) => p.ttftMs ?? Infinity)),
    firstLangMs: done.length ? Math.min(...done) : null,
    langReadyMs: Object.fromEntries(parts.map((p, i) => [langs[i], p.ms ?? NaN])),
    status: errored ? errored.status : Object.keys(tr).length === langs.length ? "valid" : "partial",
    error: errored?.error,
    seg,
    completionTokens: parts.reduce((a, p) => a + (p.completionTokens ?? 0), 0),
    retries429: parts.reduce((a, p) => a + p.retries429, 0),
    termRecall: seg ? termRecall(expected, seg, langs) : NaN,
    highlight: seg ? highlightable(seg, langs) : { ok: 0, total: 0 },
    asrRepaired: parts.some((p) => p.asrRepaired),
  };
}

const translate = MODE === "split" ? translateSplit : translateOne;

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

type GlossaryResult = { lesson: string; lang: string; ms: number | null; ok: boolean; error?: string; data?: GlossaryResponse };

// Glossary: one call per language with all of a lesson's key terms, run in
// parallel the way the app does when a new language joins a lesson.
async function glossaryRun(model: string): Promise<GlossaryResult[]> {
  const out: GlossaryResult[] = [];
  for (const lesson of BENCH_LESSONS) {
    const results = await Promise.all(
      LANGS.map(async (lang): Promise<GlossaryResult> => {
        try {
          const r = await call(model, buildGlossaryMessages({ subject: lesson.subject, title: lesson.title, terms: lesson.keyTerms, lang }));
          const parsed = parseModelJson(r.text, GlossaryResponseSchema);
          return parsed.ok
            ? { lesson: lesson.title, lang, ms: r.ms, ok: parsed.data.terms.length === lesson.keyTerms.length, data: parsed.data }
            : { lesson: lesson.title, lang, ms: r.ms, ok: false, error: parsed.error };
        } catch (err) {
          return { lesson: lesson.title, lang, ms: null, ok: false, error: (err as Error).message.slice(0, 200) };
        }
      }),
    );
    out.push(...results);
    console.log(`  glossary ${lesson.title}: ${results.map((r) => `${r.lang}=${r.ok ? Math.round(r.ms!) + "ms" : "fail"}`).join(" ")}`);
  }
  return out;
}

type ModelRun = {
  glossary?: GlossaryResult[];
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
  const warm = await translate(model, BENCH_LESSONS[0], 0, LANGS);
  run.coldMs = warm.ms;
  if (warm.status === "error") run.coldError = warm.error;
  console.log(`  cold first call: ${warm.ms ? Math.round(warm.ms) + "ms" : "error " + warm.error}`);

  const limit = args.limit ? Number(args.limit) : Infinity;
  let count = 0;
  for (const lesson of BENCH_LESSONS) {
    for (let i = 0; i < lesson.sentences.length && count < limit; i++, count++) {
      const r = await translate(model, lesson, i, LANGS);
      run.results.push(r);
      console.log(`  #${r.id} ${r.status} first=${r.firstLangMs ? Math.round(r.firstLangMs) : "-"}ms all=${r.ms ? Math.round(r.ms) + "ms" : "-"} ${r.error ?? ""}`);
    }
  }
  run.jsonMode = jsonModeByModel.get(model);
  if (MODE === "combined" && !args["no-spot"]) run.glossary = await glossaryRun(model);

  for (const lesson of args["no-spot"] ? [] : BENCH_LESSONS) {
    for (let i = 0; i < lesson.sentences.length; i++) {
      if (!SPOT_CHECK_IDS.includes(lesson.sentences[i].id)) continue;
      const r = await translateOne(model, lesson, i, SPOT_LANGS);
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
  const first = ok.map((r) => r.firstLangMs).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const ttft = ok.map((r) => r.ttftMs).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const tokPerSec = ok.filter((r) => r.completionTokens && r.ms).map((r) => r.completionTokens! / (r.ms! / 1000));
  return {
    ttft50: percentile(ttft, 50),
    first50: percentile(first, 50),
    first95: percentile(first, 95),
    tokPerSec: tokPerSec.length ? Math.round(percentile(tokPerSec, 50)) : NaN,
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
  out.push(MODE === "split" ? `# Model benchmark: split mode` : `# Model benchmark`);
  out.push(``);
  out.push(`Run on ${date} against Featherless.ai (${BASE_URL}) in **${MODE}** mode (${MODE === "split" ? "one call per language, in parallel" : "one call returns every language"}). Generated by \`scripts/bench-models.ts\`; raw outputs are in \`docs/bench/raw-results${OUT_SUFFIX}.json\`.`);
  out.push(``);
  out.push(`## What we measured`);
  out.push(``);
  out.push(`We sent 20 sentences written the way teachers actually talk (8 Biology, 6 Algebra, 6 US History) through the exact prompt and validation schema Aula uses live. Each call asks for ${langNames} at once, just like the real pipeline. Each call also includes the two previous sentences as context and the teacher's key terms. Calls ran one at a time, so the latency is what one lesson would see.`);
  out.push(``);
  out.push(`- **First token**: median time until the model starts answering.`);
  out.push(`- **First language ready**: median / 95th-percentile time until the first language is complete. Aula streams replies and sends each language to its students the moment it is finished, so this is what the largest language group waits for.`);
  out.push(`- **All languages ready**: median / 95th-percentile time until every language is complete. The first call to each model is reported separately as "cold", because Featherless may need to load the model.`);
  out.push(`- **Speed**: output tokens per second (median).`);
  out.push(`- **Valid JSON**: the reply parsed and passed our zod schema with every language present. Anything else would fall back to English for students.`);
  out.push(`- **Term recall**: of the teacher's key terms that appeared in a sentence, how many the model marked for highlighting.`);
  out.push(`- **Highlightable**: of the terms returned, how many can actually be found in the translated line (so we can highlight them).`);
  out.push(`- **ASR repairs**: two sentences contain deliberate speech-recognition mistakes ("sell membrane", "why intercept"). This counts how many the model fixed.`);
  out.push(`- **Units**: Featherless concurrency cost per request. Our plan has 4 units in total.`);
  out.push(``);
  out.push(`## Results`);
  out.push(``);
  out.push(`| Model | Units | Cold first call | First token | First language ready (p50 / p95) | All languages ready (p50 / p95) | Speed | Valid JSON | Term recall | Highlightable | ASR repairs | Avg output tokens | 429s |`);
  out.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const run of runs) {
    const s = summarize(run);
    out.push(
      `| \`${run.model}\` | ${run.info?.concurrency_cost ?? "?"} | ${run.coldMs ? fmtMs(run.coldMs) : "error"} | ${fmtMs(s.ttft50)} | ${fmtMs(s.first50)} / ${fmtMs(s.first95)} | ${fmtMs(s.p50)} / ${fmtMs(s.p95)} | ${Number.isFinite(s.tokPerSec) ? s.tokPerSec + " tok/s" : "n/a"} | ${pct(s.validRate)} | ${pct(s.recall)} | ${pct(s.highlight)} | ${s.asr} | ${s.avgTokens} | ${s.retries429} |`,
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
  if (runs.some((r) => r.glossary?.length)) {
    out.push(`## Glossary calls`);
    out.push(``);
    out.push(`Definitions are generated once per language per lesson (when the first student of that language joins), not during live captions. One call covers all of a lesson's key terms (5 to 8 terms). "Complete" means every term came back with a translation and a definition.`);
    out.push(``);
    out.push(`| Model | p50 | p95 | Complete |`);
    out.push(`|---|---|---|---|`);
    for (const run of runs) {
      const g = run.glossary ?? [];
      const ms = g.map((x) => x.ms).filter((v): v is number => v !== null);
      out.push(`| \`${run.model}\` | ${fmtMs(percentile(ms, 50))} | ${fmtMs(percentile(ms, 95))} | ${g.filter((x) => x.ok).length}/${g.length} |`);
    }
    out.push(``);
    out.push(`Sample (Biology key terms):`);
    out.push(``);
    for (const run of runs) {
      const es = run.glossary?.find((x) => x.lesson === "Photosynthesis" && x.lang === "es")?.data;
      const ar = run.glossary?.find((x) => x.lesson === "Photosynthesis" && x.lang === "ar")?.data;
      if (!es && !ar) continue;
      out.push(`- \`${run.model.split("/")[1]}\`: ${(es?.terms ?? []).slice(0, 3).map((t) => `**${t.en}** → ${t.tr}: ${t.gloss}`).join(" · ")}${ar ? ` · ${ar.terms.slice(0, 2).map((t) => `**${t.en}** → ${t.tr}: ${t.gloss}`).join(" · ")}` : ""}`);
    }
    out.push(``);
  }

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
  const mdPath = MODE === "split" ? "docs/bench/split-mode.md" : "docs/MODEL_BENCHMARK.md";
  writeFileSync(`docs/bench/raw-results${OUT_SUFFIX}.json`, JSON.stringify({ date: new Date().toISOString(), mode: MODE, langs: LANGS, spotLangs: SPOT_LANGS, judge, runs }, null, 2));
  writeFileSync(mdPath, report(runs, judge));
  console.log(`\nWrote ${mdPath} and docs/bench/raw-results${OUT_SUFFIX}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
