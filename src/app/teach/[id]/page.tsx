import { notFound, redirect } from "next/navigation";
import { currentTeacher } from "@/auth";
import { TeacherLive } from "@/components/teach/teacher-live";
import { getLesson } from "@/lib/server/lessons";
import { joinUrl, qrSvg } from "@/lib/server/urls";

export async function generateMetadata(props: PageProps<"/teach/[id]">) {
  const lesson = await getLesson((await props.params).id);
  return { title: lesson?.title ?? "Live lesson" };
}

export default async function TeacherLessonPage(props: PageProps<"/teach/[id]">) {
  const { id } = await props.params;
  const teacher = await currentTeacher();
  if (!teacher) redirect("/login");
  const lesson = await getLesson(id);
  if (!lesson || lesson.teacherId !== teacher.id) notFound();
  const url = await joinUrl(lesson.code);
  return (
    <TeacherLive
      lesson={{ id: lesson.id, code: lesson.code, title: lesson.title, subject: lesson.subject, status: lesson.status, startedAt: lesson.startedAt.toISOString() }}
      joinUrl={url}
      qrSvg={await qrSvg(url)}
    />
  );
}
