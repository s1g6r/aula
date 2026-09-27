import { db } from "@/lib/db";
import { forgetLessonPipeline } from "@/lib/pipeline";
import { bus } from "@/lib/realtime/bus";
import { forgetLesson, requireTeacherLesson } from "@/lib/server/lessons";
import { forgetSignals } from "@/lib/server/signals";

// DELETE /api/lessons/:id
// The teacher deletes a lesson: its transcript, translations, signals,
// questions and recap all go with it (database cascades).
export async function DELETE(_request: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const { id } = await ctx.params;
  const access = await requireTeacherLesson(id);
  if ("error" in access) return access.error;
  const row = await db.lesson.findUnique({ where: { id }, select: { isReplay: true } });
  if (row?.isReplay) return Response.json({ error: "The demo lesson can't be deleted" }, { status: 403 });
  bus.publish(id, "lesson-ended", {});
  await db.lesson.delete({ where: { id } });
  forgetLesson(id);
  forgetSignals(id);
  forgetLessonPipeline(id);
  bus.forget(id);
  return Response.json({ ok: true });
}
