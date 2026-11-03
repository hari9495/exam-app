'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { NominationsScreen, type NominationRow, type Nominations, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { day, designState, usePerf, usePerfWrite, refused } from '../../../../../../../lib/yx-performance';

// PRF-07 360° nominations, the designed screen with live data: the employee builds the list and sends it to their
// manager; the manager approves, removes, adds and invites. The API checks who, the window and the cycle's min and max.
const REL = { peer: 'Peer', report: 'Direct report', other: 'Other' } as const;
const STATUS = { proposed: 'Proposed', approved: 'Approved', declined: 'Removed', submitted: 'Responded' } as const;

export default function YxNominationsPage() {
  const { id } = useParams<{ id: string }>();
  const base = `/reviews/${encodeURIComponent(id)}`;
  const data = usePerf<Nominations>(`${base}/nominations`);
  const [q, setQ] = useState('');
  const d = data.data;
  const mine = d?.viewer === 'employee';
  const options = usePerf<{ id: string; name: string }[]>(`${base}/nominee-options?q=${encodeURIComponent(q)}`, Boolean(d?.can.propose || d?.can.add));
  const write = usePerfWrite();
  const rows: NominationRow[] = (d?.nominations ?? [])
    .filter((n) => n.status !== 'withdrawn')
    .map((n) => ({
      id: n.id,
      name: n.reviewer,
      relationship: REL[n.relationship],
      status: STATUS[n.status as keyof typeof STATUS],
      addedBy: n.proposedBy === 'employee' ? undefined : n.proposedBy === 'manager' ? 'Manager' : 'HR',
      canRemove: n.status === 'proposed' && (mine ? n.proposedBy === 'employee' && Boolean(d?.can.propose) : Boolean(d?.can.decide)),
    }));
  if (refused(data)) return <PerfNoAccessScreen title="360° nominations" what="360° nominations for this review" grantedBy="HR" active="Reviews & cycles" persona="emp" />;
  return (
    <NominationsScreen
      persona={mine ? 'emp' : 'mgr'}
      state={designState(data)}
      employee={d?.employee ?? ''}
      people={(options.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
      nominations={rows}
      min={d?.peer?.minNominees ?? 3}
      max={d?.peer?.maxNominees ?? 6}
      live={{
        onRetry: () => void data.refetch(),
        cycle: d?.cycle ?? '',
        dueOn: d?.peer ? day(d.peer.dueOn) : new Date(),
        manager: d?.manager ?? 'your manager',
        sent: mine ? Boolean(d?.sentAt) && !d?.can.send : rows.length > 0 && !rows.some((n) => n.status === 'Proposed'),
        can: { propose: Boolean(d?.can.propose), decide: Boolean(d?.can.decide), add: Boolean(d?.can.add), send: Boolean(d?.can.send) },
        onSearch: setQ,
        onAdd: (reviewerEmployeeId, relationship) => write('POST', `${base}/nominations`, { reviewerEmployeeId, relationship }),
        onApprove: (nid) => write('POST', `/nominations/${encodeURIComponent(nid)}/approve`),
        onRemove: (n) => write('POST', `/nominations/${encodeURIComponent(n.id)}/${mine ? 'withdraw' : 'decline'}`),
        onSend: () => write('POST', `${base}/nominations/send`),
        onApproveAll: () => write('POST', `${base}/nominations/approve-all`),
      }}
    />
  );
}
