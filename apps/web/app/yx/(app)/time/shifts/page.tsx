'use client';

import { MyShiftsScreen, type MyShifts } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Me › My shifts: the person's own published shifts and swaps (no key; the API reads only their own record).
export default function YxMyShiftsPage() {
  const today = todayIndia();
  const mine = useTime<MyShifts>(`/me/shifts?week=${mondayOf(today)}`);
  const write = useTimeWrite();
  return (
    <MyShiftsScreen
      state={timeState(mine)}
      onRetry={() => void mine.refetch()}
      data={mine.data ?? null}
      today={today}
      onSwap={(input) => write('/me/swaps', 'POST', input)}
      onWithdrawSwap={(sid) => write(`/me/swaps/${encodeURIComponent(sid)}/withdraw`)}
    />
  );
}
