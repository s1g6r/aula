import { z } from "zod";
import { createRateLimiter } from "@/lib/rate-limit";
import { jsonError, readJson } from "@/lib/server/http";
import { requireStudentLesson } from "@/lib/server/lessons";
import { askQuestion } from "@/lib/server/questions";

// POST /api/lessons/:id/questions { text }
// A student's question, in any language. Only the teacher sees it.

const Body = z.object({ text: z.string().trim().min(1, "Type a question").max(300, "Keep it under 300 characters") });
const limiter = createRateLimiter({ windowMs: 30_000, max: 2 });

export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/questions">) {
  const { id } = await ctx.params;
  const access = await requireStudentLesson(id);
  if ("error" in access) return access.error;
  const body = await readJson(request, Body);
  if ("error" in body) return body.error;
  const limit = limiter.check(access.student.id);
  if (!limit.ok) return jsonError(429, "Wait a moment before asking again", { retryAfterMs: limit.retryAfterMs });
  const q = await askQuestion(access.lesson, access.student, body.data.text);
  return Response.json(q);
}
