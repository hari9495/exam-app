'use client';

import { useParams, useRouter } from 'next/navigation';
import { LeaveTypeEditorScreen, type TimeSetup } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Leave types & policies › a leave type (TIM-27), or 'new'.
export default function YxTimeLeaveTypePage() {
  const router = useRouter();
  const typeId = String(useParams<{ id: string }>()?.id ?? 'new');
  const setup = useTime<TimeSetup>('/setup');
  const write = useTimeWrite();
  return (
    <LeaveTypeEditorScreen
      live={{
        state: timeState(setup),
        onRetry: () => void setup.refetch(),
        data: setup.data ?? null,
        typeId,
        policiesHref: '/yx/time/setup',
        onSaveType: (tid, input) => (tid ? write(`/setup/types/${id(tid)}`, 'PUT', input, true, 'Leave type saved') : write('/setup/types', 'POST', input, true, 'Leave type added')),
        onAdded: (tid) => router.replace(`/yx/time/setup/types/${id(tid)}`),
      }}
    />
  );
}
