// The scripted lesson behind the Demo Replay: a 9th-grade Biology class on
// photosynthesis, about two minutes long. scripts/generate-replay.mts plays
// it through the real app (real translations, definitions and recap) and
// records the result in src/demo/replay.json.

export const DEMO_LESSON = {
  title: "Photosynthesis",
  subject: "Biology",
  keyTerms: ["photosynthesis", "chloroplast", "chlorophyll", "carbon dioxide", "glucose", "oxygen", "ATP", "Calvin cycle", "cell membrane"],
};

export const DEMO_SENTENCES = [
  "Good morning everyone, today we're learning about photosynthesis.",
  "Photosynthesis is how plants make their own food, using sunlight.",
  "Think about a leaf: inside every leaf there are tiny parts called chloroplasts.",
  "Chloroplasts are green because they're full of chlorophyll.",
  "Chlorophyll catches the energy in sunlight, kind of like a solar panel.",
  "The plant also needs two ingredients: water from the soil and carbon dioxide from the air.",
  // Speech recognition mishears "cell membrane"; the pipeline repairs it.
  "Water gets into the plant cells through the sell membrane.",
  "Now here's the tricky part, so stay with me.",
  "The light energy is stored in a molecule called ATP, which works like a tiny battery.",
  // The hardest sentence: three students tap "I'm lost" here.
  "Then the Calvin cycle uses that ATP to turn carbon dioxide into glucose.",
  "Glucose is a sugar, and it's the plant's food.",
  // The teacher saw the pulse and re-explains.
  "Let me say that again more simply: the plant uses stored energy to build sugar out of air.",
  "And as a bonus, plants release oxygen, which is the oxygen we breathe.",
  "So remember the recipe: sunlight, water and carbon dioxide go in; glucose and oxygen come out.",
  // The teacher answers the student's question out loud.
  "Someone asked why the plant needs ATP: it carries the energy from sunlight to the Calvin cycle.",
  "For homework, draw a leaf and label where each step happens.",
  "That's it for today, great work everyone.",
];

export const DEMO_STUDENTS = [
  { nickname: "Ana", lang: "es", label: "Español" },
  { nickname: "Omar", lang: "ar", label: "العربية" },
  { nickname: "Linh", lang: "vi", label: "Tiếng Việt" },
  { nickname: "Wei", lang: "zh-Hans", label: "简体中文" },
] as const;

// Who does what, keyed by the (1-based) sentence it follows.
export const DEMO_ACTIONS = {
  slower: { after: 9, by: "ar" },
  lost: { after: 10, by: ["es", "vi", "zh-Hans"] },
  question: { after: 11, by: "es", text: "¿Para qué necesita la planta el ATP?" },
} as const;

// Realistic pacing: about 3 words a second, plus a short pause.
export function sentenceTimings(sentences: string[] = DEMO_SENTENCES, startMs = 2500): { startMs: number; endMs: number }[] {
  let t = startMs;
  return sentences.map((s) => {
    const words = s.split(/\s+/).length;
    const speak = Math.round(words * 330);
    const out = { startMs: t, endMs: t + speak };
    t += speak + 2200; // a teacher of newcomers pauses about 2 seconds between sentences
    return out;
  });
}
