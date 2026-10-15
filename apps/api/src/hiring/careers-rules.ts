import { createHash } from 'crypto';

// Recruitment batch AT3 (M10-BUILD-DESIGN §6, §13): pure rules for the public careers site and apply.

/** A readable, ASCII-only job URL part: "senior-accountant-chennai-7f3k2a" (title, location, a stable id suffix). */
export function jobSlug(title: string, location: string | null | undefined, id: string): string {
  const words = `${title} ${location ?? ''}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '');
  const tail = id.replace(/-/g, '').slice(0, 6).toLowerCase();
  return words ? `${words}-${tail}` : `job-${tail}`;
}

/** A colour that is safe to put in a CSS custom property: #rrggbb only, else nothing. */
export const safeColor = (c: string | null | undefined) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null);

/** An entity page slug: lower-case ASCII words joined by hyphens. */
export const isSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 60;

/** The applicant's IP, kept only as a salted hash with the consent record (evidence without storing the address). */
export const ipHash = (ip: string | null | undefined, salt: string) => (ip ? createHash('sha256').update(`${salt}:${ip}`).digest('hex') : null);

/**
 * What the applicant accepted, checked against the notices shown: the application notice (when the company has one) is
 * required; every accepted notice must be the current version, or the page was stale.
 */
export function checkConsents(
  notices: { id: string; purpose: string; version: number }[],
  accepted: { purpose: string; version: number }[],
): { problem: string | null; stale: boolean; record: { id: string; purpose: string; version: number }[] } {
  const record: { id: string; purpose: string; version: number }[] = [];
  for (const a of accepted) {
    const n = notices.find((x) => x.purpose === a.purpose);
    if (!n) continue;
    if (n.version !== a.version) return { problem: 'The privacy notice changed while you were applying. Reload the page and read it again.', stale: true, record: [] };
    record.push(n);
  }
  if (notices.some((n) => n.purpose === 'application') && !record.some((r) => r.purpose === 'application')) return { problem: 'Please accept the privacy notice to apply.', stale: false, record: [] };
  return { problem: null, stale: false, record };
}
