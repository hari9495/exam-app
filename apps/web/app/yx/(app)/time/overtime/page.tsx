'use client';

import { MyOvertimeScreen, type MyOvertime } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Me › My overtime (designed in the library as "Extra · My overtime"): the person's own days and claims (no key; the
// API reads only their record); the manager approves each claim through P03.
export default function YxMyOvertimePage() {
  const mine = useTime<MyOvertime>('/me/overtime');
  const write = useTimeWrite();
  return (
    <MyOvertimeScreen
      live={{
        state: timeState(mine),
        onRetry: () => void mine.refetch(),
        data: mine.data ?? null,
        onClaim: (input) => write('/me/overtime', 'POST', input),
        onWithdraw: (cid) => write(`/me/overtime/${encodeURIComponent(cid)}/withdraw`),
      }}
    />
  );
}
