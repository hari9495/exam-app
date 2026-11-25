// Settings group 7 made live (S-10, answer 1327): 7.1 Integrations, 7.5 Calendar & chat, 7.6 AI and 7.7 Developers on
// the routes checked in the S-10 security check. Every change needs the security key (the API asks for it); secrets are
// written, never read back: a key or signing secret is shown once, a saved password or token stays blank. Drawn fields
// that are not built (catalogue, retries, OAuth apps, AI features and region, chat mirroring) are left out, never shown
// with sample values.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { Segment } from '../../components/segment';
import { MultiSelect, Select } from '../../components/select';
import type { SettingDef, SettingsPageDef } from './settings-types';

/** GET organizations/integrations (secrets are only "configured" flags; URLs come back masked). */
export interface IntegrationsState {
  smtpConfigured: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  emailFromAddress: string | null;
  aiKeyConfigured: boolean;
  aiProvider: string;
  aiBaseUrl: string | null;
  aiModelFast: string | null;
  aiModelStandard: string | null;
  embeddingConfigured: boolean;
  embeddingBaseUrl: string | null;
  embeddingModel: string | null;
  apiKeyConfigured: boolean;
  apiKeyPrefix: string | null;
  apiKeyCreatedAt: string | null;
  webhookConfigured: boolean;
  webhookUrl: string | null;
  hrisExportConfigured: boolean;
  hrisExportEnabled: boolean;
  hrisProvider: string;
  hrisTargetUrl: string | null;
}
export interface ConnectedApp {
  id: string;
  type: string;
  label: string;
  events: string[];
  status: string;
  lastDeliveryAt: string | null;
  lastError: string | null;
}
/** A provider and its fields (SMS, WhatsApp, HRIS): secret fields are never sent back. */
export interface ProviderSpec {
  id: string;
  label: string;
  configFields: { key: string; label: string; secret: boolean; required: boolean; placeholder?: string }[];
}
export interface ProviderState {
  enabled: boolean;
  provider: string;
  configured: boolean;
  config: Record<string, string>;
}
export interface DeliveryRow {
  id: string;
  eventType: string;
  status: string;
  httpStatusCode: number | null;
  createdAt: string;
}
export interface ApiUsage {
  totals: { requests: number; throttled: number };
  byEndpoint: { endpoint: string; requests: number; throttled: number }[];
}
export interface CalendarConnection {
  provider: string;
  connected: boolean;
  connectedEmail: string | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const n = (v: number) => v.toLocaleString('en-IN');
const info = (key: string, label: string, value: string, locked?: string): SettingDef => ({ key, label, kind: 'text', value, locked: locked ?? 'Change it with the button below.', scope: 'Company' });
const link = (key: string, label: string, linkLabel: string, helper?: string): SettingDef => ({ key, label, kind: 'link', linkScreenId: key, linkLabel, ...(helper ? { helper } : {}) });
const list = (key: string, label: string, columns: string[], rows: string[][], helper?: string, addLabel?: string): SettingDef => ({ key, label, kind: 'list', columns, rows, readOnlyList: !addLabel, ...(addLabel ? { addLabel } : {}), ...(helper ? { helper } : {}), scope: 'Company' });
const page = (design: SettingsPageDef, sections: { title: string; settings: SettingDef[] }[]): SettingsPageDef => ({
  ...design,
  note: undefined,
  sections: sections.filter((s) => s.settings.length).map((s) => ({ ...s, description: design.sections.find((d) => d.title === s.title)?.description })),
});
const KIND: Record<string, string> = { slack: 'Slack', msteams: 'Microsoft Teams', webhook: 'Webhook' };
const stateText = (s: ProviderState | null, specs: ProviderSpec[]) => (!s ? 'Not set up' : s.configured ? `${specs.find((p) => p.id === s.provider)?.label ?? s.provider}, ${s.enabled ? 'on' : 'off'}` : 'Not set up');

/** 7.1: connected apps (add, change, remove, test) and the company's email, SMS, WhatsApp and HRIS connections. */
export function integrationsPage(design: SettingsPageDef, d: { apps: ConnectedApp[]; state: IntegrationsState; sms: ProviderState | null; smsProviders: ProviderSpec[]; whatsapp: ProviderState | null; whatsappProviders: ProviderSpec[] }): SettingsPageDef {
  const s = d.state;
  return page(design, [
    {
      title: 'Connections',
      settings: [
        list('integrations.connections', 'Connected apps', ['Name', 'Type', 'Events', 'Status', 'Last delivery'], d.apps.map((a) => [a.label, KIND[a.type] ?? a.type, `${a.events.length} ${a.events.length === 1 ? 'event' : 'events'}`, a.status === 'active' ? 'On' : 'Paused', a.lastError ? `Failed: ${a.lastError}` : when(a.lastDeliveryAt)]), 'Slack, Teams or your own webhook. The address is stored encrypted and never shown again.', 'Add connected app'),
        info('conn.smtp.state', 'Email sending (your own mail server)', s.smtpConfigured ? `${s.smtpHost}:${s.smtpPort}${s.emailFromAddress ? ` · from ${s.emailFromAddress}` : ''}` : 'YukthiX sends your email'),
        link('conn.smtp', 'Mail server', s.smtpConfigured ? 'Change mail server' : 'Use your own mail server', 'The password is stored encrypted and never shown again.'),
        info('conn.sms.state', 'SMS to candidates', stateText(d.sms, d.smsProviders)),
        link('conn.sms', 'SMS provider', 'Set up SMS'),
        info('conn.whatsapp.state', 'WhatsApp to candidates', stateText(d.whatsapp, d.whatsappProviders)),
        link('conn.whatsapp', 'WhatsApp provider', 'Set up WhatsApp'),
        info('conn.hris.state', 'Hires sent to another HR system', s.hrisExportConfigured ? `${s.hrisProvider}${s.hrisTargetUrl ? ` · ${s.hrisTargetUrl}` : ''}, ${s.hrisExportEnabled ? 'on' : 'off'}` : 'Not set up'),
        link('conn.hris', 'HR system export', 'Set up HR system export'),
      ],
    },
  ]);
}

/** 7.6: the company's own AI key (and embeddings), stored encrypted, never shown again. */
export function aiPage(design: SettingsPageDef, s: IntegrationsState): SettingsPageDef {
  const own = s.aiKeyConfigured ? (s.aiProvider === 'openai-compatible' ? `Your own key: OpenAI-compatible at ${s.aiBaseUrl ?? '—'} (${s.aiModelFast ?? '—'}, ${s.aiModelStandard ?? '—'})` : 'Your own key: Anthropic') : 'YukthiX AI (counts against your AI credits)';
  return page(design, [
    {
      title: 'Provider',
      settings: [
        info('ai.current', 'AI used for your company', own, 'Your key is stored encrypted and never shown again; use with it counts against your own AI account.'),
        link('ai.set_key', 'Your own AI key', s.aiKeyConfigured ? 'Replace AI key' : 'Use your own AI key', 'The address must be a public https one; the key is checked before it is saved.'),
        // Answer 1903: back to YukthiX AI.
        ...(s.aiKeyConfigured ? [link('ai.stop', 'Back to YukthiX AI', 'Stop using our key', 'Your key is forgotten at once; AI use counts against your YukthiX AI credits again.')] : []),
        info('ai.embeddings.state', 'Search embeddings', s.embeddingConfigured ? `${s.embeddingBaseUrl ?? '—'} · ${s.embeddingModel ?? '—'}` : 'Not set up'),
        link('ai.embeddings', 'Embeddings provider', s.embeddingConfigured ? 'Replace embeddings provider' : 'Set up embeddings'),
      ],
    },
  ]);
}

/** 7.7: the API key (shown once), the webhook (masked address, signing secret shown once), deliveries and API use. */
export function developersPage(design: SettingsPageDef, s: IntegrationsState, deliveries: DeliveryRow[], usage: ApiUsage | null): SettingsPageDef {
  return page(design, [
    {
      title: 'API keys',
      settings: [
        list('dev.api_keys', 'API key', ['Key', 'Created'], s.apiKeyConfigured ? [[`${s.apiKeyPrefix ?? ''}…`, when(s.apiKeyCreatedAt)]] : [], 'Shown once when it is made; only its first characters after that.'),
        link('dev.key.create', 'Make a key', s.apiKeyConfigured ? 'Replace API key' : 'Create API key', s.apiKeyConfigured ? 'The old key stops working at once.' : undefined),
        ...(s.apiKeyConfigured ? [link('dev.key.revoke', 'Stop the key', 'Revoke API key', 'Anything using it stops working at once.')] : []),
      ],
    },
    {
      title: 'Webhooks',
      settings: [
        info('dev.webhook.state', 'Webhook address', s.webhookConfigured ? s.webhookUrl ?? '—' : 'Not set up', 'Only the start and the last characters are shown.'),
        link('dev.webhook', 'Address', s.webhookConfigured ? 'Change webhook address' : 'Set webhook address', 'A public https address. Events are signed with your signing secret.'),
        link('dev.webhook.secret', 'Signing secret', 'Make a new signing secret', 'Shown once. The old one stops working at once.'),
        list('dev.webhook.deliveries', 'Recent deliveries', ['Event', 'Result', 'HTTP', 'When'], deliveries.map((r) => [r.eventType, r.status, r.httpStatusCode == null ? '—' : String(r.httpStatusCode), when(r.createdAt)])),
      ],
    },
    {
      title: 'Console and usage',
      settings: usage ? [list('dev.usage', `API calls, last 30 days: ${n(usage.totals.requests)} (${n(usage.totals.throttled)} slowed down)`, ['Endpoint', 'Calls', 'Slowed down'], usage.byEndpoint.map((e) => [e.endpoint, n(e.requests), n(e.throttled)]))] : [],
    },
  ]);
}

/** 7.5: the viewer's own work calendar (connect or disconnect); chat approval links are on Approvals. */
export function calendarPage(design: SettingsPageDef, connections: CalendarConnection[]): SettingsPageDef {
  const name = (p: string) => (p === 'google' ? 'Google Calendar' : p === 'microsoft' ? 'Microsoft 365' : p);
  return page(design, [
    {
      title: 'Work calendar',
      settings: [
        list('calendar.connections', 'Your work calendar', ['Calendar', 'Status'], connections.map((c) => [name(c.provider), c.connected ? `Connected as ${c.connectedEmail ?? 'you'}` : 'Not connected']), 'Yours only: used to book interviews around your free and busy times. Nobody else sees it.'),
        ...connections.map((c) => (c.connected ? link(`calendar.disconnect.${c.provider}`, name(c.provider), `Disconnect ${name(c.provider)}`) : link(`calendar.connect.${c.provider}`, name(c.provider), `Connect ${name(c.provider)}`))),
      ],
    },
    { title: 'Chat app', settings: [link('chat.links', 'Approve from chat', 'Open Approvals', 'Link your chat account to approve or reject requests from a chat message.')] },
  ]);
}

/** A field in the generic drawer. */
export type DrawerField =
  | { key: string; label: string; kind: 'text' | 'secret' | 'url'; required?: boolean; placeholder?: string; helper?: string }
  | { key: string; label: string; kind: 'number'; required?: boolean; min?: number; max?: number }
  | { key: string; label: string; kind: 'toggle'; helper?: string }
  | { key: string; label: string; kind: 'choice'; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: 'multi'; options: { value: string; label: string }[]; required?: boolean };
export type DrawerValues = Record<string, string | number | boolean | string[] | null>;

/**
 * One drawer for every connection: the fields follow the chosen provider when there is a choice. A secret field starts
 * blank (the saved one is never sent back); blank keeps it when `keepSecrets` says one is saved.
 */
export function ConnectionDrawer({ title, subtitle, fields, initial, keepSecrets = false, saveLabel, onClose, onSave, onRemove, onTest }: {
  title: string;
  subtitle?: string;
  fields: (values: DrawerValues) => DrawerField[];
  initial: DrawerValues;
  keepSecrets?: boolean;
  saveLabel: string;
  onClose: () => void;
  onSave: (values: DrawerValues) => Promise<unknown>;
  onRemove?: () => Promise<unknown>;
  onTest?: () => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<DrawerValues>(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const list = fields(values);
  const set = (k: string, v: DrawerValues[string]) => setValues((x) => ({ ...x, [k]: v }));
  const errorOf = (f: DrawerField): string | null => {
    const v = values[f.key];
    if (f.kind === 'toggle' || f.kind === 'choice') return null;
    if (f.kind === 'multi') return f.required && !(v as string[] | null)?.length ? `Choose at least one ${f.label.toLowerCase()}.` : null;
    if (f.kind === 'number') return f.required && (v === null || v === undefined || v === '') ? `Enter the ${f.label.toLowerCase()}.` : null;
    const text = String(v ?? '').trim();
    if (!text) return f.required && !(f.kind === 'secret' && keepSecrets) ? `Enter the ${f.label.toLowerCase()}.` : null;
    if (f.kind === 'url' && !/^https:\/\/[^\s]+$/.test(text)) return 'Give a full https address.';
    return null;
  };
  const fail = (e: unknown) => setFailed(e instanceof Error ? e.message : 'It could not be saved. Try again.');
  const save = () => {
    setTried(true);
    const bad = list.find((f) => errorOf(f));
    if (bad) return document.getElementById(`cd-${bad.key}`)?.focus();
    setBusy(true);
    setFailed(null);
    const out: DrawerValues = {};
    for (const f of list) {
      const v = values[f.key];
      if (f.kind === 'secret' && !String(v ?? '').trim()) continue;
      out[f.key] = typeof v === 'string' ? v.trim() : v;
    }
    onSave(out)
      .then(() => (toast({ tone: 'success', title: `${title.replace(/^(Set up|Change|Add|Replace|Use your own) /, '')} saved` }), onClose()))
      .catch(fail)
      .finally(() => setBusy(false));
  };
  const act = (fn: () => Promise<unknown>, done: string, close: boolean) => () =>
    fn().then(() => (toast({ tone: 'success', title: done }), close && onClose()), fail);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={title}
      subtitle={subtitle}
      dirty
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          {onRemove && <Button onClick={act(onRemove, 'Removed', true)}>Remove</Button>}
          {onTest && <Button onClick={act(onTest, 'Test sent', false)}>Send a test</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>{saveLabel}</Button>
        </>
      }
    >
      <div className="yx-set-stack">
        {list.map((f) => {
          const id = `cd-${f.key}`;
          const err = tried ? errorOf(f) : null;
          if (f.kind === 'toggle') return <Checkbox key={f.key} id={id} checked={Boolean(values[f.key])} onChange={(c) => set(f.key, c)} label={f.label} description={f.helper} />;
          if (f.kind === 'choice')
            return (
              <FormField key={f.key} id={id} label={f.label}>
                {f.options.length <= 4 ? <Segment label={f.label} options={f.options} value={String(values[f.key] ?? f.options[0]?.value)} onChange={(v) => set(f.key, v)} /> : <Select aria-label={f.label} options={f.options} value={String(values[f.key] ?? '')} onChange={(v) => v && set(f.key, v)} />}
              </FormField>
            );
          if (f.kind === 'multi')
            return (
              <FormField key={f.key} id={id} label={f.label} required={f.required} error={err}>
                <MultiSelect aria-label={f.label} options={f.options} value={(values[f.key] as string[] | null) ?? []} onChange={(v) => set(f.key, v)} />
              </FormField>
            );
          if (f.kind === 'number')
            return (
              <FormField key={f.key} id={id} label={f.label} required={f.required} error={err}>
                <NumberField value={(values[f.key] as number | null) ?? null} onChange={(v) => set(f.key, v)} min={f.min} max={f.max} />
              </FormField>
            );
          const secretKept = f.kind === 'secret' && keepSecrets;
          return (
            <FormField key={f.key} id={id} label={f.label} required={f.required && !secretKept} error={err} helper={secretKept ? 'Saved. Leave it blank to keep it.' : f.helper}>
              <TextField type={f.kind === 'secret' ? 'password' : 'text'} autoComplete={f.kind === 'secret' ? 'new-password' : 'off'} value={String(values[f.key] ?? '')} onChange={(v) => set(f.key, v)} placeholder={f.placeholder} maxLength={1000} />
            </FormField>
          );
        })}
      </div>
    </Drawer>
  );
}

/** A key or signing secret, shown once: copy it now; it is never shown again. */
export function ShownOnceDrawer({ title, value, onClose }: { title: string; value: string; onClose: () => void }) {
  const { toast } = useToast();
  const copy = () => void navigator.clipboard?.writeText(value).then(() => toast({ tone: 'success', title: 'Copied' }), () => toast({ tone: 'error', title: 'Copy it by hand: the clipboard is not available.' }));
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="md" title={title} notice={<InlineAlert tone="warning" title="Copy it now. It is shown only this once." />} footer={<><Button onClick={copy}>Copy</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
      <div className="yx-set-stack">
        <FormField id="once-value" label={title}>
          <TextField value={value} readOnly onFocus={(e) => e.currentTarget.select()} />
        </FormField>
      </div>
    </Drawer>
  );
}
