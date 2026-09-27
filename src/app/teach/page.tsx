import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { currentTeacher } from "@/auth";
import { CreateLessonForm } from "@/components/teach/create-lesson-form";
import { Wordmark } from "@/components/wordmark";
import { db } from "@/lib/db";

export const metadata = { title: "Your lessons" };

export default async function TeachPage() {
  const teacher = await currentTeacher();
  if (!teacher) redirect("/login");
  const lessons = await db.lesson.findMany({
    where: { teacherId: teacher.id },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: { id: true, code: true, title: true, subject: true, status: true, startedAt: true, _count: { select: { participants: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-6">
      <header className="flex items-center justify-between">
        <Wordmark href="/teach" />
        <div className="flex items-center gap-4 text-sm text-ink-2">
          <span>{teacher.name}</span>
          <form action={signOutAction}>
            <button className="font-medium underline-offset-4 hover:underline">Sign out</button>
          </form>
        </div>
      </header>

      {teacher.isGuest && (
        <p className="mt-6 rounded-xl border border-saffron/40 bg-highlight/40 px-4 py-3 text-sm">
          You&rsquo;re trying Aula as a guest. Lessons you start here delete themselves after 24 hours. We filled in an example so you can
          start right away.
        </p>
      )}

      <main>
        <section aria-labelledby="new-lesson" className="mt-8 rounded-2xl border bg-card p-6 sm:p-8">
          <h1 id="new-lesson" className="text-2xl font-semibold">
            Start a lesson
          </h1>
          <p className="mt-1 mb-6 text-ink-2">Students join with a code or QR. Then just teach: Aula listens and captions.</p>
          <CreateLessonForm example={teacher.isGuest && lessons.length === 0} />
        </section>

        <section aria-labelledby="past" className="mt-10">
          <h2 id="past" className="text-xl font-semibold">
            Your lessons
          </h2>
          {lessons.length === 0 ? (
            <p className="mt-3 text-ink-2">No lessons yet. Your first one will show up here.</p>
          ) : (
            <ul className="mt-4 divide-y rounded-2xl border bg-card">
              {lessons.map((l) => (
                <li key={l.id}>
                  <Link href={l.status === "LIVE" ? `/teach/${l.id}` : `/teach/${l.id}/review`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-secondary/60">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.title || "Untitled lesson"}</p>
                      <p className="text-sm text-ink-2">
                        {[l.subject, l.startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }), `${l._count.participants} students`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {l.status === "LIVE" ? (
                      <span className="shrink-0 rounded-full bg-sage/10 px-2.5 py-1 text-xs font-semibold text-sage">Live · {l.code}</span>
                    ) : (
                      <span className="shrink-0 text-xs text-ink-2">Review</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
