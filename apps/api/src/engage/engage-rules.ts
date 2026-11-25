// Batch G2 (M09 Engage) rules that need no database.

/** External channels (email) carry only the title and a link, and never a pay amount or similar value (ENG-03). */
export const carriesAmount = (s: string) => /(₹|\bRs\.?|\bINR)\s?\d/i.test(s);

/** Answer 2602: reminders to people who have not acknowledged go 2 and 5 days after publishing (then stop). */
export const REMINDER_DAYS = [2, 5] as const;
export function reminderDue(publishedOn: string, today: string, sent: number): boolean {
  const day = REMINDER_DAYS[sent];
  if (day === undefined) return false;
  return Date.parse(`${today}T00:00:00Z`) - Date.parse(`${publishedOn}T00:00:00Z`) >= day * 86_400_000;
}
