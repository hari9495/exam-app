'use client';

import { MyOvertimeScreen, type MyOvertime } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Me › Overtime (Q7): the person's own claims; the manager approves them in Approvals (P03).
export default function YxMyOvertimePage() {
  const ot = useTime<MyOvertime>('/me/overtime');
  const write = useTimeWrite();
  return (
    <MyOvertimeScreen
      state={timeState(ot)}
      onRetry={() => void ot.refetch()}
      data={ot.data ?? null}
      onClaim={(input) => write('/me/overtime', 'POST', input)}
      onWithdraw={(cid) => write(`/me/overtime/${encodeURIComponent(cid)}/withdraw`)}
    />
  );
}
