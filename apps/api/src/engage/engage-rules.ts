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

/** Batch G2 item 74: the question kinds a survey asks. */
export type QuestionKind = 'enps' | 'rating' | 'single' | 'multiple' | 'text';

/** eNPS: promoters (9-10) minus detractors (0-6), as a whole percentage of everyone who answered. */
export function enpsOf(scores: number[]) {
  const n = scores.length;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return { score: n ? Math.round(((promoters - detractors) / n) * 100) : null, promoters, passives: n - promoters - detractors, detractors, n };
}

/** Share of 1-5 ratings that agree (4 or 5), as a whole percentage; null with no answers. */
export const favourable = (values: number[]) => (values.length ? Math.round((values.filter((v) => v >= 4).length / values.length) * 100) : null);

/** Answer 2604: the starter questions of each survey type (editable before launch). */
export const STARTER_QUESTIONS: Record<'engagement' | 'pulse' | 'enps' | 'onboarding' | 'exit', { id: string; text: string; kind: QuestionKind; options?: string[]; theme?: string }[]> = {
  enps: [
    { id: 'enps', text: 'How likely are you to recommend this company as a place to work?', kind: 'enps', theme: 'eNPS' },
    { id: 'why', text: 'What is the main reason for your score?', kind: 'text', theme: 'Open' },
  ],
  pulse: [
    { id: 'enps', text: 'How likely are you to recommend this company as a place to work?', kind: 'enps', theme: 'eNPS' },
    { id: 'clarity', text: 'I know what is expected of me at work.', kind: 'rating', theme: 'Clarity' },
    { id: 'manager', text: 'My manager gives me useful feedback.', kind: 'rating', theme: 'Manager' },
    { id: 'tools', text: 'I have the tools I need to do my job well.', kind: 'rating', theme: 'Enablement' },
    { id: 'workload', text: 'My workload this month was…', kind: 'single', options: ['Too light', 'About right', 'Too heavy'], theme: 'Workload' },
  ],
  engagement: [
    { id: 'enps', text: 'How likely are you to recommend this company as a place to work?', kind: 'enps', theme: 'eNPS' },
    { id: 'proud', text: 'I am proud to work here.', kind: 'rating', theme: 'Pride' },
    { id: 'clarity', text: 'I know what is expected of me at work.', kind: 'rating', theme: 'Clarity' },
    { id: 'manager', text: 'My manager cares about me as a person.', kind: 'rating', theme: 'Manager' },
    { id: 'growth', text: 'I have had chances to learn and grow this year.', kind: 'rating', theme: 'Growth' },
    { id: 'recognition', text: 'I get recognised for good work.', kind: 'rating', theme: 'Recognition' },
    { id: 'change', text: 'What one thing should we change?', kind: 'text', theme: 'Open' },
  ],
  onboarding: [
    { id: 'welcome', text: 'I felt welcome in my first weeks.', kind: 'rating', theme: 'Welcome' },
    { id: 'ready', text: 'I had what I needed to start work (laptop, access, training).', kind: 'rating', theme: 'Readiness' },
    { id: 'better', text: 'What would have made joining easier?', kind: 'text', theme: 'Open' },
  ],
  exit: [
    { id: 'reason', text: 'What is the main reason you are leaving?', kind: 'single', options: ['Pay', 'Growth', 'Manager', 'Workload', 'Personal', 'Other'], theme: 'Reason' },
    { id: 'return', text: 'Would you work here again?', kind: 'single', options: ['Yes', 'Maybe', 'No'], theme: 'Return' },
    { id: 'tell', text: 'What should we know?', kind: 'text', theme: 'Open' },
  ],
};

/** Answer 2602: reminders to people who have not acknowledged go 2 and 5 days after publishing (then stop). */
export const REMINDER_DAYS = [2, 5] as const;
export function reminderDue(publishedOn: string, today: string, sent: number): boolean {
  const day = REMINDER_DAYS[sent];
  if (day === undefined) return false;
  return Date.parse(`${today}T00:00:00Z`) - Date.parse(`${publishedOn}T00:00:00Z`) >= day * 86_400_000;
}
