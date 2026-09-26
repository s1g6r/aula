import { jsonError } from "@/lib/server/http";
import { requireTeacherLesson } from "@/lib/server/lessons";
import { markAnswered } from "@/lib/server/questions";

// POST /api/lessons/:id/questions/:qid/answered
// The teacher answered out loud; the student's phone shows "answered".
export async function POST(_request: Request, ctx: RouteContext<"/api/lessons/[id]/questions/[qid]/answered">) {
  const { id, qid } = await ctx.params;
  const access = await requireTeacherLesson(id);
  if ("error" in access) return access.error;
  if (!(await markAnswered(id, qid))) return jsonError(404, "Question not found");
  return Response.json({ ok: true });
}
