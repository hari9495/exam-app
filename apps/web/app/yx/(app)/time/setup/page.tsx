'use client';

import { LeavePoliciesScreen, type TimeSetup, type TypeExamplePerson } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Leave types & policies (TIM-27 / 28): leave.settings.manage for the whole company.
export default function YxTimeSetupPage() {
  const setup = useTime<TimeSetup>('/setup');
  const write = useTimeWrite();
  const read = useTimeRead();
  return (
    <LeavePoliciesScreen
      live={{
        state: timeState(setup),
        onRetry: () => void setup.refetch(),
        data: setup.data ?? null,
        onSaveType: (tid, input) => (tid ? write(`/setup/types/${id(tid)}`, 'PUT', input) : write('/setup/types', 'POST', input)),
        onCreatePolicy: (name) => write('/setup/policies', 'POST', { name }),
        onAddVersion: (pid, input) => write(`/setup/policies/${id(pid)}/versions`, 'POST', input),
        onAssign: (pid, input) => write(`/setup/policies/${id(pid)}/assign`, 'POST', input),
        onRemoveAssignment: (aid) => write(`/setup/assignments/${id(aid)}/remove`),
        onTypeExample: (tid) => read<{ people: TypeExamplePerson[] }>(`/setup/types/${id(tid)}/example`),
      }}
    />
  );
}
