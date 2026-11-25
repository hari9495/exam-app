'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { PositionRecordScreen, type SeatList, type SeatRecord } from '@yukthix/ui/frame';
import { loadState, useOrg, useOrgWrite } from '../../../../../../lib/yx-org';
import { useSeatOptions, useSendSeatChanges } from '../../../../../../lib/yx-positions';

const enc = encodeURIComponent;

// People › Positions › a seat (POS-02, Enterprise E1): details, the people in it, the seats under it, its dated history,
// requisitions and changes. The requester may withdraw a change still waiting for approval.
export default function YxPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const seat = useOrg<SeatRecord>(`/positions/${enc(id)}`);
  const list = useOrg<SeatList>('/positions', Boolean(seat.data?.canManage));
  const options = useSeatOptions(Boolean(seat.data?.canManage), list.data);
  const send = useSendSeatChanges();
  const write = useOrgWrite();
  const st = loadState(seat);
  return (
    <PositionRecordScreen
      state={st === 'no-access' ? 'forbidden' : st}
      onRetry={() => void seat.refetch()}
      data={seat.data ?? null}
      options={options}
      today={new Date()}
      onBack={() => router.push('/yx/people/positions')}
      hrefs={{ person: (p) => `/yx/people/directory/${enc(p)}`, seat: (s) => `/yx/people/positions/${enc(s)}` }}
      onSend={send}
      onWithdraw={async (batchId) => {
        await write('POST', `/positions/changes/${enc(batchId)}/withdraw`);
      }}
    />
  );
}
