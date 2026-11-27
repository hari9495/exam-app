import type { Prisma } from '@prisma/client';
import type { SettingDef } from './settings-registry';

// T2-G 84a (answer 2743): the company's own words for a fixed list of terms ("Business unit" for Department). Each is a
// company setting (Settings 1.1 › Language and region), YukthiX's word by default. The web and the kit change the words
// on their labels (packages/yx-ui/src/lib/terms.ts, the same rules); here they change notification and email text.

export const TERM_KEYS = ['department', 'sub_department', 'grade', 'designation', 'location', 'legal_entity', 'employee'] as const;
export type TermKey = (typeof TERM_KEYS)[number];
export type Terms = Record<TermKey, { one: string; many: string }>;

export const DEFAULT_TERMS: Terms = {
  department: { one: 'Department', many: 'Departments' },
  sub_department: { one: 'Sub-department', many: 'Sub-departments' },
  grade: { one: 'Grade', many: 'Grades' },
  designation: { one: 'Designation', many: 'Designations' },
  location: { one: 'Location', many: 'Locations' },
  legal_entity: { one: 'Legal entity', many: 'Legal entities' },
  employee: { one: 'Employee', many: 'Employees' },
};

export const TERM_MAX = 30;
/** Plain words only: letters (any script), digits, spaces and & ' . / - (no markup, no line breaks). */
export const TERM_TEXT = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} &'./-]*$/u;
export const termSettingKey = (k: TermKey, n: 'one' | 'many') => `terms.${k}.${n}`;

/** The registry entries: one setting per term and number, company-wide, text up to TERM_MAX characters. */
export const TERM_SETTINGS: Record<string, SettingDef> = Object.fromEntries(
  TERM_KEYS.flatMap((k) =>
    (['one', 'many'] as const).map((n) => [
      termSettingKey(k, n),
      { label: `Our word for "${DEFAULT_TERMS[k][n]}"`, scopes: ['tenant'], dated: false, values: [], text: { maxLength: TERM_MAX }, default: DEFAULT_TERMS[k][n] } satisfies SettingDef,
    ]),
  ),
);

/** A term setting's value is one short line of plain words (null: fine; else the problem in plain words). */
export function termProblem(value: string): string | null {
  if (/[\r\n]/.test(value)) return 'Write the word on one line.';
  if (!TERM_TEXT.test(value)) return 'Use letters, numbers, spaces and & \' . / - only.';
  return null;
}

/** The company's words (YukthiX's where none is saved). */
export async function companyTerms(tx: Pick<Prisma.TransactionClient, 'setting'>, organizationId: string): Promise<Terms> {
  const rows = await tx.setting.findMany({ where: { organizationId, scopeType: 'tenant', key: { startsWith: 'terms.' } }, select: { key: true, value: true } });
  const saved = new Map(rows.map((r) => [r.key, String(r.value ?? '').trim()]));
  return Object.fromEntries(TERM_KEYS.map((k) => [k, { one: saved.get(termSettingKey(k, 'one')) || DEFAULT_TERMS[k].one, many: saved.get(termSettingKey(k, 'many')) || DEFAULT_TERMS[k].many }])) as Terms;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Statutory names keep the law's words ("Employees' Provident Fund", "Employees' State Insurance").
const LAW_AFTER = /^(['’]|\s+(Provident|State Insurance|Pension|Deposit|Compensation))/i;

/**
 * Puts the company's words in place of YukthiX's in text (a label, a sentence, the text parts of an email's HTML). Whole
 * words only, never inside a web address or a tag; a word that starts with a capital keeps it, one in lower case is
 * written in lower case (unless the company's word is an abbreviation such as "BU"); words in capitals stay as they are.
 */
export function applyTerms(text: string, terms: Terms): string {
  const pairs: [string, string][] = [];
  for (const k of TERM_KEYS) for (const n of ['many', 'one'] as const) if (terms[k][n] !== DEFAULT_TERMS[k][n]) pairs.push([DEFAULT_TERMS[k][n], terms[k][n]]);
  if (!pairs.length || !text) return text;
  // Longest first, so "Sub-departments" wins over "Departments" and "Departments" over "Department".
  pairs.sort((a, b) => b[0].length - a[0].length);
  const byWord = new Map(pairs.map(([from, to]) => [from.toLowerCase(), to]));
  const re = new RegExp(`(?<![\\p{L}\\p{N}/_-])(${pairs.map(([from]) => escape(from)).join('|')})(?![\\p{L}\\p{N}/_-])`, 'giu');
  const swap = (part: string) =>
    part.replace(re, (match: string, _w: string, offset: number) => {
      if (match.length > 1 && match === match.toUpperCase()) return match;
      if (LAW_AFTER.test(part.slice(offset + match.length))) return match;
      const to = byWord.get(match.toLowerCase())!;
      const abbreviation = to.length > 1 && to[1] === to[1]!.toUpperCase() && /\p{Lu}/u.test(to[1]!);
      if (match[0] === match[0]!.toUpperCase()) return to[0]!.toUpperCase() + to.slice(1);
      return abbreviation ? to : to[0]!.toLowerCase() + to.slice(1);
    });
  // Only the text between tags changes; tags and their attributes (links) never do.
  return text.split(/(<[^>]*>)/).map((p) => (p.startsWith('<') ? p : swap(p))).join('');
}
