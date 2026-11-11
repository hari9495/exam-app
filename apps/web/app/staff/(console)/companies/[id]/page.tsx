'use client';

import { useParams, useRouter } from 'next/navigation';
import { CompanyScreen, type CompanyDetail, type CompanyFeature, type CompanySettingsView, type Product, type SupportSession } from '@yukthix/ui/console';
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
  // Answer 1053: what is switched on: the plan's products, then the plan features YukthiX turns on (Company settings).
  // shortcut: C-4's per-company feature switches are not merged yet; add them here as source 'switch' when they are.
  const products = useConsole<Product[]>('/products');
  const settings = useConsole<CompanySettingsView>(`${path}/settings`, can('platform.companies.view'));
  const features: CompanyFeature[] | undefined =
    company.data && products.data
      ? [
          ...products.data.map((p) => ({ key: `product:${p.code}`, label: p.name, on: company.data!.products.includes(p.code), source: 'product' as const, note: 'Not in the plan' })),
          ...(settings.data?.settings ?? []).map((s) => ({ key: `setting:${s.key}`, label: s.label, on: s.included && s.value === 'on', source: 'setting' as const, note: s.included ? 'Off' : 'Not in the plan' })),
        ]
      : undefined;
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
      onOpenSettings={() => router.push(`/staff/companies/${encodeURIComponent(id)}/settings`)}
      onContain={can('platform.company.contain') ? () => router.push(`/staff/companies/${encodeURIComponent(id)}/contain`) : undefined}
      features={features}
    />
  );
}
