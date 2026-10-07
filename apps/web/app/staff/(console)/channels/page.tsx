'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MfaStatus } from '@yukthix/ui/auth';
import { SmsSettingsScreen, type SmsAccountInput, type SmsDeliveryRow, type SmsOverview, type SmsTestResult } from '@yukthix/ui/notifications';
import { useAuth } from '../../../../lib/auth-context';
import { apiFetch } from '../../../../lib/api-client';
import { loadState } from '../../../../lib/yx-console';

interface DeliveriesPage {
  data: SmsDeliveryRow[];
  nextCursor: string | null;
}

const BASE = '/platform/channels/sms';
const mask = (e164: string) => `${e164.slice(0, 3)}${'•'.repeat(Math.max(0, e164.length - 5))}${e164.slice(-2)}`;

// Console › Shared SMS account (P04 §4.5a): the YukthiX account companies use unless they add their own. Moved here
// from company settings (step 3). Saving an account is a step-up action; secrets are write-only.
export default function ConsoleChannelsPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['console', 'sms', 'overview'], queryFn: (): Promise<SmsOverview> => apiFetch(BASE, {}, token), enabled: Boolean(token), retry: false });
  const deliveries = useInfiniteQuery({
    queryKey: ['console', 'sms', 'deliveries'],
    queryFn: ({ pageParam }): Promise<DeliveriesPage> => apiFetch(`${BASE}/deliveries${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`, {}, token),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(token) && overview.isSuccess,
  });
  const mfa = useQuery<MfaStatus>({ queryKey: ['yx', 'mfa'], queryFn: () => apiFetch('/auth/mfa', {}, token), enabled: Boolean(token) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['console', 'sms'] });
  return (
    <SmsSettingsScreen
      state={loadState(overview)}
      onRetry={() => void overview.refetch()}
      overview={overview.data ?? null}
      deliveries={deliveries.data?.pages.flatMap((p) => p.data) ?? []}
      deliveriesState={deliveries.isError ? 'error' : deliveries.isLoading || deliveries.isFetchingNextPage ? 'loading' : 'ready'}
      onRetryDeliveries={() => void deliveries.refetch()}
      hasMoreDeliveries={Boolean(deliveries.hasNextPage)}
      onLoadMoreDeliveries={() => void deliveries.fetchNextPage()}
      myMobile={mfa.data?.mobileNumber ? mask(mfa.data.mobileNumber) : null}
      myMobileHref="/staff/security"
      allowDevProvider={process.env.NODE_ENV !== 'production'}
      onSavePolicy={async () => undefined}
      onSaveAccount={async (id, input: SmsAccountInput) => {
        await apiFetch(id ? `${BASE}/accounts/${encodeURIComponent(id)}` : `${BASE}/accounts`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) }, token);
        await refresh();
      }}
      onDeleteAccount={async (id) => {
        await apiFetch(`${BASE}/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
        await refresh();
      }}
      onTestAccount={async (id): Promise<SmsTestResult> => {
        const result = await apiFetch(`${BASE}/accounts/${encodeURIComponent(id)}/test`, { method: 'POST' }, token);
        await refresh();
        return result;
      }}
    />
  );
}
