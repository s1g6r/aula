import { z } from "zod";
import { db } from "@/lib/db";
import { bus } from "@/lib/realtime/bus";
import { jsonError, readJson } from "@/lib/server/http";
import { requireTeacherLesson } from "@/lib/server/lessons";
import { updateParticipant } from "@/lib/server/participants";
import { publishRoom } from "@/lib/server/room";

// POST /api/lessons/:id/participants/:pid/mute { muted }
// Hides a student's questions from now on (and their earlier ones on the
// teacher's screen). They can still read captions and tap "I'm lost".
const Body = z.object({ muted: z.boolean() });

export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/participants/[pid]/mute">) {
  const { id, pid } = await ctx.params;
  const access = await requireTeacherLesson(id);
  if ("error" in access) return access.error;
  const body = await readJson(request, Body);
  if ("error" in body) return body.error;
  const student = await db.participant.findFirst({ where: { id: pid, lessonId: id }, select: { id: true } });
  if (!student) return jsonError(404, "Student not found");
  await updateParticipant(pid, { muted: body.data.muted });
  if (body.data.muted) {
    const hidden = await db.question.findMany({ where: { lessonId: id, participantId: pid, hidden: false }, select: { id: true } });
    await db.question.updateMany({ where: { lessonId: id, participantId: pid }, data: { hidden: true } });
    for (const q of hidden) bus.publish(id, "question-removed", { id: q.id }, "teacher");
  }
  await publishRoom(id);
  return Response.json({ ok: true });
}
