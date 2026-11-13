'use client';

import { BusinessAppsScreen, type BusinessApp } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk plan item 3: the company's business applications and their owners. The desks' staff read the list; the
// company's Service Desk owner (desk.desk.create) adds, changes and retires applications. Access is asked for in the
// service catalogue and approved by the application's owner (or the desk's admins).
export default function YxDeskAppsPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const perms = useYxPermissions();
  const apps = useDesk<BusinessApp[]>('/apps');
  const write = useDeskWrite();
  return (
    <BusinessAppsScreen
      state={deskState(apps)}
      onRetry={() => void apps.refetch()}
      apps={apps.data ?? []}
      canEdit={perms.has('desk.desk.create')}
      onSave={(id, input) => write(id ? `/apps/${encodeURIComponent(id)}` : '/apps', id ? 'PATCH' : 'POST', input)}
      onPickPeople={async (q) => ((await apiFetch(`/desk/users?search=${encodeURIComponent(q)}`, {}, token)) as { id: string; name: string | null; email: string }[]).map((u) => ({ id: u.id, label: u.name ?? u.email, detail: u.email }))}
    />
  );
}
