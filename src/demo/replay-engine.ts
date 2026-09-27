import type { RecapTranslation, Recap } from "@/lib/ai/schemas";
import type { CaptionLine, CaptionTerm } from "@/lib/captions";

// The Demo Replay plays back a recorded lesson (src/demo/replay.json). Every
// screen is computed from the recording and a time `t`, so play, pause, 2x,
// seeking and switching the phone's language are all the same operation:
// "what did things look like at t?".

export type ReplayData = {
  note: string;
  generatedAt: string;
  models: { translate?: string; glossaryAndRecap?: string };
  lesson: { title: string; subject: string; keyTerms: string[] };
  languages: string[];
  timings: { startMs: number; endMs: number }[];
  segments: {
    seq: number;
    text: string;
    fixedText: string | null;
    translations: Record<string, { text: string; terms: CaptionTerm[]; latencyMs: number | null }>;
  }[];
  glossary: Record<string, { en: string; tr: string; gloss: string }[]>;
  signals: { type: "LOST" | "SLOWER"; seq: number | null; lang: string }[];
  questions: { lang: string; nickname: string; original: string; english: string | null }[];
  recap: { english: Recap; translations: Record<string, RecapTranslation> } | null;
};

export type Beat = { atMs: number; text: string };

export type ReplayTimeline = {
  durationMs: number;
  endMs: number; // when the teacher ends the lesson
  recapReadyMs: number;
  lostMomentMs: number;
  // When each (seq, lang) translation and fix lands.
  trAt: Map<string, number>;
  fixAt: Map<number, number>;
  lostTaps: { atMs: number; lang: string; seq: number }[];
  slowerTaps: { atMs: number; lang: string }[];
  question: { atMs: number; englishAtMs: number; lang: string; nickname: string; original: string; english: string } | null;
  beats: Beat[];
};

const FALLBACK_LATENCY = 8000; // shown as "translation not available" (never happened in the recording)
const QUESTION_TRANSLATE_MS = 2500;

export function buildTimeline(data: ReplayData, actions = { slowerAfter: 9, lostAfter: 10, questionAfter: 11 }): ReplayTimeline {
  const end = (seq: number) => data.timings[seq - 1]?.endMs ?? 0;
  const trAt = new Map<string, number>();
  const fixAt = new Map<number, number>();
  for (const s of data.segments) {
    let last = end(s.seq);
    for (const lang of data.languages) {
      const at = end(s.seq) + (s.translations[lang]?.latencyMs ?? FALLBACK_LATENCY);
      trAt.set(`${s.seq}|${lang}`, at);
      last = Math.max(last, at);
    }
    // Key-term repairs happen when the sentence arrives (no AI needed).
    if (s.fixedText) fixAt.set(s.seq, end(s.seq));
  }
  const lostLangs = data.signals.filter((x) => x.type === "LOST").map((x) => x.lang);
  const lostTaps = lostLangs.map((lang, i) => ({ atMs: end(actions.lostAfter) + 1200 * (i + 1), lang, seq: actions.lostAfter }));
  const slowerTaps = data.signals.filter((x) => x.type === "SLOWER").map((x) => ({ atMs: end(actions.slowerAfter) + 1500, lang: x.lang }));
  const q = data.questions[0];
  const qAt = end(actions.questionAfter) + 2000;
  const question = q ? { atMs: qAt, englishAtMs: qAt + QUESTION_TRANSLATE_MS, lang: q.lang, nickname: q.nickname, original: q.original, english: q.english ?? q.original } : null;
  const lastSeq = data.segments.at(-1)?.seq ?? 0;
  const endMs = end(lastSeq) + 5000;
  const recapReadyMs = endMs + 6000;
  const firstTr = Math.min(...data.languages.map((l) => trAt.get(`1|${l}`) ?? Infinity));
  const fixSeq = data.segments.find((s) => s.fixedText)?.seq;

  const beats: Beat[] = [
    { atMs: 0, text: "A 9th-grade Biology class. Four newcomer students joined with a code, each choosing their own language." },
    { atMs: end(1), text: "The teacher just talks. Each sentence reaches every phone in English right away..." },
    { atMs: Number.isFinite(firstTr) ? firstTr : end(1) + 2000, text: "...and in each student's language about 2 seconds later. Try switching the phone's language." },
    ...(data.timings[3] ? [{ atMs: end(4), text: "Highlighted words are the teacher's key terms. Tap one on the phone: its meaning in your language, and how it sounds in English." }] : []),
    ...(fixSeq ? [{ atMs: fixAt.get(fixSeq)!, text: "Speech recognition heard “sell membrane”. Aula checked the teacher’s key terms and fixed it to “cell membrane” before translating." }] : []),
    ...(lostTaps.length ? [{ atMs: lostTaps[0].atMs, text: "Students tap “I'm lost”. The teacher sees how many (never who) and exactly which sentence lost them." }] : []),
    ...(data.timings[actions.lostAfter + 1] ? [{ atMs: end(actions.lostAfter + 2) - 1500, text: "So the teacher re-explains it more simply, right when it matters." }] : []),
    ...(question ? [{ atMs: question.atMs, text: `${question.nickname} asked a question in Spanish. The teacher reads it in English, and answers out loud.` }] : []),
    { atMs: endMs, text: "The lesson ends. Aula writes a recap from what was said..." },
    { atMs: recapReadyMs, text: "...in every student's language. The same link works for anyone who was absent, in any language." },
  ];

  return {
    durationMs: recapReadyMs + 12_000,
    endMs,
    recapReadyMs,
    lostMomentMs: lostTaps[0] ? lostTaps[0].atMs - 4000 : end(actions.lostAfter) - 3000,
    trAt,
    fixAt,
    lostTaps,
    slowerTaps,
    question,
    beats,
  };
}

