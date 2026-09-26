import { bus } from "@/lib/realtime/bus";
import { endLesson, requireTeacherLesson } from "@/lib/server/lessons";

// POST /api/lessons/:id/end
export async function POST(_request: Request, ctx: RouteContext<"/api/lessons/[id]/end">) {
  const { id } = await ctx.params;
  const access = await requireTeacherLesson(id);
  if ("error" in access) return access.error;
  if (access.lesson.status === "LIVE") {
    await endLesson(id);
    bus.publish(id, "lesson-ended", {});
  }
  return Response.json({ ok: true });
}
