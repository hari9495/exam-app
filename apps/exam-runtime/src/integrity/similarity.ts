// Pure-function code similarity engine: normalize -> 5-gram fingerprint -> jaccard.
// No NestJS wiring, no DB, no dependencies (see task-3 brief).

export const MIN_NORMALIZED_LENGTH = 150;
export const SIMILARITY_THRESHOLD = 0.7;
export const SIMILARITY_HIGH = 0.85;

/**
 * Strips comments (//, /* *\/, #) and string literals ('...', "...", `...`),
 * then collapses whitespace and lowercases. Uses a single scanning pass so a
 * string literal's contents (e.g. a "http://..." URL) are never
 * misinterpreted as the start of a comment.
 */
export function normalizeCode(code: string): string {
  let out = '';
  const n = code.length;
  let i = 0;
  while (i < n) {
    const c = code[i];
    const next = code[i + 1];

    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < n && code[i] !== quote) {
        i += code[i] === '\\' ? 2 : 1;
      }
      i++; // skip closing quote
      continue;
    }

    if (c === '/' && next === '/') {
      i += 2;
      while (i < n && code[i] !== '\n') i++;
      continue;
    }

    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (c === '#') {
      i++;
      while (i < n && code[i] !== '\n') i++;
      continue;
    }

    out += c;
    i++;
  }
  return out.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Tokenizes and returns the set of overlapping 5-token grams. */
export function fingerprint(normalized: string): Set<string> {
  const tokens = normalized.match(/\w+|[^\w\s]/g) ?? [];
  const grams = new Set<string>();
  for (let i = 0; i + 5 <= tokens.length; i++) {
    grams.add(tokens.slice(i, i + 5).join(' '));
  }
  return grams;
}

/** Intersection-over-union; 0 when both sets are empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return intersection / union;
}

export function similarityScore(codeA: string, codeB: string): number {
  return jaccard(fingerprint(normalizeCode(codeA)), fingerprint(normalizeCode(codeB)));
}
