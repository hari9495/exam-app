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

export interface ScoredPair<T> {
  a: T;
  b: T;
  score: number;
}

// Every unordered pair whose cosine similarity is >= threshold, highest first, capped at `limit`.
// O(n^2) over the upper triangle — the caller bounds n (this is a brute-force duplicate scan). Pairs
// with mismatched vector lengths are skipped.
export function topSimilarPairs<T>(items: { item: T; vector: number[] }[], threshold: number, limit: number): ScoredPair<T>[] {
  const pairs: ScoredPair<T>[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].vector.length !== items[j].vector.length) continue;
      const score = cosineSimilarity(items[i].vector, items[j].vector);
      if (score >= threshold) pairs.push({ a: items[i].item, b: items[j].item, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  return pairs.slice(0, Math.max(0, limit));
}
