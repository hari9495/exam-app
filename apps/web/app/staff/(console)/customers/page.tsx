'use client';

import { useRouter } from 'next/navigation';
import { CustomerSuccessScreen, type CsFollowup, type CsHealthRow, type CsMessageRow, type CsSettingRow } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../lib/yx-console';

// Console › Customer success (C-2, answers 1047 and 1048): tenant health from account signals, churn alerts from the
// platform settings, and messages to companies' System Admins. Approving a message to more than one company is a step-up
// action: apiFetch asks the staff member for their security key, then resends.
export default function ConsoleCustomersPage() {
  const router = useRouter();
  const health = useConsole<{ rows: CsHealthRow[] }>('/customers/health');
  const messages = useConsole<CsMessageRow[]>('/customers/messages');
  const settings = useConsole<CsSettingRow[]>('/customers/settings');
  // Answers 1082, 1083 (1165): Customer success owners and alert follow-up.
  const owners = useConsole<{ id: string; name: string }[]>('/customers/owners');
  const followups = useConsole<CsFollowup[]>('/customers/alerts');
  const can = useConsoleKeys();
  const write = useConsoleWrite();
  const state = [health, messages, settings].map(loadState).find((s) => s !== 'ready') ?? 'ready';
  return (
    <CustomerSuccessScreen
      tenants={[]}
      alerts={[]}
      me=""
      live={{
        state,
        onRetry: () => void Promise.all([health.refetch(), messages.refetch(), settings.refetch()]),
        rows: health.data?.rows ?? [],
        messages: messages.data ?? [],
        settings: settings.data ?? [],
        canManage: can('platform.customers.success'),
        onWrite: (input) => write('/customers/messages', 'POST', input),
        onApprove: (id, version) => write(`/customers/messages/${encodeURIComponent(id)}/approve`, 'POST', { version }),
        onReject: (id, version, note) => write(`/customers/messages/${encodeURIComponent(id)}/reject`, 'POST', { version, note }),
        // Answer 1087: the writer withdraws their own message while it waits.
        onWithdraw: (id, version) => write(`/customers/messages/${encodeURIComponent(id)}/withdraw`, 'POST', { version }),
        // Answer 1183: the alert rules change only on Console › Platform settings (security key and a reason).
        onOpenPlatformSettings: can('platform.settings.manage') ? () => router.push('/staff/platform-settings') : undefined,
        owners: owners.data ?? [],
        followups: followups.data,
        onSetOwner: (companyId, ownerUserId) => write(`/customers/companies/${encodeURIComponent(companyId)}/owner`, 'PUT', { ownerUserId }),
        onUpdateAlert: (id, version, change) => write(`/customers/alerts/${encodeURIComponent(id)}`, 'PUT', { version, ...change }),
        onOutreach: (id, note) => write(`/customers/alerts/${encodeURIComponent(id)}/outreach`, 'POST', { note }),
      }}
    />
  );
}
