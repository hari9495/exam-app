'use client';

import { NoAccessState } from '@yukthix/ui';
import { SchedulesScreen } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../lib/yx-hiring';
import { useYxPermissions } from '../../../../../lib/yx-org';

// Answer 2428 (decision 2398): Hire › Report schedules, the designed ANL-08 screen, live, in place of the older /v2
// Scheduled reports page: the weekly hiring digest, its recipients and when it last went out. The API checks the key.
type Digest = { enabled: boolean; recipientUserIds: string[]; lastSentAt: string | null };
type People = { data: { id: string; name: string | null; email: string; status?: string }[] };
export default function YxReportSchedulesPage() {
  const perms = useYxPermissions();
  const admin = perms.has('org:manage_settings' as never);
  const digest = useApi<Digest>(admin ? '/organizations/scheduled-report-settings' : null);
  const people = useApi<People>(admin ? '/users?pageSize=100' : null);
  const write = useApiWrite();
  if (perms.isSuccess && !admin) return <NoAccessState grantedBy="your company admin" what="report schedules" />;
  return (
    <SchedulesScreen
      live={{
        state: digest.isError || people.isError ? 'error' : digest.data && people.data ? 'ready' : 'loading',
        onRetry: () => void Promise.all([digest.refetch(), people.refetch()]),
        digest: { enabled: digest.data?.enabled ?? false, recipientIds: digest.data?.recipientUserIds ?? [], lastSentAt: digest.data?.lastSentAt ?? null },
        people: (people.data?.data ?? []).filter((u) => u.status !== 'inactive').map((u) => ({ id: u.id, name: u.name || u.email })),
        onSave: async (v) => void (await write('PATCH', '/organizations/scheduled-report-settings', { enabled: v.enabled, recipientUserIds: v.recipientIds })),
      }}
    />
  );
}
