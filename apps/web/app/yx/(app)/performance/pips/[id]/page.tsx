'use client';

import { useParams } from 'next/navigation';
import { ErrorState, Skeleton } from '@yukthix/ui';
import { PipRecordScreen, type Pip, type PipRecord, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { day, designState, usePerf, usePerfWrite, refused } from '../../../../../../lib/yx-performance';

// PRF-12 PIP record, the designed screen with live data: the plan, its check-ins, the employee's acknowledgement, the
// outcome, HR's approval from the plan, the letter and the exit link. The API decides who sees and does what.

const STATUS: Record<Pip['status'], PipRecord['status']> = { proposed: 'Proposed', declined: 'Not approved', active: 'Active', extended: 'Extended', met: 'Closed: met', not_met: 'Closed: not met', withdrawn: 'Withdrawn' };
const GOAL: Record<string, PipRecord['goals'][number]['status']> = { open: 'In progress', met: 'Met', not_met: 'Not met' };
const RATING = { on_track: 'On track', some_progress: 'Some progress', no_progress: 'No progress' } as const;

export default function YxPipPage() {
  const { id } = useParams<{ id: string }>();
  const base = `/pips/${encodeURIComponent(id)}`;
  const q = usePerf<Pip>(base);
  const write = usePerfWrite();
  const p = q.data;
  const state = designState(q);
  if (refused(q)) return <PerfNoAccessScreen title="Improvement plan" what="this improvement plan" grantedBy="HR" active="PIPs" persona="emp" />;
  if (state === 'loading') return <Skeleton height={420} />;
  if (state === 'error' || !p) return <ErrorState title="We couldn’t load this plan" description="It may not exist, or it isn’t yours to see. Check the link and try again." onRetry={() => void q.refetch()} />;
  const version = p.version;
  const steps = (p.approval?.steps ?? []).map((s) => ({ ...s, at: s.at ? new Date(s.at) : undefined }));
  const pip: PipRecord = {
    id: p.id,
    employee: p.employee,
    role: '',
    manager: p.manager,
    hr: steps.find((s) => s.id === 'hr')?.approver ?? 'HR',
    status: STATUS[p.status],
    start: day(p.startsOn),
    days: Math.round((day(p.plannedEndsOn).getTime() - day(p.startsOn).getTime()) / 86_400_000),
    end: day(p.endsOn),
    pausedDays: p.pausedDays,
    warning: p.warning,
    reason: p.reason,
    goals: p.goals.map((g) => ({ id: g.id, text: g.text, measure: g.measure, status: GOAL[g.status] ?? 'In progress' })),
    support: p.support.split('\n').map((s) => s.trim()).filter(Boolean),
    checkIns: [],
    schedule: p.checkins.map((c) => ({ id: c.id, due: day(c.dueOn), status: c.status, note: c.managerNote ? `${p.manager}: ${c.managerNote}` : null, employeeNote: c.employeeNote, rating: c.rating ? RATING[c.rating] : null })),
    acknowledgement: p.acknowledgedAt ? { at: new Date(p.acknowledgedAt), comment: p.employeeComment ?? undefined } : null,
    approval: steps,
    outcomeNote: p.outcomeNote ?? p.reextendReason ?? p.extendReason,
    reextended: Boolean(p.reextendedFrom),
  };
  return (
    <PipRecordScreen
      persona={p.role === 'employee' ? 'emp' : p.role === 'manager' ? 'mgr' : 'hr'}
      pip={pip}
      live={{
        today: new Date(),
        can: { decide: Boolean(p.approval?.canDecide), acknowledge: p.can.acknowledge, checkin: p.can.checkin, employeeNote: p.can.employeeNote, outcome: p.can.outcome, letter: p.can.letter, startExit: p.can.startExit, extend: p.can.extend, extendAgain: Boolean(p.can.extendAgain) },
        extendDays: p.extendDays ?? 30,
        extendAgainDays: p.extendAgainDays ?? 30,
        // Founder answer (a): one more extension after "not met", with a reason (HR; the API checks again).
        onExtendAgain: (reason) => write('POST', `${base}/extend-again`, { reason, version }),
        askHrHref: '/yx/desk/help',
        exitHref: p.exitCaseId ? `/yx/people/exits/${encodeURIComponent(p.exitCaseId)}` : null,
        onDecide: (decision, reason) => write('POST', `${base}/decide`, { decision, reason }),
        onAcknowledge: (comment) => write('POST', `${base}/acknowledge`, { comment, version }),
        onCheckin: (input) => write('POST', `${base}/checkins`, input),
        onEmployeeNote: (checkinId, note) => write('POST', `${base}/checkins`, { checkinId, note }),
        onOutcome: (input) => write('POST', `${base}/outcome`, { ...input, version }),
        onLetter: () => write('POST', `${base}/letter`),
        onStartExit: (input) => write('POST', `${base}/start-exit`, input),
      }}
    />
  );
}
