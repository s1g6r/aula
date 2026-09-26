import { currentTeacher } from "@/auth";
import { generateCode } from "@/lib/codes";
import { db } from "@/lib/db";
import { env } from "./env";
import { jsonError } from "./http";
import { currentParticipant, type ParticipantInfo } from "./participants";
import { singleton } from "./singleton";

// Lesson facts that every live request needs (who owns it, is it live, key
// terms). Cached in memory because the teacher's browser posts interim text
// several times a second and we don't want a database query each time.

export type LessonMeta = {
  id: string;
  code: string;
  teacherId: string;
  status: "LIVE" | "ENDED";
  title: string | null;
  subject: string | null;
  keyTerms: string[];
  startedAt: Date;
};

const cache = singleton("lessonCache", () => new Map<string, LessonMeta>());
const seqs = singleton("lessonSeqs", () => new Map<string, number>());
const seqInit = singleton("lessonSeqInit", () => new Map<string, Promise<void>>());

const select = { id: true, code: true, teacherId: true, status: true, title: true, subject: true, keyTerms: true, startedAt: true } as const;

export async function getLesson(id: string): Promise<LessonMeta | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const row = await db.lesson.findUnique({ where: { id }, select });
  if (row) cache.set(id, row);
  return row;
}

export async function getLessonByCode(code: string): Promise<LessonMeta | null> {
  for (const l of cache.values()) if (l.code === code) return l;
  const row = await db.lesson.findUnique({ where: { code }, select });
  if (row) cache.set(row.id, row);
  return row;
}

export function forgetLesson(id: string): void {
  cache.delete(id);
  seqs.delete(id);
  seqInit.delete(id);
}

export async function createLesson(input: {
  teacherId: string;
  isGuest: boolean;
  title?: string;
  subject?: string;
  keyTerms: string[];
}): Promise<LessonMeta> {
  const expiresAt = input.isGuest
    ? new Date(Date.now() + env.guestLessonTtlHours * 3600_000)
    : new Date(Date.now() + env.retentionDays * 86_400_000);
  // Codes are random; on the rare collision, try another.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await db.lesson.create({
        data: { code: generateCode(), teacherId: input.teacherId, title: input.title || null, subject: input.subject || null, keyTerms: input.keyTerms, expiresAt },
        select,
      });
      cache.set(row.id, row);
      return row;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new Error("Could not allocate a join code");
}

export async function endLesson(id: string): Promise<void> {
  await db.lesson.update({ where: { id }, data: { status: "ENDED", endedAt: new Date() } });
  const hit = cache.get(id);
  if (hit) hit.status = "ENDED";
}

// Next sentence number for a lesson. The server assigns seq (not the
// browser), so a teacher who reloads the page mid-lesson can't reuse one.
export async function nextSeq(lessonId: string): Promise<number> {
  if (!seqs.has(lessonId)) {
    if (!seqInit.has(lessonId)) {
      seqInit.set(
        lessonId,
        db.segment.aggregate({ where: { lessonId }, _max: { seq: true } }).then((r) => {
          if (!seqs.has(lessonId)) seqs.set(lessonId, r._max.seq ?? 0);
        }),
      );
    }
    await seqInit.get(lessonId);
  }
  const n = (seqs.get(lessonId) ?? 0) + 1;
  seqs.set(lessonId, n);
  return n;
}

// For teacher-only API routes: the lesson, if the signed-in teacher owns it.
export async function requireTeacherLesson(lessonId: string): Promise<{ lesson: LessonMeta } | { error: Response }> {
  const [teacher, lesson] = await Promise.all([currentTeacher(), getLesson(lessonId)]);
  if (!teacher) return { error: jsonError(401, "Sign in first") };
  if (!lesson || lesson.teacherId !== teacher.id) return { error: jsonError(404, "Lesson not found") };
  return { lesson };
}

// For student API routes: the live lesson, and the student in this browser.
export async function requireStudentLesson(lessonId: string): Promise<{ lesson: LessonMeta; student: ParticipantInfo } | { error: Response }> {
  const [lesson, student] = await Promise.all([getLesson(lessonId), currentParticipant(lessonId)]);
  if (!lesson) return { error: jsonError(404, "Lesson not found") };
  if (!student) return { error: jsonError(401, "Join the lesson first") };
  if (lesson.status !== "LIVE") return { error: jsonError(409, "Lesson has ended") };
  return { lesson, student };
}
