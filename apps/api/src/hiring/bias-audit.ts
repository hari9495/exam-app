import type { Prisma } from '@prisma/client';
import { settingFor } from '../people/probation';
import type { CompanyContext } from '../org-structure/org-structure.service';

// HIR-23 (founder decision 2 and question 7): the bias audit an automated hiring tool needs before it may be used for
// New York City jobs. Which places it covers, its categories and how long an audit lasts come from the rule set
// HIR.BIAS_AUDIT (statutory_rule_sets, marked verify), never code. A company says it uses an automated tool for NYC jobs
// with the setting hiring.bias_audit.nyc (default off). With it on and no audit in the last year, every automated
// scoring (the HIR-26 rediscovery AI notes, the HIR-25 AI draft scorecard) is refused for those jobs with a plain message.

export const BIAS_STATUTE = 'HIR.BIAS_AUDIT';

export interface BiasLaw {
  name: string;
  /** The law's state code, e.g. "US-NY"; the city names it covers (compared with the location's city). */
  jurisdiction: string;
  cities: string[];
  validMonths: number;
  /** Answer 474: candidates are told this many business days before the tool is used (null: the law sets none). */
  noticeBusinessDays: number | null;
  categories: { sex: string[]; race: string[] };
  source: string;
  verify: boolean;
}

export interface Category {
  label: string;
  assessed: number;
  selected: number;
}
export interface AuditResults {
  sex: Category[];
  race: Category[];
}

/** The rule (one row per state) on a day. Null when none is published. */
export async function biasLaw(tx: Prisma.TransactionClient, on: string): Promise<BiasLaw | null> {
  const day = new Date(`${on}T00:00:00Z`);
  const row = await tx.statutoryRuleSet.findFirst({
    where: { statute: BIAS_STATUTE, status: 'published', validFrom: { lte: day }, OR: [{ validTo: null }, { validTo: { gte: day } }] },
    orderBy: { validFrom: 'desc' },
    select: { jurisdiction: true, values: true, source: true, verify: true },
  });
  if (!row) return null;
  const v = row.values as { name?: string; cities?: string[]; validMonths?: number; noticeBusinessDays?: number; categories?: { sex?: string[]; race?: string[] } };
  return {
    name: v.name ?? row.jurisdiction,
    jurisdiction: row.jurisdiction,
    cities: Array.isArray(v.cities) ? v.cities : [],
    validMonths: Number(v.validMonths ?? 12),
    noticeBusinessDays: typeof v.noticeBusinessDays === 'number' ? v.noticeBusinessDays : null,
    categories: { sex: v.categories?.sex ?? [], race: v.categories?.race ?? [] },
    source: row.source,
    verify: row.verify,
  };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Is a job's place covered? A company location: its state and its city. A job with only a free-text place (no location
 * from the masters): covered when the text names one of the cities (conservative: when in doubt, the audit applies).
 */
