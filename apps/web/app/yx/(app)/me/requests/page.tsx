'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MyRequestsPhone, MyRequestsScreen } from '@yukthix/ui/frame';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { toMyRequest, type MineRow } from '../../../../../lib/yx-me-pages';
import { pickerRows, usePhone } from '../../../../../lib/yx-phone';
import { YxNavContext } from '../../../../../lib/yx-shell';

// My requests (PLT-06, design audit step 2): what the person asked for, and what HR or a manager raised for them.
export default function YxMyRequestsPage() {
  const { accessToken } = useAuth();
  const mine = useQuery<MineRow[]>({ queryKey: ['workflow', '/approvals/mine'], queryFn: () => apiFetch('/workflow/approvals/mine', {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  const router = useRouter();
  const phone = usePhone();
  const { nav } = useContext(YxNavContext);
  const rows = (mine.data ?? []).map(toMyRequest);
  const state = mine.isLoading ? 'loading' : mine.isError ? 'error' : 'ready';
  // T2-H: on a phone, the designed phone list with the same call; New request opens the phone's type picker.
  if (phone) return <MyRequestsPhone rows={rows} live={{ state, onRetry: () => void mine.refetch(), ...(pickerRows(nav).length ? { newHref: '/yx/requests/new' } : {}), onNavigate: (href) => router.push(href) }} />;
  return <MyRequestsScreen rows={rows} state={state} live={{ onRetry: () => void mine.refetch() }} />;
}
