'use client';

import { useRouter } from 'next/navigation';
import { PositionsSwitchOnScreen, type SwitchOnData } from '@yukthix/ui/frame';
import { loadState, useOrg, useOrgWrite } from '../../../../../../lib/yx-org';

const enc = encodeURIComponent;

// People › Positions › Switch on (POS-03, answer 2642): one seat per group of identical jobs. One HR person sends the
// plan; another approves it, which links everyone to their seat and turns positions on.
export default function YxPositionsSwitchOnPage() {
  const router = useRouter();
  const data = useOrg<SwitchOnData>('/positions/switch-on');
  const write = useOrgWrite();
  const st = loadState(data);
  return (
    <PositionsSwitchOnScreen
      state={st === 'no-access' ? 'forbidden' : st}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      onBack={() => router.push('/yx/people/positions')}
      onSend={async (reason) => {
        await write('POST', '/positions/switch-on', { reason });
      }}
      onApprove={async (batchId) => {
        await write('POST', `/positions/switch-on/${enc(batchId)}/approve`);
      }}
      onDecline={async (batchId, reason) => {
        await write('POST', `/positions/switch-on/${enc(batchId)}/decline`, { reason });
      }}
    />
  );
}
