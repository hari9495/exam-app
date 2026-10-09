'use client';

import { ResignationScreen, type MyResignation } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › Resign (PPL-18; design §10.2): my notice from the company policy, my resignation and its withdrawal.
export default function YxResignationPage() {
  const data = useLife<MyResignation>('/lifecycle/me/resignation');
  const write = useLifeWrite();
  return (
    <ResignationScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      onResign={(x) => write('POST', '/lifecycle/me/resignation', { reasonCode: x.reasonCode, reasonText: x.reasonText, ...(x.requestedLwd ? { requestedLwd: x.requestedLwd } : {}) })}
      onWithdraw={(reason) => write('POST', '/lifecycle/me/resignation/withdraw', { reason })}
      interviewHref="/yx/me/exit-interview"
    />
  );
}
