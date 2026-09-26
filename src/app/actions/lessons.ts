"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { currentTeacher } from "@/auth";
import { parseKeyTerms } from "@/lib/terms";
import { createLesson } from "@/lib/server/lessons";

export type CreateLessonState = { error?: string } | undefined;

const Schema = z.object({
  title: z.string().trim().max(120).optional(),
  subject: z.string().trim().max(60).optional(),
  keyTerms: z.string().max(4000).optional(),
});

export async function createLessonAction(_prev: CreateLessonState, formData: FormData): Promise<CreateLessonState> {
  const teacher = await currentTeacher();
  if (!teacher) redirect("/login");
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const lesson = await createLesson({
    teacherId: teacher.id,
    isGuest: teacher.isGuest,
    title: parsed.data.title,
    subject: parsed.data.subject,
    keyTerms: parseKeyTerms(parsed.data.keyTerms ?? ""),
  });
  redirect(`/teach/${lesson.id}`);
}
