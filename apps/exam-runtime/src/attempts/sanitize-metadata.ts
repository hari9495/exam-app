import { Logger } from '@nestjs/common';

// `screenshot`/`screenshotCapReached` are server-authoritative outcomes of a screen-capture
// upload -- a client must never be able to set them itself. This is a separate concern from
// the cap-count invariant below: forging one of these two keys (folded for case/width, see
// isForgedScreenshotKey) lets a client's own metadata be mistaken for real capture evidence or
// a real cap-reached marker. Nothing else about a key's shape is suspicious on its own, so
// this check is deliberately narrow.
const SOFT_HYPHEN = String.fromCharCode(0xad);
const IGNORABLE_KEY_CHARS = new RegExp(`[\\p{Cf}${SOFT_HYPHEN}]`, 'gu');

function isForgedScreenshotKey(key: string): boolean {
  const folded = key.replace(IGNORABLE_KEY_CHARS, '').normalize('NFKC').toLowerCase();
  return folded.includes('screenshot') || key.includes('"');
}

function stripForgedScreenshotKeys(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return metadata;
  return sanitizeAgainstForgedScreenshotKeys(metadata) as Record<string, unknown>;
}

function sanitizeAgainstForgedScreenshotKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAgainstForgedScreenshotKeys);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !isForgedScreenshotKey(key))
        .map(([key, nested]) => [key, sanitizeAgainstForgedScreenshotKeys(nested)]),
    );
  }
  return value;
}

// Four rounds of this bug each closed one way a *key* could be shaped to spell "screenshot" --
// exact name, nested a level deep, an embedded quote, a folded Unicode variant -- and each
// round left the class open, because the actual invariant was never about keys. The cap-count
// query greps the *serialized* JSON text for the literal `"screenshot":`, matched by a
// collation (SQL_Latin1_General_CP1_CI_AS, verified against the real dev database -- see
// scc-task-5-report.md fix rounds 4-5) that folds case AND width across the whole FF01-FF5E
// fullwidth block. That block also contains the fullwidth quote (U+FF02) and fullwidth colon
// (U+FF1A), which JSON.stringify does not escape and which a plain client-controlled *value*
// (not just a key) can carry straight through: metadata `{ trigger: '＂screenshot＂：' }`
// serializes to text containing that literal without touching a single key. One NFKC pass over
// the whole serialized text folds all three (fullwidth s/quote/colon) together, checks keys and
// values in a single pass, and tests the actual property the database checks instead of
// guessing at key shapes -- this replaces, rather than supplements, per-key content guessing.
const CAP_COUNT_LITERAL = '"screenshot":';

// Hostile or merely absurd metadata (thousands of nesting levels deep -- a few KB of payload,
// trivially inside the body-size limit) can overflow the stack in the recursive strip above or
// in JSON.stringify itself; that failure and the literal-content check above are both reasons
// this metadata can't be trusted to serialize into storage as-is. Either way: drop it and
// record the violation without it -- the violation is what matters, losing a hostile client's
// metadata is an acceptable trade -- rather than letting either failure become an uncaught
// exception (and, inside a transaction, a lost violation).
//
// Every write path that puts client-supplied metadata into a `metadataJson` column routes
// through this one function rather than repeating the check -- this invariant has already been
// restated key-shape-by-key-shape across several rounds of fixes, and one shared place to state
// it (and to log a drop with attempt/event correlation) is the point.
export function sanitizeMetadataOrDrop(
  metadata: Record<string, unknown> | undefined,
  logger: Logger,
  attemptId: string,
  eventType: string,
): Record<string, unknown> | undefined {
  try {
    const stripped = stripForgedScreenshotKeys(metadata);
    if (stripped) {
      const serialized = JSON.stringify(stripped);
      if (serialized.normalize('NFKC').toLowerCase().includes(CAP_COUNT_LITERAL)) {
        throw new Error('Metadata serializes to text containing the reserved "screenshot": literal');
      }
    }
    return stripped;
  } catch (error) {
    logger.error(`Dropping unprocessable proctoring event metadata (attempt ${attemptId}, event ${eventType})`, error as Error);
    return undefined;
  }
}
