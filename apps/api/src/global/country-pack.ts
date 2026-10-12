import { Prisma } from '@prisma/client';

// Batch G1 (G1-GLOBAL-CORE-BUILD-DESIGN §2): a country pack is a P07 rule set `<CC>.PACK` of kind `country_pack`.
// The code knows the field names and the shape, never a country's values (YX-GLB-16): those are dated pack data.

/** The YukthiX person-field catalogue (gap pass G3). A pack rules every one: required, optional or not allowed. */
export const PERSON_FIELDS = [
  'legalName',
  'dateOfBirth',
  'gender',
  'maritalStatus',
  'nationality',
  'fatherOrSpouseName',
  'disability',
  'bloodGroup',
  'religion',
  'casteCategory',
  'ethnicity',
  'pan',
  'aadhaar',
  'uan',
  'esic',
  'passport',
  'socialSecurityNumber',
  'nationalInsuranceNumber',
  'emiratesId',
] as const;
export type PersonField = (typeof PERSON_FIELDS)[number];
export const FIELD_RULES = ['required', 'optional', 'not_allowed'] as const;
export type FieldRule = (typeof FIELD_RULES)[number];

/** Languages a company may use for its people (P04 Q4). */
export const LANGUAGES = ['en', 'hi', 'ta', 'te'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface CountryPack {
  country: string;
  version: string;
  verify: boolean;
  source: string;
  name: string;
  currency: string;
  fyStartMonth: number;
  dataRegion: string;
  /** Decimal string: the most a full-time week may be. */
  normalWeekHours: string;
  languages: Language[];
  entityIds: { key: string; required: boolean }[];
  registrations: string[];
  personFields: Record<PersonField, FieldRule>;
}

export class PackError extends Error {}

const HOURS = /^\d{1,2}(\.5)?$/;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A published rule set's values as a country pack; a malformed pack is refused, never half-read. */
export function parsePack(rs: { jurisdiction: string; version: string; verify: boolean; source: string; values: unknown }): CountryPack {
  const v = rs.values;
  const bad = (what: string) => new PackError(`The ${rs.jurisdiction} country pack ${rs.version}: ${what}.`);
  if (!isObj(v) || v.kind !== 'country_pack') throw bad('is not a country pack');
  if (typeof v.name !== 'string' || !v.name) throw bad('has no name');
  if (typeof v.currency !== 'string' || !/^[A-Z]{3}$/.test(v.currency)) throw bad('has no currency');
  if (!Number.isInteger(v.fyStartMonth) || (v.fyStartMonth as number) < 1 || (v.fyStartMonth as number) > 12) throw bad('has no financial year start');
  if (typeof v.dataRegion !== 'string' || !v.dataRegion) throw bad('has no data region');
  if (typeof v.normalWeekHours !== 'string' || !HOURS.test(v.normalWeekHours) || Number(v.normalWeekHours) <= 0 || Number(v.normalWeekHours) > 80) throw bad('has no normal week (hours, 1 to 80)');
  const languages = v.languages;
  if (!Array.isArray(languages) || !languages.length || languages.some((l) => !(LANGUAGES as readonly unknown[]).includes(l))) throw bad('lists a language YukthiX does not have');
  const ids = v.entityIds;
  if (!Array.isArray(ids) || ids.some((x) => !isObj(x) || typeof x.key !== 'string' || typeof x.required !== 'boolean')) throw bad('has malformed entity identifiers');
  const regs = v.registrations;
  if (!Array.isArray(regs) || regs.some((r) => typeof r !== 'string')) throw bad('has malformed registrations');
  const pf = v.personFields;
  if (!isObj(pf)) throw bad('has no person fields');
  for (const k of Object.keys(pf)) if (!(PERSON_FIELDS as readonly string[]).includes(k)) throw bad(`names an unknown person field "${k.slice(0, 40)}"`);
  for (const k of PERSON_FIELDS) if (!(FIELD_RULES as readonly unknown[]).includes(pf[k])) throw bad(`does not rule the person field "${k}"`);
  return {
    country: rs.jurisdiction,
    version: rs.version,
    verify: rs.verify,
    source: rs.source,
    name: v.name,
    currency: v.currency,
    fyStartMonth: v.fyStartMonth as number,
    dataRegion: v.dataRegion,
    normalWeekHours: v.normalWeekHours,
    languages: languages as Language[],
    entityIds: ids as { key: string; required: boolean }[],
    registrations: regs as string[],
    personFields: pf as Record<PersonField, FieldRule>,
  };
}

/** FTE % = hours ÷ normal week × 100 (2 places); empty hours are full-time. Gap pass C1: computed, never typed. */
export function ftePercent(hoursPerWeek: string | null, normalWeekHours: string): string {
  if (hoursPerWeek === null) return '100.00';
  return new Prisma.Decimal(hoursPerWeek).div(normalWeekHours).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}
