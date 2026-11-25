import type { Prisma } from '@prisma/client';
import type { Tx } from '../org-structure/org-structure.service';
import { asDate, dateOf, monthRange } from '../time/time-core';
import { addDays } from '../time/time-maths';

// Enterprise E5 (O17, answer 2657): a pay group's input cut-off and payslip release dates for a month. The group's days
// give the default (cut-off: that day of the month; release: that many days after the period ends, 0 = when published);
// one month can have its own dates, set with a reason (pay_group_period_dates).

export interface PeriodDates {
  month: string;
  cutOff: string;
  /** null: the payslips are released when they are published. */
  release: string | null;
  /** The month's own dates (with the reason), not the group's days. */
  changed: { reason: string; changedAt: string; version: number } | null;
}

type Group = Pick<Prisma.PayGroupGetPayload<object>, 'id' | 'cutOffDay' | 'releaseDay'>;

/** The group's default dates for a month (pure). */
export function defaultDates(g: Pick<Group, 'cutOffDay' | 'releaseDay'>, month: string): Omit<PeriodDates, 'changed'> {
  const { to } = monthRange(month);
  const day = Math.min(g.cutOffDay, Number(to.slice(8)));
  return { month, cutOff: `${month}-${String(day).padStart(2, '0')}`, release: g.releaseDay ? addDays(to, g.releaseDay) : null };
}

/** The dates in force for a month: the month's own, else the group's. */
export async function periodDates(tx: Tx, org: string, g: Group, month: string): Promise<PeriodDates> {
  const own = await tx.payGroupPeriodDate.findFirst({ where: { organizationId: org, payGroupId: g.id, periodStart: asDate(`${month}-01`) } });
  if (!own) return { ...defaultDates(g, month), changed: null };
  return { month, cutOff: dateOf(own.cutOffOn), release: own.releaseOn ? dateOf(own.releaseOn) : null, changed: { reason: own.reason, changedAt: own.changedAt.toISOString(), version: own.version } };
}

/** The pay group of an employment on a day (null: in none). */
export async function groupOf(tx: Tx, org: string, employmentId: string, day: string) {
  const m = await tx.payGroupMember.findFirst({ where: { organizationId: org, employmentId, validFrom: { lte: asDate(day) }, OR: [{ validTo: null }, { validTo: { gte: asDate(day) } }] }, orderBy: { validFrom: 'desc' } });
  return m ? tx.payGroup.findFirst({ where: { organizationId: org, id: m.payGroupId } }) : null;
}
