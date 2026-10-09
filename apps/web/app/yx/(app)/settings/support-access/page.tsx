'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SupportAccessScreen } from '@yukthix/ui/access';
import type { SupportActivity, SupportSession } from '@yukthix/ui/console';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch } from '../../../../../lib/api-client';
import { loadState } from '../../../../../lib/yx-console';

// Settings › Security › Support access (APX-D PLT-17, P02 Q8): the System Admin approves, declines or ends YukthiX
// support sessions and sees every page opened in them. Approving is a step-up action: apiFetch asks the person to
// confirm it's them, then resends.
export default function YxSupportAccessPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const sessions = useQuery<SupportSession[]>({ queryKey: ['yx', 'support-access'], queryFn: () => apiFetch('/support-access', {}, token), enabled: Boolean(token), retry: false });
  const act = async (id: string, what: 'approve' | 'decline' | 'end', body: object) => {
    await apiFetch(`/support-access/${encodeURIComponent(id)}/${what}`, { method: 'POST', body: JSON.stringify(body) }, token);
    await queryClient.invalidateQueries({ queryKey: ['yx', 'support-access'] });
  };
  const loadActivity = useCallback((id: string): Promise<SupportActivity[]> => apiFetch(`/support-access/${encodeURIComponent(id)}/activity`, {}, token), [token]);
  return (
    <SupportAccessScreen
      state={loadState(sessions)}
      onRetry={() => void sessions.refetch()}
      sessions={sessions.data ?? []}
      onApprove={(id, hours, note) => act(id, 'approve', { hours, ...(note ? { note } : {}) })}
      onDecline={(id, note) => act(id, 'decline', note ? { note } : {})}
      onEnd={(id) => act(id, 'end', {})}
      loadActivity={loadActivity}
    />
  );
}
