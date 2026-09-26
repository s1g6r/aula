import { db } from "@/lib/db";

// Privacy housekeeping, run once an hour inside the server:
//   - lessons past their expiry (30 days; 24 hours for guest "Try it live"
//     lessons) are deleted, with everything under them (cascades);
//   - guest teacher accounts with no lessons left are deleted;
//   - lessons left "live" for over 12 hours (a closed laptop) are ended.
// The Demo Replay lesson is never deleted.

// `forget` drops any in-memory state for deleted lessons (caches, queues).
export async function cleanUp(now = new Date(), forget?: (lessonId: string) => void): Promise<{ deleted: number; ended: number; guests: number }> {
  const expired = await db.lesson.findMany({ where: { expiresAt: { lt: now }, isReplay: false }, select: { id: true } });
  if (expired.length) {
    await db.lesson.deleteMany({ where: { id: { in: expired.map((l) => l.id) } } });
    for (const { id } of expired) forget?.(id);
  }

  const stale = await db.lesson.updateMany({
    where: { status: "LIVE", startedAt: { lt: new Date(now.getTime() - 12 * 3600_000) } },
    data: { status: "ENDED", endedAt: now },
  });

  const guests = await db.teacher.deleteMany({
    where: { isGuest: true, createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) }, lessons: { none: {} } },
  });

  return { deleted: expired.length, ended: stale.count, guests: guests.count };
}

let started = false;

export function startJanitor(forget: (lessonId: string) => void): void {
  if (started) return;
  started = true;
  const run = () =>
    cleanUp(new Date(), forget)
      .then((r) => {
        if (r.deleted || r.ended || r.guests) console.log(`[janitor] deleted ${r.deleted} expired lessons, ended ${r.ended} stale lessons, removed ${r.guests} guest accounts`);
      })
      .catch((err) => console.error("[janitor]", (err as Error).message));
  setTimeout(run, 30_000); // shortly after boot
  setInterval(run, 3600_000).unref();
}
