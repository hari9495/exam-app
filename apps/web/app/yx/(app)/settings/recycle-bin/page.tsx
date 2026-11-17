'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@yukthix/ui';
import { RecycleBinScreen, type RecycleBinRow } from '@yukthix/ui/screens/settings/recycle-bin';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';

type Items = { keepDays: number; items: RecycleBinRow[] };
const id = encodeURIComponent;

// Batch B item 3 (admin B2, answers 2367-2369): Settings › Recycle bin. The YukthiX bin and hiring's soft-deleted
// records in one list; restore (audited), delete for good (step-up, audited) and the company's keep days.
export default function YxRecycleBinPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const qc = useQueryClient();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const key = ['yx', 'recycle-bin'];
  const bin = useQuery<Items>({ queryKey: key, queryFn: () => apiFetch('/recycle-bin/items', {}, token), enabled: Boolean(token), retry: false });
  const err = bin.error as { status?: number } | null;
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  return (
    <RecycleBinScreen
      state={err?.status === 403 ? 'no-access' : bin.isError ? 'error' : bin.data ? 'ready' : 'loading'}
      onRetry={() => void bin.refetch()}
      rows={bin.data?.items ?? []}
      keepDays={bin.data?.keepDays ?? 180}
      onKeepDays={
        perms.has('org.settings.manage')
          ? async (days) => {
              await apiFetch('/org/settings', { method: 'PUT', body: JSON.stringify({ key: 'recycle_bin.keep_days', value: String(days), scopeType: 'tenant' }) }, token);
              await refresh();
              toast({ tone: 'success', title: `Deleted items are now kept for ${days} days.` });
            }
          : undefined
      }
      onRestore={async (row) => {
        // Hiring keeps its own soft delete and restore route; everything else is in the YukthiX bin.
        await apiFetch(row.source === 'hiring' ? `/recycle-bin/${id(row.kind)}/${id(row.id)}/restore` : `/recycle-bin/items/${id(row.id)}/restore`, { method: 'POST' }, token);
        await refresh();
        toast({ tone: 'success', title: `${row.label} is back.` });
      }}
      onPurge={async (row) => {
        await apiFetch(`/recycle-bin/items/${id(row.id)}`, { method: 'DELETE' }, token);
        await refresh();
        toast({ tone: 'success', title: `${row.label} is deleted for good.` });
      }}
    />
  );
}
