import { asDate, isoDate } from '../org-structure/org-validation';
import type { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { resolveSetting, ScopeContext, SETTINGS } from '../org-structure/settings-registry';
import { CountryPack, Language, parsePack } from './country-pack';

// Batch G1 loaders shared by core HR and leave: the country packs in force, a job's normal week, the reader's
// language and the company's translated words. Everything runs inside the caller's company transaction (RLS).

export const SUBJECT_TYPES = ['leave_type', 'designation', 'department', 'grade', 'employment_type', 'location', 'journey_template', 'journey_task', 'expense_category', 'city_tier'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

/** Every published country pack in force on `on`, the latest version per country. */
export async function packsOn(tx: Tx, on: string): Promise<CountryPack[]> {
  const d = asDate(on);
  const rows = await tx.statutoryRuleSet.findMany({
    where: { statute: { endsWith: '.PACK' }, status: 'published', validFrom: { lte: d }, OR: [{ validTo: null }, { validTo: { gte: d } }] },
    orderBy: [{ jurisdiction: 'asc' }, { validFrom: 'desc' }],
  });
  const seen = new Set<string>();
  const out: CountryPack[] = [];
  for (const r of rows) {
    // `<CC>.PACK` for country CC only (a state never has a pack of its own).
    if (r.statute !== `${r.jurisdiction}.PACK` || seen.has(r.jurisdiction)) continue;
    seen.add(r.jurisdiction);
    out.push(parsePack(r));
  }
  return out;
}

export async function packFor(tx: Tx, country: string, on: string): Promise<CountryPack | null> {
  return (await packsOn(tx, on)).find((p) => p.country === country) ?? null;
}

async function settingValue(tx: Tx, c: CompanyContext, key: string, context: ScopeContext): Promise<string> {
  const rows = (await tx.setting.findMany({ where: { organizationId: c.organizationId, key } })).map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? isoDate(r.validFrom) : null }));
  return String(resolveSetting(SETTINGS[key], rows, { tenant: c.organizationId, ...context }, null).value);
}

/** The normal week at a location (hours, decimal string): the company's setting, else the country pack; null when neither. */
export async function normalWeekAt(tx: Tx, c: CompanyContext, locationId: string, on: string): Promise<string | null> {
  const loc = await tx.location.findFirst({ where: { organizationId: c.organizationId, id: locationId }, select: { country: true, legalEntityId: true } });
  if (!loc) return null;
  const value = await settingValue(tx, c, 'work.normal_week_hours', { location: locationId, legal_entity: loc.legalEntityId });
  if (value !== 'pack') return value;
  return (await packFor(tx, loc.country, on))?.normalWeekHours ?? null;
}

/** The company default: the language its own words are typed in. */
export const companyLanguage = (tx: Tx, c: CompanyContext) => settingValue(tx, c, 'people.language', {}) as Promise<Language>;

/** A person's language: their own choice, else their legal entity's, else the company's (G1-GLOBAL-CORE §7). */
export async function employeeLanguage(tx: Tx, c: CompanyContext, employeeId: string): Promise<Language> {
  const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId }, orderBy: { joinedOn: 'desc' }, select: { legalEntityId: true } });
  return (await settingValue(tx, c, 'people.language', { employee: employeeId, ...(e ? { legal_entity: e.legalEntityId } : {}) })) as Language;
}

/** The reader's language from their login (someone with no employee record reads the company's language). */
export async function readerLanguage(tx: Tx, c: CompanyContext): Promise<Language> {
  const me = c.userId ? await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: c.userId }, select: { id: true } }) : null;
  return me ? employeeLanguage(tx, c, me.id) : companyLanguage(tx, c);
}

/**
 * The company's words in `language` for these subjects: id → translated text. Ids without a translation are
 * absent (the caller keeps the company's own words), and nothing is looked up in the company default language.
 */
export async function translated(tx: Tx, c: CompanyContext, language: Language, subjectType: SubjectType, ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length || language === (await companyLanguage(tx, c))) return new Map();
  const rows = await tx.contentTranslation.findMany({ where: { organizationId: c.organizationId, subjectType, language, subjectId: { in: [...new Set(ids)] } }, select: { subjectId: true, text: true } });
  return new Map(rows.map((r) => [r.subjectId, r.text]));
}

/**
 * Journey names and step titles in the reader's language (lifecycle 6f screens). A journey's steps are copies of its
 * template's steps, matched back by the step key.
 */
export async function journeyWords(tx: Tx, c: CompanyContext, journeys: readonly { id: string; templateId: string }[]) {
  const lang = await readerLanguage(tx, c);
  const templateIds = [...new Set(journeys.map((j) => j.templateId))];
  const names = await translated(tx, c, lang, 'journey_template', templateIds);
  const steps = lang === (await companyLanguage(tx, c)) ? [] : await tx.journeyTemplateTask.findMany({ where: { organizationId: c.organizationId, templateId: { in: templateIds } }, select: { id: true, templateId: true, key: true } });
  const words = await translated(tx, c, lang, 'journey_task', steps.map((s) => s.id));
  const templateOf = new Map(journeys.map((j) => [j.id, j.templateId]));
  const stepId = new Map(steps.map((s) => [`${s.templateId}:${s.key}`, s.id]));
  return {
    template: (templateId: string, base: string) => names.get(templateId) ?? base,
    step: (journeyId: string, key: string, base: string) => words.get(stepId.get(`${templateOf.get(journeyId)}:${key}`) ?? '') ?? base,
  };
}
