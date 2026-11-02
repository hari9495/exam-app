import { createHash } from 'crypto';

// Pure rules for PRF-13 … PRF-17 (no database): the review wording check, the rating-spread check, the coach nudges,
// the dispute escalation window and the evidence hash. Every rule is explainable: each flag says what it found and why.

export type BiasKind = 'Gendered or loaded word' | 'Personality, not behaviour' | 'Age reference' | 'Vague, no example' | 'Rating and text disagree' | 'Rating spread against peers';
export interface BiasFlag {
  id: string;
  kind: BiasKind;
  /** The words flagged, exactly as written (or the figures, for a rating check). */
  match: string;
  suggestion: string;
}

const LOADED = ['abrasive', 'emotional', 'bossy', 'shrill', 'aggressive', 'hysterical', 'feisty', 'sassy', 'pushy', 'nagging'];
const PERSONALITY = ['attitude', 'personality', 'not a team player', 'difficult person', 'lazy'];
const AGE = ['young', 'old-school', 'too old', 'digital native', 'energetic for his age', 'energetic for her age'];
const VAGUE = ['good job', 'great work', 'needs to improve', 'did well', 'good performer', 'hard worker'];
const MISSES = ['missed', 'late', 'delayed', 'did not', 'failed'];

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** First whole-word match ("late" never matches inside "translate"), as written. */
const findWord = (text: string, w: string) => new RegExp(`\\b${esc(w)}\\b`, 'i').exec(text)?.[0] ?? null;

/** The wording check (YX-AST-11): suggestions only; the manager's text and rating stay final. */
export function wordingFlags(text: string, rating: number | null | undefined, maxRating = 5): BiasFlag[] {
  const flags: BiasFlag[] = [];
  const find = (words: string[], kind: BiasKind, suggestion: (w: string) => string) => {
    for (const w of words) {
      const m = findWord(text, w);
      if (m) flags.push({ id: `${kind}:${w}`, kind, match: m, suggestion: suggestion(w) });
    }
  };
  find(LOADED, 'Gendered or loaded word', (w) => `Describe what happened instead of "${w}", e.g. the meeting and its effect.`);
  find(PERSONALITY, 'Personality, not behaviour', () => 'Name the behaviour and its result, not the person’s character.');
  find(AGE, 'Age reference', () => 'Remove the age reference; describe skills or results.');
  find(VAGUE, 'Vague, no example', () => 'Add one example with a date or result.');
  const misses = MISSES.filter((w) => findWord(text, w)).length;
  if (rating != null && rating >= maxRating - 1 && misses >= 2) {
    flags.push({ id: 'inconsistent', kind: 'Rating and text disagree', match: `Rating ${rating} with ${misses} misses listed`, suggestion: 'Add the results that support this rating, or review the rating.' });
  }
  return flags;
}

/** Fewest finished reviews before an average is compared (a smaller group says nothing and could identify people). */
export const SPREAD_MIN = 5;
/** How far a manager's average may sit from the company's before it is flagged. */
export const SPREAD_GAP = 0.75;

/**
 * Rating spread against peers, from this cycle's finished scores: every rating the same (at least 3), or the manager's
 * average far from the company's. Shown to the manager only, as a prompt to re-read the evidence; nothing changes.
 */
export function spreadFlags(mine: number[], company: number[]): BiasFlag[] {
  const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const flags: BiasFlag[] = [];
  if (mine.length >= 3 && mine.every((x) => x === mine[0])) {
    flags.push({ id: 'spread:same', kind: 'Rating spread against peers', match: `All ${mine.length} of your ratings this cycle are ${mine[0].toFixed(2)}`, suggestion: 'Check that each rating stands on its own evidence.' });
  }
  if (mine.length >= SPREAD_MIN && company.length >= SPREAD_MIN) {
    const a = avg(mine);
    const b = avg(company);
    if (Math.abs(a - b) >= SPREAD_GAP) {
      flags.push({ id: 'spread:average', kind: 'Rating spread against peers', match: `Your average ${a.toFixed(2)}; company average ${b.toFixed(2)}`, suggestion: a > b ? 'Your ratings are well above the company’s. Check each one against its results.' : 'Your ratings are well below the company’s. Check each one against its results.' });
    }
  }
  return flags;
}

// ------------------------------------------------------------------------------------------ manager coach (PRF-16)

export interface CoachSignals {
  employeeId: string;
  name: string;
  /** Days since my last feedback to them; null = never. */
  feedbackDays: number | null;
  /** Days since the last 1:1 held with them; null = never held. */
  lastOneOnOneDays: number | null;
  /** Days a planned 1:1 is past its date (0 or less = not overdue). */
  plannedOverdueDays: number;
  /** Active goals whose latest check-in is off track or at risk. */
  goalsOff: { id: string; title: string; confidence: 'off_track' | 'at_risk' }[];
}

