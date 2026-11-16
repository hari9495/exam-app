// Assessments AS-3 (answers 2013, 2001; PRC-21, PRC-32): pure rules for the candidate's test list and result reuse.

export type CandidateTestStatus = 'invited' | 'started' | 'completed' | 'under_review' | 'missed' | 'withdrawn' | 'reused';

export interface InvitationFacts {
  status: string;
  expiresAt: Date;
  attempt: { status: string; held: boolean } | null;
}

const RUNNING = ['in_progress', 'paused'];

/** One invitation as the candidate sees it in "My tests". */
export function candidateTestStatus(i: InvitationFacts, now: Date): CandidateTestStatus {
  if (i.status === 'revoked') return 'withdrawn';
  if (i.status === 'reused') return 'reused';
  if (i.attempt) return RUNNING.includes(i.attempt.status) ? 'started' : i.attempt.held ? 'under_review' : 'completed';
  return i.expiresAt < now ? 'missed' : 'invited';
}

/** The day an earlier result stops being usable again (the company's months after it was taken); null when never. */
export function reuseValidUntil(takenAt: Date, months: number): Date | null {
  if (months <= 0) return null;
  const d = new Date(takenAt);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** An earlier attempt may be used again: finished, marked, not held, and taken within the company's months. */
export function reusable(a: { status: string; submittedAt: Date | null; hasResult: boolean; held: boolean }, months: number, now: Date): boolean {
  if (RUNNING.includes(a.status) || !a.submittedAt || !a.hasResult || a.held) return false;
  const until = reuseValidUntil(a.submittedAt, months);
  return until !== null && now < until;
}
