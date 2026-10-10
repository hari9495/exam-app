import { Prisma } from '@prisma/client';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { payScope } from '../payroll/pay-access';
import { daysFrom, wagesDueBy } from './exit-rules';

// LIFE-4.05 the payroll hand-off (design §11): one frozen record per exit case, a new revision whenever something
// payroll needs changes (accepted, last day moved, recovery recorded, asset returned, exited). Payroll reads the
// current revision and never writes to it. No amounts are computed here: only what to recover and why.

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type SettlementCause = 'accepted' | 'lwd_changed' | 'recovery' | 'asset_returned' | 'exited' | 'hold' | 'payees';

/** The days the person's calendar is closed around a date (their location's calendar, else the company's). */
async function holidaysNear(tx: Tx, org: string, locationId: string | null, from: string): Promise<Set<string>> {
  const cal = (locationId && (await tx.holidayCalendar.findFirst({ where: { organizationId: org, locationId } }))) || (await tx.holidayCalendar.findFirst({ where: { organizationId: org, locationId: null } }));
  if (!cal) return new Set();
  const until = new Date(new Date(`${from}T00:00:00Z`).getTime() + 20 * 86_400_000);
  const rows = await tx.holiday.findMany({ where: { organizationId: org, calendarId: cal.id, halfDay: false, holidayOn: { gte: new Date(`${from}T00:00:00Z`), lte: until } }, select: { holidayOn: true } });
  return new Set(rows.map((r) => iso(r.holidayOn)));
}

/** Freezes a new revision in the caller's transaction (opening payroll's guard to that one legal entity for it). */
export async function freezeSettlementIn(tx: Tx, c: CompanyContext, exitCaseId: string, cause: SettlementCause): Promise<number> {
  const org = c.organizationId;
  const k = await tx.exitCase.findFirstOrThrow({ where: { organizationId: org, id: exitCaseId } });
  if (!k.approvedLwd) return 0;
  const e = await tx.employment.findFirstOrThrow({ where: { organizationId: org, id: k.employmentId } });
  const lwd = iso(k.approvedLwd);
  const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null, validFrom: { lte: k.approvedLwd } }, orderBy: { validFrom: 'desc' }, select: { locationId: true } });
  const items = await tx.clearanceItem.findMany({ where: { organizationId: org, exitCaseId } });
  const recoveries = [];
  for (const i of items) {
    if (i.recoveryAmount) recoveries.push({ source: i.department === 'asset' ? 'asset' : 'clearance', title: i.title, amount: i.recoveryAmount.toFixed(2), reason: i.recoveryReason, status: 'recorded' });
    else if (i.status === 'open' && i.assetAssignmentId) {
      // Not returned yet: payroll sees the book value as a possible recovery until it comes back or is signed off.
      const x = await tx.assetAssignment.findFirst({ where: { organizationId: org, id: i.assetAssignmentId } });
      const asset = x ? await tx.asset.findFirst({ where: { organizationId: org, id: x.assetId }, select: { cost: true } }) : null;
      recoveries.push({ source: 'asset', title: i.title, amount: asset?.cost?.toFixed(2) ?? null, reason: 'Not returned yet', status: 'open' });
    }
  }
  await payScope(tx, [e.legalEntityId]);
  const prev = await tx.exitSettlementInput.findFirst({ where: { organizationId: org, exitCaseId, supersededAt: null } });
  if (prev) await tx.exitSettlementInput.update({ where: { id: prev.id }, data: { supersededAt: new Date() } });
  const revision = (prev?.revision ?? 0) + 1;
  await tx.exitSettlementInput.create({
    data: {
      organizationId: org,
      exitCaseId,
      employmentId: e.id,
      legalEntityId: e.legalEntityId,
      revision,
      cause,
      exitType: k.exitType,
      lwd: k.approvedLwd,
      wagesDueBy: new Date(`${wagesDueBy(lwd, await holidaysNear(tx, org, a?.locationId ?? null, lwd))}T00:00:00Z`),
      noticePeriod: k.noticePeriod,
      noticeServedDays: cause === 'exited' && k.acceptedAt ? Math.max(0, daysFrom(iso(k.acceptedAt), lwd)) : null,
      noticeArrangement: (k.noticeArrangement ?? []) as Prisma.InputJsonValue,
      recoveries: recoveries as Prisma.InputJsonValue,
      holds: { letters: k.lettersHeld },
      // Death in service (YX-LC-16): who is paid, and their shares (names and shares only; bank checks are P10).
      payees: (await tx.exitPayee.findMany({ where: { organizationId: org, exitCaseId, removedAt: null }, orderBy: [{ sharePercent: 'desc' }, { name: 'asc' }] })).map((p) => ({ kind: p.kind, name: p.name, relation: p.relation, sharePercent: p.sharePercent.toFixed(2) })) as Prisma.InputJsonValue,
    },
  });
  await payScope(tx, []);
  // Ids only (Confidential): payroll reads the record itself.
  await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'exit.settlement_inputs.ready', payload: { exitCaseId, revision } } });
  return revision;
}

/** The current revision and the earlier ones (for the hand-off view), read under payroll's guard for that entity. */
export async function settlementOf(tx: Tx, org: string, exitCaseId: string, legalEntityId: string) {
  await payScope(tx, [legalEntityId]);
  const rows = await tx.exitSettlementInput.findMany({ where: { organizationId: org, exitCaseId }, orderBy: { revision: 'desc' } });
  await payScope(tx, []);
  return rows;
}
