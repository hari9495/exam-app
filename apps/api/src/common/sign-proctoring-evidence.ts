import { BlobStorageService } from '@exam-platform/shared';

// The metadataJson keys that ever hold evidence-image URLs: webcam snapshot / screen-capture
// screenshot (see apps/exam-runtime/src/attempts/attempt.service.ts), and face_mismatch's
// snapshotPath / referenceImagePath (see apps/exam-runtime/src/face/face-verification.service.ts).
// Everything else on the object (strike, confidence, reason, screenshotCapReached, score, ...)
// is left alone.
const EVIDENCE_URL_KEYS = ['snapshot', 'screenshot', 'snapshotPath', 'referenceImagePath'] as const;

// Single place all three proctoring-evidence read paths (recruiter log modal, reports webcam
// timeline, GDPR export) route through to rewrite raw blob URLs into short-lived SAS URLs,
// so the private-container fix lives once instead of three times. `meta` is an already-parsed
// metadataJson value (or null/undefined); non-object input passes through untouched.
export async function signProctoringEvidence(blobStorage: BlobStorageService, meta: unknown): Promise<unknown> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return meta;
  }
  const rewritten: Record<string, unknown> = { ...(meta as Record<string, unknown>) };
  for (const key of EVIDENCE_URL_KEYS) {
    if (key in rewritten) {
      rewritten[key] = await blobStorage.signIfOurs(rewritten[key]);
    }
  }
  return rewritten;
}
