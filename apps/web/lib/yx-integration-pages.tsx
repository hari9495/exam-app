'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SETTINGS_GROUPS,
  SettingsPageScreen,
  ConnectionDrawer,
  ShownOnceDrawer,
  aiPage,
  calendarPage,
  developersPage,
  integrationsPage,
  type ApiUsage,
  type CalendarConnection,
  type ConnectedApp,
  type DeliveryRow,
  type DrawerField,
  type DrawerValues,
  type IntegrationsState,
  type ProviderSpec,
  type ProviderState,
} from '@yukthix/ui/hiring';
import { useToast } from '@yukthix/ui';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { loadState } from './yx-org';

/** Settings group 7 pages served here (S-10, answer 1327), by address. */
export const INTEGRATION_PAGES: Record<string, string> = { integrations: '7.1', 'calendar-and-chat': '7.5', ai: '7.6', developers: '7.7' };
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;

// The events a connected app may follow (as packages/shared INTEGRATION_EVENT_LABELS).
const EVENTS = [
  ['invitation.created', 'Candidate invited'],
  ['attempt.submitted', 'Candidate finished exam'],
  ['attempt.settled', 'Results ready'],
  ['integrity.flagged', 'Integrity flag raised'],
  ['interview.confirmed', 'Interview confirmed'],
  ['offer.accepted', 'Offer accepted'],
  ['candidate.applied', 'New applicant'],
  ['candidate.fit_scored', 'AI fit score ready'],
  ['candidate.hired', 'Candidate hired'],
].map(([value, label]) => ({ value: value!, label: label! }));
// HR system export: the fields each provider needs (the API checks them again).
const HRIS: { value: string; label: string; fields: DrawerField[] }[] = [
  { value: 'generic', label: 'Generic endpoint', fields: [{ key: 'targetUrl', label: 'Endpoint address', kind: 'url', required: true }, { key: 'authHeader', label: 'Authorization header', kind: 'secret' }] },
  { value: 'greenhouse', label: 'Greenhouse', fields: [{ key: 'apiKey', label: 'API key', kind: 'secret', required: true }, { key: 'onBehalfOf', label: 'On behalf of (user id)', kind: 'text' }] },
  { value: 'lever', label: 'Lever', fields: [{ key: 'apiKey', label: 'API key', kind: 'secret', required: true }, { key: 'performAs', label: 'Perform as (user id)', kind: 'text' }] },
  { value: 'bamboohr', label: 'BambooHR', fields: [{ key: 'apiKey', label: 'API key', kind: 'secret', required: true }, { key: 'subdomain', label: 'Company subdomain', kind: 'text', required: true }] },
  { value: 'workday', label: 'Workday (beta)', fields: [{ key: 'targetUrl', label: 'Endpoint address', kind: 'url', required: true }, { key: 'apiKey', label: 'API key', kind: 'secret' }] },
];
type Raw = { smsEnabled?: boolean; smsProvider?: string; whatsappEnabled?: boolean; whatsappProvider?: string; configured: boolean; config: Record<string, string> };
const provider = (r: Raw | undefined, kind: 'sms' | 'whatsapp'): ProviderState | null =>
  r ? { enabled: Boolean(kind === 'sms' ? r.smsEnabled : r.whatsappEnabled), provider: String((kind === 'sms' ? r.smsProvider : r.whatsappProvider) ?? ''), configured: r.configured, config: r.config ?? {} } : null;

/** One read of the older API, cached under ['yx', 'integrations', path]. */
function useApi<T>(token: string | null | undefined, path: string, on = true) {
  return useQuery<T>({ queryKey: ['yx', 'integrations', path], queryFn: () => apiFetch(path, {}, token ?? undefined), enabled: Boolean(token) && on, retry: false });
}

type Open =
  | { kind: 'app'; app: ConnectedApp | null }
  | { kind: 'smtp' | 'sms' | 'whatsapp' | 'hris' | 'ai' | 'embeddings' | 'webhook' }
  | { kind: 'once'; title: string; value: string };

/**
 * 7.1, 7.6 and 7.7 for System Admins (org:manage_settings; the API checks it and asks for the security key on every
 * change); 7.5 is the viewer's own calendar. Nothing is changed while acting for someone else.
 */
