import type { FormDef } from '../rules-engine/forms';

// Lifecycle batch 6c, the pure parts of the exit flow (design §10): exit types, the notice period and the standard
// last working day (D7: calendar days or months, as the company policy says), the starter exit-interview form and
// the starter clearance list. The service does the database work.

export const EXIT_TYPES = ['resignation', 'termination', 'probation_termination', 'end_of_contract', 'retirement', 'death', 'absconding'] as const;
export type ExitType = (typeof EXIT_TYPES)[number];
export const COMPANY_EXIT_TYPES = EXIT_TYPES.filter((t) => t !== 'resignation');
/** Starter company setting: these company exits need approval (P03 exit.company); the rest are recorded at once. */
export const NEEDS_APPROVAL: readonly ExitType[] = ['termination', 'probation_termination'];
/** YX-LV-10: never while the person is on maternity leave. */
export const MATERNITY_BLOCKED: readonly ExitType[] = ['termination', 'probation_termination'];

export const RESIGNATION_REASONS = ['better_opportunity', 'higher_studies', 'relocation', 'family', 'health', 'career_change', 'manager', 'work_environment', 'compensation', 'other'] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A notice period as stored: "30d" (calendar days) or "2m" (months). */
export function parseNotice(p: string): { n: number; unit: 'd' | 'm' } {
  const m = /^(\d{1,3})([dm])$/.exec(p);
  if (!m) throw new Error(`Bad notice period ${p}`);
  return { n: Number(m[1]), unit: m[2] as 'd' | 'm' };
}

export function noticeLabel(p: string): string {
  const { n, unit } = parseNotice(p);
  if (n === 0) return 'No notice';
  return unit === 'd' ? `${n} day${n === 1 ? '' : 's'}` : `${n} month${n === 1 ? '' : 's'}`;
}

/**
 * The standard last working day: the notice runs from the day after the resignation is given, so 30 days from 1 Jan
 * ends on 31 Jan; a month from 31 Jan ends on the last day of February (the same day of the month, clamped).
 */
export function standardLwd(submittedOn: string, notice: string): string {
  if (!ISO.test(submittedOn)) throw new Error('Bad date');
  const { n, unit } = parseNotice(notice);
  const d = day(submittedOn);
  if (unit === 'd') return iso(new Date(d.getTime() + n * 86_400_000));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))));
}

/** Days from one ISO day to another (b − a). */
export const daysFrom = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86_400_000);

/** The starter clearance list (setting exit.clearance_departments, starter values): who signs off what. */
export const CLEARANCE_STARTER: { department: 'manager_handover' | 'it' | 'admin' | 'finance' | 'hr'; title: string }[] = [
  { department: 'manager_handover', title: 'Work and files handed over' },
  { department: 'it', title: 'Accounts closed, devices and data handed back' },
  { department: 'admin', title: 'Access card, keys and seat handed back' },
  { department: 'finance', title: 'Advances, loans and expense claims settled' },
  { department: 'hr', title: 'Documents and exit formalities done' },
];

/** The starter exit-interview form (setting exit.interview.form). Answers are HR-only (YX-LC-09). */
export const EXIT_INTERVIEW_FORM_VERSION = 1;
export const EXIT_INTERVIEW_FORM: FormDef = {
  sections: [
    {
      id: 'why',
      columns: 1,
      fields: [
        {
          key: 'main_reason',
          type: 'choice',
          label: 'The main reason you are leaving',
          required: true,
          options: [
            { value: 'better_opportunity', label: 'A better opportunity' },
            { value: 'compensation', label: 'Pay and benefits' },
            { value: 'manager', label: 'My manager' },
            { value: 'work_environment', label: 'The work or the team' },
            { value: 'growth', label: 'Growth and learning' },
            { value: 'personal', label: 'Personal or family reasons' },
            { value: 'other', label: 'Something else' },
          ],
        },
        { key: 'would_return', type: 'choice', label: 'Would you work here again?', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'No' }] },
        { key: 'rating', type: 'number', label: 'How was working here, from 1 (poor) to 5 (great)?', required: true, min: 1, max: 5 },
        { key: 'keep', type: 'textarea', label: 'What should we keep doing?', max: 2000 },
        { key: 'change', type: 'textarea', label: 'What should we change?', max: 2000 },
      ],
    },
  ],
  rules: [],
};

/**
 * YX-LC-08 (Code on Wages s.17(2)): the final dues are paid within two working days after the last working day.
 * Working days skip Saturdays, Sundays and the holidays of the person's calendar. Open clearance never moves it.
 */
export function wagesDueBy(lwd: string, holidays: ReadonlySet<string>): string {
  let d = lwd;
  let left = 2;
  while (left > 0) {
    d = new Date(day(d).getTime() + 86_400_000).toISOString().slice(0, 10);
    const wd = day(d).getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(d)) left--;
  }
  return d;
}

/** Where a last working day stands on `today` (both IST days): still ahead, the day itself, or over (exit at T+0). */
export function lwdStage(lwd: string, today: string): 'ahead' | 'today' | 'over' {
  return today < lwd ? 'ahead' : today === lwd ? 'today' : 'over';
}

/** Alumni read their own documents for this many years after the last day (P05 Q6; setting alumni.access_years). */
export function alumniUntil(lastDay: string, years: number): string {
  const d = day(lastDay);
  return new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}
