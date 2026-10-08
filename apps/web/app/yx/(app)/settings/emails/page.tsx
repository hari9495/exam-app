'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmailSettingsScreen, type EmailBranding, type EmailDraft, type EmailOverview, type EmailPreview, type EmailWording } from '@yukthix/ui/notifications';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch } from '../../../../../lib/api-client';

// Settings › Notifications › Email (P04 Q5): the company's branding and wording of the emails YukthiX sends its
// people. The API checks every rule again and renders the preview, so what is shown is what people get.
export default function YxEmailSettingsPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const key = ['yx', 'notifications', 'email'];
  const overview = useQuery({ queryKey: key, queryFn: (): Promise<EmailOverview> => apiFetch('/notifications/email', {}, token), enabled: Boolean(token), retry: false });
  const store = (data: EmailOverview): void => void queryClient.setQueryData(key, data);
  const send = (method: 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown) =>
    apiFetch(`/notifications/email${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, token);
  // Stable, so the editor's debounced preview only re-runs when the draft changes.
  const onPreview = useCallback(
    (type: string, draft: EmailDraft): Promise<EmailPreview> =>
      apiFetch(`/notifications/email/templates/${encodeURIComponent(type)}/preview`, { method: 'POST', body: JSON.stringify(draft) }, token),
    [token],
  );

  const err = overview.error as { status?: number; code?: string } | null;
  const noAccess = err?.status === 403 && err.code !== 'MFA_REQUIRED';
  return (
    <EmailSettingsScreen
      state={noAccess ? 'no-access' : overview.isError ? 'error' : overview.data ? 'ready' : 'loading'}
      onRetry={() => void overview.refetch()}
      overview={overview.data ?? null}
      onSaveBranding={async (b: EmailBranding) => store(await send('PUT', '/branding', b))}
      onSaveWording={async (type: string, w: EmailWording) => store(await send('PUT', `/templates/${encodeURIComponent(type)}`, w))}
      onResetWording={async (type: string) => store(await send('DELETE', `/templates/${encodeURIComponent(type)}`))}
      onPreview={onPreview}
      onTest={(type: string, draft: EmailDraft) => send('POST', `/templates/${encodeURIComponent(type)}/test`, draft)}
    />
  );
}
