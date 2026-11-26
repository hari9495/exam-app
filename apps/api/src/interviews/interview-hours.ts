import { BusinessHours, Holiday, WEEKDAYS, type Weekday } from '@exam-platform/shared';
import type { Tx } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';

/** India time: the company setting is kept in IST (answer 2510). */
export const INTERVIEW_TIME_ZONE = 'Asia/Kolkata';
/** Holidays that close the day for interviews; optional and restricted holidays do not. */
const CLOSED_KINDS = ['national', 'festival'];

/** Answers 2423 and 2510: the company's interview hours (Settings 6.1). */
export async function interviewHours(tx: Tx, organizationId: string): Promise<{ from: string; to: string; days: Weekday[] }> {
  const c = { organizationId, isSuperAdmin: false };
  const [from, to, days] = await Promise.all(['hiring.interview_hours.from', 'hiring.interview_hours.to', 'hiring.interview_hours.days'].map((k) => settingFor(tx, c, k, { legalEntityId: '' })));
  return { from: from!, to: to!, days: days ? (days.split(',') as Weekday[]) : [] };
}

/**
 * The hours and holidays a candidate's self-booking is checked against: the 6.1 interview hours, and the published
 * holiday calendar of the job's location, else the company-wide one (no location). Optional holidays stay open.
 */
export async function interviewBookingRules(tx: Tx, organizationId: string, jobLocationId: string | null): Promise<{ businessHours: BusinessHours; holidays: Holiday[] }> {
  const h = await interviewHours(tx, organizationId);
  const days = Object.fromEntries(WEEKDAYS.map((d) => [d, { enabled: h.days.includes(d), open: h.from, close: h.to }])) as BusinessHours['days'];
  const calendars = await tx.holidayCalendar.findMany({
    where: { organizationId, publishedAt: { not: null }, OR: [{ locationId: null }, ...(jobLocationId ? [{ locationId: jobLocationId }] : [])] },
    orderBy: { createdAt: 'asc' },
    select: { id: true, locationId: true },
  });
  const calendar = calendars.find((k) => jobLocationId && k.locationId === jobLocationId) ?? calendars.find((k) => k.locationId === null);
  const rows = calendar ? await tx.holiday.findMany({ where: { organizationId, calendarId: calendar.id, kind: { in: CLOSED_KINDS } }, select: { holidayOn: true, name: true } }) : [];
  return { businessHours: { timeZone: INTERVIEW_TIME_ZONE, days }, holidays: rows.map((r) => ({ date: r.holidayOn.toISOString().slice(0, 10), name: r.name })) };
}
