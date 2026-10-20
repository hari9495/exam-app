'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { LeaveHomeScreen, type LeavePlan, type MyLeave, type PersonOption } from '@yukthix/ui/time';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// Me › Leave (the designed TIM-17 leave home, with TIM-18 apply, TIM-19 request and TIM-23 optional holidays): no
// permission key; the API reaches only the signed-in person's own leave. Home's Apply leave opens the sheet here
// (?request=apply); the parameter is then dropped, so asking again opens it again.
function YxMyLeaveInner() {
  const { accessToken } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const asked = params.get('request') === 'apply';
  const [apply, setApply] = useState<number | undefined>();
  useEffect(() => {
    if (!asked) return;
    setApply((n) => (n ?? 0) + 1);
    router.replace(path);
  }, [asked, path, router]);
  const leave = useTime<MyLeave>('/me/leave');
  const write = useTimeWrite();
  return (
    <LeaveHomeScreen
      live={{
        state: timeState(leave),
        onRetry: () => void leave.refetch(),
        data: leave.data ?? null,
        onPreview: (input) => write<LeavePlan>('/me/leave/preview', 'POST', input, false),
        onApply: (input) => write('/me/leave', 'POST', input),
        onWithdraw: (rid) => write(`/me/leave/${id(rid)}/withdraw`),
        onCancel: (rid, reason) => write(`/me/leave/${id(rid)}/cancel`, 'POST', { reason }),
        onChooseHoliday: (hid, choose) => write(`/me/holidays/${id(hid)}/${choose ? 'choose' : 'unchoose'}`),
        onFindPeople: (q) => apiFetch(`/workflow/people?q=${id(q)}`, {}, accessToken ?? undefined) as Promise<PersonOption[]>,
        apply,
      }}
    />
  );
}

export default function YxMyLeavePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxMyLeaveInner />
    </Suspense>
  );
}
