import type { BusinessHours, Holiday, Weekday } from './types';

// Duplicated (not imported) from @exam-platform/shared's packages/shared/src/scheduling/business-hours.ts
// -- apps/web can't import that package's values at runtime (see lib/hooks/useQuestions.ts /
// lib/sentry-rate-limiter.ts comments, and the inlined GLOBAL_STAGES/BusinessHours types in
// lib/types.ts for the same restriction). Keep this function's behavior in sync BY HAND with the
// shared source of truth above -- it must match verbatim (Intl-based, tz-correct, null -> no
// warning, outsideHours computed independently of holiday).
const WEEKDAY_BY_SHORT: Record<string, Weekday> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

export function evaluateSlot(
  startsAtIso: string,
  businessHours: BusinessHours | null,
  holidays: Holiday[],
): { outsideHours: boolean; holiday: string | null } {
  if (!businessHours) return { outsideHours: false, holiday: null };

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: businessHours.timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(startsAtIso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';

  const weekday = WEEKDAY_BY_SHORT[part('weekday')];
  const dateStr = `${part('year')}-${part('month')}-${part('day')}`;
  let hour = part('hour');
  if (hour === '24') hour = '00'; // Intl hour12:false midnight quirk
  const timeStr = `${hour}:${part('minute')}`;

  const holiday = holidays.find((h) => h.date === dateStr)?.name ?? null;
  const dayHours = businessHours.days[weekday];
  const outsideHours = !dayHours.enabled || timeStr < dayHours.open || timeStr >= dayHours.close;

  return { outsideHours, holiday };
}
