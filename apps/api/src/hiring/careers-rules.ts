import { keyedHash } from '../common/keyed-hash';

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
/** Where a consent came from, as a keyed hash (F10: the key comes from the API secret; never the IP itself). */
export const ipHash = (ip: string | null | undefined) => (ip ? keyedHash('consent-ip', ip) : null);

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

/** The page builder's saved layout (T9-09 / Surfaces Careers). */
export interface CareersLayout {
  theme: 'classic' | 'compact' | 'split';
  accent: string | null;
  sections: { id: string; type: string; title: string; hidden?: boolean; text?: string; photoAlt?: string; items?: Record<string, string>[] }[];
}

/** Section types that may appear once only. */
export const SINGLE_SECTIONS = ['hero', 'jobs', 'footer'];

/** A repeated one-only section ("hero"), or null when the layout is fine. */
export function layoutProblem(sections: { type: string }[]): string | null {
  const twice = SINGLE_SECTIONS.find((t) => sections.filter((s) => s.type === t).length > 1);
  return twice ? `A page can have only one ${twice} section. Remove the extra one.` : null;
}

/** The saved layout, or (before anyone used the builder) one made from the headline and intro. */
export function careersLayout(saved: unknown, org: { name: string; careersHeadline: string | null; careersIntro: string | null }): CareersLayout {
  const s = saved as Partial<CareersLayout> | null;
  if (s && Array.isArray(s.sections) && typeof s.theme === 'string') return { theme: s.theme, accent: safeColor(s.accent ?? null), sections: s.sections };
  return {
    theme: 'classic',
    accent: null,
    sections: [
      { id: 'hero', type: 'hero', title: org.careersHeadline ?? `Work at ${org.name}`, text: org.careersIntro ?? '' },
      { id: 'jobs', type: 'jobs', title: 'Open jobs' },
      { id: 'footer', type: 'footer', title: 'Contact', text: '' },
    ],
  };
}

/** A company page's own headline and intro replace the hero's words (when set). */
export function withHero(layout: CareersLayout, own: { title: string | null; text: string | null } | null): CareersLayout {
  if (!own || (!own.title && !own.text)) return layout;
  return { ...layout, sections: layout.sections.map((s) => (s.type === 'hero' ? { ...s, title: own.title ?? s.title, text: own.text ?? s.text } : s)) };
}
