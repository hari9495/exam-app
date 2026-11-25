// Batch G2 (M09 Engage) rules that need no database.

/** External channels (email) carry only the title and a link, and never a pay amount or similar value (ENG-03). */
export const carriesAmount = (s: string) => /(₹|\bRs\.?|\bINR)\s?\d/i.test(s);

/** M09 Q2: the first blocked word in a text (whole words, any case), or null. A listed phrase with spaces or marks matches as written. */
export function blockedWord(text: string, words: string[]): string | null {
  const lower = text.toLowerCase();
  const tokens = new Set(lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  return (
    words
      .map((w) => w.trim().toLowerCase())
      .find((w) => w && (tokens.has(w) || (/[^\p{L}\p{N}]/u.test(w) && lower.includes(w)))) ?? null
  );
}

/** Answer 2602: reminders to people who have not acknowledged go 2 and 5 days after publishing (then stop). */
export const REMINDER_DAYS = [2, 5] as const;
export function reminderDue(publishedOn: string, today: string, sent: number): boolean {
  const day = REMINDER_DAYS[sent];
  if (day === undefined) return false;
  return Date.parse(`${today}T00:00:00Z`) - Date.parse(`${publishedOn}T00:00:00Z`) >= day * 86_400_000;
}
