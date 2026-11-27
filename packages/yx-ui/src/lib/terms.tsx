import { createContext, useContext, useMemo, type ReactNode } from 'react';

// T2-G 84a (answer 2743): the company's own words for a fixed list of terms ("Business unit" for Department). The web
// gives them once (TermsProvider, from GET /org/terms); the kit's labels (form fields, table headers, card and page
// titles, detail lists) put them in place of YukthiX's words through useTerm(). Without a provider (stories, tests) the
// words stay YukthiX's. The API changes notification and email text with the same rules (apps/api/src/org-structure/terms.ts).

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

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Statutory names keep the law's words ("Employees' Provident Fund", "Employees' State Insurance").
const LAW_AFTER = /^(['’]|\s+(Provident|State Insurance|Pension|Deposit|Compensation))/i;

/**
 * Puts the company's words in place of YukthiX's: whole words only, never inside a web address or a tag; a word that
 * starts with a capital keeps it, one in lower case is written in lower case (unless the company's word is an
 * abbreviation such as "BU"); words in capitals and the law's names stay as they are.
 */
export function applyTerms(text: string, terms: Terms): string {
  const pairs: [string, string][] = [];
  for (const k of TERM_KEYS) for (const n of ['many', 'one'] as const) if (terms[k][n] !== DEFAULT_TERMS[k][n]) pairs.push([DEFAULT_TERMS[k][n], terms[k][n]]);
  if (!pairs.length || !text) return text;
  pairs.sort((a, b) => b[0].length - a[0].length);
  const byWord = new Map(pairs.map(([from, to]) => [from.toLowerCase(), to]));
  const re = new RegExp(`(?<![\\p{L}\\p{N}/_-])(${pairs.map(([from]) => escape(from)).join('|')})(?![\\p{L}\\p{N}/_-])`, 'giu');
  const swap = (part: string) =>
    part.replace(re, (match: string, _w: string, offset: number) => {
      if (match.length > 1 && match === match.toUpperCase()) return match;
      if (LAW_AFTER.test(part.slice(offset + match.length))) return match;
      const to = byWord.get(match.toLowerCase())!;
      const abbreviation = to.length > 1 && /\p{Lu}/u.test(to[1]!);
      if (match[0] === match[0]!.toUpperCase()) return to[0]!.toUpperCase() + to.slice(1);
      return abbreviation ? to : to[0]!.toLowerCase() + to.slice(1);
    });
  return text.split(/(<[^>]*>)/).map((p) => (p.startsWith('<') ? p : swap(p))).join('');
}

const TermsContext = createContext<Terms>(DEFAULT_TERMS);

/** The company's words for every screen below (missing ones stay YukthiX's). */
export function TermsProvider({ terms, children }: { terms?: Partial<Terms> | null; children: ReactNode }) {
  const value = useMemo(() => ({ ...DEFAULT_TERMS, ...(terms ?? {}) }), [terms]);
  return <TermsContext.Provider value={value}>{children}</TermsContext.Provider>;
}

/** The company's words, and a function that puts them into a label (anything other than text passes through). */
export function useTerm() {
  const terms = useContext(TermsContext);
  return useMemo(() => {
    const custom = TERM_KEYS.some((k) => terms[k].one !== DEFAULT_TERMS[k].one || terms[k].many !== DEFAULT_TERMS[k].many);
    const t = <V,>(v: V): V => (custom && typeof v === 'string' ? (applyTerms(v, terms) as V) : v);
    return Object.assign(t, { terms, custom });
  }, [terms]);
}
