"use client";

import { BookOpen, HelpCircle, MessageCircleQuestion, Mic, Pause, Play, RotateCcw, SkipForward, Turtle, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RecapBody } from "@/components/recap/recap-view";
import { Timeline } from "@/components/review/timeline";
import { Captions, type Glossary, type OpenTerm } from "@/components/student/student-live";
import { PulseCard, QuestionsCard, RoomCard, Transcript, type Question, type Room } from "@/components/teach/teacher-live";
import { beatAt, buildTimeline, interimAt, linesAt, signalsAt, type ReplayData } from "@/demo/replay-engine";
import { getLanguage } from "@/lib/languages";
import { termKey } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { studentStrings } from "@/i18n/student";
import { formatDate } from "@/lib/dates";

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const TICK_MS = 100;

export function DemoPlayer({ data }: { data: ReplayData }) {
  const tl = useMemo(() => buildTimeline(data), [data]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [lang, setLang] = useState(data.languages[0] ?? "es");
  const [openTerm, setOpenTerm] = useState<OpenTerm | null>(null);

  // The clock. Ten ticks a second is plenty for captions and keeps rendering cheap.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((prev) => {
        const next = Math.min(tl.durationMs, prev + TICK_MS * speed);
        if (next >= tl.durationMs) setPlaying(false);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, speed, tl.durationMs]);

  // The phone opens its recap by itself shortly after it's ready, so the
  // story finishes even if nobody clicks, unless the viewer closed it.
  // Seeking back before the end of the lesson resets that choice.
  const autoRecapAt = tl.recapReadyMs + 2000;
  const [recapChoice, setRecapChoice] = useState<"auto" | "open" | "closed">("auto");
  const choice = t < tl.endMs ? "auto" : recapChoice;
  const showRecap = t >= tl.recapReadyMs && (choice === "open" || (choice === "auto" && t >= autoRecapAt));

  const seek = useCallback(
    (ms: number) => {
      const next = Math.max(0, Math.min(tl.durationMs, ms));
      setT(next);
      setOpenTerm(null);
      if (next < tl.endMs) setRecapChoice("auto");
    },
    [tl.durationMs, tl.endMs],
  );

  // Keyboard: space plays/pauses, arrows jump 5 seconds.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, button")) return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") seek(t + 5000);
      else if (e.key === "ArrowLeft") seek(t - 5000);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, t]);

  const teacherLines = linesAt(data, tl, t, "en");
  const phoneLines = linesAt(data, tl, t, lang);
  const interim = interimAt(data, t);
  const signals = signalsAt(data, tl, t);
  const ended = t >= tl.endMs;
  const recapReady = t >= tl.recapReadyMs;
  const beat = beatAt(tl, t);

  const questions: Question[] =
    tl.question && t >= tl.question.atMs
      ? [
          {
            id: "q1",
            nickname: tl.question.nickname,
            participantId: "p1",
            lang: tl.question.lang,
            original: tl.question.original,
            english: t >= tl.question.englishAtMs ? tl.question.english : null,
            translating: t < tl.question.englishAtMs,
            answered: t >= (data.timings[14]?.endMs ?? Infinity),
            at: new Date(Date.parse(data.generatedAt) - tl.durationMs + tl.question.atMs).toISOString(),
          },
        ]
      : [];
  const room: Room = {
    students: data.languages.length,
    langs: Object.fromEntries(data.languages.map((l) => [l, 1])),
    participants: [],
  };
  const glossary: Glossary = useMemo(() => Object.fromEntries((data.glossary[lang] ?? []).map((g) => [termKey(g.en), { tr: g.tr, gloss: g.gloss }])), [data.glossary, lang]);

  // Which tap (if any) the student on this phone just made.
  const recently = (at: number) => t >= at && t < at + 1800;
  const phoneLost = tl.lostTaps.some((x) => x.lang === lang && recently(x.atMs));
  const phoneSlower = tl.slowerTaps.some((x) => x.lang === lang && recently(x.atMs));

  const markers = [
    { at: tl.lostMomentMs + 4000, label: "Students lost", color: "bg-coral" },
    ...(tl.question ? [{ at: tl.question.atMs, label: "Question", color: "bg-ink" }] : []),
    { at: tl.endMs, label: "Lesson ends", color: "bg-sage" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-10 sm:px-6">
      <p aria-live="polite" className="mx-auto mt-2 flex min-h-[3.5rem] max-w-4xl items-center justify-center rounded-2xl bg-card px-4 py-3 text-center text-[15px] font-medium shadow-[0_1px_0_rgba(27,30,43,0.04)] sm:px-5 sm:text-lg">
        {beat.text}
      </p>

      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Teacher's laptop */}
        <section aria-label="The teacher's screen" className="order-3 overflow-hidden rounded-2xl border bg-background shadow-[0_24px_60px_-30px_rgba(27,30,43,0.35)] lg:order-1">
          <div className="flex items-center gap-2 border-b bg-card px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-ink/15" />
            <span className="size-2.5 rounded-full bg-ink/15" />
            <span className="size-2.5 rounded-full bg-ink/15" />
            <span className="ml-3 truncate rounded-md bg-secondary px-3 py-0.5 text-xs text-ink-2">aulaapp.xyz/teach · Teacher view</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-b bg-card/60 px-4 py-2.5">
            <div>
              <p className="font-medium">{data.lesson.title}</p>
              <p className="text-xs text-ink-2">{data.lesson.subject} · 9th grade</p>
            </div>
            {ended ? (
              <span className="rounded-full bg-secondary px-3 py-1 text-sm text-ink-2">Ended</span>
            ) : (
              <span className="flex items-center gap-2 rounded-full bg-sage/10 px-3 py-1 text-sm font-medium text-sage">
                <span className="size-2 animate-pulse-soft rounded-full bg-sage" aria-hidden /> Live <span className="tabular-nums">{mmss(t)}</span>
              </span>
            )}
          </div>
          <div className="grid gap-4 p-4 md:h-[clamp(360px,calc(100dvh-420px),600px)] md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex h-80 min-h-0 flex-col rounded-xl border bg-card md:h-auto">
              <Transcript lines={teacherLines} sending={[]} interim={interim} ended={ended} lostTotals={signals.totals} anchorSeq={signals.anchor?.seq ?? null} />
              <div className="flex items-center gap-2 border-t px-4 py-2.5 text-sm">
                <Mic className="size-4 text-ink-2" aria-hidden />
                {ended ? <span className="text-ink-2">Microphone off</span> : <span className="font-medium">Listening</span>}
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl focus-visible:ring-3 focus-visible:ring-coral/30 focus-visible:outline-none [&_section]:p-4" tabIndex={0} role="region" aria-label="Teacher's side panel">
              {ended ? (
                <section className="rounded-2xl border bg-card">
                  <h2 className="text-base font-semibold">Where students got lost</h2>
                  <Timeline
                    durationSec={tl.endMs / 1000}
                    points={data.segments.map((s) => ({ seq: s.seq, offsetSec: (data.timings[s.seq - 1]?.startMs ?? 0) / 1000, lost: signals.totals[s.seq] ?? 0, text: s.fixedText ?? s.text }))}
                  />
                </section>
              ) : (
                <PulseCard signals={signals} />
              )}
              <QuestionsCard lessonId="demo" questions={questions} readOnly />
              {!ended && <RoomCard room={room} />}
            </div>
          </div>
        </section>

        {/* Student's phone */}
        <section aria-label="A student's phone" className="order-1 flex w-full flex-col items-center lg:order-2">
          <div role="radiogroup" aria-label="Phone language" className="mb-3 flex flex-wrap justify-center gap-1.5">
            {data.languages.map((code) => {
              const l = getLanguage(code);
              return (
                <button
                  key={code}
                  role="radio"
                  aria-checked={code === lang}
                  onClick={() => {
                    setLang(code);
                    setOpenTerm(null);
                  }}
                  className={cn("rounded-full border px-3 py-1 text-sm", code === lang ? "border-coral bg-coral-soft font-semibold" : "bg-card hover:bg-secondary")}
                >
                  <span lang={code} dir={l?.dir}>
                    {l?.native ?? code}
                  </span>
                </button>
              );
            })}
          </div>
          <Phone
            lang={lang}
            data={data}
            lines={phoneLines}
            interim={interim}
            ended={ended}
            recapReady={recapReady}
            recapOpen={showRecap}
            onOpenRecap={() => setRecapChoice("open")}
            onCloseRecap={() => setRecapChoice("closed")}
            glossary={glossary}
            openTerm={openTerm}
            onTerm={setOpenTerm}
            lostTap={phoneLost}
            slowerTap={phoneSlower}
          />
        </section>

        {/* Controls */}
        <div className="order-2 rounded-2xl border bg-card p-3 sm:p-4 lg:order-3 lg:col-span-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => (t >= tl.durationMs ? (seek(0), setPlaying(true)) : setPlaying((p) => !p))}
              className="flex h-10 items-center gap-2 rounded-full bg-ink px-3.5 text-sm font-semibold text-paper sm:px-4"
            >
              {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))} className="h-10 shrink-0 rounded-full border px-3 text-sm font-medium sm:px-4" aria-label={`Speed ${speed}x, switch to ${speed === 1 ? 2 : 1}x`}>
              {speed}x
            </button>
            <button onClick={() => (seek(tl.lostMomentMs), setPlaying(true))} className="flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium sm:px-4" aria-label="Jump to the lost moment">
              <SkipForward className="size-4 shrink-0" aria-hidden /> <span className="hidden sm:inline">Jump to the lost moment</span>
              <span className="sm:hidden">Lost moment</span>
            </button>
            <button onClick={() => (seek(0), setPlaying(true))} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium sm:px-4" aria-label="Restart">
              <RotateCcw className="size-4" aria-hidden /> <span className="hidden sm:inline">Restart</span>
            </button>
            <span className="ml-auto hidden text-sm text-ink-2 tabular-nums sm:inline">
              {mmss(t)} / {mmss(tl.durationMs)}
            </span>
          </div>
          <div className="relative mt-3">
            <input
              type="range"
              min={0}
              max={tl.durationMs}
              step={100}
              value={t}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Replay position"
              aria-valuetext={`${mmss(t)} of ${mmss(tl.durationMs)}`}
              className="w-full accent-coral"
            />
            <div className="pointer-events-none relative h-4" aria-hidden>
              {markers.map((m) => (
                <span key={m.label} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${(m.at / tl.durationMs) * 100}%` }}>
                  <span className={cn("size-2 rounded-full", m.color)} />
                  <span className="mt-0.5 hidden text-[10px] whitespace-nowrap text-ink-2 sm:block">{m.label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-4 max-w-3xl text-center text-xs leading-relaxed text-ink-2">
        Replay of a lesson processed by Aula&rsquo;s live pipeline on{" "}
        {formatDate(data.generatedAt, { month: "long", day: "numeric", year: "numeric" })}. The translations, definitions, speech fix and recap are real AI output
        (Featherless: {data.models.translate?.split("/")[1] ?? "Qwen3"} and {data.models.glossaryAndRecap?.split("/")[1] ?? "Gemma 4"}), shown with the delays we measured. The teacher&rsquo;s
        sentences were typed at speaking pace, and the recap step is sped up.
      </p>
    </div>
  );
}

type PhoneProps = {
  lang: string;
  data: ReplayData;
  lines: ReturnType<typeof linesAt>;
  interim: string;
  ended: boolean;
  recapReady: boolean;
  recapOpen: boolean;
  onOpenRecap: () => void;
  onCloseRecap: () => void;
  glossary: Glossary;
  openTerm: OpenTerm | null;
  onTerm: (t: OpenTerm | null) => void;
  lostTap: boolean;
  slowerTap: boolean;
};

function Phone(p: PhoneProps) {
  const t = studentStrings(p.lang);
  const language = getLanguage(p.lang);
  const recapTr = p.data.recap?.translations[p.lang];
  const english = p.data.recap?.english;
  return (
    <div className="relative h-[62dvh] w-full overflow-hidden rounded-2xl border bg-background lg:h-[clamp(460px,calc(100dvh-330px),700px)] lg:w-[360px] lg:rounded-[2.6rem] lg:border-[10px] lg:border-ink lg:shadow-[0_30px_60px_-25px_rgba(27,30,43,0.5)]">
      <div className="absolute top-1.5 left-1/2 z-20 hidden h-5 w-24 -translate-x-1/2 rounded-full bg-ink lg:block" aria-hidden />
      <div className="flex h-full flex-col lg:pt-7">
        <div className="flex items-center justify-between gap-2 border-b bg-card/70 px-4 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{p.data.lesson.title}</p>
            <p className={cn("flex items-center gap-1.5 text-xs", p.ended ? "text-ink-2" : "text-sage")}>
              {!p.ended && <span className="size-1.5 animate-pulse-soft rounded-full bg-sage" aria-hidden />}
              {p.ended ? t.ended : t.live}
            </p>
          </div>
          <span className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium" lang={p.lang} dir={language?.dir}>
            {language?.native}
          </span>
        </div>

        {p.recapOpen && english ? (
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <button onClick={p.onCloseRecap} className="mt-3 text-xs font-medium text-ink-2 underline underline-offset-4">
              &larr; {t.live}
            </button>
            <p className="mt-2 text-xs font-semibold tracking-wide text-coral uppercase" lang={p.lang}>
              {t.recapTitle}
            </p>
            <RecapBody
              compact
              lang={p.lang}
              shownLang={recapTr ? p.lang : "en"}
              shownDir={recapTr ? (language?.dir ?? "ltr") : "ltr"}
              summary={recapTr?.summary ?? english.summary}
              keyTerms={recapTr?.keyTerms ?? english.keyTerms.map((k) => ({ ...k, tr: null }))}
              questions={recapTr?.checkQuestions ?? english.checkQuestions}
            />
          </div>
        ) : (
          <Captions glossary={p.glossary} lines={p.lines} interim={p.ended ? "" : p.interim} lang={p.lang} t={t} ended={p.ended} bilingual keyTerms={p.data.lesson.keyTerms} onTerm={p.onTerm} />
        )}

        {!p.recapOpen && (
          <div className="border-t bg-card/90 px-3 pt-2 pb-4">
            {p.ended ? (
              p.recapReady ? (
                <button onClick={p.onOpenRecap} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-coral text-base font-semibold text-primary-foreground">
                  <BookOpen className="size-5" aria-hidden /> {t.readRecap}
                </button>
              ) : (
                <p className="flex items-center justify-center gap-2 py-3 text-sm text-ink-2">
                  <span className="size-2 animate-pulse-soft rounded-full bg-coral" aria-hidden /> {t.recapWriting}
                </p>
              )
            ) : (
              <div className="flex gap-2" aria-hidden>
                <span className={cn("flex h-12 flex-[1.3] items-center justify-center gap-1.5 rounded-2xl bg-coral text-sm font-semibold text-primary-foreground transition", p.lostTap && "ring-4 ring-coral/40 scale-[0.97]")}>
                  <HelpCircle className="size-4" /> {t.lost}
                </span>
                <span className={cn("flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl border bg-card text-sm font-semibold transition", p.slowerTap && "ring-4 ring-saffron/40 scale-[0.97]")}>
                  <Turtle className="size-4" /> {t.slower}
                </span>
                <span className="flex h-12 flex-col items-center justify-center rounded-2xl border bg-card px-3 text-[11px] font-medium">
                  <MessageCircleQuestion className="size-4" /> {t.ask}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {p.openTerm && (
        <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl border-t bg-card p-5 shadow-[0_-12px_30px_-12px_rgba(27,30,43,0.25)]" role="dialog" aria-label={p.openTerm.en}>
          <div className="flex items-start justify-between gap-3">
            <p lang="en" className="font-display text-2xl font-semibold">
              {p.openTerm.en}
            </p>
            <button onClick={() => p.onTerm(null)} className="text-sm text-ink-2 underline underline-offset-4">
              Close
            </button>
          </div>
          <button
            onClick={() => {
              const u = new SpeechSynthesisUtterance(p.openTerm!.en);
              u.lang = "en-US";
              u.rate = 0.85;
              window.speechSynthesis?.speak(u);
            }}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-paper"
          >
            <Volume2 className="size-4" aria-hidden /> {t.hearIt}
          </button>
          {p.lang !== "en" && (p.openTerm.tr ?? p.glossary[termKey(p.openTerm.en)]?.tr) && (
            <p lang={p.lang} dir={language?.dir} className="mt-3 text-xl font-medium">
              {p.openTerm.tr ?? p.glossary[termKey(p.openTerm.en)]?.tr}
            </p>
          )}
          <p lang={p.lang} dir={language?.dir} className="mt-1 leading-relaxed">
            {p.glossary[termKey(p.openTerm.en)]?.gloss ?? t.definitionComing}
          </p>
        </div>
      )}
    </div>
  );
}
