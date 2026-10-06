'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MfaStatus } from '@yukthix/ui/auth';
import { SmsSettingsScreen, type SmsAccountInput, type SmsDeliveryRow, type SmsOverview, type SmsTestResult } from '@yukthix/ui/notifications';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch } from '../../../../../lib/api-client';

interface DeliveriesPage {
  data: SmsDeliveryRow[];
  nextCursor: string | null;
}

const mask = (e164: string) => `${e164.slice(0, 3)}${'•'.repeat(Math.max(0, e164.length - 5))}${e164.slice(-2)}`;

// Settings › Notifications › SMS (P04 §7). Saving an account is a step-up action: apiFetch asks the
// person to confirm it's them, then resends. Secrets are write-only; the API never returns them.
export default function YxSmsSettingsPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();

  const overview = useQuery({ queryKey: ['yx', 'sms', 'overview'], queryFn: (): Promise<SmsOverview> => apiFetch('/notifications/sms', {}, token), enabled: Boolean(token), retry: false });
  const deliveries = useInfiniteQuery({
    queryKey: ['yx', 'sms', 'deliveries'],
    queryFn: ({ pageParam }): Promise<DeliveriesPage> => apiFetch(`/notifications/sms/deliveries${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`, {}, token),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(token) && overview.isSuccess,
  });
  // Shares the cache with My security.
  const mfa = useQuery<MfaStatus>({ queryKey: ['yx', 'mfa'], queryFn: () => apiFetch('/auth/mfa', {}, token), enabled: Boolean(token) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['yx', 'sms'] });

  // A plain 403 is a missing permission; MFA_REQUIRED is the MFA floor (the layout says what to do).
  const err = overview.error as { status?: number; code?: string } | null;
  const noAccess = err?.status === 403 && err.code !== 'MFA_REQUIRED';
  return (
    <SmsSettingsScreen
      state={noAccess ? 'no-access' : overview.isError ? 'error' : overview.data ? 'ready' : 'loading'}
      onRetry={() => void overview.refetch()}
      overview={overview.data ?? null}
      deliveries={deliveries.data?.pages.flatMap((p) => p.data) ?? []}
      deliveriesState={deliveries.isError ? 'error' : deliveries.isLoading || deliveries.isFetchingNextPage ? 'loading' : 'ready'}
      onRetryDeliveries={() => void deliveries.refetch()}
      hasMoreDeliveries={Boolean(deliveries.hasNextPage)}
      onLoadMoreDeliveries={() => void deliveries.fetchNextPage()}
      myMobile={mfa.data?.mobileNumber ? mask(mfa.data.mobileNumber) : null}
      myMobileHref="/yx/me/security"
      allowDevProvider={process.env.NODE_ENV !== 'production'}
      onSavePolicy={async (changes) => {
        await apiFetch('/notifications/sms/policy', { method: 'PATCH', body: JSON.stringify(changes) }, token);
        await refresh();
      }}
      onSaveAccount={async (id, input: SmsAccountInput) => {
        await apiFetch(id ? `/notifications/sms/accounts/${encodeURIComponent(id)}` : '/notifications/sms/accounts', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) }, token);
        await refresh();
      }}
      onDeleteAccount={async (id) => {
        await apiFetch(`/notifications/sms/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
        await refresh();
      }}
      onTestAccount={async (id): Promise<SmsTestResult> => {
        const result = await apiFetch(`/notifications/sms/accounts/${encodeURIComponent(id)}/test`, { method: 'POST' }, token);
        await refresh();
        return result;
      }}
    />
  );
}
