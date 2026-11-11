'use client';

import { CustomerSuccessScreen, type CsHealthRow, type CsMessageRow, type CsSettingRow } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../lib/yx-console';

// Console › Customer success (C-2, answers 1047 and 1048): tenant health from account signals, churn alerts from the
// platform settings, and messages to companies' System Admins. Approving a message to more than one company is a step-up
// action: apiFetch asks the staff member for their security key, then resends.
export default function ConsoleCustomersPage() {
  const health = useConsole<{ rows: CsHealthRow[] }>('/customers/health');
  const messages = useConsole<CsMessageRow[]>('/customers/messages');
  const settings = useConsole<CsSettingRow[]>('/customers/settings');
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
        onSaveSettings: (values) => write('/customers/settings', 'PUT', { values }),
      }}
    />
  );
}
