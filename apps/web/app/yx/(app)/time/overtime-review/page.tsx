'use client';

import { OtReviewScreen, type OtReview } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Team / HR › Overtime (TIM-09): a manager's team or attendance.view in scope; approve, reject or give comp-off as the
// viewer's approval task; paying over a limit needs leave.approve.
export default function YxOvertimeReviewPage() {
  const { month, setMonth, entity } = useScopeParams();
  const review = useTime<OtReview>(withParams(`/overtime?month=${month}`, entity));
  const write = useTimeWrite();
  return (
    <OtReviewScreen
      live={{
        state: timeState(review),
        onRetry: () => void review.refetch(),
        data: review.data ?? null,
        month,
        onMonth: setMonth,
        onOverride: (cid, reason) => write(`/overtime/${encodeURIComponent(cid)}/override`, 'POST', { reason }, true, 'Overtime over the limit will be paid'),
        // TIM-09: the viewer's approval task, decided here (the same engine as Approvals). Bulk decisions toast once on the page.
        onDecide: (cid, decision, reason) => write(`/overtime/${encodeURIComponent(cid)}/decide`, 'POST', { decision, ...(reason ? { reason } : {}) }, true, decision === 'comp_off' ? 'Comp-off given' : undefined),
      }}
    />
  );
}
