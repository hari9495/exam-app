import { timingSafeEqual } from 'crypto';

/**
 * External "Easy Apply" ingestion providers (Indeed Apply / LinkedIn Easy Apply). A candidate
 * applies on the board; the board POSTs the application to our public ingestion endpoint, which
 * verifies a per-org shared secret and normalizes the payload into our standard apply() call.
 * Inert until an org configures the provider's secret. Over plain data — no SDK.
 */

export type EasyApplyProviderId = 'indeed' | 'linkedin';

/** The normalized application, shaped to feed straight into PublicApplicationsService.apply(). */
export interface NormalizedApplication {
  applyToken: string; // our job's public apply token (the board echoes it back as the job ref)
  name: string;
  email: string;
  phone?: string;
  resumeBase64: string; // raw base64 PDF (the board includes the résumé)
  customFields?: Record<string, string | number | null>;
  consentAccepted?: boolean;
}

export interface EasyApplyAdapter {
  id: EasyApplyProviderId;
  label: string; // 'Indeed Apply' | 'LinkedIn Easy Apply'
  /** Constant-time check of the shared secret the board sends against the org's stored secret. */
  verify(storedSecret: string, providedSecret: string | undefined): boolean;
  /** Map the board's webhook payload to our normalized shape. Throws on a malformed payload. */
  normalize(payload: unknown): NormalizedApplication;
}

/** Constant-time string compare that never throws on length mismatch. */
export function secretsMatch(a: string, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/**
 * Shared normalizer: Easy Apply payloads across boards carry the same essentials under a few common
 * key spellings. Each provider adapter delegates here, then the exact field mapping can be tuned per
 * board on real partner onboarding (ponytail: documented common shapes as of build time).
 */
export function normalizeCommon(payload: unknown, provider: string): NormalizedApplication {
  if (!payload || typeof payload !== 'object') throw new Error(`${provider}: empty payload`);
  const p = payload as Record<string, unknown>;
  const applicant = (p.applicant && typeof p.applicant === 'object' ? p.applicant : p) as Record<string, unknown>;
  const applyToken = str(p.applyToken) ?? str(p.jobReference) ?? str(p.jobRef) ?? str(p.externalJobId);
  const name = str(applicant.name) ?? [str(applicant.firstName), str(applicant.lastName)].filter(Boolean).join(' ');
  const email = str(applicant.email);
  const resumeBase64 = str(p.resumeBase64) ?? str(applicant.resumeBase64) ?? str((p.resume as Record<string, unknown> | undefined)?.base64);
  if (!applyToken) throw new Error(`${provider}: missing job reference`);
  if (!name) throw new Error(`${provider}: missing applicant name`);
  if (!email) throw new Error(`${provider}: missing applicant email`);
  if (!resumeBase64) throw new Error(`${provider}: missing résumé`);
  return {
    applyToken,
    name,
    email,
    phone: str(applicant.phone),
    resumeBase64,
    customFields: (p.customFields && typeof p.customFields === 'object' ? (p.customFields as Record<string, string | number | null>) : undefined),
    consentAccepted: typeof p.consentAccepted === 'boolean' ? p.consentAccepted : undefined,
  };
}
