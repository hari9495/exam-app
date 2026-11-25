import { Prisma } from '@prisma/client';
import { CompanyContext, Tx, audit } from '../org-structure/org-structure.service';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { asDate, monthRange } from '../time/time-core';
import { withPayScope } from './pay-access';

// HLP-12 founder answer 65: payroll's injury days (special days, kind injury: the IN.EC injury pay) fill each month from
// approved leave of the company's injury leave type (setting accident.injury_leave_type). A filled row is source 'leave'
// and follows the leave (0 days once it is cancelled: the app may not delete). A row payroll typed or edited (source
// 'payroll') is never changed. A locked or filed month is never changed.

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** The company's injury leave type, or null when it has none. */
async function injuryType(tx: Tx, org: string, today: string) {
  const rows = await tx.setting.findMany({ where: { organizationId: org, key: 'accident.injury_leave_type' } });
  const code = String(resolveSetting(SETTINGS['accident.injury_leave_type'], rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: org }, today).value).trim();
  return code ? tx.leaveType.findFirst({ where: { organizationId: org, code }, select: { id: true, paid: true, code: true } }) : null;
}

/** Fills one legal entity's month; returns how many rows changed. Safe to run again (the same leave gives the same rows). */
export async function fillInjuryDays(tx: Tx, c: CompanyContext, legalEntityId: string, month: string, today: string): Promise<number> {
  const org = c.organizationId;
  const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId, payGroupId: null, periodStart: asDate(`${month}-01`) } });
  const locked = p && (p.stage === 'locked' || p.stage === 'filed');
  const type = await injuryType(tx, org, today);
  if (!type) return 0;
  const { from, to } = monthRange(month);
  // Approved days of that type in the month, per employment of the entity (a half day counts half).
  const taken = await tx.$queryRaw<{ employmentId: string; employeeId: string; days: string }[]>`
    SELECT em.id::text AS "employmentId", em.employee_id::text AS "employeeId", sum(d.portion)::text AS days FROM leave_request_days d
    JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending') AND r.leave_type_id = ${type.id}::uuid
    JOIN employments em ON em.organization_id = d.organization_id AND em.employee_id = d.employee_id AND em.legal_entity_id = ${legalEntityId}::uuid
      AND em.joined_on <= d.leave_on AND (em.exited_on IS NULL OR em.exited_on >= d.leave_on)
    WHERE d.organization_id = ${org}::uuid AND d.active AND d.leave_on BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1, 2`;
  const periodStart = asDate(from);
  return withPayScope(tx, [legalEntityId], async () => {
    const rows = await tx.specialDays.findMany({ where: { organizationId: org, legalEntityId, periodStart, kind: 'injury' } });
    // Founder answer 93: a locked month never changes. Injury days approved since (more than the month paid) become a
    // correction shown on the next open month's run for payroll to review; never applied by the app.
    if (locked) return lateInjury(tx, c, p!.id, legalEntityId, month, type.code, taken, rows);
    let changed = 0;
    for (const t of taken) {
      const days = D(t.days).toDecimalPlaces(2);
      const row = rows.find((r) => r.employmentId === t.employmentId);
      if (row?.source === 'payroll') continue;
      const inFeedDays = type.paid ? D(0) : days;
      if (row && row.days.eq(days) && row.inFeedDays.eq(inFeedDays)) continue;
      const data = { days, inFeedDays, daysBefore: 0, note: `From approved ${type.code} leave in Time`, source: 'leave', enteredBy: null, enteredAt: new Date() };
      if (row) await tx.specialDays.update({ where: { id: row.id }, data });
      else await tx.specialDays.create({ data: { organizationId: org, legalEntityId, employeeId: t.employeeId, employmentId: t.employmentId, periodStart, kind: 'injury', ...data } });
      await audit(tx, c, 'payroll.special_days.filled', 'employee', t.employeeId, { month, kind: 'injury', days: days.toFixed(2), from: row?.days.toFixed(2) ?? null });
      changed++;
    }
    // Leave cancelled or rejected since: the filled row drops to 0 days (kept, as the app may not delete).
    for (const row of rows.filter((r) => r.source === 'leave' && r.days.gt(0) && !taken.some((t) => t.employmentId === r.employmentId))) {
      await tx.specialDays.update({ where: { id: row.id }, data: { days: 0, inFeedDays: 0, note: `No approved ${type.code} leave in Time now`, enteredAt: new Date() } });
      await audit(tx, c, 'payroll.special_days.filled', 'employee', row.employeeId, { month, kind: 'injury', days: '0.00', from: row.days.toFixed(2) });
      changed++;
    }
    return changed;
  });
}

/** The next month after `month` whose period is not locked or filed (the run that shows the correction). */
async function nextOpenMonth(tx: Tx, org: string, legalEntityId: string, month: string): Promise<string> {
  const d = new Date(`${month}-01T00:00:00Z`);
  for (let i = 0; i < 24; i++) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    const m = d.toISOString().slice(0, 7);
    const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId, payGroupId: null, periodStart: asDate(`${m}-01`) }, select: { stage: true } });
    if (!p || (p.stage !== 'locked' && p.stage !== 'filed')) return m;
  }
  return d.toISOString().slice(0, 7);
}

/** Answer 93: one correction per person and locked month for the days not paid there (a later change adds another). */
async function lateInjury(
  tx: Tx,
  c: CompanyContext,
  periodId: string,
  legalEntityId: string,
  month: string,
  code: string,
  taken: { employmentId: string; employeeId: string; days: string }[],
  rows: { employmentId: string; days: Prisma.Decimal; source: string }[],
): Promise<number> {
  const org = c.organizationId;
  let made = 0;
  for (const t of taken) {
    const row = rows.find((r) => r.employmentId === t.employmentId);
    // Payroll typed its own value for that month: payroll already decided; nothing to raise.
    if (row?.source === 'payroll') continue;
    const missing = D(t.days).sub(row?.days ?? 0).toDecimalPlaces(2);
    if (missing.lte(0)) continue;
    const earlier = await tx.payCorrection.findMany({ where: { organizationId: org, employeeId: t.employeeId, payPeriodId: periodId, source: 'injury_leave' }, select: { change: true } });
    const raised = earlier.reduce((s, e) => s.add(D((e.change as { injuryDays?: string }).injuryDays ?? 0)), D(0));
    const more = missing.sub(raised).toDecimalPlaces(2);
    if (more.lte(0)) continue;
    const target = await nextOpenMonth(tx, org, legalEntityId, month);
    const x = await tx.payCorrection.create({
      data: { organizationId: org, legalEntityId, employeeId: t.employeeId, payPeriodId: periodId, workOn: asDate(`${month}-01`), kind: 'leave', source: 'injury_leave', change: { injuryDays: more.toFixed(2), month }, reason: `${more.toFixed(2)} days of ${code} leave in ${month} were approved after the month was locked`, status: 'approved', targetPeriod: asDate(`${target}-01`), createdBy: c.userId ?? null, decidedAt: new Date() },
    });
    await audit(tx, c, 'payroll.correction.injury_leave', 'pay_correction', x.id, { employeeId: t.employeeId, month, days: more.toFixed(2), showIn: target });
    made++;
  }
  return made;
}
