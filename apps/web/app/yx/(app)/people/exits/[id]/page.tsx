'use client';

import { useParams, useRouter } from 'next/navigation';
import { ExitCaseScreen, type ExitWorkspace, type InterviewAnswers } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';
import { useAuth } from '../../../../../../lib/auth-context';
import { apiFetch } from '../../../../../../lib/api-client';

const id = encodeURIComponent;

// People › Exits › one exit (PPL-19 workspace): the exit, last-day changes, HR-only facts, clearance, the interview.
export default function YxExitPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { id: caseId } = useParams<{ id: string }>();
  const data = useLife<ExitWorkspace>(`/lifecycle/exits/${id(caseId)}`);
  const write = useLifeWrite();
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const signOff = (item: { id: string; version: number }, x: { action: 'clear' | 'waive'; note: string | null; recoveryAmount: string | null; recoveryReason: string | null }) =>
    write('POST', `/lifecycle/clearance/${id(item.id)}/sign-off`, { action: x.action, version: item.version, ...(x.note ? { note: x.note } : {}), ...(x.recoveryAmount ? { recoveryAmount: x.recoveryAmount, recoveryReason: x.recoveryReason } : {}) });
  return (
    <ExitCaseScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      today={today}
      onBack={() => router.push('/yx/people/exits')}
      onNotice={(x) => write('POST', `/lifecycle/exits/${id(caseId)}/notice`, { kind: x.kind, lwd: x.lwd, reason: x.reason, version: x.version, ...(x.kind === 'buyout' ? { buyoutBy: x.buyoutBy, buyoutDays: x.buyoutDays } : {}) })}
      onHrFacts={(x) => write('PUT', `/lifecycle/exits/${id(caseId)}/hr`, x)}
      onSignOff={signOff}
      onInterview={() => apiFetch(`/lifecycle/exits/${id(caseId)}/interview`, {}, accessToken ?? undefined) as Promise<InterviewAnswers>}
      onInterviewNotes={(notes) => write('PUT', `/lifecycle/exits/${id(caseId)}/interview`, { notes })}
      checklistHref={(j) => `/yx/people/onboarding/${id(j)}`}
    />
  );
}
