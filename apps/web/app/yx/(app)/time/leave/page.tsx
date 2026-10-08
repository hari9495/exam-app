'use client';

import { MyLeaveScreen, type LeavePlan, type MyLeave, type PersonOption } from '@yukthix/ui/time';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// Me › Leave (TIM-17 / 18 / 19 / 23): no permission key; the API reaches only the signed-in person's own leave.
export default function YxMyLeavePage() {
  const { accessToken } = useAuth();
  const leave = useTime<MyLeave>('/me/leave');
  const write = useTimeWrite();
  return (
    <MyLeaveScreen
      state={timeState(leave)}
      onRetry={() => void leave.refetch()}
      data={leave.data ?? null}
      onPreview={(input) => write<LeavePlan>('/me/leave/preview', 'POST', input, false)}
      onApply={(input) => write('/me/leave', 'POST', input)}
      onWithdraw={(rid) => write(`/me/leave/${id(rid)}/withdraw`)}
      onCancel={(rid, reason) => write(`/me/leave/${id(rid)}/cancel`, 'POST', { reason })}
      onChooseHoliday={(hid, choose) => write(`/me/holidays/${id(hid)}/${choose ? 'choose' : 'unchoose'}`)}
      onFindPeople={(q) => apiFetch(`/workflow/people?q=${id(q)}`, {}, accessToken ?? undefined) as Promise<PersonOption[]>}
    />
  );
}
