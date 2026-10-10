'use client';

import { ResignationScreen, type MyResignation, type MyVrsScheme } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › Resign (PPL-18; design §10.2): my notice from the company policy, my resignation and its withdrawal.
export default function YxResignationPage() {
  const data = useLife<MyResignation>('/lifecycle/me/resignation');
  const write = useLifeWrite();
  const vrs = useLife<{ schemes: MyVrsScheme[] }>('/lifecycle/me/vrs');
  return (
    <ResignationScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      onResign={(x) => write('POST', '/lifecycle/me/resignation', { reasonCode: x.reasonCode, reasonText: x.reasonText, ...(x.requestedLwd ? { requestedLwd: x.requestedLwd } : {}) })}
      onWithdraw={(reason) => write('POST', '/lifecycle/me/resignation/withdraw', { reason })}
      interviewHref="/yx/me/exit-interview"
      vrs={vrs.data?.schemes.length ? { schemes: vrs.data.schemes, onApply: (s, x) => write('POST', '/lifecycle/me/vrs', { schemeId: s.id, requestedLwd: x.requestedLwd, ...(x.reasonText ? { reasonText: x.reasonText } : {}) }) } : undefined}
    />
  );
}
