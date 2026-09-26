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
  get aiModelRecap() {
    return process.env.AI_MODEL_RECAP || process.env.AI_MODEL_TRANSLATE || "";
  },
  get aiConcurrencyUnits() {
    return num("AI_CONCURRENCY_UNITS", 4);
  },
  get aiTranslateCost() {
    return num("AI_TRANSLATE_COST", 1);
  },
  get aiRecapCost() {
    return num("AI_RECAP_COST", 4);
  },
  get lessonConcurrency() {
    return num("LESSON_CONCURRENCY", 2);
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
