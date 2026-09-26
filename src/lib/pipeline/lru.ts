// A small least-recently-used cache. Used for sentence translations: when
// the teacher repeats a phrase ("any questions?", "open your notebooks"),
// students get the same translation instantly without calling the AI.
export class Lru<K, V> {
  private map = new Map<K, V>();

  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K);
  }

  get size(): number {
    return this.map.size;
  }
}

export function translationCacheKey(text: string, lang: string, model: string): string {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `${model}|${lang}|${normalized}`;
}
