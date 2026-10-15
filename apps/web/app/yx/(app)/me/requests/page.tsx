'use client';

import { useQuery } from '@tanstack/react-query';
import { MyRequestsScreen } from '@yukthix/ui/frame';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { toMyRequest, type MineRow } from '../../../../../lib/yx-me-pages';

// My requests (PLT-06, design audit step 2): what the person asked for, and what HR or a manager raised for them.
export default function YxMyRequestsPage() {
  const { accessToken } = useAuth();
  const mine = useQuery<MineRow[]>({ queryKey: ['workflow', '/approvals/mine'], queryFn: () => apiFetch('/workflow/approvals/mine', {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  return <MyRequestsScreen rows={(mine.data ?? []).map(toMyRequest)} state={mine.isLoading ? 'loading' : mine.isError ? 'error' : 'ready'} live={{ onRetry: () => void mine.refetch() }} />;
}
