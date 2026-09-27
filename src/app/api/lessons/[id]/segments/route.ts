import { z } from "zod";
import { db } from "@/lib/db";
import { bus } from "@/lib/realtime/bus";
import { jsonError, readJson } from "@/lib/server/http";
import { translateSegment } from "@/lib/pipeline";
import { nextSeq, requireTeacherLesson } from "@/lib/server/lessons";
import { repairKeyTerms } from "@/lib/terms";

// POST /api/lessons/:id/segments { text, startedAt }
// A finished sentence from the teacher (from speech recognition or typed).
// Saved, then broadcast in English right away. If speech recognition
// misheard one of the teacher's key terms ("sell membrane"), the repaired
// sentence is shown and translated. Translations for the languages in the
// room follow, streamed in as each one is ready.

const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  startedAt: z.iso.datetime().optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/segments">) {
  const { id } = await ctx.params;
  const access = await requireTeacherLesson(id);
  if ("error" in access) return access.error;
  if (access.lesson.status !== "LIVE") return jsonError(409, "Lesson has ended");
  const body = await readJson(request, Body);
  if ("error" in body) return body.error;

  const seq = await nextSeq(id);
  const now = new Date();
  // Clamp the browser's clock to something sane.
  const claimed = body.data.startedAt ? new Date(body.data.startedAt) : now;
  const startedAt = Math.abs(claimed.getTime() - now.getTime()) > 120_000 ? now : claimed;

  const fixedText = repairKeyTerms(body.data.text, access.lesson.keyTerms);
  const segment = await db.segment.create({ data: { lessonId: id, seq, text: body.data.text, fixedText, startedAt }, select: { id: true } });
  bus.publish(id, "segment", { seq, text: body.data.text, fixedText, startedAt: startedAt.toISOString() });
  void translateSegment(id, { id: segment.id, seq, text: fixedText ?? body.data.text });
  return Response.json({ seq });
}
