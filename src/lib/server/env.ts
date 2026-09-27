// Typed access to server configuration, with the defaults documented in
// .env.example. Read lazily so tests and scripts can set values first.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  get aiBaseUrl() {
    return process.env.AI_BASE_URL || "https://api.featherless.ai/v1";
  },
  get aiApiKey() {
    return process.env.AI_API_KEY || "";
  },
  get aiModelTranslate() {
    return process.env.AI_MODEL_TRANSLATE || "";
  },
  // Stronger model for languages with less training data (the "beta" ones),
  // glossaries and recaps. Falls back to the translation model.
  get aiModelQuality() {
    return process.env.AI_MODEL_QUALITY || process.env.AI_MODEL_TRANSLATE || "";
  },
  get aiModelRecap() {
    return process.env.AI_MODEL_RECAP || process.env.AI_MODEL_QUALITY || process.env.AI_MODEL_TRANSLATE || "";
  },
  get aiConcurrencyUnits() {
    return num("AI_CONCURRENCY_UNITS", 4);
  },
  // AI calls in flight at once, across all lessons (see AiScheduler).
  get aiMaxInflight() {
    return num("AI_MAX_INFLIGHT", 1);
  },
  get aiTranslateCost() {
    return num("AI_TRANSLATE_COST", 1);
  },
  get aiQualityCost() {
    return num("AI_QUALITY_COST", 2);
  },
  get aiRecapCost() {
    return num("AI_RECAP_COST", 2);
  },
  get lessonConcurrency() {
    // One call in flight per lesson; sentences that arrive meanwhile are
    // merged into the next call (see DECISIONS.md, P3).
    return num("LESSON_CONCURRENCY", 1);
  },
  get aiTimeoutMs() {
    return num("AI_TIMEOUT_MS", 8000);
  },
  get retentionDays() {
    return num("DATA_RETENTION_DAYS", 30);
  },
  get guestLessonTtlHours() {
    return num("GUEST_LESSON_TTL_HOURS", 24);
  },
  get appUrl() {
    return (process.env.APP_URL || "").replace(/\/$/, "");
  },
};
