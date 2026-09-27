"use client";

import { Volume2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/wordmark";
import type { RecapView as View } from "@/lib/server/recaps";
import { getLanguage, LANGUAGES } from "@/lib/languages";
import { studentStrings } from "@/i18n/student";
import { formatDate } from "@/lib/dates";

type Data = View & { translating?: boolean; draft?: { summary: string[] } | null };

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

// The "What you missed" page. Anyone with the link can read it, in any
// language. If the recap isn't in that language yet, it's translated now and
// the page checks back every couple of seconds: the summary shows up first,
// then the key words and questions.
export function RecapView({ initial, explicitLang }: { initial: Data; explicitLang: boolean }) {
  const [data, setData] = useState<Data>(initial);
  const [lang, setLang] = useState(initial.lang);
  const [gaveUp, setGaveUp] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const t = studentStrings(lang);
  const language = getLanguage(lang);
  const dir = language?.dir ?? "ltr";

  // First visit without ?lang=: use the language this phone used in class.
  useEffect(() => {
    if (explicitLang) return;
    try {
      const saved = JSON.parse(localStorage.getItem("aula:student") ?? "{}") as { lang?: string };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the student's language after hydration
      if (saved.lang && saved.lang !== "en") setLang(saved.lang);
    } catch {
      // ignore
    }
  }, [explicitLang]);

  // Load (and if needed, wait for) the recap in the chosen language.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const load = async () => {
      const res = await fetch(`/api/recaps/${initial.recapId}?lang=${encodeURIComponent(lang)}`);
      if (!res.ok || cancelled) return;
      const next = (await res.json()) as Data;
      setData(next);
      if (lang !== "en" && !next.translated && next.translating && tries++ < 90) setTimeout(load, 2000);
      else setGaveUp(lang !== "en" && !next.translated);
    };
    if (lang !== initial.lang || (lang !== "en" && !initial.translated)) void load();
    return () => {
      cancelled = true;
    };
  }, [lang, initial.recapId, initial.lang, initial.translated]);

  const pick = (code: string) => {
    setGaveUp(false);
    setLang(code);
    router.replace(`${pathname}?lang=${encodeURIComponent(code)}`, { scroll: false });
  };

  const tr = data.lang === lang ? data.translated : null;
  const draft = data.lang === lang && !tr ? data.draft : null;
  const summary = tr?.summary ?? draft?.summary ?? data.english.summary;
  const keyTerms = tr?.keyTerms ?? data.english.keyTerms.map((k) => ({ ...k, tr: null as string | null }));
  const questions = tr?.checkQuestions ?? data.english.checkQuestions;
  const shownLang = tr ? lang : "en";
  const shownDir = tr ? dir : "ltr";
  const waiting = lang !== "en" && !tr && !gaveUp;
  const date = formatDate(data.lesson.date, { weekday: "long", month: "long", day: "numeric" }, shownLang === "en" ? "en-US" : shownLang);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <div className="flex items-center justify-between gap-3">
        <Wordmark />
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">{t.language}</span>
          <select
            value={lang}
            onChange={(e) => pick(e.target.value)}
            className="h-9 rounded-full border border-input bg-card px-3 text-sm focus-visible:ring-3 focus-visible:ring-coral/30 focus-visible:outline-none"
          >
            <option value="en">English</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native} ({l.name})
              </option>
            ))}
          </select>
        </label>
      </div>

      <header className="mt-10">
        <p className="text-sm font-semibold tracking-wide text-coral uppercase" lang={lang}>
          {t.recapTitle}
        </p>
        <h1 className="mt-1 text-4xl leading-tight font-semibold">{data.lesson.title ?? "Lesson recap"}</h1>
        <p className="mt-2 text-ink-2">{[data.lesson.subject, date].filter(Boolean).join(" · ")}</p>
        <p className="mt-4 text-sm text-ink-2" lang={lang} dir={dir}>
          {t.aiNote}
        </p>
      </header>

      {(waiting || (gaveUp && lang !== "en")) && (
        <p role="status" className="mt-6 flex items-center gap-2 rounded-xl bg-highlight/40 px-4 py-3 text-sm" lang={lang} dir={dir}>
          {waiting && <span className="size-2 animate-pulse-soft rounded-full bg-saffron" aria-hidden />}
          {waiting ? t.translatingRecap : t.recapNotTranslated}
        </p>
      )}

      <RecapBody
        summary={summary}
        keyTerms={keyTerms}
        questions={questions}
        shownLang={shownLang}
        shownDir={shownDir}
        summaryLang={draft ? lang : undefined}
        summaryDir={draft ? dir : undefined}
        lang={lang}
      />

      <details className="mt-12 rounded-2xl border bg-card p-4">
        <summary className="cursor-pointer text-lg font-semibold" lang={lang}>
          {t.fullLesson}
        </summary>
        <ol className="mt-4 space-y-3">
          {data.transcript.map((line) => (
            <li key={line.seq}>
              {line.tr && data.lang === lang && (
                <p lang={lang} dir={dir}>
                  {line.tr}
                </p>
              )}
              <p lang="en" className={line.tr && data.lang === lang ? "text-sm text-ink-2" : ""}>
                {line.en}
              </p>
            </li>
          ))}
        </ol>
      </details>

      <footer className="mt-16 text-center text-sm text-ink-2">
        Made with{" "}
        <Link href="/" className="font-medium text-coral underline underline-offset-4">
          Aula
        </Link>: live classroom captions in every student&rsquo;s language.
      </footer>
    </main>
  );
}

