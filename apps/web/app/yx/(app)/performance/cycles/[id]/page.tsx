'use client';

import { useParams, useRouter } from 'next/navigation';
import { CalibrationSessions, CycleControlRoomScreen, type CalibrationSession, type Disagreement, type EligibilityRow, type ReviewCycle, type StagePerson } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../../lib/yx-org';
import { perfState, usePerf, usePerfRead, usePerfWrite } from '../../../../../../lib/yx-performance';
import { CycleSetup } from '../setup';

// PRF-04 one review cycle: a draft opens the set-up; a launched cycle opens the control room (funnel with names, overdue
// by owner, reminders, later deadlines, release, who is reviewed, disagreements and calibration sessions).
export default function YxReviewCyclePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/cycles/${encodeURIComponent(id)}`;
  const cycle = usePerf<ReviewCycle>(base);
  const running = Boolean(cycle.data && cycle.data.status !== 'draft');
  const funnel = usePerf<{ stage: string; label: string; count: number }[]>(running ? `${base}/funnel` : null);
  const overdue = usePerf<{ ownerEmployeeId: string; owner: string; stage: string; count: number }[]>(running ? `${base}/overdue` : null);
  const eligibility = usePerf<EligibilityRow[]>(running ? `${base}/eligibility` : null);
  const disagreements = usePerf<Disagreement[]>(running ? `${base}/disagreements` : null);
  const perms = useYxPermissions();
  const sessions = usePerf<{ bands: string[]; sessions: CalibrationSession[] }>(running ? `${base}/calibrations` : null);
  const facilitators = usePerf<{ value: string; label: string }[]>('/calibration-facilitators', running && perms.has('perf.cycle.manage'));
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  const write = usePerfWrite();
  const read = usePerfRead();
  const state = perfState(loadState(cycle));
  if (cycle.data?.status === 'draft' || state !== 'ready') return <CycleSetup cycle={cycle.data ?? null} state={state} onRetry={() => void cycle.refetch()} />;
  const depts = (departments.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name }));
  return (
    <CycleControlRoomScreen
      live={{
        state: perfState(loadState(cycle, ...(running ? [funnel, overdue, eligibility, disagreements] : []))),
        onRetry: () => void Promise.all([cycle.refetch(), funnel.refetch(), overdue.refetch(), eligibility.refetch(), disagreements.refetch()]),
        cycle: cycle.data ?? null,
        funnel: funnel.data ?? [],
        overdue: overdue.data ?? [],
        eligibility: eligibility.data ?? [],
        disagreements: disagreements.data ?? [],
        stagePeople: (stage) => read<StagePerson[]>(`${base}/funnel/people?stage=${encodeURIComponent(stage)}`),
        onOpenReview: (rid) => router.push(`/yx/performance/reviews/${encodeURIComponent(rid)}`),
        onRemind: (opts) => write<{ reminded: number }>('POST', `${base}/remind`, opts),
        onExtend: (stage, dueOn) => write('POST', `${base}/extend`, { stage, dueOn, version: cycle.data!.version }),
        onRelease: () => write<{ released: number; notReady: number }>('POST', `${base}/release`),
        onDecide: (did, status, hrNote) => write('POST', `/disagreements/${encodeURIComponent(did)}/decide`, { status, hrNote }),
        onOverride: (rowId, reviewed, reason) => write('PUT', `/eligibility/${encodeURIComponent(rowId)}`, { reviewed, reason }),
        calibration: sessions.data ? (
          <CalibrationSessions
            sessions={sessions.data.sessions}
            bands={sessions.data.bands}
            departments={depts}
            facilitators={facilitators.data ?? []}
            onOpen={(sid) => router.push(`/yx/performance/calibrations/${encodeURIComponent(sid)}`)}
            onCreate={cycle.data?.status === 'launched' ? (input) => write('POST', `${base}/calibrations`, input) : undefined}
          />
        ) : undefined,
      }}
    />
  );
}
