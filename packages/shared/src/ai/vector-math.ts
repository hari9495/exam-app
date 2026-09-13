// Pure vector helpers for app-side (brute-force, per-org) similarity search. Fine at org scale
// (hundreds–few-thousand candidates); swap for a native vector index if a tenant ever outgrows it.

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Scored<T> {
  item: T;
  score: number;
}

// Top-K by cosine similarity to `query`, highest first. Items whose vector length differs from the
// query's are skipped (a stale embedding from a different model), never crashed on.
export function topKSimilar<T>(query: number[], items: { item: T; vector: number[] }[], k: number): Scored<T>[] {
  const scored: Scored<T>[] = [];
  for (const { item, vector } of items) {
    if (vector.length !== query.length) continue;
    scored.push({ item, score: cosineSimilarity(query, vector) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, k));
}
