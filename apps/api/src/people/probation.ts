import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { ScopeContext, SETTINGS, resolveSetting } from '../org-structure/settings-registry';

// M01 §3.4 probation plans. The outcome lives in the dated employment status (P06): a probation ends with an
// approved confirmation change, never by editing this row. The row keeps the planned dates, extensions and
// the daily job's reminder / escalation marks (YX-LC-01).

/** The scopes of an employment's assignment, for settings resolution (YX-ORG-18). */
export interface ProbationScope {
  legalEntityId: string;
  employmentTypeId?: string | null;
  gradeId?: string | null;
}

/** A setting's value for the company, entity, employment type and grade given (most specific first). */
export async function settingFor(tx: Tx, c: CompanyContext, key: keyof typeof SETTINGS & string, scope: ProbationScope, asOf: string | null = null): Promise<string> {
  const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key } });
  const context: ScopeContext = { tenant: c.organizationId, legal_entity: scope.legalEntityId, employment_type: scope.employmentTypeId ?? undefined, grade: scope.gradeId ?? undefined };
  const resolved = resolveSetting(
    SETTINGS[key],
    rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? r.validFrom.toISOString().slice(0, 10) : null })),
    context,
    asOf,
  );
  return String(resolved.value);
}

/** The day before `start` + `months` months, month ends clamped by PostgreSQL (31 Jan + 1 month = 28 Feb). */
export async function endAfterMonths(tx: Tx, start: string, months: number): Promise<string> {
  const [{ d }] = await tx.$queryRaw<{ d: string }[]>`SELECT ((${start}::date + make_interval(months => ${months}::int))::date - 1)::text AS d`;
  return d;
}

/** A joiner on probation gets the plan from the company's probation length (M01 Q3, starter 6 months). */
export async function startProbation(tx: Tx, c: CompanyContext, employmentId: string, joinedOn: string, scope: ProbationScope): Promise<void> {
  const months = Number(await settingFor(tx, c, 'probation.default_months', scope));
  const end = new Date(`${await endAfterMonths(tx, joinedOn, months)}T00:00:00Z`);
  await tx.probation.create({
    data: { organizationId: c.organizationId, employmentId, startOn: new Date(`${joinedOn}T00:00:00Z`), originalEndOn: end, plannedEndOn: end, createdBy: c.userId ?? null },
  });
}
