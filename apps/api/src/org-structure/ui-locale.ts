import { employeeLanguage, readerLanguage } from '../global/global-data';
import type { CompanyContext, Tx } from './org-structure.service';

// T2-G 84b (answer 2743): the screens' language. Hindi when the person's language is Hindi (their own choice, else
// their legal entity's, else the company's) and the company offers the Hindi screens (on by default); English otherwise,
// and English for every word not yet written in Hindi.

export type UiLocale = 'en' | 'hi';
export const HINDI_SCREENS_KEY = 'people.language.hindi_screens';

async function hindiOffered(tx: Tx, organizationId: string): Promise<boolean> {
  const row = await tx.setting.findFirst({ where: { organizationId, key: HINDI_SCREENS_KEY, scopeType: 'tenant' }, select: { value: true } });
  return String(row?.value ?? 'on') !== 'off';
}

/** The signed-in reader's screen language. */
export async function readerLocale(tx: Tx, c: CompanyContext): Promise<UiLocale> {
  if (!(await hindiOffered(tx, c.organizationId))) return 'en';
  return (await readerLanguage(tx, c)) === 'hi' ? 'hi' : 'en';
}

/** The people (logins) among `userIds` who read Hindi: for their notification emails. */
export async function hindiReaders(tx: Tx, c: CompanyContext, userIds: readonly string[]): Promise<Set<string>> {
  if (!userIds.length || !(await hindiOffered(tx, c.organizationId))) return new Set();
  const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, userId: { in: [...userIds] } }, select: { id: true, userId: true } });
  const out = new Set<string>();
  for (const p of people) if (p.userId && (await employeeLanguage(tx, c, p.id)) === 'hi') out.add(p.userId);
  return out;
}
