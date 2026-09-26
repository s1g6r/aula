import { notFound, redirect } from "next/navigation";
import { StudentLive } from "@/components/student/student-live";
import { normalizeCode } from "@/lib/codes";
import { getLessonByCode } from "@/lib/server/lessons";
import { currentParticipant } from "@/lib/server/participants";

export const metadata = { title: "Live lesson" };

export default async function StudentLessonPage(props: PageProps<"/l/[code]">) {
  const code = normalizeCode((await props.params).code);
  const lesson = code ? await getLessonByCode(code) : null;
  if (!lesson) notFound();
  const me = await currentParticipant(lesson.id);
  if (!me) redirect(`/join/${lesson.code}`);
  return (
    <StudentLive
      lesson={{ id: lesson.id, code: lesson.code, title: lesson.title, subject: lesson.subject, status: lesson.status, keyTerms: lesson.keyTerms }}
      me={{ nickname: me.nickname, lang: me.lang }}
    />
  );
}
