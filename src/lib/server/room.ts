import type { CaptionTerm } from "@/lib/captions";
import { db } from "@/lib/db";
import { bus } from "@/lib/realtime/bus";
import { getLesson } from "./lessons";
import { getParticipantsById } from "./participants";
import { myQuestions, teacherQuestions } from "./questions";
import { signalSummary } from "./signals";

// What the teacher sees about the room: how many students, which languages,
// and nicknames. Nicknames only ever go to the teacher's screen.
export async function roomState(lessonId: string) {
  const presence = bus.presence(lessonId);
  const people = await getParticipantsById(presence.participantIds);
  return {
    students: presence.students,
    langs: presence.langs,
    participants: people.map((p) => ({ id: p.id, nickname: p.nickname, lang: p.lang, muted: p.muted })),
  };
}

export async function publishRoom(lessonId: string): Promise<void> {
  bus.publish(lessonId, "room", await roomState(lessonId), "teacher");
}

type SnapshotSegment = {
  seq: number;
  text: string;
  fixedText: string | null;
  startedAt: string;
  tr: { text: string; terms: CaptionTerm[] } | null;
};

// Everything a screen needs to draw the lesson from scratch: sent on first
// connect, and on reconnect when the missed events are no longer buffered.
async function recapInfo(lessonId: string) {
  const row = await db.lesson.findUnique({ where: { id: lessonId }, select: { recapStatus: true, recap: { select: { id: true } } } });
  return { status: row?.recapStatus ?? "NONE", recapId: row?.recap?.id ?? null };
}

export async function studentSnapshot(lessonId: string, lang: string, participantId: string) {
  const [lesson, glossary, questions, recap, segments] = await Promise.all([
    getLesson(lessonId),
    db.term.findMany({ where: { lessonId, lang }, select: { en: true, tr: true, gloss: true } }),
    myQuestions(lessonId, participantId),
    recapInfo(lessonId),
    db.segment.findMany({
      where: { lessonId },
      orderBy: { seq: "asc" },
      select: {
        seq: true,
        text: true,
        fixedText: true,
        startedAt: true,
        translations: { where: { lang }, select: { text: true, terms: true } },
      },
    }),
  ]);
  return {
    ended: lesson?.status === "ENDED",
    glossary,
    questions,
    recap,
    segments: segments.map((s): SnapshotSegment => ({
      seq: s.seq,
      text: s.text,
      fixedText: s.fixedText,
      startedAt: s.startedAt.toISOString(),
      // terms were validated by the AI schema before they were saved
      tr: s.translations[0] ? { text: s.translations[0].text, terms: s.translations[0].terms as CaptionTerm[] } : null,
    })),
  };
}

export async function teacherSnapshot(lessonId: string) {
  const [lesson, segments, room, signals, questions, recap] = await Promise.all([
    getLesson(lessonId),
    db.segment.findMany({ where: { lessonId }, orderBy: { seq: "asc" }, select: { seq: true, text: true, fixedText: true, startedAt: true } }),
    roomState(lessonId),
    signalSummary(lessonId),
    teacherQuestions(lessonId),
    recapInfo(lessonId),
  ]);
  return {
    ended: lesson?.status === "ENDED",
    segments: segments.map((s) => ({ seq: s.seq, text: s.text, fixedText: s.fixedText, startedAt: s.startedAt.toISOString(), tr: null })),
    room,
    signals,
    questions,
    recap,
  };
}
