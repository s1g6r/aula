// Finds which of the teacher's key terms appear in an English sentence.
// We do this ourselves instead of asking the model, so highlighting is
// consistent: a term is marked exactly when the teacher said it.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Matches whole words, tolerating simple plurals ("chloroplasts",
// "amendments", "processes") and hyphen/space differences ("y-intercept"
// vs "y intercept").
export function findKeyTerms(sentence: string, keyTerms: string[]): string[] {
  const text = ` ${normalize(sentence)} `;
  const found: string[] = [];
  for (const term of keyTerms) {
    const t = normalize(term);
    if (!t) continue;
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(` ${escaped}(s|es)? `).test(text) && !found.includes(term)) found.push(term);
  }
  return found;
}

// Cleans the teacher's pasted key terms: splits on commas, semicolons and
// new lines, trims bullets, drops duplicates and anything too long to be a term.
export function parseKeyTerms(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,;\n]+/)) {
    const term = raw.replace(/^[\s\-*•\d.)]+/, "").trim();
    const key = term.toLowerCase();
    if (!term || term.length > 60 || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= 40) break;
  }
  return out;
}

// Stable lookup key for a term ("Calvin cycle", "calvin-cycle" -> "calvin cycle").
export function termKey(term: string): string {
  return normalize(term);
}

// ---------------------------------------------------------------------------
// Repairing a misheard key term without AI.
//
// Speech recognition swaps a word for one that sounds alike ("sell membrane",
// "why intercept"). For the teacher's multi-word key terms we look for a run
// of words where every word matches except one that is off by at most two
// letters, and put the key term back. Single-word terms are left alone: too
// easy to get wrong.

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export function repairKeyTerms(sentence: string, keyTerms: string[]): string | null {
  // Tokens with their positions in the original sentence.
  const tokens = [...sentence.matchAll(/[\p{L}\p{N}']+/gu)].map((m) => ({ word: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length }));
  let result = sentence;
  let offset = 0;
  let changed = false;
  for (const term of keyTerms) {
    const words = normalize(term).split(" ");
    if (words.length < 2 || findKeyTerms(sentence, [term]).length) continue;
    for (let i = 0; i + words.length <= tokens.length; i++) {
      const window = tokens.slice(i, i + words.length);
      const diffs = window.map((t, k) => (t.word === words[k] ? 0 : editDistance(t.word, words[k])));
      const wrong = diffs.filter((d) => d > 0);
      if (wrong.length === 1 && wrong[0] <= 2 && window.find((_, k) => diffs[k] > 0)!.word.length >= 2) {
        const start = window[0].start + offset;
        const end = window[window.length - 1].end + offset;
        result = result.slice(0, start) + term + result.slice(end);
        offset += term.length - (end - start);
        changed = true;
        break;
      }
    }
  }
  return changed ? result : null;
}
