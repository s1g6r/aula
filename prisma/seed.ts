// Seeds the demo teacher and one small finished lesson for local development.
// Idempotent: safe to run again. The Demo Replay lesson is added in P7 from
// src/demo/replay.json, which the real pipeline generates.

import { hash } from "bcryptjs";
import { db } from "../src/lib/db";

const DEMO_EMAIL = process.env.DEMO_TEACHER_EMAIL ?? "demo@aulaapp.xyz";
const DEMO_PASSWORD = process.env.DEMO_TEACHER_PASSWORD ?? "aula-demo";

async function main() {
  const teacher = await db.teacher.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: "Ms. Rivera (demo)", passwordHash: await hash(DEMO_PASSWORD, 12) },
  });

  const existing = await db.lesson.findUnique({ where: { code: "SEED42" } });
  if (existing) await db.lesson.delete({ where: { id: existing.id } });

  const startedAt = new Date(Date.now() - 60 * 60 * 1000);
  const at = (sec: number) => new Date(startedAt.getTime() + sec * 1000);

  // Hand-written sample lines for development only (not AI output).
  const lines = [
    {
      en: "Today we're talking about photosynthesis, which is how plants make their own food.",
      es: "Hoy vamos a hablar de la fotosíntesis, que es cómo las plantas hacen su propio alimento.",
      terms: [{ en: "photosynthesis", tr: "fotosíntesis", gloss: "Proceso con el que las plantas usan la luz para hacer su alimento." }],
    },
    {
      en: "Plants take in carbon dioxide from the air and water from the soil.",
      es: "Las plantas toman dióxido de carbono del aire y agua del suelo.",
      terms: [{ en: "carbon dioxide", tr: "dióxido de carbono", gloss: "Gas del aire que las plantas usan para crecer." }],
    },
    {
      en: "The green color comes from chlorophyll, which absorbs the energy in sunlight.",
      es: "El color verde viene de la clorofila, que absorbe la energía de la luz del sol.",
      terms: [{ en: "chlorophyll", tr: "clorofila", gloss: "Sustancia verde de las plantas que atrapa la luz." }],
    },
  ];

  const lesson = await db.lesson.create({
    data: {
      code: "SEED42",
      teacherId: teacher.id,
      title: "Photosynthesis (sample)",
      subject: "Biology",
      keyTerms: ["photosynthesis", "carbon dioxide", "chlorophyll"],
      status: "ENDED",
      startedAt,
      endedAt: at(600),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      segments: {
        create: lines.map((l, i) => ({
          seq: i + 1,
          text: l.en,
          startedAt: at(20 + i * 15),
          translations: { create: { lang: "es", text: l.es, terms: l.terms, model: "seed" } },
        })),
      },
      participants: {
        create: [
          { tokenHash: "seed-token-1", nickname: "Ana", lang: "es" },
          { tokenHash: "seed-token-2", nickname: "Omar", lang: "ar" },
        ],
      },
    },
    include: { participants: true },
  });

  await db.signal.createMany({
    data: lesson.participants.map((p) => ({ lessonId: lesson.id, participantId: p.id, type: "LOST" as const, seq: 3, createdAt: at(70) })),
  });

  console.log(`Seeded demo teacher ${teacher.email} and lesson ${lesson.code}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
