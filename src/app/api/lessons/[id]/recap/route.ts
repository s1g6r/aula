import { db } from "@/lib/db";
import { generateLessonRecap } from "@/lib/pipeline";
import { jsonError } from "@/lib/server/http";
import { requireTeacherLesson } from "@/lib/server/lessons";

// GET: the recap's status for the teacher. POST: try again after a failure.
export async function GET(_request: Request, ctx: RouteContext<"/api/lessons/[id]/recap">) {
  const { id } = await ctx.params;
  const access = await requireTeacherLesson(id);
  if ("error" in access) return access.error;
  const lesson = await db.lesson.findUnique({ where: { id }, select: { recapStatus: true, recap: { select: { id: true, content: true } } } });
  return Response.json({ status: lesson?.recapStatus ?? "NONE", recapId: lesson?.recap?.id ?? null, content: lesson?.recap?.content ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(_request: Request, ctx: RouteContext<"/api/lessons/[id]/recap">) {
  const { id } = await ctx.params;
  const access = await requireTeacherLesson(id);
  if ("error" in access) return access.error;
  if (access.lesson.status !== "ENDED") return jsonError(409, "End the lesson first");
  void generateLessonRecap(id);
  return Response.json({ ok: true });
}
