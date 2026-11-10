'use client';

import { useParams, useRouter } from 'next/navigation';
import { CompanySettingsScreen, type CompanySettingsView } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../../../lib/yx-console';

// Console › Companies › one company › Company settings (careers answer 442): white-label and other settings only
// YukthiX staff change, each allowed by the company's plan, with a reason (audited for the company).
export default function ConsoleCompanySettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const path = `/companies/${encodeURIComponent(id)}/settings`;
  const settings = useConsole<CompanySettingsView>(path);
  const can = useConsoleKeys();
  const write = useConsoleWrite();
  return (
    <CompanySettingsScreen
      state={loadState(settings)}
      onRetry={() => void settings.refetch()}
      company={settings.data ?? null}
      canManage={can('platform.companies.manage')}
      onBack={() => router.push(`/staff/companies/${encodeURIComponent(id)}`)}
      onChange={(key, value, reason) => write(path, 'PATCH', { key, value, reason }).then(() => undefined)}
    />
  );
}
