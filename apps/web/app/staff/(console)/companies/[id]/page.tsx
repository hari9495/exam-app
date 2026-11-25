'use client';

import { useParams, useRouter } from 'next/navigation';
import { CompanyScreen, type CompanyDetail, type CompanyFeature, type CompanySettingsView, type Product, type SupportSession } from '@yukthix/ui/console';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../../lib/yx-console';
import { saveBlob } from '../../../../../lib/yx-pay';
import { apiFetch } from '../../../../../lib/api-client';

// Console › Companies › one company: lifecycle, support access (P02 Q8), admins and history. Suspending or closing
// is a step-up action: apiFetch asks for the security key, then resends.
export default function ConsoleCompanyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { switchIntoOrg, accessToken } = useAuth();
  const path = `/companies/${encodeURIComponent(id)}`;
  const company = useConsole<CompanyDetail>(path);
  const can = useConsoleKeys();
  const sessions = useConsole<SupportSession[]>(`/support-sessions?organizationId=${encodeURIComponent(id)}`, can('platform.support.request'));
  const write = useConsoleWrite();
  // Answer 1053: what is switched on: the plan's products, then the plan features YukthiX turns on (Company settings).
  // C-4's feature switches for this company, decided by the one feature check (killed, own value, default, setting).
  const switches = useConsole<{ key: string; label: string; on: boolean; why: string | null }[]>(`${path}/feature-switches`, can('platform.companies.view'));
  const products = useConsole<Product[]>('/products');
  const settings = useConsole<CompanySettingsView>(`${path}/settings`, can('platform.companies.view'));
  const features: CompanyFeature[] | undefined =
    company.data && products.data
      ? [
          ...products.data.map((p) => ({ key: `product:${p.code}`, label: p.name, on: company.data!.products.includes(p.code), source: 'product' as const, note: 'Not in the plan' })),
          ...(settings.data?.settings ?? []).map((s) => ({ key: `setting:${s.key}`, label: s.label, on: s.included && s.value === 'on', source: 'setting' as const, note: s.included ? 'Off' : 'Not in the plan' })),
          ...(switches.data ?? []).map((f) => ({ key: `switch:${f.key}`, label: f.label, on: f.on, source: 'switch' as const, note: f.why ?? 'Off' })),
        ]
      : undefined;
  // The certificate exactly as stored, so its SHA-256 can be checked against the one shown in the console.
  const downloadCertificate = async () => {
    const r = (await apiFetch(`/platform${path}/deletion/certificate`, {}, accessToken ?? undefined)) as { fileName: string; certificate: string };
    saveBlob(new Blob([r.certificate], { type: 'application/json' }), r.fileName);
  };
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
      // Answer 1882: a second staff member confirms; the certificate is saved. Answer 1975: the company stays, with its
      // statutory records kept read-only; 1973: its certificate can be downloaded again from here.
      onAskDeletion={can('platform.companies.manage') ? (reason) => write(`${path}/deletion`, 'POST', { reason }) : undefined}
      onWithdrawDeletion={can('platform.companies.manage') ? () => write(`${path}/deletion/withdraw`, 'POST') : undefined}
      onConfirmDeletion={
        can('platform.companies.manage')
          ? () =>
              write(`${path}/deletion/confirm`, 'POST').then(downloadCertificate)
          : undefined
      }
      onDownloadCertificate={can('platform.companies.view') ? downloadCertificate : undefined}
      // Answer 2083: a legal hold on a deleted company (security key, asked for by apiFetch; audited).
      onSetHold={can('platform.companies.manage') ? (input) => write(`${path}/legal-holds`, 'POST', input) : undefined}
      onEndHold={can('platform.companies.manage') ? (holdId, reason) => write(`${path}/legal-holds/${encodeURIComponent(holdId)}/end`, 'POST', { reason }) : undefined}
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
