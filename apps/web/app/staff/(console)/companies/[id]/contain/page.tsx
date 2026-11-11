'use client';

import { useParams } from 'next/navigation';
import { ContainTenantScreen, type ContainView } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleWrite } from '../../../../../../lib/yx-console';

// Console › Companies › Contain company (YX-18, answer 1050): sign everyone out, revoke connected apps, hold exports,
// bank-detail changes and payouts; two different staff members lift it. The API asks for the security key again.
export default function ConsoleContainPage() {
  const { id } = useParams<{ id: string }>();
  const path = `/companies/${encodeURIComponent(id)}/containment`;
  const q = useConsole<ContainView>(path);
  const write = useConsoleWrite();
  return (
    <ContainTenantScreen
      stepUpAt={null}
      now={new Date()}
      live={{
        state: loadState(q),
        onRetry: () => void q.refetch(),
        view: q.data ?? null,
        onContain: async (reason) => void (await write(`/companies/${encodeURIComponent(id)}/contain`, 'POST', { reason })),
        onRequestLift: async (reason) => void (await write(`${path}/request-lift`, 'POST', { reason })),
        onLift: async () => void (await write(`${path}/lift`, 'POST', {})),
      }}
    />
  );
}
