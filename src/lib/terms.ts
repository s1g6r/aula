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
