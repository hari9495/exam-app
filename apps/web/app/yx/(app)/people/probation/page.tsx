'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ProbationQueue } from '@yukthix/ui/frame';
import type { ProbationRow } from '@yukthix/ui/workforce';
import { todayIst, useYxPermissions, loadState } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';
import { useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { probationRows, RATING_SCORE } from '../../../../../lib/yx-onboarding';

const id = encodeURIComponent;
const day = (iso: string) => new Date(`${iso}T00:00:00`);

// People › Probation (PPL-16 / PPL-17, design audit step 3; M01 §3.4, YX-LC-01): the designed queue. The direct manager
// reviews (confirm for approval, extend, or recommend ending: lifecycle 6c); HR decides an escalated review with the same
// form (PPL-16). The API checks every call.
export default function YxProbationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const list = usePeople<{ today: string; rows: ProbationRow[] }>('/probations');
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
        state: loadState(list),
        onRetry: () => void list.refetch(),
        canDecide: perms.has('employee.change.manage'),
        onReview: async (employeeId, outcome, months, draft) => {
          const comments = [draft.comments.trim(), outcome === 'extend' && draft.improve.trim() ? `To improve: ${draft.improve.trim()}` : ''].filter(Boolean).join('\n');
          await lifeWrite('POST', `/lifecycle/probations/${id(employeeId)}/review`, { outcome, comments, ...(months ? { months } : {}), ...(draft.rating ? { rating: RATING_SCORE[draft.rating] } : {}) });
          await list.refetch();
          const name = nameOf(employeeId);
          toast({ tone: 'success', title: outcome === 'confirm' ? `${name}'s confirmation sent to HR for approval` : outcome === 'extend' ? `${name}'s probation extended by ${months} month${months === 1 ? '' : 's'}` : `Your recommendation for ${name} sent to HR` });
        },
        onOpenApproval: () => router.push('/yx/people/changes'),
      }}
    />
  );
}
