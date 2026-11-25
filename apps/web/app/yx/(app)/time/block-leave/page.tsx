'use client';

import { useRouter } from 'next/navigation';
import { BlockLeavePlannerScreen, type BlockLeaveList } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// Team › Block leave (TIM-39): people whose role needs block leave (setting leave.block_leave.required). Managers see
// their team read only; planning and the access pause need leave.approve in scope, a reminder leave.view (security review F6).
export default function YxBlockLeavePage() {
  const router = useRouter();
  const list = useTime<BlockLeaveList>('/hr/block-leave');
  const write = useTimeWrite();
  return (
    <BlockLeavePlannerScreen
      live={{
        state: timeState(list),
        onRetry: () => void list.refetch(),
        data: list.data ?? null,
        onPlan: (eid, from, to) => write(`/hr/block-leave/${id(eid)}/plan`, 'POST', { from, to }, true, 'Block leave planned'),
        onNudge: (eid) => write(`/hr/block-leave/${id(eid)}/nudge`, 'POST', undefined, true, 'Nudge sent'),
        onPause: (eid, pause) => write(`/hr/block-leave/${id(eid)}/pause`, 'POST', { pause }, true, pause ? 'Access pause scheduled' : 'Access pause cancelled'),
        teamLeaveHref: '/yx/time/team',
        onNavigate: (href) => router.push(href),
      }}
    />
  );
}
