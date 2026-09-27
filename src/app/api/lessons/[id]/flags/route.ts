import { z } from "zod";
import { db } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { jsonError, readJson } from "@/lib/server/http";
import { getLesson } from "@/lib/server/lessons";
import { currentParticipant } from "@/lib/server/participants";

// POST /api/lessons/:id/flags { seq }
// "This translation looks wrong." One flag per student per line; the teacher
// sees flagged lines on the review page. Being honest about quality is part
// of the product, especially for the beta languages.

const Body = z.object({ seq: z.number().int().positive() });
const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/flags">) {
  const { id } = await ctx.params;
  const [lesson, student] = await Promise.all([getLesson(id), currentParticipant(id)]);
  if (!lesson) return jsonError(404, "Lesson not found");
  if (!student) return jsonError(401, "Join the lesson first");
  const body = await readJson(request, Body);
  if ("error" in body) return body.error;
  if (!limiter.check(student.id).ok) return jsonError(429, "Wait a moment");
  const translation = await db.translation.findFirst({
    where: { lang: student.lang, segment: { lessonId: id, seq: body.data.seq } },
    select: { id: true },
  });
  if (!translation) return jsonError(404, "No translation for that line");
  await db.translationFlag.upsert({
    where: { translationId_participantId: { translationId: translation.id, participantId: student.id } },
    create: { translationId: translation.id, participantId: student.id },
    update: {},
  });
  return Response.json({ ok: true });
}
