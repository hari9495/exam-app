'use client';

import { PreRegisterScreen, type VisitView } from '@yukthix/ui/visitors';
import { loadState } from '../../../../../lib/yx-org';
import { useVisitors, useVisitorsWrite, type VisitorOptions } from '../../../../../lib/yx-visitors';

// Visitors › My visitors (VIS-02): every employee invites their own visitors; the pass goes by email (answer 609).
// Nothing is sent while acting for someone else.
export default function YxMyVisitorsPage() {
  const options = useVisitors<VisitorOptions>('/options');
  const mine = useVisitors<VisitView[]>('/mine');
  const write = useVisitorsWrite();
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
      }}
    />
  );
}