export type RecapBodyProps = {
  summary: string[];
  keyTerms: { term: string; tr: string | null; definition: string }[];
  questions: { q: string; answer: string }[];
  // Language the content is in (falls back to English while translating).
  shownLang: string;
  shownDir: "ltr" | "rtl";
  // The summary is translated first, so it can be in the reader's language
  // while the rest is still English.
  summaryLang?: string;
  summaryDir?: "ltr" | "rtl";
  // The reader's language, for headings.
  lang: string;
  compact?: boolean;
};

// The recap itself: what we learned, key words, check yourself. Shared by
// the "What you missed" page and the Demo Replay's phone.
export function RecapBody({ summary, keyTerms, questions, shownLang, shownDir, summaryLang, summaryDir, lang, compact = false }: RecapBodyProps) {
  const t = studentStrings(lang);
  return (
    <>
      <section aria-labelledby="learned" className={compact ? "mt-4" : "mt-10"}>
        <h2 id="learned" className="text-2xl font-semibold" lang={lang}>
          {t.whatWeLearned}
        </h2>
        <ol className="mt-4 space-y-3">
          {summary.map((line, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-coral-soft text-sm font-semibold text-coral">{i + 1}</span>
              <p lang={summaryLang ?? shownLang} dir={summaryDir ?? shownDir} className="text-lg leading-relaxed">
                {line}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {keyTerms.length > 0 && (
        <section aria-labelledby="words" className={compact ? "mt-8" : "mt-12"}>
          <h2 id="words" className="text-2xl font-semibold" lang={lang}>
            {t.keyWords}
          </h2>
          <ul className={compact ? "mt-3 grid gap-3" : "mt-4 grid gap-3 sm:grid-cols-2"}>
            {keyTerms.map((k) => (
              <li key={k.term} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p lang="en" className="font-display text-xl font-semibold">
                    {k.term}
                  </p>
                  <button onClick={() => speak(k.term)} className="rounded-full bg-secondary p-2" aria-label={`${t.hearIt}: ${k.term}`}>
                    <Volume2 className="size-4" aria-hidden />
                  </button>
                </div>
                {k.tr && (
                  <p lang={shownLang} dir={shownDir} className="mt-1 font-medium">
                    {k.tr}
                  </p>
                )}
                <p lang={shownLang} dir={shownDir} className="mt-1 text-ink-2">
                  {k.definition}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="check" className={compact ? "mt-8" : "mt-12"}>
        <h2 id="check" className="text-2xl font-semibold" lang={lang}>
          {t.checkYourself}
        </h2>
        <ul className="mt-4 space-y-3">
          {questions.map((q, i) => (
            <li key={i} className="rounded-2xl border bg-card p-4">
              <p lang={shownLang} dir={shownDir} className="text-lg font-medium">
                {q.q}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-coral" lang={lang}>
                  {t.showAnswer}
                </summary>
                <p lang={shownLang} dir={shownDir} className="mt-2 text-ink-2">
                  {q.answer}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </section>

    </>
  );
}
