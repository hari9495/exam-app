'use client';

import { useRouter } from 'next/navigation';
import { SupportSessionsScreen, type SupportSession } from '@yukthix/ui/console';
import { useAuth } from '../../../../lib/auth-context';
import { loadState, useConsole, useConsoleWrite } from '../../../../lib/yx-console';

// Console › Support sessions (P02 Q8): every company's requests and sessions; open your own approved one.
export default function ConsoleSupportPage() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const sessions = useConsole<SupportSession[]>('/support-sessions');
  const write = useConsoleWrite();
  return (
    <SupportSessionsScreen
      state={loadState(sessions)}
      onRetry={() => void sessions.refetch()}
      sessions={sessions.data ?? []}
      onOpenCompany={(organizationId) => router.push(`/staff/companies/${encodeURIComponent(organizationId)}`)}
      onOpenSession={async (s) => {
        await switchIntoOrg(s.organizationId);
        router.push('/yx/settings/legal-entities');
      }}
      onEndSession={(id) => write(`/support-sessions/${encodeURIComponent(id)}/end`, 'POST').then(() => undefined)}
      onWithdrawRequest={(id) => write(`/support-sessions/${encodeURIComponent(id)}/cancel`, 'POST').then(() => undefined)}
    />
  );
}
