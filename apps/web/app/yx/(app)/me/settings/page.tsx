'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@yukthix/ui';
import { deviceLabel, type SessionRow } from '@yukthix/ui/auth';
import { MobileSettingsScreen, type NotificationPreference } from '@yukthix/ui/frame';
import { LANGUAGE_LABEL, type Language, type MyLanguage } from '@yukthix/ui/global';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useGlobal, useGlobalWrite } from '../../../../../lib/yx-global';
import { usePhoneLanding } from '../../../../../lib/yx-phone';
import { ME_SECURITY } from '../../../../../lib/yx-nav';

// T2-H: Me › Settings and security on a phone (MOB-03), with the calls of Me › Language, Notification preferences and
// My security: language, app and email per kind of notification, quiet hours, devices and signing out. On a desk:
// Notification preferences. WhatsApp waits on the provider (2742), so it has no column.
export default function YxPhoneSettingsPage() {
  const router = useRouter();
  const phone = usePhoneLanding('/yx/me/notifications');
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const on = Boolean(token) && phone === true;
  const qc = useQueryClient();
  const prefs = useQuery<NotificationPreference[]>({ queryKey: ['notifications', 'preferences'], queryFn: () => apiFetch('/notifications/preferences', {}, token), enabled: on, retry: false });
  const push = useQuery<{ available: boolean; quietFrom: string; quietTo: string }>({ queryKey: ['notifications', 'push'], queryFn: () => apiFetch('/notifications/push', {}, token), enabled: on, retry: false });
  const sessions = useQuery<SessionRow[]>({ queryKey: ['yx', 'sessions'], queryFn: () => apiFetch('/auth/sessions', {}, token), enabled: on, retry: false });
  const language = useGlobal<MyLanguage>(phone ? '/me/language' : null);
  const writeGlobal = useGlobalWrite();
  if (!phone) return null;
  const patch = async (path: string, body: unknown) => {
    await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }, token);
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const signOut = async (path: string, method: 'DELETE' | 'POST') => {
    await apiFetch(path, { method }, token);
    await qc.invalidateQueries({ queryKey: ['yx', 'sessions'] });
  };
  const lang = language.data;
  const app = push.data?.available === true;
  return (
    <MobileSettingsScreen
      live={{
        state: prefs.isLoading || sessions.isLoading ? 'loading' : prefs.isError ? 'error' : 'ready',
        onRetry: () => void Promise.all([prefs.refetch(), sessions.refetch()]),
        ...(lang && lang.choices.length > 1 ? { language: { value: lang.language, choices: lang.choices.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] })), onChange: async (v) => void (await writeGlobal('PUT', '/me/language', { language: v as Language })) } } : {}),
        types: (prefs.data ?? []).map((p) => ({ type: p.type, label: p.label, email: p.emailEnabled, ...(app ? { app: Boolean(p.pushEnabled) } : {}) })),
        onToggle: (type, channel, value) => patch('/notifications/preferences', channel === 'app' ? { type, pushEnabled: value } : { type, emailEnabled: value }),
        ...(app && push.data ? { quietHours: { text: `${push.data.quietFrom} – ${push.data.quietTo}`, href: '/yx/me/notifications' } } : {}),
        devices: (sessions.data ?? []).map((s) => ({ id: s.id, title: deviceLabel(s.userAgent), sub: `Last used ${formatDate(new Date(s.lastSeenAt))}`, current: Boolean(s.current) })),
        onSignOutDevice: (id) => signOut(`/auth/sessions/${encodeURIComponent(id)}`, 'DELETE'),
        onSignOutOthers: () => signOut('/auth/sessions/revoke-others', 'POST'),
        securityHref: ME_SECURITY,
        onNavigate: (href) => router.push(href),
      }}
    />
  );
}
