'use client';

import { useState } from 'react';
import { OvertimeReviewScreen, type OtReview } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Team / HR › Overtime: a manager's team or attendance.view in scope; paying over a limit needs leave.approve.
export default function YxOvertimeReviewPage() {
  const [month, setMonth] = useState(todayIndia().slice(0, 7));
  const review = useTime<OtReview>(`/overtime?month=${month}`);
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
