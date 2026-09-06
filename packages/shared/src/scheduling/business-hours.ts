export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayHours {
  enabled: boolean;
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

export interface BusinessHours {
  timeZone: string;
  days: Record<Weekday, DayHours>;
}

export interface Holiday {
  date: string; // "YYYY-MM-DD"
  name: string;
}

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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
