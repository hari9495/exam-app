'use client';

import { useRouter } from 'next/navigation';
import { LeaveCardScreen, type MyLeaveCard } from '@yukthix/ui/time';
import { timeState, useTime } from '../../../../../../lib/yx-time';

// Me › My leave card (TIM-21, employee): my own balances, ledger and projection. No key: the API reads only my own leave.
export default function YxMyLeaveCardPage() {
  const router = useRouter();
  const card = useTime<MyLeaveCard>('/me/leave/ledger');
  return <LeaveCardScreen mine={{ state: timeState(card), onRetry: () => void card.refetch(), data: card.data ?? null, onApply: () => router.push('/yx/time/leave?apply=1') }} />;
}
