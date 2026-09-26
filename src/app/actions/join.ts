"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeCode } from "@/lib/codes";
import { LANGUAGE_CODES } from "@/lib/languages";
import { createRateLimiter } from "@/lib/rate-limit";
import { getLesson, getLessonByCode } from "@/lib/server/lessons";
import { createParticipant, currentParticipant, participantCookie, updateParticipant } from "@/lib/server/participants";
import { publishRoom } from "@/lib/server/room";
import { headers } from "next/headers";

export type JoinState = { error?: string } | undefined;

const joinLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

export async function goToCodeAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Codes are 6 letters and numbers, like K7M2QX." };
  const lesson = await getLessonByCode(code);
  if (!lesson) return { error: "No lesson has that code. Check it with your teacher." };
  redirect(`/join/${code}`);
}

const JoinSchema = z.object({
  code: z.string(),
  nickname: z.string().trim().min(1, "Type a name or nickname").max(24, "Keep it under 24 characters"),
  lang: z.enum(["en", ...LANGUAGE_CODES]),
});

export async function joinLessonAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!joinLimiter.check(`join:${ip}`).ok) return { error: "Too many joins from this network. Wait a minute and try again." };
  const parsed = JoinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Pick a language" };
  const code = normalizeCode(parsed.data.code);
  const lesson = code ? await getLessonByCode(code) : null;
  if (!lesson) return { error: "This lesson doesn't exist anymore." };
  if (lesson.status !== "LIVE") return { error: "This lesson has ended." };

  const existing = await currentParticipant(lesson.id);
  if (existing) {
    await updateParticipant(existing.id, { nickname: parsed.data.nickname, lang: parsed.data.lang });
  } else {
    const { token } = await createParticipant(lesson.id, parsed.data.nickname, parsed.data.lang);
    (await cookies()).set(participantCookie(lesson.id), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  redirect(`/l/${lesson.code}`);
}

export async function changeLanguageAction(lessonId: string, lang: string): Promise<{ ok: boolean }> {
  const parsed = z.enum(["en", ...LANGUAGE_CODES]).safeParse(lang);
  const lesson = await getLesson(lessonId);
  const me = await currentParticipant(lessonId);
  if (!parsed.success || !lesson || !me) return { ok: false };
  await updateParticipant(me.id, { lang: parsed.data });
  void publishRoom(lessonId);
  return { ok: true };
}
