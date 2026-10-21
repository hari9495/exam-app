'use client';

import { OtReviewScreen, type OtReview } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeDecide, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Overtime review (TIM-09, the designed screen): a manager's team or attendance.view in scope, for the top-bar month.
// Approve and reject decide the viewer's own approval step; paying over a limit needs leave.approve.
export default function YxOvertimeReviewPage() {
  const { month, entity } = useScopeParams();
  const review = useTime<OtReview>(withParams(`/overtime?month=${month}`, entity));
  const write = useTimeWrite();
  const decide = useTimeDecide();
  return (
    <OtReviewScreen
      live={{
        state: timeState(review),
        onRetry: () => void review.refetch(),
        data: review.data ?? null,
        today: todayIndia(),
        onDecide: decide,
        onOverride: (cid, reason) => write(`/overtime/${encodeURIComponent(cid)}/override`, 'POST', { reason }),
      }}
    />
  );
}
