import { afterAll, describe, expect, it } from "vitest";

// Verifies the privacy promise at the database level: deleting a lesson
// deletes everything students and the AI produced for it.
describe.skipIf(!process.env.DATABASE_URL)("schema cascades", async () => {
  const { db } = await import("@/lib/db");

  afterAll(() => db.$disconnect());

  it("deleting a lesson removes all of its data", async () => {
    const teacher = await db.teacher.create({ data: { email: `t-${Date.now()}@test.local`, name: "T" } });
    const lesson = await db.lesson.create({
      data: {
        code: `T${Date.now().toString(36).slice(-5).toUpperCase()}`,
        teacherId: teacher.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        segments: {
          create: { seq: 1, text: "Hello class", startedAt: new Date(), translations: { create: { lang: "es", text: "Hola clase", terms: [], model: "test" } } },
        },
        terms: { create: { en: "class", lang: "es", tr: "clase", gloss: "grupo" } },
      },
      include: { segments: { include: { translations: true } } },
    });
    const student = await db.participant.create({ data: { lessonId: lesson.id, tokenHash: `h-${Date.now()}`, nickname: "A", lang: "es" } });
    await db.signal.create({ data: { lessonId: lesson.id, participantId: student.id, type: "LOST", seq: 1 } });
    await db.question.create({ data: { lessonId: lesson.id, participantId: student.id, lang: "es", original: "¿Qué?" } });
    await db.translationFlag.create({ data: { translationId: lesson.segments[0].translations[0].id, participantId: student.id } });
    const recap = await db.recap.create({
      data: { lessonId: lesson.id, content: {}, model: "test", translations: { create: { lang: "es", content: {} } } },
    });

    await db.lesson.delete({ where: { id: lesson.id } });

    const where = { lessonId: lesson.id };
    expect(await db.segment.count({ where })).toBe(0);
    expect(await db.translation.count({ where: { segment: { lessonId: lesson.id } } })).toBe(0);
    expect(await db.participant.count({ where })).toBe(0);
    expect(await db.signal.count({ where })).toBe(0);
    expect(await db.question.count({ where })).toBe(0);
    expect(await db.term.count({ where })).toBe(0);
    expect(await db.translationFlag.count({ where: { participantId: student.id } })).toBe(0);
    expect(await db.recapTranslation.count({ where: { recapId: recap.id } })).toBe(0);
    expect(await db.recap.count({ where })).toBe(0);

    await db.teacher.delete({ where: { id: teacher.id } });
  });
});
