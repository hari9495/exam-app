'use client';

import { FeatureFlagsScreen, type LiveFlag } from '@yukthix/ui/console';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { loadState, useConsole, useConsoleWrite } from '../../../../lib/yx-console';

const key = encodeURIComponent;

// Console › Feature flags (YX-04 Flags, answer 1049): a default for every company, a company's own value, and the
// kill switch (another staff member turns it back on). The API asks for the security key again for every change.
export default function ConsoleFeatureFlagsPage() {
  const flags = useConsole<LiveFlag[]>('/feature-flags');
  const companies = useConsole<{ id: string; name: string }[]>('/companies');
  const me = useCurrentUser();
  const write = useConsoleWrite();
  return (
    <FeatureFlagsScreen
      flags={[]}
      live={{
        state: loadState(flags),
        onRetry: () => void flags.refetch(),
        flags: flags.data ?? [],
        companies: (companies.data ?? []).map((c) => ({ id: c.id, name: c.name })),
        meId: me.data?.id ?? '',
        onDefault: async (k, on, reason) => void (await write(`/feature-flags/${key(k)}/default`, 'PUT', { on, reason })),
        onOverride: async (k, org, on, reason) => void (await write(`/feature-flags/${key(k)}/companies/${key(org)}`, 'PUT', { on, reason })),
        onKill: async (k, reason) => void (await write(`/feature-flags/${key(k)}/kill`, 'POST', { reason })),
        onRevive: async (k, reason) => void (await write(`/feature-flags/${key(k)}/revive`, 'POST', { reason })),
      }}
    />
  );
}
