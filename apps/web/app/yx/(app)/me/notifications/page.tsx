'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@yukthix/ui';
import { NotificationPreferencesScreen, type DigestMode, type NotificationPreference } from '@yukthix/ui/frame';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';

// Notification preferences (PLT-65, design audit step 2): email per kind of notification, and how often.
export default function YxNotificationPreferencesPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const qc = useQueryClient();
  const { toast } = useToast();
  const prefs = useQuery<NotificationPreference[]>({ queryKey: ['notifications', 'preferences'], queryFn: () => apiFetch('/notifications/preferences', {}, token), enabled: Boolean(token), retry: false });
  const digest = useQuery<{ mode: DigestMode }>({ queryKey: ['notifications', 'digest'], queryFn: () => apiFetch('/notifications/digest', {}, token), enabled: Boolean(token), retry: false });
  const patch = async (path: string, body: unknown) => {
    await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }, token);
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <NotificationPreferencesScreen
      state={prefs.isLoading || digest.isLoading ? 'loading' : prefs.isError || digest.isError ? 'error' : 'ready'}
      onRetry={() => void Promise.all([prefs.refetch(), digest.refetch()])}
      types={prefs.data ?? []}
      digest={digest.data?.mode ?? 'immediate'}
      onToggle={(type, emailEnabled) => patch('/notifications/preferences', { type, emailEnabled })}
      onDigest={(mode) => patch('/notifications/digest', { mode })}
      onDone={(text) => toast({ title: text, tone: 'success' })}
    />
  );
}
