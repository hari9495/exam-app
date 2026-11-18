'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LeaveHomeScreen } from '@yukthix/ui/time';
import { useMyLeaveLive } from '../../../../../lib/yx-my-leave';

// Me › Leave: the TIM-17 design (Apply leave TIM-18, a request TIM-19 and optional holidays TIM-23 open from it): no permission key; the API reaches only the signed-in person's own leave.
function MyLeave() {
  // ?apply=1: the "Apply leave" action (Ctrl K, N L) opens the request sheet at once.
  const apply = useSearchParams()?.get('apply') === '1';
  const router = useRouter();
  // Drop ?apply=1 once read, so asking again (N L) changes the address and opens the sheet again.
  useEffect(() => {
    if (apply) router.replace('/yx/time/leave', { scroll: false });
  }, [apply, router]);
  const live = useMyLeaveLive({ startApplying: apply, onOpenCard: () => router.push('/yx/time/leave/card') });
  return <LeaveHomeScreen live={live} />;
}

export default function YxMyLeavePage() {
  return (
    <Suspense>
      <MyLeave />
    </Suspense>
  );
}
