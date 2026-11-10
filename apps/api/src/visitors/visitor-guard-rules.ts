// Visitors slice 3 (founder answers 603, 605, 614): the pure rules for ID proof, the watch-list and visitors under 18.

/** 603: the ID types a visitor can show. Only the type and the last 4 characters are ever kept. */
export const ID_TYPES = ['aadhaar', 'driving_licence', 'passport', 'voter_id', 'pan', 'company_id', 'other'] as const;
export type IdType = (typeof ID_TYPES)[number];
export const ID_WORDS: Record<IdType, string> = { aadhaar: 'Aadhaar', driving_licence: 'Driving licence', passport: 'Passport', voter_id: 'Voter ID', pan: 'PAN card', company_id: 'Company ID card', other: 'Other ID' };
export type IdCapture = 'off' | 'on' | 'with_image';

/** The last 4 characters of an ID number, upper case; null unless exactly 4 letters or digits (never a full number). */
export function idLast4(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(s) ? s : null;
}

/** Why the ID given does not fit the location's rule, or null. A minor gives no ID (614). */
export function idProblem(rule: IdCapture, minor: boolean, id: { type?: string | null; last4?: string | null }): string | null {
  const given = Boolean(id.type || id.last4);
  if (minor) return given ? 'Visitors under 18 do not give ID proof.' : null;
  if (rule === 'off') return given ? 'This location does not take ID proof.' : null;
  if (!id.type || !(ID_TYPES as readonly string[]).includes(id.type)) return 'Choose the ID type.';
  if (!id.last4 || !idLast4(id.last4)) return 'Enter only the last 4 characters of the ID number.';
  return null;
}

/** An image of an Aadhaar card shows the full number, so none is kept (UIDAI). */
export const imageAllowed = (type: string | null | undefined) => Boolean(type) && type !== 'aadhaar';

/** What a name is matched on: lower case, single spaces. */
export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** 605: a visitor matches an entry by mobile number, or by name. */
export function watchMatches(entry: { mobile: string | null; nameKey: string }, visitor: { name: string; mobile: string | null }): boolean {
  return Boolean(entry.mobile && visitor.mobile && entry.mobile === visitor.mobile) || entry.nameKey === nameKey(visitor.name);
}

/** 605: the day an entry lapses unless reviewed again. */
export const reviewBy = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000);

/** 614: a visitor under 18 comes with a named adult. */
export function minorProblem(minor: boolean, adult: string | null | undefined): string | null {
  if (!minor) return null;
  const a = (adult ?? '').trim();
  return a.length >= 2 && a.length <= 200 ? null : 'Name the adult who comes with a visitor under 18.';
}
