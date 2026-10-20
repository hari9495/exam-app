'use client';

import { useRouter } from 'next/navigation';
import { ShiftSwapSheet, type MyShifts } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Me › My shifts (TIM-08, the designed screen): the person's own published shifts and swaps (no key; the API reads only
// their own record). A colleague's swap waiting for them is answered in the shared Approvals inbox.
export default function YxMyShiftsPage() {
  const today = todayIndia();
  const router = useRouter();
  const mine = useTime<MyShifts>(`/me/shifts?week=${mondayOf(today)}`);
  const write = useTimeWrite();
  return (
    <ShiftSwapSheet
      live={{
        state: timeState(mine),
        onRetry: () => void mine.refetch(),
        data: mine.data ?? null,
        today,
        onSwap: (input) => write('/me/swaps', 'POST', input),
        onWithdraw: (sid) => write(`/me/swaps/${encodeURIComponent(sid)}/withdraw`),
        onOpenApprovals: () => router.push('/yx/approvals'),
      }}
    />
  );
}
