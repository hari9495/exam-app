'use client';

import { OvertimeReviewScreen, type OtReview } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Team / HR › Overtime: a manager's team or attendance.view in scope; paying over a limit needs leave.approve.
export default function YxOvertimeReviewPage() {
  const { month, setMonth, entity } = useScopeParams();
  const review = useTime<OtReview>(withParams(`/overtime?month=${month}`, entity));
  const write = useTimeWrite();
  return (
    <OvertimeReviewScreen
      state={timeState(review)}
      onRetry={() => void review.refetch()}
      data={review.data ?? null}
      month={month}
      onMonth={setMonth}
      onOverride={(cid, reason) => write(`/overtime/${encodeURIComponent(cid)}/override`, 'POST', { reason })}
    />
  );
}
