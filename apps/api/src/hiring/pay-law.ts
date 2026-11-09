import { Prisma } from '@prisma/client';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';

// HIR-24 (founder decision 7, 9 Nov 2026): whether a job's location requires its pay range on the ad and bans the
// pay-history question comes from the rule set HIR.PAY_TRANSPARENCY (statutory_rule_sets, every row marked verify),
// never code. Where no row applies (India, or a job without a location), both are the company's choice
// (settings hiring.pay_range.show and hiring.pay_history.ask).

export const PAY_STATUTE = 'HIR.PAY_TRANSPARENCY';

export interface PayLaw {
  rangeRequired: boolean;
  historyBanned: boolean;
  /** The law's short name ("New York pay transparency law"), null when no rule applies. */
  name: string | null;
  source: string | null;
  verify: boolean;
}

export const NO_PAY_LAW: PayLaw = { rangeRequired: false, historyBanned: false, name: null, source: null, verify: false };

export interface PayRuleRow {
  jurisdiction: string;
  values: unknown;
  source: string;
  verify: boolean;
}

/** The rule for a place: its state code ("US-NY"), then its country ("IN"), then a row listing the country (EU). */
export function pickPayLaw(rows: PayRuleRow[], place: { country: string; state: string } | null): PayLaw {
  if (!place) return NO_PAY_LAW;
  const country = place.country.trim().toUpperCase();
  const listed = (r: PayRuleRow) => Array.isArray((r.values as { countries?: unknown }).countries) && ((r.values as { countries: string[] }).countries).includes(country);
  const row = rows.find((r) => r.jurisdiction === place.state) ?? rows.find((r) => r.jurisdiction === country) ?? rows.find(listed);
  if (!row) return NO_PAY_LAW;
  const v = row.values as { rangeRequired?: boolean; historyBanned?: boolean; name?: string };
  return { rangeRequired: v.rangeRequired === true, historyBanned: v.historyBanned === true, name: v.name ?? row.jurisdiction, source: row.source, verify: row.verify };
}

/** The law for a job's location (a P01 location of the company) on a day (YYYY-MM-DD, India time). */
export async function payLawFor(tx: Prisma.TransactionClient, organizationId: string, locationId: string | null, on: string): Promise<{ law: PayLaw; legalEntityId: string | null; place: string | null }> {
  const loc = locationId ? await tx.location.findFirst({ where: { organizationId, id: locationId }, select: { country: true, state: true, legalEntityId: true, name: true } }) : null;
  if (!loc) return { law: NO_PAY_LAW, legalEntityId: null, place: null };
  const day = new Date(`${on}T00:00:00Z`);
  const rows = await tx.statutoryRuleSet.findMany({
    where: { statute: PAY_STATUTE, status: 'published', validFrom: { lte: day }, OR: [{ validTo: null }, { validTo: { gte: day } }] },
    orderBy: { validFrom: 'desc' },
    select: { jurisdiction: true, values: true, source: true, verify: true },
  });
  return { law: pickPayLaw(rows, loc), legalEntityId: loc.legalEntityId, place: loc.name };
}

/** The company's choices for a new job at a location (most specific scope first). */
export async function payDefaults(tx: Prisma.TransactionClient, organizationId: string, scope: { legalEntityId: string | null; locationId: string | null }) {
  const rows = await tx.setting.findMany({ where: { organizationId, key: { in: ['hiring.pay_range.show', 'hiring.pay_history.ask'] } } });
  const ctx = { tenant: organizationId, legal_entity: scope.legalEntityId ?? undefined, location: scope.locationId ?? undefined };
  const value = (key: 'hiring.pay_range.show' | 'hiring.pay_history.ask') =>
    resolveSetting(SETTINGS[key], rows.filter((r) => r.key === key).map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), ctx, null).value;
  return { showRange: value('hiring.pay_range.show') === 'on', askHistory: value('hiring.pay_history.ask') === 'on' };
}

/** A job's pay facts after a change. `isPublic`: on the careers site, taking public applications or on a job board. */
export interface JobPay {
  salaryMin: number | null;
  salaryMax: number | null;
  showSalary: boolean;
  askPayHistory: boolean;
  isPublic: boolean;
}

/** The refusal for a job's pay facts under its location's law, in plain words, or null when they are fine. */
export function payProblem(job: JobPay, law: PayLaw): string | null {
  const where = law.name ?? 'this location';
  if (job.salaryMin != null && job.salaryMax != null && job.salaryMin > job.salaryMax) return 'The minimum pay must not be more than the maximum. Fix the range and try again.';
  if (law.historyBanned && job.askPayHistory) return `The ${where} bans asking applicants about their current or past pay. Switch the question off.`;
  if (law.rangeRequired && !job.showSalary) return `The ${where} requires the pay range on the job. It cannot be hidden.`;
  if (law.rangeRequired && job.isPublic && (job.salaryMin == null || job.salaryMax == null)) return `The ${where} requires a pay range before the job is published. Add a minimum and a maximum.`;
  return null;
}
