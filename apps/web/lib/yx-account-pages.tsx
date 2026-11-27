'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SETTINGS_GROUPS, SettingsPageScreen, ClosureRequestDrawer, StorageDrawer, dataPage, invoicesPage, planPage, usagePage, type AccountBilling, type AccountData, type ScheduledExport } from '@yukthix/ui/hiring';
import { useToast } from '@yukthix/ui';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import { loadState } from './yx-org';
import { saveBlob } from './yx-pay';

/** Settings group 8 pages served here (S-9, answers 1328 and 1332), by address. */
export const ACCOUNT_PAGES: Record<string, string> = {
  'plan-and-add-ons': '8.1',
  'usage-and-caps': '8.2',
  'invoices-and-payment': '8.3',
  'data-export-and-closure': '8.5',
};
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const stateOf = (s: ReturnType<typeof loadState>) => (s === 'ready' ? 'ready' : s === 'loading' ? 'loading' : s === 'no-access' ? 'no-access' : 'error');

/**
 * 8.1 to 8.3 read-only from GET /account/billing (the billing key); 8.5 from GET /account/data, where a System Admin
 * starts an export (the security key is asked for), downloads it while its link works, and asks YukthiX to close the
 * account. The API checks every call; nothing is done while acting for someone else.
 */
export function AccountSettingsPage({ id }: { id: string }) {
  const { accessToken, role, impersonating, actingSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const billing = useQuery<AccountBilling>({ queryKey: ['yx', 'account', 'billing'], queryFn: () => apiFetch('/account/billing', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && id !== '8.5', retry: false });
  const data = useQuery<AccountData>({ queryKey: ['yx', 'account', 'data'], queryFn: () => apiFetch('/account/data', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && id === '8.5', retry: false });
  // T2-G 45 (answer 2744): the scheduled export to the company's own storage.
  const scheduled = useQuery<ScheduledExport>({ queryKey: ['yx', 'account', 'export-destination'], queryFn: () => apiFetch('/account/export-destination', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && id === '8.5', retry: false });
  const [closing, setClosing] = useState(false);
  const [storage, setStorage] = useState(false);
  const canAct = role === 'org_admin' && !impersonating && !actingSuperAdmin;
  const query = id === '8.5' ? data : billing;
  const page = useMemo(() => {
    const design = pageOf(id);
    if (id === '8.5') return data.data ? dataPage(design, data.data, canAct, scheduled.data ?? null) : design;
    if (!billing.data) return design;
    return id === '8.1' ? planPage(design, billing.data) : id === '8.2' ? usagePage(design, billing.data) : invoicesPage(design, billing.data);
  }, [id, billing.data, data.data, canAct, scheduled.data]);
  const post = async (path: string, body?: unknown, method = 'POST') => {
    const out = await apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['yx', 'account'] });
    return out;
  };
  const fail = (e: unknown) => void toast({ tone: 'error', title: e instanceof Error ? e.message : 'It did not work. Try again.' });
  const open = (screenId: string) => {
    const last = data.data?.exports[0];
    if (screenId === 'ACC-EXPORT') {
      if (!canAct) return void toast({ tone: 'default', title: 'Only a System Admin can export all data.' });
      return void post('/account/exports').then(() => toast({ tone: 'success', title: 'Export ready to download' }), fail);
    }
    if (screenId === 'ACC-DOWNLOAD' && last) return void apiFetchBlob(`/account/exports/${last.id}/file`, {}, accessToken ?? undefined).then(({ blob, filename }) => saveBlob(blob, filename ?? 'yukthix-export.json.gz'), fail);
    if (screenId === 'ACC-CLOSE') return canAct ? setClosing(true) : void toast({ tone: 'default', title: 'Only a System Admin can ask to close the account.' });
    if (screenId === 'ACC-STORAGE') return canAct ? setStorage(true) : void toast({ tone: 'default', title: 'Only a System Admin can connect storage.' });
    if (screenId === 'ACC-STORAGE-SEND')
      return void post('/account/export-destination/send').then((r: { ok?: boolean; error?: string | null } | null) => (r?.ok ? toast({ tone: 'success', title: 'Export sent to your storage' }) : toast({ tone: 'error', title: r?.error ?? 'The export was not sent.' })), fail);
    if (screenId === 'ACC-WITHDRAW') return void post('/account/closure/withdraw').then(() => toast({ tone: 'success', title: 'Closure request withdrawn' }), fail);
  };
  return (
    <>
      <SettingsPageScreen
        groups={SETTINGS_GROUPS}
        pageId={id}
        live={{ page, canEdit: false, lastChange: null, state: stateOf(loadState(query)), onRetry: () => void query.refetch(), onSave: async () => undefined, onOpenScreen: open }}
      />
      {storage && scheduled.data && (
        <StorageDrawer
          current={scheduled.data}
          onClose={() => setStorage(false)}
          onSave={async (input, frequency) => {
            await post('/account/export-destination', input, 'PUT');
            if (frequency !== scheduled.data!.frequency) await post('/org/settings', { key: 'account.scheduled_export.frequency', value: frequency, scopeType: 'tenant' }, 'PUT');
          }}
          onRemove={() => post('/account/export-destination', undefined, 'DELETE')}
        />
      )}
      {closing && data.data && <ClosureRequestDrawer companyName={data.data.companyName} keepDays={data.data.keepDays} onClose={() => setClosing(false)} onSend={(input) => post('/account/closure', input)} />}
    </>
  );
}
