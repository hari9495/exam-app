'use client';

import { PreRegisterScreen, type VisitView, type WalkInApproval } from '@yukthix/ui/visitors';
import { loadState } from '../../../../../lib/yx-org';
import { useVisitors, useVisitorsGet, useVisitorsWrite, useWalkInPhoto, type VisitorOptions } from '../../../../../lib/yx-visitors';

// Visitors › My visitors (VIS-02): every employee invites their own visitors; the pass goes by email (answer 609).
// Nothing is sent while acting for someone else.
export default function YxMyVisitorsPage() {
  const options = useVisitors<VisitorOptions>('/options');
  const mine = useVisitors<VisitView[]>('/mine');
  const write = useVisitorsWrite();
  const get = useVisitorsGet();
  const photo = useWalkInPhoto();
  const types = useVisitors<{ types: { id: string; name: string }[] }>('/types');
  // Slice 2 (604): walk-ins asking for me, checked every 15 seconds while the page is open.
  const approvals = useVisitors<WalkInApproval[]>('/approvals', 15_000);
  return (
    <PreRegisterScreen
      visits={[]}
      today={new Date()}
      live={{
        state: loadState(options, mine),
        onRetry: () => void Promise.all([options.refetch(), mine.refetch()]),
        visits: mine.data ?? [],
        locations: options.data?.locations ?? [],
        today: new Date(),
        canChange: Boolean(options.data && !options.data.acting),
        onInvite: (input) => write<VisitView & { emailed: boolean; outsideHours: string | null }>('POST', '/invites', input),
        onCancel: (id) => write('POST', `/${encodeURIComponent(id)}/cancel`),
        types: (types.data?.types ?? []).map((t) => ({ value: t.id, label: t.name })),
        approvals: {
          rows: approvals.data ?? [],
          photo,
          onDecide: (id, approve) => write('POST', `/walk-ins/${encodeURIComponent(id)}/decide`, { approve }),
          // Answer 711: send a colleague; they get the card with their own minutes.
          colleagues: (id, q) => get(`/walk-ins/${encodeURIComponent(id)}/colleagues?q=${encodeURIComponent(q)}`),
          onSend: async (id, userId) => {
            const r = await write<{ to: string; dueAt: string | null }>('POST', `/walk-ins/${encodeURIComponent(id)}/send`, { userId });
            void approvals.refetch();
            return r;
          },
        },
      }}
    />
  );
}
