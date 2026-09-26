import { z } from "zod";
import { db } from "@/lib/db";
import { bus } from "@/lib/realtime/bus";
import { jsonError, readJson } from "@/lib/server/http";
import { nextSeq, requireTeacherLesson } from "@/lib/server/lessons";

// POST /api/lessons/:id/segments { text, startedAt }
// A finished sentence from the teacher (from speech recognition or typed).
// Saved, then broadcast in English right away. Translation follows (P3).

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

  await db.segment.create({ data: { lessonId: id, seq, text: body.data.text, startedAt } });
  bus.publish(id, "segment", { seq, text: body.data.text, startedAt: startedAt.toISOString() });
  return Response.json({ seq });
}
