import type { LivePipelineCard, PipelineScore, ScorecardSummary } from '@yukthix/ui/hiring';
import type { BoardEntryRow } from './types';

// HIR-04: the board rows of GET hiring/jobs/:id/board shaped into the designed board's cards (the API decides what is sent).

type Row = BoardEntryRow & { stageEnteredAt: string; scorecards: (ScorecardSummary & { interviewId: string }) | null; nextInterviewAt: string | null; rejectionPendingUntil: string | null };

const SOURCE: Record<string, string> = { application: 'Applied online', reapply: 'Applied again', referral: 'Referral', agency: 'Agency', internal: 'Internal', manual: 'Added by recruiter', exam: 'From a test', drive: 'Hiring drive' };
const IST = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
/** "12 Nov 2026, 11:00 am" in India time. */
export const istDateTime = (iso: string) => IST.format(new Date(iso)).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());
const days = (iso: string, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));

/** One board card from the API row: scores, the next thing due and flags. */
export function cardOf(r: Row, now = Date.now()): LivePipelineCard {
  const scores: PipelineScore[] = [];
  const t = r.examResults.find((e) => e.score != null);
  if (t) scores.push({ label: 'Test', value: `${t.score}`, tone: t.passFail === 'pass' ? 'success' : t.passFail === 'fail' ? 'warning' : 'neutral' });
  if (r.fitScore != null) scores.push({ label: 'AI fit (advisory)', value: `${r.fitScore}`, tone: 'ai' });
  if (r.scorecards?.complete && r.scorecards.score != null) scores.push({ label: 'Panel', value: `${r.scorecards.score}`, tone: r.scorecards.passes ? 'success' : 'warning' });
  const next = r.rejectionPendingUntil
    ? `rejection email ${istDateTime(r.rejectionPendingUntil)}`
    : r.nextInterviewAt
      ? `interview ${istDateTime(r.nextInterviewAt)}`
      : r.scorecards && !r.scorecards.complete
        ? `scorecards ${r.scorecards.submitted} of ${r.scorecards.expected}`
        : 'nothing scheduled';
  const flags = r.enteredVia === 'internal' ? ['Internal applicant'] : [];
  return { id: r.entryId, stageId: r.stageId, name: r.candidateName, line: [r.candidateEmail, SOURCE[r.enteredVia] ?? r.enteredVia, r.referredByName ? `by ${r.referredByName}` : null].filter(Boolean).join(' · '), scores, next, flags, daysInStage: days(r.stageEnteredAt, now) };
}

