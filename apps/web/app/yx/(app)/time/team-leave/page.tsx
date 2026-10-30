'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { LeaveHomeScreen, type LeaveRequestDetailView, type TeamLeaveHome } from '@yukthix/ui/time';
import { timeState, useOtherWrite, useTime, useTimeRead } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// Team › Leave (TIM-17 Manager, TIM-19 Manager): the manager's own team's leave waiting for their decision, with who else
// is off then, and who is away this week. A request opens with team availability and the balance after it; Approve and
// Reject decide the manager's own approval task through the approvals inbox's API, which checks they hold it. The
// server shows only the manager's team; another person's request answers 404. ?open=<id> opens one at once.
function YxTeamLeaveHomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const home = useTime<TeamLeaveHome>('/team/leave-home');
  const read = useTimeRead();
  const other = useOtherWrite();
  return (
    <LeaveHomeScreen
      mgrLive={{
        state: timeState(home),
        onRetry: () => void home.refetch(),
        data: home.data ?? null,
        onOpen: (rid) => read<LeaveRequestDetailView>(`/requests/${id(rid)}`),
        // The page says "done" itself (it names the person); the time and approvals lists reload.
        onDecide: (taskId, decision, reason) => other(`/workflow/approvals/tasks/${id(taskId)}/decide`, { decision, ...(reason ? { reason } : {}) }),
        onNavigate: (href) => router.push(href),
        hrefs: { approvals: '/yx/approvals', calendar: '/yx/time/team' },
        openId: params.get('open') ?? undefined,
      }}
    />
  );
}

export default function YxTeamLeaveHomePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxTeamLeaveHomeInner />
    </Suspense>
  );
}
