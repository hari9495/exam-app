'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MobileRequestsTabScreen } from '@yukthix/ui/frame';
import type { ApprovalTask } from '@yukthix/ui/desk';
import type { TeamMember } from '@yukthix/ui/workforce';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import type { MineRow } from '../../../../lib/yx-me-pages';
import { usePeople } from '../../../../lib/yx-people';
import { mineRows, pickerRows, teamRows, usePhoneLanding } from '../../../../lib/yx-phone';
import { YxNavContext } from '../../../../lib/yx-shell';

// T2-H: the phone's Requests tab (the designed landing): Mine (My requests' own call) and Team, what waits for the
// person's decision (the Approvals inbox's own call); each row opens that page. On a desk: Approvals.
export default function YxRequestsTabPage() {
  const router = useRouter();
  const phone = usePhoneLanding('/yx/approvals');
  const { accessToken } = useAuth();
  const { nav } = useContext(YxNavContext);
  const on = Boolean(accessToken) && phone === true;
  const mine = useQuery<MineRow[]>({ queryKey: ['workflow', '/approvals/mine'], queryFn: () => apiFetch('/workflow/approvals/mine', {}, accessToken ?? undefined), enabled: on, retry: false });
  const inbox = useQuery<ApprovalTask[]>({ queryKey: ['workflow', '/approvals/inbox'], queryFn: () => apiFetch('/workflow/approvals/inbox', {}, accessToken ?? undefined), enabled: on, retry: false });
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>(phone ? '/team' : null);
  if (!phone) return null;
  // The Team segment for managers and anyone something waits on.
  const approver = Boolean(team.data?.members.length) || Boolean(inbox.data?.length);
  return (
    <MobileRequestsTabScreen
      live={{
        state: mine.isLoading ? 'loading' : mine.isError ? 'error' : 'ready',
        onRetry: () => void Promise.all([mine.refetch(), inbox.refetch()]),
        mine: mineRows(mine.data ?? []),
        team: approver ? teamRows(inbox.data ?? [], new Date()) : null,
        ...(pickerRows(nav).length ? { newHref: '/yx/requests/new' } : {}),
        onNavigate: (href) => router.push(href),
      }}
    />
  );
}
