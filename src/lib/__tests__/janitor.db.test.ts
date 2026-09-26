import { afterAll, describe, expect, it } from "vitest";

// The 30-day / 24-hour auto-delete, against the test database.
describe.skipIf(!process.env.DATABASE_URL)("cleanUp", async () => {
  const { db } = await import("@/lib/db");
  const { cleanUp } = await import("@/lib/server/janitor");
  afterAll(() => db.$disconnect());

  it("deletes expired lessons and empty guest accounts, ends stale live lessons, keeps the replay", async () => {
    const now = new Date();
    const hour = 3600_000;
    const tag = Date.now().toString(36).toUpperCase().slice(-4);
    const teacher = await db.teacher.create({ data: { email: `j-${tag}@test.local`, name: "T" } });
    const guest = await db.teacher.create({ data: { email: `g-${tag}@test.local`, name: "G", isGuest: true, createdAt: new Date(now.getTime() - 48 * hour) } });
    const mk = (code: string, extra: Record<string, unknown>) =>
      db.lesson.create({ data: { code: `${code}${tag}`.slice(0, 6), teacherId: teacher.id, expiresAt: new Date(now.getTime() + hour), ...extra } });

    const expired = await mk("EX", { expiresAt: new Date(now.getTime() - hour) });
    const replay = await mk("RP", { expiresAt: new Date(now.getTime() - hour), isReplay: true });
    const stale = await mk("ST", { startedAt: new Date(now.getTime() - 13 * hour) });
    const fresh = await mk("FR", {});

    await cleanUp(now);

    expect(await db.lesson.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await db.lesson.findUnique({ where: { id: replay.id } })).not.toBeNull();
    expect((await db.lesson.findUnique({ where: { id: stale.id } }))?.status).toBe("ENDED");
    expect((await db.lesson.findUnique({ where: { id: fresh.id } }))?.status).toBe("LIVE");
    expect(await db.teacher.findUnique({ where: { id: guest.id } })).toBeNull();

    await db.lesson.deleteMany({ where: { teacherId: teacher.id } });
    await db.teacher.delete({ where: { id: teacher.id } });
  });
});
