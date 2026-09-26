import { db } from "@/lib/db";
import { isProfane } from "@/lib/profanity";
import { translateQuestion } from "@/lib/pipeline";
import { bus } from "@/lib/realtime/bus";
import type { LessonMeta } from "./lessons";
import type { ParticipantInfo } from "./participants";

// Questions students type in their own language. Only the teacher ever sees
// them, in English with the original underneath. The AI only translates;
// the teacher answers. Questions from a muted student, or ones the light
// profanity filter flags, are saved but never shown.

export type TeacherQuestion = {
  id: string;
  nickname: string;
  participantId: string;
  lang: string;
  original: string;
  english: string | null;
  translating: boolean;
  answered: boolean;
  at: string;
};

function toTeacher(q: { id: string; lang: string; original: string; english: string | null; answeredAt: Date | null; createdAt: Date }, who: { id: string; nickname: string }, translating = false): TeacherQuestion {
  return {
    id: q.id,
    nickname: who.nickname,
    participantId: who.id,
    lang: q.lang,
    original: q.original,
    english: q.english,
    translating,
    answered: Boolean(q.answeredAt),
    at: q.createdAt.toISOString(),
  };
}

export async function askQuestion(lesson: LessonMeta, student: ParticipantInfo, text: string): Promise<{ id: string }> {
  const hidden = student.muted || isProfane(text);
  const english = student.lang === "en" ? text : null;
  const q = await db.question.create({
    data: { lessonId: lesson.id, participantId: student.id, lang: student.lang, original: text, english, hidden },
  });
  if (hidden) return { id: q.id };

  bus.publish(lesson.id, "question", toTeacher(q, student, english === null), "teacher");
  if (english === null) {
    void translateQuestion(text, student.lang, lesson.subject).then(async (en) => {
      if (en) await db.question.update({ where: { id: q.id }, data: { english: en } });
      if (en && isProfane(en)) {
        await db.question.update({ where: { id: q.id }, data: { hidden: true } });
        bus.publish(lesson.id, "question-removed", { id: q.id }, "teacher");
        return;
      }
      bus.publish(lesson.id, "question", toTeacher({ ...q, english: en }, student), "teacher");
    });
  }
  return { id: q.id };
}

export async function markAnswered(lessonId: string, questionId: string): Promise<boolean> {
  const q = await db.question.findFirst({ where: { id: questionId, lessonId }, include: { participant: { select: { id: true, nickname: true } } } });
  if (!q) return false;
  const updated = await db.question.update({ where: { id: q.id }, data: { answeredAt: q.answeredAt ?? new Date() } });
  bus.publish(lessonId, "question", toTeacher(updated, q.participant), "teacher");
  bus.publish(lessonId, "question-status", { id: q.id, answered: true }, { participantId: q.participant.id });
  return true;
}

export async function teacherQuestions(lessonId: string): Promise<TeacherQuestion[]> {
  const rows = await db.question.findMany({
    where: { lessonId, hidden: false },
    orderBy: { createdAt: "asc" },
    include: { participant: { select: { id: true, nickname: true } } },
  });
  return rows.map((q) => toTeacher(q, q.participant));
}

export async function myQuestions(lessonId: string, participantId: string) {
  const rows = await db.question.findMany({ where: { lessonId, participantId }, orderBy: { createdAt: "asc" }, select: { id: true, original: true, answeredAt: true } });
  return rows.map((q) => ({ id: q.id, text: q.original, answered: Boolean(q.answeredAt) }));
}