export function IntegrationSettingsPage({ id }: { id: string }) {
  const { accessToken, impersonating, actingSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const admin = id !== '7.5';
  const state = useApi<IntegrationsState>(accessToken, '/organizations/integrations', admin);
  const apps = useApi<ConnectedApp[]>(accessToken, '/organizations/integrations/connected-apps', id === '7.1');
  const sms = useApi<Raw>(accessToken, '/organizations/sms-config', id === '7.1');
  const smsProviders = useApi<ProviderSpec[]>(accessToken, '/organizations/sms-providers', id === '7.1');
  const wa = useApi<Raw>(accessToken, '/organizations/whatsapp-config', id === '7.1');
  const waProviders = useApi<ProviderSpec[]>(accessToken, '/organizations/whatsapp-providers', id === '7.1');
  const deliveries = useApi<DeliveryRow[]>(accessToken, '/organizations/integrations/webhook-deliveries', id === '7.7');
  const usage = useApi<ApiUsage>(accessToken, '/organizations/api-usage?window=30', id === '7.7');
  const calendar = useApi<CalendarConnection[]>(accessToken, '/calendar/connections', id === '7.5');
  const [open, setOpen] = useState<Open | null>(null);
  const acting = Boolean(impersonating || actingSuperAdmin);
  const needed = id === '7.1' ? [state, apps, sms, smsProviders, wa, waProviders] : id === '7.6' ? [state] : id === '7.7' ? [state, deliveries] : [calendar];
  const ready = needed.every((q) => q.data);
  const page = useMemo(() => {
    const design = pageOf(id);
    if (!ready) return design;
    if (id === '7.1') return integrationsPage(design, { apps: apps.data!, state: state.data!, sms: provider(sms.data, 'sms'), smsProviders: smsProviders.data!, whatsapp: provider(wa.data, 'whatsapp'), whatsappProviders: waProviders.data! });
    if (id === '7.6') return aiPage(design, state.data!);
    if (id === '7.7') return developersPage(design, state.data!, deliveries.data!, usage.data ?? null);
    return calendarPage(design, calendar.data!);
  }, [id, ready, apps.data, state.data, sms.data, smsProviders.data, wa.data, waProviders.data, deliveries.data, usage.data, calendar.data]);
  const call = async (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => {
    const out = await apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['yx', 'integrations'] });
    return out;
  };
  const fail = (e: unknown) => void toast({ tone: 'error', title: e instanceof Error ? e.message : 'It did not work. Try again.' });
  const guard = (fn: () => void) => (acting ? void toast({ tone: 'default', title: 'Not available while acting for someone else.' }) : fn());
  const onOpen = (key: string) => {
    if (key === 'chat.links') return void (window.location.href = '/yx/approvals');
    if (key.startsWith('calendar.connect.')) return void (apiFetch(`/calendar/${key.split('.')[2]}/connect`, {}, accessToken ?? undefined) as Promise<{ authUrl: string }>).then((r) => (window.location.href = r.authUrl), fail);
    if (key.startsWith('calendar.disconnect.')) return void call('DELETE', `/calendar/${key.split('.')[2]}`).then(() => toast({ tone: 'success', title: 'Calendar disconnected' }), fail);
    guard(() => {
      if (key === 'conn.smtp') return setOpen({ kind: 'smtp' });
      if (key === 'conn.sms') return setOpen({ kind: 'sms' });
      if (key === 'conn.whatsapp') return setOpen({ kind: 'whatsapp' });
      if (key === 'conn.hris') return setOpen({ kind: 'hris' });
      if (key === 'ai.set_key') return setOpen({ kind: 'ai' });
      if (key === 'ai.embeddings') return setOpen({ kind: 'embeddings' });
      if (key === 'dev.webhook') return setOpen({ kind: 'webhook' });
      if (key === 'dev.key.create') return void call('POST', '/organizations/integrations/api-key').then((r) => setOpen({ kind: 'once', title: 'Your API key', value: (r as { apiKey: string }).apiKey }), fail);
      if (key === 'dev.key.revoke') return void call('DELETE', '/organizations/integrations/api-key').then(() => toast({ tone: 'success', title: 'API key revoked' }), fail);
      if (key === 'dev.webhook.secret') return void call('POST', '/organizations/integrations/webhook-secret').then((r) => setOpen({ kind: 'once', title: 'Your webhook signing secret', value: (r as { webhookSecret: string }).webhookSecret }), fail);
    });
  };
  const s = state.data;
  const providerDrawer = (kind: 'sms' | 'whatsapp') => {
    const current = provider(kind === 'sms' ? sms.data : wa.data, kind);
    const specs = (kind === 'sms' ? smsProviders.data : waProviders.data) ?? [];
    const name = kind === 'sms' ? 'SMS' : 'WhatsApp';
    return (
      <ConnectionDrawer
        title={`Set up ${name}`}
        subtitle="Messages to candidates"
        keepSecrets={Boolean(current?.configured)}
        initial={{ enabled: current?.enabled ?? false, provider: current?.provider || specs[0]?.id || '', ...(current?.config ?? {}) }}
        fields={(v) => [
          { key: 'enabled', label: `Send ${name} messages`, kind: 'toggle' },
          { key: 'provider', label: 'Provider', kind: 'choice', options: specs.map((p) => ({ value: p.id, label: p.label })) },
          ...(specs.find((p) => p.id === v.provider)?.configFields ?? []).map((f) => ({ key: f.key, label: f.label, kind: f.secret ? ('secret' as const) : ('text' as const), required: f.required, placeholder: f.placeholder })),
        ]}
        saveLabel={`Save ${name}`}
        onClose={() => setOpen(null)}
        onSave={({ enabled, provider: p, ...config }) => call('PUT', `/organizations/${kind}-config`, kind === 'sms' ? { smsEnabled: enabled, smsProvider: p, config } : { whatsappEnabled: enabled, whatsappProvider: p, config })}
      />
    );
  };
  return (
    <>
      <SettingsPageScreen
        groups={SETTINGS_GROUPS}
        pageId={id}
        live={{
          page,
          canEdit: false,
          lastChange: null,
          state: (() => {
            const st = loadState(...needed);
            return st === 'ready' ? 'ready' : st === 'loading' ? 'loading' : st === 'no-access' ? 'no-access' : 'error';
          })(),
          onRetry: () => needed.forEach((q) => void q.refetch()),
          onSave: async () => undefined,
          onOpenScreen: onOpen,
          listEditors: id === '7.1' && !acting ? { 'integrations.connections': (i) => setOpen({ kind: 'app', app: i === 'new' ? null : apps.data?.[i] ?? null }) } : undefined,
        }}
      />
      {open?.kind === 'once' && <ShownOnceDrawer title={open.title} value={open.value} onClose={() => setOpen(null)} />}
      {open?.kind === 'app' && (
        <ConnectionDrawer
          title={open.app ? `Change ${open.app.label}` : 'Add connected app'}
          keepSecrets={Boolean(open.app)}
          initial={open.app ? { type: open.app.type, label: open.app.label, events: open.app.events, active: open.app.status === 'active' } : { type: 'slack', label: '', events: [], active: true }}
          fields={() => [
            ...(open.app ? [] : [{ key: 'type', label: 'Type', kind: 'choice' as const, options: [{ value: 'slack', label: 'Slack' }, { value: 'msteams', label: 'Microsoft Teams' }, { value: 'webhook', label: 'Webhook' }] }]),
            { key: 'label', label: 'Name', kind: 'text', required: true },
            { key: 'targetUrl', label: 'Address (incoming webhook)', kind: 'secret', required: true, helper: 'Stored encrypted and never shown again.' },
            { key: 'events', label: 'Events', kind: 'multi', options: EVENTS, required: true },
            ...(open.app ? [{ key: 'active', label: 'On', kind: 'toggle' as const }] : []),
          ]}
          saveLabel={open.app ? 'Save connected app' : 'Add connected app'}
          onClose={() => setOpen(null)}
          onSave={({ active, ...v }) => (open.app ? call('PATCH', `/organizations/integrations/connected-apps/${open.app.id}`, { ...v, status: active ? 'active' : 'paused' }) : call('POST', '/organizations/integrations/connected-apps', v))}
          onRemove={open.app ? () => call('DELETE', `/organizations/integrations/connected-apps/${open.app!.id}`) : undefined}
          onTest={open.app ? () => call('POST', `/organizations/integrations/connected-apps/${open.app!.id}/test`) : undefined}
        />
      )}
      {open?.kind === 'smtp' && (
        <ConnectionDrawer
          title="Use your own mail server"
          initial={{ host: s?.smtpHost ?? '', port: s?.smtpPort ?? 587, user: '', password: '', fromAddress: s?.emailFromAddress ?? '' }}
          fields={() => [
            { key: 'host', label: 'Server', kind: 'text', required: true, placeholder: 'smtp.yourcompany.com' },
            { key: 'port', label: 'Port', kind: 'number', required: true, min: 1, max: 65535 },
            { key: 'user', label: 'User name', kind: 'text', required: true },
            { key: 'password', label: 'Password', kind: 'secret', required: true },
            { key: 'fromAddress', label: 'From address', kind: 'text' },
          ]}
          saveLabel="Check and save"
          onClose={() => setOpen(null)}
          onSave={(v) => call('PATCH', '/organizations/integrations/smtp', { ...v, fromAddress: v.fromAddress || undefined })}
        />
      )}
      {open?.kind === 'sms' && providerDrawer('sms')}
      {open?.kind === 'whatsapp' && providerDrawer('whatsapp')}
      {open?.kind === 'hris' && (
        <ConnectionDrawer
          title="Set up HR system export"
          subtitle="Each hire is sent to your HR system"
          keepSecrets={Boolean(s?.hrisExportConfigured)}
          initial={{ enabled: s?.hrisExportEnabled ?? false, provider: s?.hrisProvider ?? 'generic' }}
          fields={(v) => [{ key: 'enabled', label: 'Send hires', kind: 'toggle' }, { key: 'provider', label: 'HR system', kind: 'choice', options: HRIS.map(({ value, label }) => ({ value, label })) }, ...(HRIS.find((h) => h.value === v.provider)?.fields ?? [])]}
          saveLabel="Save HR system export"
          onClose={() => setOpen(null)}
          onSave={(v) => call('PATCH', '/organizations/integrations/hris-config', v)}
        />
      )}
      {open?.kind === 'ai' && (
        <ConnectionDrawer
          title="Use your own AI key"
          initial={{ provider: s?.aiProvider ?? 'anthropic', apiKey: '', baseUrl: s?.aiBaseUrl ?? '', modelFast: s?.aiModelFast ?? '', modelStandard: s?.aiModelStandard ?? '' }}
          fields={(v) => [
            { key: 'provider', label: 'Provider', kind: 'choice', options: [{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai-compatible', label: 'OpenAI-compatible' }] },
            { key: 'apiKey', label: 'API key', kind: 'secret', required: true },
            ...(v.provider === 'openai-compatible'
              ? ([
                  { key: 'baseUrl', label: 'Base address', kind: 'url', required: true, helper: 'A public https address.' },
                  { key: 'modelFast', label: 'Fast model', kind: 'text', required: true },
                  { key: 'modelStandard', label: 'Standard model', kind: 'text', required: true },
                ] as DrawerField[])
              : []),
          ]}
          saveLabel="Check and save"
          onClose={() => setOpen(null)}
          onSave={(v: DrawerValues) => call('PATCH', '/organizations/integrations/ai-key', v)}
        />
      )}
      {open?.kind === 'embeddings' && (
        <ConnectionDrawer
          title="Set up embeddings"
          initial={{ apiKey: '', baseUrl: s?.embeddingBaseUrl ?? '', model: s?.embeddingModel ?? '' }}
          fields={() => [{ key: 'baseUrl', label: 'Base address', kind: 'url', required: true }, { key: 'apiKey', label: 'API key', kind: 'secret', required: true }, { key: 'model', label: 'Model', kind: 'text', required: true }]}
          saveLabel="Check and save"
          onClose={() => setOpen(null)}
          onSave={(v) => call('PATCH', '/organizations/integrations/embedding-config', v)}
        />
      )}
      {open?.kind === 'webhook' && (
        <ConnectionDrawer
          title="Set webhook address"
          initial={{ url: '' }}
          fields={() => [{ key: 'url', label: 'Webhook address', kind: 'url', required: true, helper: 'A public https address. The current one is not shown again.' }]}
          saveLabel="Save webhook address"
          onClose={() => setOpen(null)}
          onSave={(v) => call('PATCH', '/organizations/integrations/webhook', v)}
        />
      )}
    </>
  );
}
