// T2-E 51 (answer 2874): Home cards for a window that is closing. The kinds, when each shows, and the company switch
// for each (a company setting, on by default). At most 2 cards at once; the person may dismiss one for the day (kept
// in their browser).

export const REMINDER_KINDS = ['sent_back', 'review', 'tax_declarations', 'tax_proofs', 'tax_regime', 'survey'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
export const reminderSetting = (k: ReminderKind) => `home.reminders.${k}`;

/** How many days ahead each kind shows (the sent-back request shows as long as it waits on the person). */
export const LEAD_DAYS: Record<ReminderKind, number> = { sent_back: Infinity, review: 3, tax_declarations: 7, tax_proofs: 7, tax_regime: 7, survey: 2 };

export interface ReminderCard {
  kind: ReminderKind;
  /** A stable id for "dismiss for today" (the kind and what it is about). */
  id: string;
  title: string;
  body: string;
  href: string;
  /** The last day (YYYY-MM-DD); null for a sent-back request. */
  closesOn: string | null;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The window closes within the kind's lead days (today counts; a closed window never shows). */
export const closingSoon = (kind: ReminderKind, today: string, closesOn: string) => closesOn >= today && daysBetween(today, closesOn) <= LEAD_DAYS[kind];

/** The cards to show: the kinds the company has on, a sent-back request first, then the soonest to close; at most 2. */
export function pickReminders(cards: ReminderCard[], on: (k: ReminderKind) => boolean, max = 2): ReminderCard[] {
  return cards
    .filter((c) => on(c.kind))
    .sort((a, b) => (a.closesOn ?? '0000').localeCompare(b.closesOn ?? '0000') || REMINDER_KINDS.indexOf(a.kind) - REMINDER_KINDS.indexOf(b.kind))
    .slice(0, max);
}