export interface CoachNudge {
  key: string;
  employeeId: string;
  person: string;
  signal: string;
  action: string;
  link: string;
}

export const COACH_LOOKS_AT = ['No feedback given in 6 weeks', '1:1s due or overdue', 'Goals off track or at risk'];
const FEEDBACK_DAYS = 42;
const ONE_ON_ONE_DAYS = 35;

/** One nudge per person, naming every signal; the first signal decides the action. */
export function coachNudges(team: CoachSignals[]): CoachNudge[] {
  const out: CoachNudge[] = [];
  for (const p of team) {
    const parts: { kind: string; text: string; action: string; link: string }[] = [];
    if (p.feedbackDays === null || p.feedbackDays >= FEEDBACK_DAYS) parts.push({ kind: 'fb', text: p.feedbackDays === null ? 'No feedback from you yet.' : `No feedback from you in ${Math.floor(p.feedbackDays / 7)} weeks.`, action: 'Give feedback', link: '/yx/performance/feedback' });
    if (p.plannedOverdueDays > 0) parts.push({ kind: '1on1', text: `1:1 overdue by ${p.plannedOverdueDays} ${p.plannedOverdueDays === 1 ? 'day' : 'days'}.`, action: 'Book 1:1', link: '/yx/performance/one-on-ones' });
    else if (p.lastOneOnOneDays === null || p.lastOneOnOneDays > ONE_ON_ONE_DAYS) parts.push({ kind: '1on1', text: p.lastOneOnOneDays === null ? 'No 1:1 held yet.' : `Last 1:1 was ${p.lastOneOnOneDays} days ago.`, action: 'Book 1:1', link: '/yx/performance/one-on-ones' });
    const g = p.goalsOff[0];
    if (g) parts.push({ kind: 'goal', text: `Goal “${g.title}” is ${g.confidence === 'off_track' ? 'off track' : 'at risk'}${p.goalsOff.length > 1 ? ` (and ${p.goalsOff.length - 1} more)` : ''}.`, action: 'View goal', link: `/yx/performance/goals/${g.id}` });
    if (!parts.length) continue;
    out.push({ key: `${p.employeeId}:${parts.map((x) => x.kind).join('+')}`.slice(0, 80), employeeId: p.employeeId, person: p.name, signal: parts.map((x) => x.text).join(' '), action: parts[0].action, link: parts[0].link });
  }
  return out;
}

const DAY = 86_400_000;
const asDay = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Monday of the week (weekly) or of the fortnight counted from Monday 1 Jan 2024 (fortnightly). */
export function coachWeekOf(today: string, frequency: 'weekly' | 'fortnightly'): string {
  const t = asDay(today);
  const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
  if (frequency === 'weekly') return isoOf(monday);
  const weeks = Math.floor((monday - asDay('2024-01-01')) / (7 * DAY));
  return isoOf(monday - (weeks % 2) * 7 * DAY);
}

/** Suggested 1:1 agenda (PRF-16): from goals off track, open actions and recent praise; nothing is added until chosen. */
export function suggestedAgenda(input: { goalsOff: { id: string; title: string; confidence: string; since: string }[]; openActions: { id: string; text: string; dueOn: string | null }[]; praiseCount: number }): { id: string; text: string; why: string }[] {
  const out: { id: string; text: string; why: string }[] = [];
  for (const g of input.goalsOff.slice(0, 3)) out.push({ id: `goal:${g.id}`, text: `${g.title}: agree one next step`, why: `Goal is ${g.confidence === 'off_track' ? 'off track' : 'at risk'} since ${g.since}` });
  for (const a of input.openActions.slice(0, 3)) out.push({ id: `action:${a.id}`, text: `Follow up: ${a.text}`, why: `Open action from an earlier 1:1${a.dueOn ? ` (due ${a.dueOn})` : ''}` });
  if (input.praiseCount >= 2) out.push({ id: 'praise', text: 'Recognise the work colleagues praised', why: `${input.praiseCount} colleagues gave praise in the last 30 days` });
  return out;
}

// ------------------------------------------------------------------------------------------ disputes (PRF-15)

/** The last day an answered disagreement may be escalated (inclusive). */
export function escalateBy(answeredOn: string, days: number): string {
  return isoOf(asDay(answeredOn) + days * DAY);
}

/** Stable JSON (sorted keys) so the same evidence always hashes the same. */
export function stableJson(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stableJson).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((x as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(x ?? null);
}

export const evidenceHash = (content: unknown) => createHash('sha256').update(stableJson(content)).digest('hex');
