"use client";

import { ArrowDown, BookOpen, Check, Globe, SlidersHorizontal, Volume2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { changeLanguageAction } from "@/app/actions/join";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLessonStream, type StreamEvent, type StreamStatus } from "@/hooks/use-lesson-stream";
import { applyCaptionEvent, emptyCaptions, type CaptionEvent, type CaptionLine } from "@/lib/captions";
import { highlight } from "@/lib/highlight";
import { getLanguage, LANGUAGES } from "@/lib/languages";
import { findKeyTerms, termKey } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { studentStrings, type StudentStrings } from "@/i18n/student";
import { StudentActions, type MyQuestion } from "./student-actions";

type Props = {
  lesson: { id: string; code: string; title: string | null; subject: string | null; status: "LIVE" | "ENDED"; keyTerms: string[] };
  me: { nickname: string; lang: string };
};

type Glossary = Record<string, { tr: string; gloss: string }>;
type OpenTerm = { en: string; tr?: string };

const PREFS_KEY = "aula:student";
const WORDS_KEY = "aula:words";

function readPrefs(): { bilingual?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writePrefs(patch: Record<string, unknown>) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // storage may be disabled
  }
}

export function StudentLive({ lesson, me }: Props) {
  const [lang, setLang] = useState(me.lang);
  const wantsTranslation = lang !== "en";
  const reducer = useCallback((s: typeof emptyCaptions, e: CaptionEvent) => applyCaptionEvent(s, e, wantsTranslation), [wantsTranslation]);
  const [captions, dispatch] = useReducer(reducer, { ...emptyCaptions, ended: lesson.status === "ENDED" });
  const [glossary, setGlossary] = useState<Glossary>({});
  const [bilingual, setBilingual] = useState(true);
  const [openTerm, setOpenTerm] = useState<OpenTerm | null>(null);
  const [questions, setQuestions] = useState<MyQuestion[]>([]);
  const [recap, setRecap] = useState<{ status: string; recapId: string | null }>({ status: "NONE", recapId: null });
  const t = studentStrings(lang);
  const language = getLanguage(lang);

  useEffect(() => {
    const saved = readPrefs();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a saved preference after hydration
    if (saved.bilingual === false) setBilingual(false);
  }, []);

  const addGlossary = useCallback((entries: { en: string; tr: string; gloss: string }[], replace = false) => {
    setGlossary((g) => {
      const next = replace ? {} : { ...g };
      for (const e of entries) next[termKey(e.en)] = { tr: e.tr, gloss: e.gloss };
      return next;
    });
  }, []);

  const onEvent = useCallback(
    (e: StreamEvent) => {
      if (e.type === "glossary") return addGlossary((e.data as { terms: { en: string; tr: string; gloss: string }[] }).terms);
      if (e.type === "recap") {
        const r = e.data as { status: string; recapId?: string };
        return setRecap((prev) => ({ status: r.status, recapId: r.recapId ?? prev.recapId }));
      }
      if (e.type === "question-status") {
        const { id } = e.data as { id: string };
        return setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, answered: true } : q)));
      }
      if (e.type === "snapshot") {
        const data = e.data as { glossary?: { en: string; tr: string; gloss: string }[]; questions?: MyQuestion[]; recap?: { status: string; recapId: string | null } };
        addGlossary(data.glossary ?? [], true);
        setQuestions(data.questions ?? []);
        if (data.recap) setRecap(data.recap);
      }
      dispatch(e as CaptionEvent);
    },
    [addGlossary],
  );
  // `lang` is in the URL so switching language opens a fresh stream (and a
  // fresh snapshot in the new language).
  const status = useLessonStream(`/api/lessons/${lesson.id}/stream?role=student&lang=${encodeURIComponent(lang)}`, onEvent);

  const [panel, setPanel] = useState<"lang" | "settings" | null>(null);
  const [, startTransition] = useTransition();
  const pickLanguage = (code: string) => {
    setPanel(null);
    if (code === lang) return;
    startTransition(async () => {
      const res = await changeLanguageAction(lesson.id, code);
      if (res.ok) {
        setLang(code);
        writePrefs({ lang: code });
      }
    });
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 border-b bg-card/70 px-4 py-2.5 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{lesson.title ?? "Live lesson"}</p>
          <StatusLine status={status} ended={captions.ended} t={t} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setPanel("lang")}
            className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium focus-visible:ring-3 focus-visible:ring-coral/40 focus-visible:outline-none"
            aria-label={`${t.changeLanguage}: ${language?.name ?? "English"}`}
          >
            <Globe className="size-4 text-ink-2" aria-hidden />
            <span lang={lang} dir={language?.dir}>
              {language?.native ?? "English"}
            </span>
          </button>
          <button
            onClick={() => setPanel("settings")}
            className="rounded-full border bg-card p-2 focus-visible:ring-3 focus-visible:ring-coral/40 focus-visible:outline-none"
            aria-label={t.settings}
          >
            <SlidersHorizontal className="size-4 text-ink-2" aria-hidden />
          </button>
        </div>
      </header>

      <Captions
        lines={captions.lines}
        interim={captions.interim}
        lang={lang}
        t={t}
        ended={captions.ended}
        bilingual={bilingual}
        keyTerms={lesson.keyTerms}
        onTerm={setOpenTerm}
      />

      <Sheet open={panel === "lang"} onOpenChange={(o) => setPanel(o ? "lang" : null)}>
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
                  <span className="text-xs text-ink-2">
                    {o.name}
                    {o.beta && <span className="ms-1.5 rounded bg-secondary px-1 py-px text-[10px] font-semibold tracking-wide uppercase">beta</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <Sheet open={panel === "settings"} onOpenChange={(o) => setPanel(o ? "settings" : null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t.settings}</SheetTitle>
            <SheetDescription className="sr-only">Caption display options.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-coral"
                checked={bilingual}
                onChange={(e) => {
                  setBilingual(e.target.checked);
                  writePrefs({ bilingual: e.target.checked });
                }}
              />
              <span>
                <span className="block font-medium">{t.showEnglish}</span>
                <span className="text-sm text-ink-2">{t.showEnglishHelp}</span>
              </span>
            </label>
          </div>
        </SheetContent>
      </Sheet>

      {captions.ended && <RecapBar recap={recap} lang={lang} t={t} />}

      {!captions.ended && (
        <StudentActions
          lessonId={lesson.id}
          latestSeq={captions.lines.at(-1)?.seq ?? null}
          t={t}
          questions={questions}
          onAsked={(q) => setQuestions((qs) => [...qs, q])}
        />
      )}

      <TermSheet term={openTerm} onClose={() => setOpenTerm(null)} lang={lang} glossary={glossary} t={t} lessonTitle={lesson.title} />
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

type CaptionsProps = {
  lines: CaptionLine[];
  interim: string;
  lang: string;
  t: StudentStrings;
  ended: boolean;
  bilingual: boolean;
  keyTerms: string[];
  onTerm: (term: OpenTerm) => void;
};

function Captions({ lines, interim, lang, t, ended, bilingual, keyTerms, onTerm }: CaptionsProps) {
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
              <CaptionItem
                key={line.seq}
                line={line}
                latest={i === lines.length - 1}
                lang={lang}
                dir={language?.dir ?? "ltr"}
                t={t}
                bilingual={bilingual}
                keyTerms={keyTerms}
                onTerm={onTerm}
              />
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

function Highlighted({ text, needles, onTerm, variant }: { text: string; needles: { match: string; term: string; tr?: string }[]; onTerm: (t: OpenTerm) => void; variant: "main" | "sub" }) {
  const pieces = useMemo(() => highlight(text, needles), [text, needles]);
  return (
    <>
      {pieces.map((p, i) => {
        if (!p.term) return <span key={i}>{p.text}</span>;
        const needle = needles.find((n) => n.term === p.term);
        return (
          <button
            key={i}
            onClick={() => onTerm({ en: p.term!, tr: needle?.tr })}
            className={cn(
              "rounded-sm underline decoration-2 underline-offset-4 focus-visible:ring-3 focus-visible:ring-coral/40 focus-visible:outline-none",
              variant === "main" ? "bg-highlight px-0.5 text-highlight-ink decoration-saffron" : "decoration-saffron/70",
            )}
          >
            {p.text}
          </button>
        );
      })}
    </>
  );
}

function CaptionItem({
  line,
  latest,
  lang,
  dir,
  t,
  bilingual,
  keyTerms,
  onTerm,
}: {
  line: CaptionLine;
  latest: boolean;
  lang: string;
  dir: "ltr" | "rtl";
  t: StudentStrings;
  bilingual: boolean;
  keyTerms: string[];
  onTerm: (term: OpenTerm) => void;
}) {
  const english = line.fix ?? line.en;
  const faded = latest ? "" : "opacity-80";
  const trTerms = useMemo(() => line.tr?.terms ?? [], [line.tr]);
  // English highlights: the translation's terms when we have them,
  // otherwise the teacher's key terms we can find in the sentence.
  const enNeedles = useMemo(() => {
    const terms = trTerms.length ? trTerms.map((x) => x.en) : findKeyTerms(english, keyTerms);
    return terms.map((term) => ({ match: term, term, tr: trTerms.find((x) => x.en === term)?.tr }));
  }, [trTerms, english, keyTerms]);
  const trNeedles = useMemo(() => trTerms.map((x) => ({ match: x.tr, term: x.en, tr: x.tr })), [trTerms]);

  if (lang === "en" || line.trStatus === "none") {
    return (
      <li lang="en" dir="ltr" className={cn("text-[1.35rem] leading-relaxed", faded)}>
        <Highlighted text={english} needles={enNeedles} onTerm={onTerm} variant="main" />
      </li>
    );
  }

  return (
    <li className={faded}>
      {line.tr ? (
        <p lang={lang} dir={dir} className="text-[1.45rem] leading-relaxed font-medium">
          <Highlighted text={line.tr.text} needles={trNeedles} onTerm={onTerm} variant="main" />
        </p>
      ) : (
        <p lang="en" dir="ltr" className="text-[1.35rem] leading-relaxed text-ink-2">
          <Highlighted text={english} needles={enNeedles} onTerm={onTerm} variant="main" />
        </p>
      )}
      {line.tr && bilingual && (
        <p lang="en" dir="ltr" className="mt-1 text-sm leading-snug text-ink-2">
          <Highlighted text={english} needles={enNeedles} onTerm={onTerm} variant="sub" />
        </p>
      )}
      {line.trStatus === "pending" && <p className="mt-1 text-xs text-ink-3">{t.translating}</p>}
      {line.trStatus === "failed" && <p className="mt-1 text-xs text-ink-3">{t.translationUnavailable}</p>}
    </li>
  );
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.85;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("en-US")) ?? window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

function saveWord(word: { en: string; tr?: string; gloss?: string; lang: string; lesson: string | null }) {
  try {
    const words = JSON.parse(localStorage.getItem(WORDS_KEY) ?? "[]") as (typeof word & { savedAt: number })[];
    if (!words.some((w) => termKey(w.en) === termKey(word.en) && w.lang === word.lang)) {
      words.unshift({ ...word, savedAt: Date.now() });
      localStorage.setItem(WORDS_KEY, JSON.stringify(words.slice(0, 300)));
    }
  } catch {
    // storage may be disabled
  }
}

function TermSheet({ term, onClose, lang, glossary, t, lessonTitle }: { term: OpenTerm | null; onClose: () => void; lang: string; glossary: Glossary; t: StudentStrings; lessonTitle: string | null }) {
  const entry = term ? glossary[termKey(term.en)] : undefined;
  const tr = term?.tr ?? entry?.tr;
  const language = getLanguage(lang);

  useEffect(() => {
    if (term) saveWord({ en: term.en, tr, gloss: entry?.gloss, lang, lesson: lessonTitle });
  }, [term, tr, entry?.gloss, lang, lessonTitle]);

  return (
    <Sheet open={Boolean(term)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        {term && (
          <div className="px-5 pt-2 pb-8">
            <SheetHeader className="p-0">
              <SheetTitle lang="en" className="font-display text-3xl font-semibold">
                {term.en}
              </SheetTitle>
              <SheetDescription className="sr-only">Vocabulary word</SheetDescription>
            </SheetHeader>
            <button onClick={() => speak(term.en)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper">
              <Volume2 className="size-4" aria-hidden />
              {t.hearIt}
            </button>
            {lang !== "en" && tr && (
              <p lang={lang} dir={language?.dir} className="mt-5 text-2xl font-medium">
                {tr}
              </p>
            )}
            <p lang={lang} dir={language?.dir} className={cn("mt-2 text-lg leading-relaxed", entry?.gloss ? "text-ink" : "text-ink-3")}>
              {entry?.gloss ?? t.definitionComing}
            </p>
            <p className="mt-5 flex items-center gap-1.5 text-sm text-sage">
              <Check className="size-4" aria-hidden />
              {t.savedToWords}
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RecapBar({ recap, lang, t }: { recap: { status: string; recapId: string | null }; lang: string; t: StudentStrings }) {
  return (
    <div className="border-t bg-card/90 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" role="status" aria-live="polite">
      <div className="mx-auto max-w-2xl">
        {recap.status === "READY" && recap.recapId ? (
          <Link
            href={`/r/${recap.recapId}?lang=${encodeURIComponent(lang)}`}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-coral text-base font-semibold text-primary-foreground"
          >
            <BookOpen className="size-5" aria-hidden />
            {t.readRecap}
          </Link>
        ) : recap.status === "GENERATING" ? (
          <p className="flex items-center justify-center gap-2 py-3 text-ink-2">
            <span className="size-2 animate-pulse-soft rounded-full bg-coral" aria-hidden />
            {t.recapWriting}
          </p>
        ) : recap.status === "FAILED" ? (
          <p className="py-3 text-center text-ink-2">{t.recapFailed}</p>
        ) : (
          <p className="py-3 text-center text-ink-2">{t.ended}</p>
        )}
      </div>
    </div>
  );
}
