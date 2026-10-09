'use client';

import { useParams, useRouter } from 'next/navigation';
import { CompanyScreen, type CompanyDetail, type SupportSession } from '@yukthix/ui/console';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../../lib/yx-console';

// Console › Companies › one company: lifecycle, support access (P02 Q8), admins and history. Suspending or closing
// is a step-up action: apiFetch asks for the security key, then resends.
export default function ConsoleCompanyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const path = `/companies/${encodeURIComponent(id)}`;
  const company = useConsole<CompanyDetail>(path);
  const can = useConsoleKeys();
  const sessions = useConsole<SupportSession[]>(`/support-sessions?organizationId=${encodeURIComponent(id)}`, can('platform.support.request'));
  const write = useConsoleWrite();
  const session = (sessionId: string, what: 'end' | 'cancel') => write(`/support-sessions/${encodeURIComponent(sessionId)}/${what}`, 'POST').then(() => undefined);
  return (
    <CompanyScreen
      state={loadState(company)}
      onRetry={() => void company.refetch()}
      company={company.data ?? null}
      sessions={sessions.data ?? []}
      canManage={can('platform.companies.manage')}
      canSupport={can('platform.support.request')}
      onBack={() => router.push('/staff/companies')}
      onLifecycle={(action, reason) => write(`${path}/lifecycle`, 'POST', { action, reason }).then(() => undefined)}
      onExtendTrial={(days, reason) => write(`${path}/extend-trial`, 'POST', { days, reason }).then(() => undefined)}
      onRequestSupport={(input) => write(`${path}/support-sessions`, 'POST', input).then(() => undefined)}
      onOpenSession={async () => {
        await switchIntoOrg(id);
        router.push('/yx/settings/legal-entities');
      }}
      onEndSession={(sessionId) => session(sessionId, 'end')}
      onWithdrawRequest={(sessionId) => session(sessionId, 'cancel')}
    />
  );
}
