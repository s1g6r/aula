import { z } from "zod";
import { createRateLimiter } from "@/lib/rate-limit";
import { jsonError, readJson } from "@/lib/server/http";
import { requireStudentLesson } from "@/lib/server/lessons";
import { recordSignal } from "@/lib/server/signals";

// POST /api/lessons/:id/signals { type: "lost" | "slower", seq }
// One tap from a student. Anonymous to everyone: the teacher only ever sees
// counts. Limited to one of each kind per student every 20 seconds.

const Body = z.object({ type: z.enum(["lost", "slower"]), seq: z.number().int().positive().nullable().optional() });
const limiter = createRateLimiter({ windowMs: 20_000, max: 1 });

export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/signals">) {
  const { id } = await ctx.params;
  const access = await requireStudentLesson(id);
  if ("error" in access) return access.error;
  const body = await readJson(request, Body);
  if ("error" in body) return body.error;
  const limit = limiter.check(`${access.student.id}:${body.data.type}`);
  if (!limit.ok) return jsonError(429, "Wait a moment before sending again", { retryAfterMs: limit.retryAfterMs });
  await recordSignal(id, access.student.id, body.data.type === "lost" ? "LOST" : "SLOWER", body.data.seq ?? null);
  return Response.json({ ok: true, cooldownMs: 20_000 });
}
