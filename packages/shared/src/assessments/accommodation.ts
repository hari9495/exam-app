// Assessments AS-4b (answer 2011; PRC-23, PRC-11): what a candidate may ask for before a test, and the evidence they may
// send. One copy for the candidate runtime and the API.

/** time: extra time; breaks: extra or longer breaks; reader: screen-reader mode; font: larger font or high contrast;
 *  separate: a separate session; profile: changes to proctoring; identity: a manual identity check (PRC-24). */
export const ACCOMMODATION_KINDS = ['time', 'breaks', 'reader', 'font', 'separate', 'profile', 'identity'] as const;
export type AccommodationKind = (typeof ACCOMMODATION_KINDS)[number];

export const ACCOMMODATION_LABEL: Record<AccommodationKind, string> = {
  time: 'Extra time',
  breaks: 'Extra or longer breaks',
  reader: 'Screen-reader mode',
  font: 'Larger font or high contrast',
  separate: 'A separate session',
  profile: 'Changes to proctoring',
  identity: 'Manual identity check',
};

/** The extra time a candidate may ask for, and the test owner may grant (as today's invitation extra time). */
export const EXTRA_TIME_PERCENTS = [25, 50, 100] as const;

/** Applied by the engine on approval: extra time on the invitation; the others are shown to the candidate and noted. */
export const APPLIED_AUTOMATICALLY: readonly AccommodationKind[] = ['time', 'reader', 'font', 'identity'];

/** Evidence: PDF or a photo, up to 10 MB, checked by its first bytes (never by the name or the claimed type). */
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export function evidenceType(buf: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return 'image/png';
  return null;
}

/** A file name safe to keep: no path, only letters, digits, dot, dash, underscore and space, at most 120 characters. */
export function safeEvidenceName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'evidence';
  const clean = base.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '').slice(-120).trim();
  return clean || 'evidence';
}

/** What the request asks for is valid: known kinds without repeats; extra time named only with "time". Null when fine. */
export function requestProblem(kinds: readonly string[], extraTimePercent: number | null | undefined): string | null {
  if (!kinds.length) return 'Choose what you need.';
  if (new Set(kinds).size !== kinds.length || kinds.some((k) => !(ACCOMMODATION_KINDS as readonly string[]).includes(k))) return 'Choose from the list.';
  if (kinds.includes('time') !== (extraTimePercent != null)) return kinds.includes('time') ? 'Choose how much extra time.' : 'Extra time goes with "Extra time".';
  if (extraTimePercent != null && !(EXTRA_TIME_PERCENTS as readonly number[]).includes(extraTimePercent)) return 'Choose 25 %, 50 % or 100 % extra time.';
  return null;
}
