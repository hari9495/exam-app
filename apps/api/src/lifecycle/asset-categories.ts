import { Prisma } from '@prisma/client';

// IT assets part 1 (founder answer 2712): the company's asset categories (Settings 2.8) and the F&F recovery of an
// asset that is not returned.

/** The drawn starter list (Settings 2.8); migration 801 added it for every company that existed then. */
export const STARTER_CATEGORIES: { name: string; trackedBy: string; defaultRecovery: string | null; usefulLifeYears: number | null }[] = [
  { name: 'Laptop', trackedBy: 'Serial number', defaultRecovery: '45000.00', usefulLifeYears: 3 },
  { name: 'Phone', trackedBy: 'IMEI', defaultRecovery: '15000.00', usefulLifeYears: 3 },
  { name: 'SIM', trackedBy: 'Number', defaultRecovery: '500.00', usefulLifeYears: null },
  { name: 'ID / access card', trackedBy: 'Card number', defaultRecovery: '300.00', usefulLifeYears: null },
  { name: 'Safety shoes and PPE kit', trackedBy: 'Tag', defaultRecovery: '2500.00', usefulLifeYears: null },
  { name: 'Tools', trackedBy: 'Tag', defaultRecovery: null, usefulLifeYears: null },
];

/** Answer 2720: a category's tag pattern (no prefix: no pattern). */
export interface TagPattern {
  tagPrefix: string | null;
  tagYear: boolean;
  tagDigits: number;
}

/** What every tag of the pattern starts with this year ("LAP-2026-"), or null without a pattern. */
export const tagHead = (p: TagPattern, year: string): string | null => (p.tagPrefix ? `${p.tagPrefix}-${p.tagYear ? `${year}-` : ''}` : null);

/**
 * The next tag of the pattern: one more than the highest counter among the tags already made with it (typed tags that
 * do not follow it are ignored), padded to the digits; null without a pattern. Tags compare without case.
 */
export function nextTag(p: TagPattern, year: string, tags: string[]): string | null {
  const head = tagHead(p, year);
  if (!head) return null;
  let max = 0;
  for (const t of tags) {
    const rest = t.toUpperCase().startsWith(head.toUpperCase()) ? t.slice(head.length) : '';
    if (/^\d{1,9}$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return `${head}${String(max + 1).padStart(p.tagDigits, '0')}`;
}

export type RecoveryBasis = 'category_default' | 'written_down' | 'hr_decides';

/**
 * The amount payroll sees for an asset not returned (a possible recovery), or null when HR decides it. "Category
 * default" uses the category's amount, else the asset's cost (as before categories). "Written-down value" needs
 * depreciation (answer 2713, a later part): until then it is decided by HR each time, like "hr_decides".
 */
export function recoveryAmount(basis: string, categoryDefault: Prisma.Decimal | null | undefined, cost: Prisma.Decimal | null | undefined): string | null {
  if (basis !== 'category_default') return null;
  return (categoryDefault ?? cost)?.toFixed(2) ?? null;
}