export function coveredPlace(law: BiasLaw, place: { state?: string | null; city?: string | null; text?: string | null }): boolean {
  const cities = law.cities.map(norm);
  if (place.state !== undefined && place.state !== null) return place.state === law.jurisdiction && cities.includes(norm(place.city ?? ''));
  const text = norm(place.text ?? '');
  return Boolean(text) && cities.some((c) => new RegExp(`(^|[^a-z])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(text));
}

/** The last day an audit counts: the same date `months` later (the day clamped to the month end: 29 Feb + 12 = 28 Feb). */
export function validUntil(auditedOn: string, months: number): string {
  const y = Number(auditedOn.slice(0, 4));
  const m = Number(auditedOn.slice(5, 7)) - 1 + months;
  const ty = y + Math.floor(m / 12);
  const tm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const d = Math.min(Number(auditedOn.slice(8, 10)), last);
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Problems with entered results, in plain words: unknown or missing categories, selected above assessed. */
export function resultsProblem(law: BiasLaw, r: AuditResults): string | null {
  for (const [group, want] of [['sex', law.categories.sex], ['race', law.categories.race]] as const) {
    const got = r[group];
    const labels = got.map((c) => c.label);
    if (new Set(labels).size !== labels.length) return `A category is listed twice under ${group === 'sex' ? 'sex' : 'race / ethnicity'}.`;
    const unknown = labels.find((l) => !want.includes(l));
    if (unknown) return `${unknown} is not a category of ${law.name}.`;
    const missing = want.find((l) => !labels.includes(l));
    if (missing) return `Enter the numbers for ${missing}.`;
    const over = got.find((c) => c.selected > c.assessed);
    if (over) return `${over.label}: selected (${over.selected}) cannot be more than assessed (${over.assessed}).`;
  }
  if (r.sex.every((c) => c.assessed === 0)) return 'Enter how many people were assessed.';
  return null;
}

const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const label = (iso: string) => `${Number(iso.slice(8, 10))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** The company's audit state: the setting, the law, the latest audit and whether it still counts (India date). */
export async function auditState(tx: Prisma.TransactionClient, c: CompanyContext, now = new Date()) {
  const today = istDay(now);
  const nycOn = (await settingFor(tx, c, 'hiring.bias_audit.nyc', { legalEntityId: '' })) === 'on';
  const law = await biasLaw(tx, today);
  const latest = await tx.biasAudit.findFirst({ where: { organizationId: c.organizationId }, orderBy: [{ auditedOn: 'desc' }, { createdAt: 'desc' }] });
  const until = latest && law ? validUntil(latest.auditedOn.toISOString().slice(0, 10), law.validMonths) : null;
  return { today, nycOn, law, latest, validUntil: until, valid: Boolean(until && until >= today) };
}

/**
 * The refusal for an automated tool on a job, or null when it may run: not applicable (setting off, no law, the job not
 * in a covered place) or a valid audit. Never a silent skip: callers show or return this message.
 */
export async function biasAuditBlock(tx: Prisma.TransactionClient, c: CompanyContext, jobId: string, tool: string, now = new Date()): Promise<string | null> {
  if ((await settingFor(tx, c, 'hiring.bias_audit.nyc', { legalEntityId: '' })) !== 'on') return null;
  const s = await auditState(tx, c, now);
  if (!s.nycOn || !s.law || s.valid) return null;
  if (!(await jobCovered(tx, c, s.law, jobId))) return null;
  const last = s.latest ? `The last bias audit was on ${label(s.latest.auditedOn.toISOString().slice(0, 10))}, more than a year ago.` : 'No bias audit is recorded.';
  return `${tool} is blocked for New York City jobs. ${last} HR records a new independent audit in Hiring › Bias audits; other jobs are not affected.`;
}

/** Is the job's place covered by the law (its company location, else its free-text place)? */
export async function jobCovered(tx: Prisma.TransactionClient, c: CompanyContext, law: BiasLaw, jobId: string): Promise<boolean> {
  const job = await tx.job.findFirst({ where: { organizationId: c.organizationId, id: jobId }, select: { locationId: true, location: true } });
  if (!job) return false;
  const loc = job.locationId ? await tx.location.findFirst({ where: { organizationId: c.organizationId, id: job.locationId }, select: { state: true, address: true } }) : null;
  return loc ? coveredPlace(law, { state: loc.state, city: (loc.address as { city?: string } | null)?.city ?? null }) : coveredPlace(law, { text: job.location });
}

/** `n` business days (Monday to Friday) after a date (shortcut: public holidays are not counted out; counsel to confirm). */
export function addBusinessDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Answer 474: the notice a New York City job shows candidates while the company says it uses an automated tool there
 * (hiring.bias_audit.nyc on): which tools are on (what they assess) and the business days of notice from the rule set.
 * Null when the setting is off, no law is published or the job is not in a covered place.
 */
export async function nycNotice(tx: Prisma.TransactionClient, c: CompanyContext, jobId: string, now = new Date()): Promise<{ assesses: string[]; businessDays: number } | null> {
  if ((await settingFor(tx, c, 'hiring.bias_audit.nyc', { legalEntityId: '' })) !== 'on') return null;
  const law = await biasLaw(tx, istDay(now));
  if (!law?.noticeBusinessDays || !(await jobCovered(tx, c, law, jobId))) return null;
  const on = async (k: 'hiring.rediscovery.ai' | 'hiring.notetaker.enabled' | 'hiring.notetaker.ai_draft') => (await settingFor(tx, c, k, { legalEntityId: '' })) === 'on';
  const assesses = [
    (await on('hiring.notetaker.enabled')) && (await on('hiring.notetaker.ai_draft')) ? 'An AI draft of the interview scorecard, from the interview transcript (a person on the panel checks and submits it)' : null,
    (await on('hiring.rediscovery.ai')) ? 'AI notes on how your profile matches other jobs, if you are considered for them later (a recruiter decides)' : null,
  ].filter((x): x is string => Boolean(x));
  return { assesses, businessDays: law.noticeBusinessDays };
}

/**
 * Answer 474: the automated tool on one application: refused when the candidate asked for another process, or before
 * the notice period has run from the day they applied (the notice was on the job page and apply form). Null: may run.
 */
export async function noticeBlock(tx: Prisma.TransactionClient, c: CompanyContext, entry: { jobId: string; createdAt: Date; alternativeRequestedAt: Date | null }, tool: string, now = new Date()): Promise<string | null> {
  const notice = await nycNotice(tx, c, entry.jobId, now);
  if (!notice) return null;
  if (entry.alternativeRequestedAt) return `${tool} is not used for this candidate: they asked for another process on ${label(istDay(entry.alternativeRequestedAt))}.`;
  const from = addBusinessDays(istDay(entry.createdAt), notice.businessDays);
  if (istDay(now) < from) return `${tool} can be used for this candidate from ${label(from)}: New York City candidates are told ${notice.businessDays} business days before.`;
  return null;
}
