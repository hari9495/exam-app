// PPL-46: IBAN and BIC checks, and how net pay splits over up to 3 accounts. Pure, so it is unit-tested.

/** IBAN length per country (ISO 13616 registry, the countries YukthiX pays into today). */
const IBAN_LENGTH: Record<string, number> = { AE: 23, GB: 22, DE: 22, FR: 27, NL: 18, SA: 24, QA: 29, BH: 22, KW: 30, OM: 23 };

export const compact = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** A valid IBAN: the country's length and the mod-97 check digits. */
export function isIban(raw: string): boolean {
  const s = compact(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const len = IBAN_LENGTH[s.slice(0, 2)];
  if (!len || s.length !== len) return false;
  const moved = `${s.slice(4)}${s.slice(0, 4)}`.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of moved) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}

/** A BIC / SWIFT code: 8 or 11 characters (bank, country, location, branch). */
export const isBic = (raw: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact(raw));

export interface SplitRule {
  rule: 'remainder' | 'fixed' | 'percent';
  value: number;
}

/**
 * The split's problem in plain words, or null: at most 3 accounts, exactly one remainder (the primary), fixed amounts
 * of 0 or more, percentages above 0 and at most 100 in total, and (for a month's net pay) never more than the net.
 */
export function splitProblem(rules: SplitRule[], net?: number): string | null {
  if (!rules.length) return 'Add at least one account.';
  if (rules.length > 3) return 'Use up to 3 accounts.';
  if (rules.filter((r) => r.rule === 'remainder').length !== 1) return 'One account takes the remainder: the primary one.';
  if (rules.some((r) => r.rule === 'fixed' && !(r.value > 0))) return 'A fixed amount is more than 0.';
  if (rules.some((r) => r.rule === 'percent' && !(r.value > 0 && r.value <= 100))) return 'A percentage is more than 0 and at most 100.';
  const pct = rules.filter((r) => r.rule === 'percent').reduce((s, r) => s + r.value, 0);
  if (pct > 100) return 'The percentages add up to more than 100.';
  if (net !== undefined) {
    const fixed = rules.filter((r) => r.rule === 'fixed').reduce((s, r) => s + r.value, 0);
    if (fixed > net) return 'The fixed amounts are more than the net pay.';
    if (fixed + ((net - fixed) * pct) / 100 > net) return 'The split is more than the net pay.';
  }
  return null;
}
