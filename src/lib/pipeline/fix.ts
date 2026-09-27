import { findKeyTerms } from "@/lib/terms";

// Should we show the model's "repair" of a speech-recognition mistake?
//
// Only when it's clearly a mishearing of one of the teacher's key terms:
// the repaired line must contain a key term the original didn't
// ("sell membrane" -> "cell membrane", "why intercept" -> "y-intercept"),
// and change at most 3 words. In production the model sometimes rephrased
// correct sentences ("take in" -> "absorb"); showing that as a correction
// would put words in the teacher's mouth, so it's ignored.

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);

function wordDistance(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export function acceptFix(original: string, fix: string, keyTerms: string[]): boolean {
  const a = words(original);
  const b = words(fix);
  if (a.join(" ") === b.join(" ")) return false; // nothing changed
  if (wordDistance(a, b) > 3) return false;
  const before = new Set(findKeyTerms(original, keyTerms));
  return findKeyTerms(fix, keyTerms).some((t) => !before.has(t));
}
