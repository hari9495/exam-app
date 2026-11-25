'use client';

import { useRouter } from 'next/navigation';
import { PositionsScreen, type SeatList, type SeatRecord } from '@yukthix/ui/frame';
import { loadState, useOrg, useOrgRead } from '../../../../../lib/yx-org';
import { useSeatOptions, useSendSeatChanges } from '../../../../../lib/yx-positions';

const id = encodeURIComponent;

// People › Positions (POS-01, Enterprise E1): the company's seats with headcount, filled and vacant. Seat changes, one
// or many, go for approval by someone else; with positions off, a manager plans the switch-on (POS-03).
export default function YxPositionsPage() {
  const router = useRouter();
  const list = useOrg<SeatList>('/positions');
  const read = useOrgRead();
  const options = useSeatOptions(Boolean(list.data?.canManage), list.data);
  const send = useSendSeatChanges();
  const st = loadState(list);
  return (
    <PositionsScreen
      state={st === 'no-access' ? 'forbidden' : st}
      onRetry={() => void list.refetch()}
      data={list.data ?? null}
      options={options}
      today={new Date()}
      onOpen={(seat) => router.push(`/yx/people/positions/${id(seat)}`)}
      onSwitchOn={() => router.push('/yx/people/positions/switch-on')}
      valuesOf={async (seat) => (await read<SeatRecord>(`/positions/${id(seat)}`)).current.values}
      onSend={send}
    />
  );
}
