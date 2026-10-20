'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ProbationQueue } from '@yukthix/ui/frame';
import type { ProbationRow } from '@yukthix/ui/workforce';
import { todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { probationRows, RATING_SCORE } from '../../../../../lib/yx-onboarding';

const id = encodeURIComponent;
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateText = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// People › Probation (PPL-16 / PPL-17, design audit step 3; M01 §3.4, YX-LC-01): the designed queue. The direct manager
// reviews (confirm for approval, extend, or recommend ending: lifecycle 6c); HR confirms (a confirmation change someone
// else approves) or extends within the company maximum. The API checks every call.
export default function YxProbationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const list = usePeople<{ today: string; rows: ProbationRow[] }>('/probations');
  const write = usePeopleWrite();
  const lifeWrite = useLifeWrite();
  const rows = list.data?.rows ?? [];
  const nameOf = (employeeId: string) => rows.find((r) => r.employeeId === employeeId)?.name ?? 'them';
  const hr = perms.has('employee.profile.view');
  return (
    <ProbationQueue
      rows={probationRows(rows)}
      today={day(list.data?.today ?? todayIst())}
      persona={hr ? 'hr' : 'mgr'}
      live={{
        state: list.isError ? 'error' : list.data ? 'ready' : 'loading',
        onRetry: () => void list.refetch(),
        canDecide: perms.has('employee.change.manage'),
        onReview: async (employeeId, outcome, months, draft) => {
          const comments = [draft.comments.trim(), outcome === 'extend' && draft.improve.trim() ? `To improve: ${draft.improve.trim()}` : ''].filter(Boolean).join('\n');
          await lifeWrite('POST', `/lifecycle/probations/${id(employeeId)}/review`, { outcome, comments, ...(months ? { months } : {}), ...(draft.rating ? { rating: RATING_SCORE[draft.rating] } : {}) });
          await list.refetch();
          const name = nameOf(employeeId);
          toast({ tone: 'success', title: outcome === 'confirm' ? `${name}'s confirmation sent to HR for approval` : outcome === 'extend' ? `${name}'s probation extended by ${months} month${months === 1 ? '' : 's'}` : `Your recommendation for ${name} sent to HR` });
        },
        onConfirm: async (employeeId, from, reason) => {
          await write('POST', '/changes', { employeeId, changeType: 'confirmation', effectiveDate: iso(from), payload: { status: 'confirmed' }, reason });
          toast({ tone: 'success', title: `${nameOf(employeeId)}'s confirmation from ${dateText(from)} sent for approval` });
        },
        onExtend: async (employeeId, months, reason) => {
          await write('POST', `/employees/${id(employeeId)}/probation/extend`, { months, reason });
          toast({ tone: 'success', title: `${nameOf(employeeId)}'s probation extended by ${months} month${months === 1 ? '' : 's'}` });
        },
        onOpenApproval: () => router.push('/yx/people/changes'),
      }}
    />
  );
}
