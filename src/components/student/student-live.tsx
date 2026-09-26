"use client";

import { ArrowDown, Globe } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState, useTransition } from "react";
import { changeLanguageAction } from "@/app/actions/join";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLessonStream, type StreamStatus, type StreamEvent } from "@/hooks/use-lesson-stream";
import { applyCaptionEvent, emptyCaptions, type CaptionEvent, type CaptionLine } from "@/lib/captions";
import { getLanguage, LANGUAGES } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { studentStrings, type StudentStrings } from "@/i18n/student";

type Props = {
  lesson: { id: string; code: string; title: string | null; subject: string | null; status: "LIVE" | "ENDED" };
  me: { nickname: string; lang: string };
};

export function StudentLive({ lesson, me }: Props) {
  const [lang, setLang] = useState(me.lang);
  const wantsTranslation = lang !== "en";
  const reducer = useCallback((s: typeof emptyCaptions, e: CaptionEvent) => applyCaptionEvent(s, e, wantsTranslation), [wantsTranslation]);
  const [captions, dispatch] = useReducer(reducer, { ...emptyCaptions, ended: lesson.status === "ENDED" });
  const t = studentStrings(lang);
  const language = getLanguage(lang);

  const onEvent = useCallback((e: StreamEvent) => dispatch(e as CaptionEvent), []);
  // `lang` is in the URL so switching language opens a fresh stream (and
  // a fresh snapshot in the new language).
  const status = useLessonStream(`/api/lessons/${lesson.id}/stream?role=student&lang=${encodeURIComponent(lang)}`, onEvent);

  const [picking, setPicking] = useState(false);
  const [, startTransition] = useTransition();
  const pickLanguage = (code: string) => {
    setPicking(false);
    if (code === lang) return;
    startTransition(async () => {
      const res = await changeLanguageAction(lesson.id, code);
      if (res.ok) {
        setLang(code);
        try {
          const saved = JSON.parse(localStorage.getItem("aula:student") ?? "{}");
          localStorage.setItem("aula:student", JSON.stringify({ ...saved, lang: code }));
        } catch {
          // ignore
        }
      }
    });
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b bg-card/70 px-4 py-2.5 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{lesson.title ?? "Live lesson"}</p>
          <StatusLine status={status} ended={captions.ended} t={t} />
        </div>
        <button
          onClick={() => setPicking(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium focus-visible:ring-3 focus-visible:ring-coral/40 focus-visible:outline-none"
          aria-label={`${t.changeLanguage}: ${language?.name ?? "English"}`}
        >
          <Globe className="size-4 text-ink-2" aria-hidden />
          <span lang={lang} dir={language?.dir}>
            {language?.native ?? "English"}
          </span>
        </button>
      </header>

      <Captions lines={captions.lines} interim={captions.interim} lang={lang} t={t} ended={captions.ended} />

      <Sheet open={picking} onOpenChange={setPicking}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t.chooseLanguage}</SheetTitle>
            <SheetDescription className="sr-only">Captions will switch to this language.</SheetDescription>
          </SheetHeader>
          <ul className="grid grid-cols-2 gap-2 px-4 pb-6">
            {[{ code: "en", native: "English", name: "English", dir: "ltr" as const, beta: false }, ...LANGUAGES].map((o) => (
              <li key={o.code}>
                <button
                  onClick={() => pickLanguage(o.code)}
                  aria-pressed={o.code === lang}
                  className={cn("w-full rounded-xl border px-3 py-2.5 text-start", o.code === lang ? "border-coral bg-coral-soft" : "bg-card")}
                >
                  <span lang={o.code} dir={o.dir} className="block text-lg font-medium">
                    {o.native}
                  </span>
                  <span className="text-xs text-ink-2">{o.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusLine({ status, ended, t }: { status: StreamStatus; ended: boolean; t: StudentStrings }) {
  if (ended) return <p className="text-xs text-ink-2">{t.ended}</p>;
  const ok = status === "live";
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", ok ? "text-sage" : "text-coral")} role="status">
      <span className={cn("size-1.5 rounded-full", ok ? "animate-pulse-soft bg-sage" : "bg-coral")} aria-hidden />
      {status === "live" ? t.live : status === "offline" ? t.offline : t.reconnecting}
    </p>
  );
}

function Captions({ lines, interim, lang, t, ended }: { lines: CaptionLine[]; interim: string; lang: string; t: StudentStrings; ended: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const language = getLanguage(lang);

  useEffect(() => {
    const el = ref.current;
    if (el && atBottom) el.scrollTo({ top: el.scrollHeight });
  }, [lines, interim, atBottom]);

  // Screen readers: announce each finished line once, in the student's
  // language when it's ready, without reading every interim word.
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef(new Set<number>());
  useEffect(() => {
    const ready = lines.filter((l) => !announced.current.has(l.seq) && l.trStatus !== "pending");
    if (!ready.length) return;
    for (const l of ready) announced.current.add(l.seq);
    const last = ready[ready.length - 1];
    setAnnouncement(last.tr?.text ?? last.fix ?? last.en);
  }, [lines]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
        }}
        className="h-full overflow-y-auto px-4 pt-4 pb-8"
      >
        {lines.length === 0 && !interim ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2.5 animate-pulse-soft rounded-full bg-ink-3" style={{ animationDelay: `${i * 0.3}s` }} />
              ))}
            </div>
            <p className="text-lg text-ink-2">{ended ? t.ended : t.waiting}</p>
          </div>
        ) : (
          <ol className="mx-auto max-w-2xl space-y-5">
            {lines.map((line, i) => (
              <CaptionItem key={line.seq} line={line} latest={i === lines.length - 1} lang={lang} dir={language?.dir ?? "ltr"} t={t} />
            ))}
          </ol>
        )}
        {interim && !ended && (
          <div className="mx-auto mt-5 max-w-2xl border-s-2 border-ink-3/40 ps-3" aria-hidden>
            <p className="text-xs text-ink-3">{t.teacherSpeaking}</p>
            <p lang="en" dir="ltr" className="text-lg text-ink-2 italic">
              {interim}
            </p>
          </div>
        )}
        {ended && lines.length > 0 && <p className="mx-auto mt-8 max-w-2xl rounded-xl bg-secondary px-4 py-3 text-center text-ink-2">{t.ended}</p>}
      </div>

      {!atBottom && (
        <button
          onClick={() => setAtBottom(true)}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper shadow-lg"
        >
          <ArrowDown className="size-4" aria-hidden />
          {t.newLines}
        </button>
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}

function CaptionItem({ line, latest, lang, dir, t }: { line: CaptionLine; latest: boolean; lang: string; dir: "ltr" | "rtl"; t: StudentStrings }) {
  const english = line.fix ?? line.en;
  const faded = latest ? "" : "opacity-80";

  if (lang === "en" || line.trStatus === "none") {
    return (
      <li lang="en" dir="ltr" className={cn("text-[1.35rem] leading-relaxed", faded)}>
        {english}
      </li>
    );
  }

  return (
    <li className={faded}>
      {line.tr ? (
        <p lang={lang} dir={dir} className="text-[1.45rem] leading-relaxed font-medium">
          {line.tr.text}
        </p>
      ) : (
        <p lang="en" dir="ltr" className="text-[1.35rem] leading-relaxed text-ink-2">
          {english}
        </p>
      )}
      {line.tr && (
        <p lang="en" dir="ltr" className="mt-1 text-sm leading-snug text-ink-2">
          {english}
        </p>
      )}
      {line.trStatus === "pending" && <p className="mt-1 text-xs text-ink-3">{t.translating}</p>}
      {line.trStatus === "failed" && <p className="mt-1 text-xs text-ink-3">{t.translationUnavailable}</p>}
    </li>
  );
}
