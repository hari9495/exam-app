'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorState, Spinner, type ApprovalStep } from '@yukthix/ui';
import { ChangeRecordScreen, type ChangeRow } from '@yukthix/ui/desk';
import { useDesk, useDeskWrite } from '../../../../../../lib/yx-desk';

// Helpdesk ITSM-2 (answers 1934-1938): one change: its approval route, window, checklist, outcome and review. The
// desk's agents and leads act on it; the change board, the approvers and the service owner may open it (the API checks).
type Step = { name: string; state: string; rule: string; approvers: { name: string; status: string }[]; waitingFor: string[] };
type Detail = Omit<ChangeRow, 'from' | 'to'> & {
  from: string;
  to: string;
  stage: ChangeRow['state'];
  version: number;
  riskFromAnswers: string | null;
  riskReason: string | null;
  freezeReason: string | null;
  plan: string | null;
  backout: string;
  banner: string;
  tasks: { title: string; done: boolean }[];
  approval: { steps: Step[]; log: { action: string; by: string | null; step: number | null; reason: string | null; at: string }[] } | null;
  outcome: { outcome: 'done' | 'done_with_problems' | 'backed_out'; note: string | null; by: string; at: string } | null;
  reviewDue: string | null;
  review: { text: string; by: string; at: string } | null;
  causedIncidents: { id: string; number: string; subject: string }[];
  linked: { id: string; number: string; subject: string; kind: string }[];
  can: { start: boolean; work: boolean; review: boolean; cancel: boolean };
  cancelReason: string | null;
};

const STEP: Record<string, ApprovalStep['status']> = { approved: 'done', rejected: 'rejected', sent_back: 'rejected', skipped: 'skipped', open: 'current', waiting: 'pending' };
const OUTCOME = { done: 'Done', done_with_problems: 'Done with problems', backed_out: 'Backed out' } as const;

/** The engine's route as the kit's approval timeline: who decided each step and when. */
function stepsOf(d: Detail): ApprovalStep[] {
  if (!d.approval) return [];
  return d.approval.steps.map((s, i) => {
    const decided = d.approval!.log.filter((l) => l.step === i + 1 && ['approved', 'rejected', 'self_approved'].includes(l.action));
    const last = decided[decided.length - 1];
    return {
      id: `s${i}`,
      label: `${s.name} · ${s.rule}`,
      status: STEP[s.state] ?? 'pending',
      approver: decided.length ? decided.map((l) => l.by ?? 'Someone').join(', ') : s.waitingFor.join(', ') || s.approvers.map((a) => a.name).join(', '),
      ...(last ? { at: new Date(last.at), ...(last.reason ? { comment: last.reason } : {}) } : {}),
    };
  });
}

export default function YxDeskChangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const path = `/changes/${encodeURIComponent(id)}`;
  const change = useDesk<Detail>(path);
  const write = useDeskWrite();
  if (change.isError) return <ErrorState title="This change did not open." description="It may not exist, or it is not one you may see." onRetry={() => void change.refetch()} />;
  if (!change.data) return <Spinner label="Loading" size="md" />;
  const d = change.data;
  const row: ChangeRow = { ...d, state: d.stage, from: new Date(d.from), to: new Date(d.to) };
  return (
    <ChangeRecordScreen
      key={d.version}
      change={row}
      stage={d.stage}
      approvals={stepsOf(d)}
      tasks={d.tasks.map((t, i) => ({ id: String(i), title: t.title, done: t.done }))}
      causedIncidents={d.causedIncidents}
      linkedFrom={d.linked}
      now={new Date()}
      live={{
        plan: d.plan,
        backout: d.backout,
        bannerText: d.banner,
        riskNote: d.riskFromAnswers && d.riskFromAnswers !== d.risk ? `The answers gave ${d.riskFromAnswers} risk; ${d.risk} was used: ${d.riskReason ?? ''}` : null,
        freezeReason: d.freezeReason,
        outcome: d.outcome ? { text: `${OUTCOME[d.outcome.outcome]}${d.outcome.note ? `: ${d.outcome.note}` : ''}`, by: d.outcome.by, at: new Date(d.outcome.at) } : null,
        review: d.review ? { text: d.review.text, by: d.review.by, at: new Date(d.review.at) } : null,
        reviewDue: d.reviewDue ? new Date(d.reviewDue) : null,
        can: d.can,
        onStart: () => write(`${path}/start`, 'POST', { version: d.version }),
        onTasks: (done) => write(`${path}/tasks`, 'PATCH', { version: d.version, done }),
        onOutcome: (outcome, note) => write(`${path}/outcome`, 'POST', { version: d.version, outcome, ...(note ? { note } : {}) }),
        onReview: (review) => write(`${path}/review`, 'POST', { version: d.version, review }),
        onCancel: (reason) => write(`${path}/cancel`, 'POST', { version: d.version, reason }),
        cancelReason: d.cancelReason,
        onBack: () => router.push('/yx/desk/changes'),
      }}
    />
  );
}
