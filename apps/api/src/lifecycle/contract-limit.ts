import { showDate } from '../people/employee-import';

// PPL-49 (founder Q4, 30 Oct 2026): a fixed-term contract runs at most `contract.max_years` from the joining day
// (company setting, default 3 years; 'none' is no limit). Joined 1 Apr 2024 with 3 years: the last allowed end is
// 31 Mar 2027. A 29 Feb joining ends on 28 Feb.

/** The last day a fixed-term contract may end on, or null when the company sets no limit. */
export function latestContractEnd(joinedOn: string, maxYears: string): string | null {
  if (maxYears === 'none') return null;
  const [y, m, d] = joinedOn.split('-').map(Number);
  const years = Number(maxYears);
  // The same day N years on, minus one day; a 29 Feb joining rolls to 1 Mar first, so it ends on 28 Feb.
  const end = new Date(Date.UTC(y + years, m - 1, d) - 86_400_000);
  return end.toISOString().slice(0, 10);
}

/** The refusal for an end past the limit, or null when it is within it. */
export function contractLimitProblem(joinedOn: string, contractEndOn: string, maxYears: string): string | null {
  const latest = latestContractEnd(joinedOn, maxYears);
  if (!latest || contractEndOn <= latest) return null;
  return `The new end is after the ${maxYears}-year limit for fixed-term contracts. The latest end is ${showDate(latest)}; make them permanent instead, or HR changes the limit in Settings.`;
}