export function beatAt(tl: ReplayTimeline, t: number): Beat {
  const sorted = [...tl.beats].sort((a, b) => a.atMs - b.atMs);
  return [...sorted].reverse().find((b) => b.atMs <= t) ?? sorted[0];
}

// The words the teacher is saying at time t, before the sentence is final.
export function interimAt(data: ReplayData, t: number): string {
  for (let i = 0; i < data.timings.length; i++) {
    const { startMs, endMs } = data.timings[i];
    if (t >= startMs && t < endMs) {
      const words = data.segments[i]?.text.split(/\s+/) ?? [];
      const n = Math.max(1, Math.ceil((words.length * (t - startMs)) / (endMs - startMs)));
      return words.slice(0, n).join(" ");
    }
  }
  return "";
}

// Caption lines at time t, as a phone reading `lang` (or the teacher, with
// lang "en") would show them.
export function linesAt(data: ReplayData, tl: ReplayTimeline, t: number, lang: string): CaptionLine[] {
  const lines: CaptionLine[] = [];
  for (const s of data.segments) {
    if ((data.timings[s.seq - 1]?.endMs ?? Infinity) > t) break;
    const fixed = s.fixedText && (tl.fixAt.get(s.seq) ?? Infinity) <= t ? s.fixedText : undefined;
    if (lang === "en") {
      lines.push({ seq: s.seq, en: s.text, fix: fixed, trStatus: "none" });
      continue;
    }
    const tr = s.translations[lang];
    const arrived = (tl.trAt.get(`${s.seq}|${lang}`) ?? Infinity) <= t;
    lines.push({
      seq: s.seq,
      en: s.text,
      fix: fixed,
      tr: arrived && tr ? { text: tr.text, terms: tr.terms } : undefined,
      trStatus: arrived ? (tr ? "done" : "failed") : "pending",
    });
  }
  return lines;
}

// What the teacher's "Understanding" card shows at time t (one-minute window).
export function signalsAt(data: ReplayData, tl: ReplayTimeline, t: number) {
  const recent = (at: number) => at <= t && at > t - 60_000;
  const lost = tl.lostTaps.filter((x) => recent(x.atMs));
  const slower = tl.slowerTaps.filter((x) => recent(x.atMs)).length;
  const totals: Record<number, number> = {};
  for (const x of tl.lostTaps) if (x.atMs <= t) totals[x.seq] = (totals[x.seq] ?? 0) + 1;
  const anchorSeq = lost[0]?.seq;
  const anchorText = anchorSeq ? (data.segments.find((s) => s.seq === anchorSeq)?.text ?? null) : null;
  return {
    lost: lost.length,
    slower,
    anchor: anchorSeq ? { seq: anchorSeq, count: lost.length } : null,
    anchorText,
    totals,
  };
}
