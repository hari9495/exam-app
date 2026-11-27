'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@yukthix/ui';
import { NotificationPreferencesScreen, type DigestMode, type NotificationPreference } from '@yukthix/ui/frame';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { pushDevice, turnPushOff, turnPushOn, type PushDevice } from '../../../../../lib/yx-push';

// Notification preferences (PLT-65, design audit step 2): email per kind of notification, and how often. T2-E 52
// (answers 2875 to 2878): a Push column per kind, push on this device, Pause push and quiet hours.
export default function YxNotificationPreferencesPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const qc = useQueryClient();
  const { toast } = useToast();
  const prefs = useQuery<NotificationPreference[]>({ queryKey: ['notifications', 'preferences'], queryFn: () => apiFetch('/notifications/preferences', {}, token), enabled: Boolean(token), retry: false });
  const digest = useQuery<{ mode: DigestMode }>({ queryKey: ['notifications', 'digest'], queryFn: () => apiFetch('/notifications/digest', {}, token), enabled: Boolean(token), retry: false });
  const push = useQuery<{ available: boolean; publicKey: string | null; paused: boolean; quietFrom: string; quietTo: string }>({ queryKey: ['notifications', 'push'], queryFn: () => apiFetch('/notifications/push', {}, token), enabled: Boolean(token), retry: false });
  const [device, setDevice] = useState<PushDevice>('unsupported');
  useEffect(() => {
    void pushDevice().then(setDevice).catch(() => setDevice('unsupported'));
  }, []);
  const patch = async (path: string, body: unknown) => {
    await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }, token);
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const p = push.data;
  return (
    <NotificationPreferencesScreen
      state={prefs.isLoading || digest.isLoading ? 'loading' : prefs.isError || digest.isError ? 'error' : 'ready'}
      onRetry={() => void Promise.all([prefs.refetch(), digest.refetch()])}
      types={prefs.data ?? []}
      digest={digest.data?.mode ?? 'immediate'}
      onToggle={(type, emailEnabled) => patch('/notifications/preferences', { type, emailEnabled })}
      onDigest={(mode) => patch('/notifications/digest', { mode })}
      onDone={(text) => toast({ title: text, tone: 'success' })}
      push={
        p
          ? {
              available: p.available,
              device,
              paused: p.paused,
              quietFrom: p.quietFrom,
              quietTo: p.quietTo,
              onDevice: async (on) => setDevice(on && p.publicKey ? await turnPushOn(p.publicKey, token) : await turnPushOff(token)),
              onPause: (paused) => patch('/notifications/push', { paused }),
              onQuiet: (quietFrom, quietTo) => patch('/notifications/push', { quietFrom, quietTo }),
              onTogglePush: (type, pushEnabled) => patch('/notifications/preferences', { type, pushEnabled }),
            }
          : undefined
      }
    />
  );
}
