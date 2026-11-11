import type { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { audit } from '../org-structure/org-structure.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The week's hours in hundredths from a timesheet's minutes (rounded to the nearest hundredth of an hour). */
export const centiOfMinutes = (minutes: number) => Math.round((minutes * 100) / 60);

/**
 * Answer 497: an own-payroll worker's approved Time timesheet becomes the placement's week of hours (waiting for the
 * client, source "time"), once. A week the account manager already entered, or one taken from this timesheet before,
 * is left alone: never counted twice. The account manager can still change the hours; the source stays shown.
 * shortcut: only a week starting on a Monday with exactly one own placement of the employee in it flows in; a worker
 * on two placements that week is left to the account manager. Upgrade when weeks can be split across placements.
 */
export async function hoursFromTimesheet(tx: Tx, c: CompanyContext, ts: { id: string; employeeId: string; weekStart: Date; totalMinutes: number }): Promise<string | null> {
  const week = iso(ts.weekStart);
  if (new Date(`${week}T00:00:00Z`).getUTCDay() !== 1 || ts.totalMinutes <= 0) return null;
  const placements = await tx.staffingPlacement.findMany({ where: { organizationId: c.organizationId, supply: 'own', employeeId: ts.employeeId, status: 'active', startOn: { lte: new Date(`${plus(week, 6)}T00:00:00Z`) }, endOn: { gte: ts.weekStart } }, select: { id: true, clientId: true } });
  if (placements.length !== 1) return null;
  const p = placements[0]!;
  const taken = await tx.staffingHours.findFirst({ where: { organizationId: c.organizationId, OR: [{ placementId: p.id, weekStart: ts.weekStart }, { timesheetId: ts.id }] }, select: { id: true } });
  if (taken) return null;
  const centi = Math.min(centiOfMinutes(ts.totalMinutes), 16800);
  const row = await tx.staffingHours.create({ data: { organizationId: c.organizationId, placementId: p.id, clientId: p.clientId, weekStart: ts.weekStart, hoursCenti: centi, status: 'waiting', source: 'time', timesheetId: ts.id, timeHoursCenti: centi } });
  await audit(tx, c, 'staffing.hours.from_time', 'staffing_placement', p.id, { weekStart: week, timesheetId: ts.id, hours: (centi / 100).toFixed(2) });
  return row.id;
}
