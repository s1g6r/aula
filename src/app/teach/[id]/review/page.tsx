import { ArrowLeft, HelpCircle } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentTeacher } from "@/auth";
import type { Recap } from "@/lib/ai/schemas";
import { db } from "@/lib/db";
import { getLanguage } from "@/lib/languages";
import { summarizeSignals } from "@/lib/signals";
import { DeleteLesson, ReviewRecap } from "@/components/review/review-actions";
import { Timeline } from "@/components/review/timeline";

export const metadata = { title: "Lesson review" };

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// After class: where students got lost, what they asked, the recap, and a
// way to delete it all.
export default async function ReviewPage(props: PageProps<"/teach/[id]/review">) {
  const { id } = await props.params;
  const teacher = await currentTeacher();
  if (!teacher) redirect("/login");
  const lesson = await db.lesson.findUnique({
    where: { id },
    include: {
      segments: { orderBy: { seq: "asc" }, select: { seq: true, text: true, fixedText: true, startedAt: true } },
      signals: { select: { type: true, seq: true, createdAt: true, participantId: true } },
      questions: { where: { hidden: false }, orderBy: { createdAt: "asc" }, include: { participant: { select: { nickname: true } } } },
      participants: { select: { lang: true } },
      recap: { select: { id: true, content: true } },
    },
  });
  if (!lesson || lesson.teacherId !== teacher.id) notFound();
  if (lesson.status === "LIVE") redirect(`/teach/${id}`);

  const start = lesson.startedAt.getTime();
  const end = (lesson.endedAt ?? lesson.segments.at(-1)?.startedAt ?? lesson.startedAt).getTime();
  const durationSec = Math.max(60, (end - start) / 1000);
  const summary = summarizeSignals(
    lesson.signals.map((s) => ({ type: s.type, seq: s.seq, at: s.createdAt.getTime(), participantId: s.participantId })),
    end,
  );
  const points = lesson.segments.map((s) => ({
    seq: s.seq,
    offsetSec: Math.max(0, (s.startedAt.getTime() - start) / 1000),
    lost: summary.totals[s.seq] ?? 0,
    text: s.fixedText ?? s.text,
  }));
  const moments = [...points].filter((p) => p.lost > 0).sort((a, b) => b.lost - a.lost || a.seq - b.seq).slice(0, 3);
  const slower = new Set(lesson.signals.filter((s) => s.type === "SLOWER").map((s) => s.participantId)).size;
  const langCounts = lesson.participants.reduce<Record<string, number>>((m, p) => ((m[p.lang] = (m[p.lang] ?? 0) + 1), m), {});
  const [latencies, flaggedRows] = await Promise.all([
    db.translation.findMany({ where: { segment: { lessonId: id }, latencyMs: { not: null } }, select: { latencyMs: true } }),
    db.translation.findMany({
      where: { segment: { lessonId: id }, flags: { some: {} } },
      select: { lang: true, text: true, _count: { select: { flags: true } }, segment: { select: { seq: true, text: true, fixedText: true } } },
      orderBy: { segment: { seq: "asc" } },
    }),
  ]);
  const sorted = latencies.map((l) => l.latencyMs!).sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;

  const stats = [
    { label: "Students", value: String(lesson.participants.length) },
    { label: "Languages", value: String(Object.keys(langCounts).length) },
    { label: "Sentences", value: String(lesson.segments.length) },
    { label: "Questions", value: String(lesson.questions.length) },
    { label: "Translation speed", value: p50 === null ? "n/a" : `${(p50 / 1000).toFixed(1)}s`, hint: "median" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-6">
      <Link href="/teach" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Your lessons
      </Link>

      <header className="mt-6">
        <p className="text-sm font-semibold tracking-wide text-coral uppercase">Lesson review</p>
        <h1 className="mt-1 text-4xl font-semibold">{lesson.title ?? "Untitled lesson"}</h1>
        <p className="mt-2 text-ink-2">
          {[lesson.subject, lesson.startedAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), mmss(durationSec)].filter(Boolean).join(" · ")}
        </p>
        {Object.keys(langCounts).length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {Object.entries(langCounts).map(([code, n]) => (
              <li key={code} className="rounded-full bg-secondary px-3 py-1 text-sm">
                {code === "en" ? "English" : (getLanguage(code)?.name ?? code)} <span className="font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card p-4">
            <dt className="text-sm text-ink-2">{s.label}</dt>
            <dd className="mt-1 font-display text-3xl font-semibold tabular-nums">{s.value}</dd>
            {s.hint && <dd className="text-xs text-ink-3">{s.hint}</dd>}
          </div>
        ))}
      </dl>

      <section aria-labelledby="timeline-h" className="mt-8 rounded-2xl border bg-card p-6">
        <h2 id="timeline-h" className="text-xl font-semibold">
          Where students got lost
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Each tick is a sentence you said. Bars show how many students tapped &ldquo;I&rsquo;m lost&rdquo; there.
          {slower > 0 && ` ${slower} ${slower === 1 ? "student" : "students"} also asked you to slow down.`}
        </p>
        {lesson.segments.length === 0 ? (
          <p className="mt-6 text-ink-2">This lesson has no transcript.</p>
        ) : (
          <Timeline durationSec={durationSec} points={points} />
        )}
        {moments.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold">Worth re-teaching tomorrow</h3>
            <ol className="mt-3 space-y-2">
              {moments.map((m) => (
                <li key={m.seq} className="flex gap-3 rounded-xl bg-coral-soft p-3">
                  <HelpCircle className="mt-0.5 size-5 shrink-0 text-coral" aria-hidden />
                  <div>
                    <p>&ldquo;{m.text}&rdquo;</p>
                    <p className="mt-0.5 text-sm text-ink-2">
                      {mmss(m.offsetSec)} · {m.lost} {m.lost === 1 ? "student" : "students"} lost
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="recap-h" className="rounded-2xl border bg-card p-6">
          <h2 id="recap-h" className="mb-3 text-xl font-semibold">
            Recap
          </h2>
          <ReviewRecap lessonId={id} initial={{ status: lesson.recapStatus, recapId: lesson.recap?.id ?? null, content: (lesson.recap?.content as Recap | undefined) ?? null }} />
        </section>

        <section aria-labelledby="qs-h" className="rounded-2xl border bg-card p-6">
          <h2 id="qs-h" className="mb-3 text-xl font-semibold">
            Questions
          </h2>
          {lesson.questions.length === 0 ? (
            <p className="text-ink-2">No questions in this lesson.</p>
          ) : (
            <ul className="space-y-3">
              {lesson.questions.map((q) => {
                const lang = getLanguage(q.lang);
                return (
                  <li key={q.id} className="rounded-xl border p-3">
                    <p className="font-medium">{q.english ?? q.original}</p>
                    {q.lang !== "en" && (
                      <p lang={q.lang} dir={lang?.dir} className="mt-1 text-sm text-ink-2">
                        {q.original}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-ink-3">
                      {q.participant.nickname} · {q.answeredAt ? "answered" : "not marked answered"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {flaggedRows.length > 0 && (
        <section aria-labelledby="flags-h" className="mt-6 rounded-2xl border bg-card p-6">
          <h2 id="flags-h" className="text-xl font-semibold">
            Translations students flagged
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-2">Students tapped &ldquo;this translation looks wrong&rdquo; on these lines. Worth checking with them, or saying again more simply.</p>
          <ul className="space-y-3">
            {flaggedRows.map((f) => {
              const l = getLanguage(f.lang);
              return (
                <li key={`${f.segment.seq}|${f.lang}`} className="rounded-xl border p-3">
                  <p>{f.segment.fixedText ?? f.segment.text}</p>
                  <p lang={f.lang} dir={l?.dir} className="mt-1 text-sm text-ink-2">
                    {f.text}
                  </p>
                  <p className="mt-1 text-xs text-ink-3">
                    {l?.name ?? f.lang} · flagged by {f._count.flags} {f._count.flags === 1 ? "student" : "students"}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="privacy-h" className="mt-6 rounded-2xl border bg-card p-6">
        <h2 id="privacy-h" className="text-xl font-semibold">
          Your data
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-2">
          This lesson deletes itself on {lesson.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric" })}. You can delete it now: the transcript, translations, signals, questions and recap all go with it.
        </p>
        <DeleteLesson lessonId={id} />
      </section>
    </div>
  );
}
