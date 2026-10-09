'use client';

import { useParams, useRouter } from 'next/navigation';
import { SupportDeskTicketScreen, type DeskConsoleTicket } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../../lib/yx-console';
import { notAgent } from '../../../../../lib/yx-support-desk';

// Console › Support desk › one ticket: conversation, tenant panel (account facts only) and "Request access".
export default function ConsoleSupportDeskTicketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const path = `/support-desk/tickets/${encodeURIComponent(id)}`;
  const q = useConsole<DeskConsoleTicket>(path);
  const can = useConsoleKeys();
  const write = useConsoleWrite();
  return (
    <SupportDeskTicketScreen
      state={loadState(q)}
      onRetry={() => void q.refetch()}
      blocked={notAgent(q.error)}
      view={q.data ?? null}
      canRequestAccess={can('platform.support.request')}
      onBack={() => router.push('/staff/support-desk')}
      onPost={(kind, bodyHtml) => write(`${path}/messages`, 'POST', { kind, bodyHtml })}
      onAssignMe={() => write(`${path}/assign-me`, 'POST')}
      onResolve={(version, note) => write(`${path}/resolve`, 'POST', { version, ...(note ? { note } : {}) })}
      onLink={(accountId) => write(`${path}/link`, 'POST', { accountId })}
      onRequestAccess={(input) => write(`${path}/request-access`, 'POST', input)}
    />
  );
}
