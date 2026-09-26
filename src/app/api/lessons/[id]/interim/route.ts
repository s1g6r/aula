import { z } from "zod";
import { bus } from "@/lib/realtime/bus";
import { jsonError, readJson } from "@/lib/server/http";
import { requireTeacherLesson } from "@/lib/server/lessons";

// POST /api/lessons/:id/interim { text }
// The words the teacher is saying right now, before speech recognition
// finalizes the sentence. Sent to phones immediately and never stored.
// The teacher's browser throttles this to at most one post per 300ms.

const Body = z.object({ text: z.string().max(2000) });

export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/interim">) {
  const { id } = await ctx.params;
  const access = await requireTeacherLesson(id);
  if ("error" in access) return access.error;
  if (access.lesson.status !== "LIVE") return jsonError(409, "Lesson has ended");
  const body = await readJson(request, Body);
  if ("error" in body) return body.error;
  bus.publish(id, "interim", { text: body.data.text }, "all", { ephemeral: true });
  return new Response(null, { status: 204 });
}
