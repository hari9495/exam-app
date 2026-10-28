'use client';

import { useRouter } from 'next/navigation';
import { LeavePoliciesScreen, type TimeSetup } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Leave types & policies (TIM-28): leave.settings.manage for the whole company. Leave types open TIM-27 at
// /yx/time/setup/types/<id>; holidays (TIM-26), year end (TIM-29) and locations (TIM-31) have their own pages here.
export default function YxTimeSetupPage() {
  const router = useRouter();
  const setup = useTime<TimeSetup>('/setup');
  const write = useTimeWrite();
  return (
    <LeavePoliciesScreen
      live={{
        state: timeState(setup),
        onRetry: () => void setup.refetch(),
        data: setup.data ?? null,
        onCreatePolicy: (name) => write('/setup/policies', 'POST', { name }, true, 'Policy added'),
        onAddVersion: (pid, input) => write(`/setup/policies/${id(pid)}/versions`, 'POST', input, true, 'Policy change saved'),
        onAssign: (pid, input) => write(`/setup/policies/${id(pid)}/assign`, 'POST', input, true, 'Policy applied'),
        onRemoveAssignment: (aid) => write(`/setup/assignments/${id(aid)}/remove`, 'POST', undefined, true, 'Policy removed from there'),
        onOpenType: (tid) => router.push(`/yx/time/setup/types/${id(tid)}`),
      }}
    />
  );
}
