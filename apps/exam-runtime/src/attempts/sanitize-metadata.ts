import { Logger } from '@nestjs/common';

// `screenshot`/`screenshotCapReached` are server-authoritative outcomes of a screen-capture
// upload, and `snapshot` is the equivalent for a webcam upload (Task 9: candidates.service.ts's
// GDPR erase treats a `metadataJson.snapshot`/`.screenshot` URL as a blob to delete, so a forged
// `snapshot` is no longer just fake evidence -- it's a delete instruction the erase path will
// run against whatever URL the client wrote) -- a client must never be able to set any of them
// itself. Forging one of these keys (folded for case/width, see isForgedScreenshotKey) would
// also let a client's own metadata be mistaken for real capture evidence or a real cap-reached
// marker when the recruiter log renders it (LiveMonitoringPanel reads the exact properties
// `metadata.screenshot`/`.screenshotCapReached`/`.snapshot`). This check is deliberately broad,
// not narrow: it's a substring match (`includes('screenshot')` / `includes('snapshot')`), so it
// also eats `xscreenshotx`, `myScreenshotNote`, and any key containing a raw quote -- on
// purpose, to close every key-shape variant the last several rounds of fixes found one at a
// time. The cost of that breadth is that it also eats the server's *own* `screenshot`/
// `screenshotCapReached`/`snapshot` keys if they're ever run through it -- see
// sanitizeMetadataOrDrop below and its callers for why server-set keys are composed in strictly
// after this filter runs, never through it (fix round 6 regression, see scc-task-5-report.md).
// The legitimate server-side `snapshot` writes (webcamViolation/webcamSnapshot in
// attempt.service.ts, registerWebcamViolation in attempt-settlement.service.ts) build
// metadataJson directly and never call this sanitizer at all, so widening the filter here
// cannot strip them.
//
// This key-strip is the only guard left in this file (task 6804 deleted the serialized-text
// cap-count literal check that used to live below it -- see sanitizeMetadataOrDrop). That
// check existed solely to keep a client from fooling the screenshot cap's old `LIKE
// '%"screenshot":%'` query; the cap now reads Attempt.screenCaptureCount, a real counter that
// no metadata content can influence, so there is nothing left for a serialized-text scan to
// protect. This key-strip stays because it protects two things the counter doesn't: forging
// evidence the recruiter log renders, and (per the GDPR paragraph above) aiming the erase path's
// delete at another candidate's blob.
const SOFT_HYPHEN = String.fromCharCode(0xad);
const IGNORABLE_KEY_CHARS = new RegExp(`[\\p{Cf}${SOFT_HYPHEN}]`, 'gu');

function isForgedScreenshotKey(key: string): boolean {
  const folded = key.replace(IGNORABLE_KEY_CHARS, '').normalize('NFKC').toLowerCase();
  return folded.includes('screenshot') || folded.includes('snapshot') || key.includes('"');
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

// Hostile or merely absurd metadata (thousands of nesting levels deep -- a few KB of payload,
// trivially inside the body-size limit) can overflow the stack in the recursive strip above.
// Drop it and record the violation without it -- the violation is what matters, losing a
// hostile client's metadata is an acceptable trade -- rather than letting an uncaught RangeError
// (and, inside a transaction, a lost violation) escape.
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
    return stripForgedScreenshotKeys(metadata);
  } catch (error) {
    logger.error(`Dropping unprocessable proctoring event metadata (attempt ${attemptId}, event ${eventType})`, error as Error);
    return undefined;
  }
}
