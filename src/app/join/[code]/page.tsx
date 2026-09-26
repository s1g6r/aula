import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinForm } from "@/components/join/join-form";
import { Wordmark } from "@/components/wordmark";
import { normalizeCode } from "@/lib/codes";
import { getLessonByCode } from "@/lib/server/lessons";

export const metadata = { title: "Join a lesson" };

export default async function JoinCodePage(props: PageProps<"/join/[code]">) {
  const code = normalizeCode((await props.params).code);
  const lesson = code ? await getLessonByCode(code) : null;
  if (!lesson) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <Wordmark />
      <div className="mt-10">
        <p className="text-sm font-medium tracking-wide text-coral uppercase">{lesson.subject ?? "Lesson"}</p>
        <h1 className="mt-1 text-3xl font-semibold">{lesson.title ?? "Your class"}</h1>
      </div>
      {lesson.status === "LIVE" ? (
        <div className="mt-8">
          <JoinForm code={lesson.code} />
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border bg-card p-6">
          <p className="font-medium">This lesson has ended.</p>
          <p className="mt-1 text-ink-2">Ask your teacher for the recap link.</p>
          <Link href="/join" className="mt-4 inline-block font-medium text-coral underline underline-offset-4">
            Join a different lesson
          </Link>
        </div>
      )}
    </main>
  );
}
