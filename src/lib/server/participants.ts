import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { singleton } from "./singleton";

// Students have no accounts. Joining a lesson gives the browser a random
// token in an httpOnly cookie scoped to that lesson; the database keeps only
// its SHA-256 hash. The token is what lets us rate-limit, mute and count a
// student without knowing who they are.

export type ParticipantInfo = { id: string; lessonId: string; nickname: string; lang: string; muted: boolean };

const byHash = singleton("participantsByHash", () => new Map<string, ParticipantInfo>());
const byId = singleton("participantsById", () => new Map<string, ParticipantInfo>());

export const participantCookie = (lessonId: string) => `aula_p_${lessonId}`;
export const newToken = () => randomBytes(24).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function remember(p: ParticipantInfo, tokenHash?: string) {
  byId.set(p.id, p);
  if (tokenHash) byHash.set(tokenHash, p);
}

export async function createParticipant(lessonId: string, nickname: string, lang: string): Promise<{ participant: ParticipantInfo; token: string }> {
  const token = newToken();
  const tokenHash = hashToken(token);
  const row = await db.participant.create({
    data: { lessonId, tokenHash, nickname, lang },
    select: { id: true, lessonId: true, nickname: true, lang: true, muted: true },
  });
  remember(row, tokenHash);
  return { participant: row, token };
}

export async function participantFromToken(lessonId: string, token: string | undefined): Promise<ParticipantInfo | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  let p = byHash.get(tokenHash) ?? null;
  if (!p) {
    p = await db.participant.findUnique({
      where: { tokenHash },
      select: { id: true, lessonId: true, nickname: true, lang: true, muted: true },
    });
    if (p) remember(p, tokenHash);
  }
  return p && p.lessonId === lessonId ? p : null;
}

// The student in this browser for this lesson, from their cookie.
export async function currentParticipant(lessonId: string): Promise<ParticipantInfo | null> {
  const token = (await cookies()).get(participantCookie(lessonId))?.value;
  return participantFromToken(lessonId, token);
}

export async function updateParticipant(id: string, data: Partial<Pick<ParticipantInfo, "lang" | "muted" | "nickname">>): Promise<void> {
  await db.participant.update({ where: { id }, data });
  const p = byId.get(id);
  if (p) Object.assign(p, data);
}

export async function getParticipantsById(ids: string[]): Promise<ParticipantInfo[]> {
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    const rows = await db.participant.findMany({
      where: { id: { in: missing } },
      select: { id: true, lessonId: true, nickname: true, lang: true, muted: true },
    });
    for (const r of rows) remember(r);
  }
  return ids.map((id) => byId.get(id)).filter((p): p is ParticipantInfo => Boolean(p));
}
