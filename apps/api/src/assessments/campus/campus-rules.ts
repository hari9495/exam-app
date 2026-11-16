// Assessments AS-3 part 2 (answer 2014; PRC-29): the campus drive's form and eligibility rules, kept pure so the public
// registration, the staff settings and the tests share one copy.

export type FieldMode = 'off' | 'optional' | 'required';
export const CAMPUS_FIELDS = ['phone', 'branch', 'graduationYear', 'cgpa'] as const;
export type CampusField = (typeof CAMPUS_FIELDS)[number];

/** A drive's registration form (name, email, college and roll number are always asked) and eligibility. */
export interface CampusSettings {
  fields: Record<CampusField, FieldMode>;
  /** Branches allowed; empty = any. */
  branches: string[];
  graduationYear: number | null;
  minCgpa: number | null;
  /** Most registrations taken (merged duplicates do not count); null = no cap. */
  cap: number | null;
  /** Tell an ineligible student why (else only that they are not eligible). */
  tellIneligible: boolean;
}

export const DEFAULT_CAMPUS: CampusSettings = {
  fields: { phone: 'required', branch: 'required', graduationYear: 'required', cgpa: 'required' },
  branches: [],
  graduationYear: null,
  minCgpa: null,
  cap: null,
  tellIneligible: true,
};

/** The stored JSON as settings, with defaults for anything missing (an older or partial value never breaks a page). */
export function readCampus(raw: unknown): CampusSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CampusSettings>;
  return {
    fields: { ...DEFAULT_CAMPUS.fields, ...(r.fields ?? {}) },
    branches: Array.isArray(r.branches) ? r.branches : [],
    graduationYear: r.graduationYear ?? null,
    minCgpa: r.minCgpa ?? null,
    cap: r.cap ?? null,
    tellIneligible: r.tellIneligible ?? true,
  };
}

/** Why these settings cannot be saved, or null. A rule needs its field asked and required. */
export function campusSettingsProblem(s: CampusSettings): string | null {
  if (s.branches.length && s.fields.branch !== 'required') return 'Branches are a rule, so the branch must be asked and required.';
  if (s.graduationYear != null && s.fields.graduationYear !== 'required') return 'Graduation year is a rule, so it must be asked and required.';
  if (s.minCgpa != null && s.fields.cgpa !== 'required') return 'Minimum CGPA is a rule, so CGPA must be asked and required.';
  return null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Why this student is not eligible, or null when eligible. */
export function ineligibleReason(s: CampusSettings, r: { branch?: string | null; graduationYear?: number | null; cgpa?: number | null }): string | null {
  if (s.branches.length && !(r.branch && s.branches.some((b) => same(b, r.branch!)))) return `Branch not in this drive (${s.branches.join(', ')})`;
  if (s.graduationYear != null && r.graduationYear !== s.graduationYear) return `Graduation year must be ${s.graduationYear}`;
  if (s.minCgpa != null && (r.cgpa == null || r.cgpa < s.minCgpa)) return `CGPA below ${s.minCgpa}`;
  return null;
}

/** Fields the form requires that the student left empty. */
export function missingFields(s: CampusSettings, r: Partial<Record<CampusField, unknown>>): CampusField[] {
  return CAMPUS_FIELDS.filter((f) => s.fields[f] === 'required' && (r[f] == null || r[f] === ''));
}
