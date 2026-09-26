import { pipelineStats } from "@/lib/pipeline";
import { requireTeacherLesson } from "@/lib/server/lessons";

// GET /api/lessons/:id/stats (teacher only)
// Translation speed for this lesson and the last AI calls: how long each
// waited, when its first words arrived, and how it ended. Used to measure
// latency in production and to diagnose slow lines.
export async function GET(_request: Request, ctx: RouteContext<"/api/lessons/[id]/stats">) {
  const { id } = await ctx.params;
  const access = await requireTeacherLesson(id);
  if ("error" in access) return access.error;
  return Response.json(pipelineStats(id), { headers: { "Cache-Control": "no-store" } });
}
