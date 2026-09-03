'use client';

// v2 Integrations (org-admin). Format-only re-skin of the old (org-admin)/settings/integrations
// page on v2 primitives + viz tokens. Same hooks, mutations, payloads, validation and edit-gating
// as the old page — only presentation changes (old ui kit → ui-v2, useToast → inline notice,
// CollapsibleSection → static cards, Table → DataTable, Select → Combobox, Modal → Dialog).
import { useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  useIntegrations,
  useUpdateSmtpSettings,
  useUpdateAiKey,
  useGenerateApiKey,
  useRevokeApiKey,
  useUpdateWebhookUrl,
  useGenerateWebhookSecret,
  useWebhookDeliveries,
} from '../../../../../lib/hooks/useIntegrations';
import {
  useConnectedApps,
  useCreateConnectedApp,
  useUpdateConnectedApp,
  useDeleteConnectedApp,
  useTestConnectedApp,
} from '../../../../../lib/hooks/useConnectedApps';
import type { WebhookDeliveryRow, ConnectedAppRow } from '../../../../../lib/types';
import { Button, TextField, PasswordField, Combobox, Dialog, DataTable, DT_FEATURES, dt, Cb, SortHead, Pill } from '../../../../../components/ui-v2';
import { STATUS } from '../../../../../components/ui-v2/viz';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const errorText: React.CSSProperties = { fontSize: 12.5, color: 'var(--danger)', margin: 0 };
const secretBox: React.CSSProperties = { borderRadius: 9, padding: 12, border: '1px solid color-mix(in srgb, #a16207 30%, transparent)', background: 'color-mix(in srgb, #a16207 8%, transparent)' };

type Notice = { type: 'success' | 'error'; text: string } | null;

const AI_PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
];

// delivered/success = ok green, *fail*/error = bad red, otherwise neutral — same thresholds
// as the old page's deliveryTone, mapped to a Pill colour instead of a StatusBadge tone.
function deliveryColor(status: string): string {
  if (status === 'delivered' || status === 'success') return STATUS.ok;
  if (status.includes('fail') || status === 'error') return STATUS.bad;
  return muted;
}

const thLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: muted };

const DELIVERY_COLUMNS: ColumnDef<typeof DT_FEATURES, WebhookDeliveryRow>[] = [
  { id: 'index', enableSorting: false, header: () => <span style={thLabel}>#</span>, cell: ({ row }) => <span style={dt.muted}>{row.index + 1}</span> },
  { accessorKey: 'eventType', header: ({ column }) => <SortHead label="Event" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => row.original.eventType },
  { accessorKey: 'status', header: ({ column }) => <SortHead label="Status" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <Pill c={deliveryColor(row.original.status)} label={row.original.status} /> },
  { id: 'http', accessorFn: (row) => row.httpStatusCode ?? 0, header: ({ column }) => <SortHead label="HTTP" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.httpStatusCode ?? '—'}</span> },
  { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Time" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.createdAt).toLocaleString()}</span> },
];

export default function V2IntegrationsSettingsPage() {
  const { data: integrations } = useIntegrations();
  const updateSmtp = useUpdateSmtpSettings();
  const updateAiKey = useUpdateAiKey();

  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [smtpError, setSmtpError] = useState<string | null>(null);
  // Once configured, the form stays hidden behind an explicit Edit step so a stray
  // click can't silently replace working credentials.
  const [smtpEditing, setSmtpEditing] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);

  const [aiProvider, setAiProvider] = useState<'anthropic' | 'openai-compatible'>('anthropic');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiModelFast, setAiModelFast] = useState('');
  const [aiModelStandard, setAiModelStandard] = useState('');
  const [aiKeyError, setAiKeyError] = useState<string | null>(null);

  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [revealedWebhookSecret, setRevealedWebhookSecret] = useState<string | null>(null);
  const [webhookUrlInput, setWebhookUrlInput] = useState(integrations?.webhookUrl ?? '');
  const [webhookError, setWebhookError] = useState<string | null>(null);

  // integrations loads asynchronously, so the useState initializer above only
  // catches an already-cached value — sync once the fetch resolves.
  useEffect(() => {
    if (integrations?.webhookUrl != null) setWebhookUrlInput(integrations.webhookUrl);
  }, [integrations?.webhookUrl]);

  useEffect(() => {
    if (integrations?.aiProvider != null) setAiProvider(integrations.aiProvider);
  }, [integrations?.aiProvider]);

  const generateApiKey = useGenerateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const updateWebhookUrl = useUpdateWebhookUrl();
  const generateWebhookSecret = useGenerateWebhookSecret();
  const { data: deliveries } = useWebhookDeliveries();

  function handleSmtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSmtpError(null);
    updateSmtp.mutate(
      { host: smtpHost, port: parseInt(smtpPort, 10), user: smtpUser, password: smtpPassword, fromAddress: fromAddress || undefined },
      {
        onSuccess: () => {
          notify('success', 'SMTP settings saved.');
          setSmtpHost('');
          setSmtpPort('587');
          setSmtpUser('');
          setSmtpPassword('');
          setFromAddress('');
          setSmtpEditing(false);
        },
        onError: (err) => setSmtpError(err instanceof Error ? err.message : 'Failed to save SMTP settings'),
      },
    );
  }

  function handleAiKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    setAiKeyError(null);
    updateAiKey.mutate(
      aiProvider === 'openai-compatible'
        ? { provider: aiProvider, apiKey: aiApiKey, baseUrl: aiBaseUrl, modelFast: aiModelFast, modelStandard: aiModelStandard }
        : { provider: aiProvider, apiKey: aiApiKey },
      {
        onSuccess: () => {
          notify('success', 'AI API key saved.');
          setAiApiKey('');
          setAiBaseUrl('');
          setAiModelFast('');
          setAiModelStandard('');
          setAiEditing(false);
        },
        onError: (err) => setAiKeyError(err instanceof Error ? err.message : 'Failed to save AI API key'),
      },
    );
  }

  function handleGenerateApiKey() {
    setApiKeyError(null);
    generateApiKey.mutate(undefined, {
      onSuccess: (result: { apiKey: string; apiKeyPrefix: string }) => setRevealedApiKey(result.apiKey),
      onError: (err) => setApiKeyError(err instanceof Error ? err.message : 'Failed to generate API key'),
    });
  }

  function handleRevokeApiKey() {
    setApiKeyError(null);
    revokeApiKey.mutate(undefined, {
      onSuccess: () => setRevealedApiKey(null),
      onError: (err) => setApiKeyError(err instanceof Error ? err.message : 'Failed to revoke API key'),
    });
  }

  function handleSaveWebhookUrl() {
    if (!webhookUrlInput.trim()) return;
    setWebhookError(null);
    updateWebhookUrl.mutate(webhookUrlInput, {
      onError: (err) => setWebhookError(err instanceof Error ? err.message : 'Failed to save webhook URL'),
    });
  }

  function handleGenerateWebhookSecret() {
    setWebhookError(null);
    generateWebhookSecret.mutate(undefined, {
      onSuccess: (result: { webhookSecret: string }) => setRevealedWebhookSecret(result.webhookSecret),
      onError: (err) => setWebhookError(err instanceof Error ? err.message : 'Failed to generate webhook secret'),
    });
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Integrations</h1>
        <p style={{ ...desc, marginTop: 6 }}>Connect email delivery, AI, the public API, webhooks, and chat apps to your organization.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Email (SMTP) */}
        <section style={card}>
          <h2 style={sectionTitle}>Email (SMTP)</h2>
          <p style={desc}>
            {integrations?.smtpConfigured
              ? `Configured — ${integrations.smtpHost}:${integrations.smtpPort}${integrations.emailFromAddress ? `, from ${integrations.emailFromAddress}` : ''}`
              : 'Not configured — invites and password resets currently use the platform default.'}
          </p>
          <div style={{ marginTop: 14 }}>
            {integrations?.smtpConfigured && !smtpEditing ? (
              <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => setSmtpEditing(true)}>Edit SMTP settings</button>
            ) : (
              <form onSubmit={handleSmtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <TextField id="smtp-host" label="SMTP Host" value={smtpHost} onChange={setSmtpHost} required />
                  <TextField id="smtp-port" label="SMTP Port" type="number" value={smtpPort} onChange={setSmtpPort} required />
                  <TextField id="smtp-user" label="SMTP Username" value={smtpUser} onChange={setSmtpUser} required />
                  <PasswordField id="smtp-password" label="SMTP Password" value={smtpPassword} onChange={setSmtpPassword} required />
                </div>
                <TextField id="smtp-from" label="From Address (Optional)" type="email" value={fromAddress} onChange={setFromAddress} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button type="submit" loading={updateSmtp.isPending}>
                    {integrations?.smtpConfigured ? 'Replace SMTP settings' : 'Save SMTP settings'}
                  </Button>
                  {integrations?.smtpConfigured && (
                    <button
                      type="button"
                      className="v2-hoverbtn"
                      style={dt.toolBtn}
                      onClick={() => {
                        setSmtpEditing(false);
                        setSmtpError(null);
                        setSmtpHost('');
                        setSmtpPort('587');
                        setSmtpUser('');
                        setSmtpPassword('');
                        setFromAddress('');
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
            {smtpError && <p role="alert" style={{ ...errorText, marginTop: 10 }}>{smtpError}</p>}
          </div>
        </section>

        {/* AI API Key */}
        <section style={card}>
          <h2 style={sectionTitle}>AI API Key</h2>
          <p style={desc}>
            {integrations?.aiKeyConfigured
              ? `Configured — AI features use this organization's ${integrations.aiProvider === 'openai-compatible' ? 'Azure OpenAI / OpenAI-compatible' : 'Anthropic'} endpoint.`
              : 'Not configured — AI features currently use the platform default key.'}
          </p>
          <div style={{ marginTop: 14 }}>
            {integrations?.aiKeyConfigured && !aiEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {integrations.aiProvider === 'openai-compatible' && integrations.aiBaseUrl && (
                  <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 4, fontSize: 13, color: muted, margin: 0 }}>
                    <dt style={{ fontWeight: 500 }}>Base URL</dt>
                    <dd style={{ margin: 0, wordBreak: 'break-all' }}>{integrations.aiBaseUrl}</dd>
                    <dt style={{ fontWeight: 500 }}>Fast-tier model</dt>
                    <dd style={{ margin: 0 }}>{integrations.aiModelFast ?? '—'}</dd>
                    <dt style={{ fontWeight: 500 }}>Standard-tier model</dt>
                    <dd style={{ margin: 0 }}>{integrations.aiModelStandard ?? '—'}</dd>
                  </dl>
                )}
                <div>
                  <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => setAiEditing(true)}>Edit AI settings</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAiKeySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="v2-label">AI Provider</label>
                    <Combobox options={AI_PROVIDER_OPTIONS} value={aiProvider} onChange={(v) => setAiProvider(v as 'anthropic' | 'openai-compatible')} width="100%" />
                  </div>
                  <PasswordField id="ai-api-key" label="AI API Key" value={aiApiKey} onChange={setAiApiKey} required />
                </div>
                {aiProvider === 'openai-compatible' && (
                  <>
                    <TextField id="ai-base-url" label="Base URL" value={aiBaseUrl} onChange={setAiBaseUrl} required placeholder="https://your-resource.openai.azure.com/openai/v1" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <TextField id="ai-model-fast" label="Fast-Tier Model/Deployment Name" value={aiModelFast} onChange={setAiModelFast} required />
                      <TextField id="ai-model-standard" label="Standard-Tier Model/Deployment Name" value={aiModelStandard} onChange={setAiModelStandard} required />
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button type="submit" loading={updateAiKey.isPending}>
                    {integrations?.aiKeyConfigured ? 'Replace AI API key' : 'Save AI API key'}
                  </Button>
                  {integrations?.aiKeyConfigured && (
                    <button
                      type="button"
                      className="v2-hoverbtn"
                      style={dt.toolBtn}
                      onClick={() => {
                        setAiEditing(false);
                        setAiKeyError(null);
                        setAiApiKey('');
                        setAiBaseUrl('');
                        setAiModelFast('');
                        setAiModelStandard('');
                        if (integrations?.aiProvider) setAiProvider(integrations.aiProvider);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
            {aiKeyError && <p role="alert" style={{ ...errorText, marginTop: 10 }}>{aiKeyError}</p>}
          </div>
        </section>

        {/* Public API */}
        <section style={card}>
          <h2 style={sectionTitle}>Public API</h2>
          <p style={desc}>
            {integrations?.apiKeyConfigured
              ? `Active key: ${integrations.apiKeyPrefix}… (created ${new Date(integrations.apiKeyCreatedAt as string).toLocaleDateString()})`
              : 'No API key generated'}
          </p>
          {revealedApiKey && (
            <div style={{ ...secretBox, marginTop: 14 }}>
              <p style={{ margin: '0 0 4px', wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#a16207' }}>{revealedApiKey}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: '#a16207' }}>Copy this now &mdash; it won&apos;t be shown again.</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <Button loading={generateApiKey.isPending} onClick={handleGenerateApiKey}>
              {integrations?.apiKeyConfigured ? 'Regenerate' : 'Generate'}
            </Button>
            {integrations?.apiKeyConfigured && (
              <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={handleRevokeApiKey} disabled={revokeApiKey.isPending}>Revoke</button>
            )}
          </div>
          {apiKeyError && <p role="alert" style={{ ...errorText, marginTop: 10 }}>{apiKeyError}</p>}
        </section>

        {/* Webhooks */}
        <section style={card}>
          <h2 style={sectionTitle}>Webhooks</h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1 }}>
              <TextField
                id="webhook-url"
                label="Webhook URL"
                value={webhookUrlInput}
                onChange={setWebhookUrlInput}
                placeholder="https://your-ats.example.com/webhooks/exam-platform"
                required
              />
            </div>
            <Button loading={updateWebhookUrl.isPending} onClick={handleSaveWebhookUrl} disabled={!webhookUrlInput.trim()}>Save URL</Button>
          </div>

          {revealedWebhookSecret && (
            <div style={{ ...secretBox, marginTop: 14 }}>
              <p style={{ margin: '0 0 4px', wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#a16207' }}>{revealedWebhookSecret}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: '#a16207' }}>Copy this now &mdash; it won&apos;t be shown again.</p>
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={handleGenerateWebhookSecret} disabled={generateWebhookSecret.isPending}>
              {integrations?.webhookConfigured ? 'Regenerate signing secret' : 'Generate signing secret'}
            </button>
          </div>
          {webhookError && <p role="alert" style={{ ...errorText, marginTop: 10 }}>{webhookError}</p>}

          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: ink, margin: '0 0 8px' }}>Recent Deliveries</h3>
            <DataTable columns={DELIVERY_COLUMNS} data={deliveries ?? []} getRowId={(row) => row.id} hideToolbar emptyMessage="No deliveries yet." />
          </div>
        </section>

        {/* Connected Apps */}
        <ConnectedAppsSection notify={notify} />
      </div>
    </div>
  );
}

// --- Connected Apps (Slack, Teams & Webhooks) ---------------------------------
// Inlined v2 re-skin of components/integrations/ConnectedAppsSection (old kit). Same hooks,
// mutations, payloads and validation; useToast → the page-level notify banner.

// Mirrors packages/shared INTEGRATION_EVENT_TYPES / INTEGRATION_EVENT_LABELS exactly.
const INTEGRATION_EVENTS: { value: string; label: string }[] = [
  { value: 'invitation.created', label: 'Candidate invited' },
  { value: 'attempt.submitted', label: 'Candidate finished exam' },
  { value: 'attempt.settled', label: 'Results ready' },
  { value: 'integrity.flagged', label: 'Integrity flag raised' },
  { value: 'interview.confirmed', label: 'Interview confirmed' },
  { value: 'offer.accepted', label: 'Offer accepted' },
  { value: 'candidate.applied', label: 'New applicant' },
  { value: 'candidate.fit_scored', label: 'AI fit score ready' },
  { value: 'candidate.hired', label: 'Candidate hired' },
];

const EVENT_LABEL_BY_VALUE = new Map(INTEGRATION_EVENTS.map((e) => [e.value, e.label]));

type AppType = 'slack' | 'msteams' | 'webhook';

const APP_TYPE_OPTIONS = [
  { value: 'slack', label: 'Slack' },
  { value: 'msteams', label: 'Microsoft Teams' },
  { value: 'webhook', label: 'Webhook (Zapier, Make, n8n…)' },
];

const APP_TYPE_LABEL: Record<AppType, string> = { slack: 'Slack', msteams: 'Microsoft Teams', webhook: 'Webhook' };

const URL_HELP: Record<AppType, { text: string; href: string }> = {
  slack: { text: 'How to get a Slack incoming webhook URL', href: 'https://api.slack.com/messaging/webhooks' },
  msteams: {
    text: 'How to get a Teams workflow webhook URL',
    href: 'https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/what-are-webhooks-and-connectors',
  },
  webhook: {
    text: 'Paste your Zapier “Catch Hook” URL (or any HTTPS endpoint — Make, n8n, custom)',
    href: 'https://zapier.com/apps/webhook/integrations',
  },
};

interface FormState {
  type: AppType;
  label: string;
  targetUrl: string;
  events: string[];
}

const EMPTY_FORM: FormState = { type: 'slack', label: '', targetUrl: '', events: [] };

function ConnectedAppsSection({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const { data: apps } = useConnectedApps();
  const createApp = useCreateConnectedApp();
  const updateApp = useUpdateConnectedApp();
  const deleteApp = useDeleteConnectedApp();
  const testApp = useTestConnectedApp();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(row: ConnectedAppRow) {
    setEditingId(row.id);
    setForm({ type: row.type, label: row.label, targetUrl: '', events: row.events });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function toggleEvent(value: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      events: checked ? [...current.events, value] : current.events.filter((e) => e !== value),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (form.events.length === 0) {
      setFormError('Select at least one event.');
      return;
    }
    const onError = (err: unknown) => setFormError(err instanceof Error ? err.message : 'Failed to save connected app');

    if (editingId) {
      updateApp.mutate(
        { id: editingId, label: form.label, events: form.events, ...(form.targetUrl.trim() ? { targetUrl: form.targetUrl } : {}) },
        { onSuccess: () => { notify('success', 'Connected app updated.'); closeModal(); }, onError },
      );
      return;
    }
    if (!form.targetUrl.trim()) {
      setFormError('Enter a webhook URL.');
      return;
    }
    createApp.mutate(
      { type: form.type, label: form.label, targetUrl: form.targetUrl, events: form.events },
      { onSuccess: () => { notify('success', 'Connected app added.'); closeModal(); }, onError },
    );
  }

  function handleToggleStatus(row: ConnectedAppRow) {
    updateApp.mutate(
      { id: row.id, status: row.status === 'active' ? 'disabled' : 'active' },
      { onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to update connected app') },
    );
  }

  function handleTest(row: ConnectedAppRow) {
    testApp.mutate(row.id, {
      onSuccess: () => notify('success', `Test event queued for ${row.label}.`),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to queue test event'),
    });
  }

  function handleRemove(row: ConnectedAppRow) {
    if (!confirm(`Remove ${row.label}? This cannot be undone.`)) return;
    deleteApp.mutate(row.id, {
      onSuccess: () => notify('success', `Removed ${row.label}.`),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to remove connected app'),
    });
  }

  const columns: ColumnDef<typeof DT_FEATURES, ConnectedAppRow>[] = [
    { accessorKey: 'type', header: ({ column }) => <SortHead label="Type" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <Pill c={muted} label={APP_TYPE_LABEL[row.original.type]} /> },
    {
      accessorKey: 'label',
      header: ({ column }) => <SortHead label="Name" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: ink }}>{row.original.label}</span>
          <span style={{ fontSize: 11.5, color: muted }}>{row.original.urlHint}</span>
        </div>
      ),
    },
    {
      id: 'events', enableSorting: false, header: () => <span style={thLabel}>Events</span>,
      cell: ({ row }) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {row.original.events.map((event) => <Pill key={event} c={muted} label={EVENT_LABEL_BY_VALUE.get(event) ?? event} />)}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <SortHead label="Status" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill c={row.original.status === 'active' ? STATUS.ok : muted} label={row.original.status} />
          <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => handleToggleStatus(row.original)} disabled={updateApp.isPending}>
            {row.original.status === 'active' ? 'Disable' : 'Enable'}
          </button>
        </div>
      ),
    },
    {
      id: 'lastDelivery', enableSorting: false, header: () => <span style={thLabel}>Last delivery</span>,
      cell: ({ row }) =>
        row.original.lastError ? (
          <span style={{ color: 'var(--danger)' }}>{row.original.lastError}</span>
        ) : row.original.lastDeliveryAt ? (
          <span style={dt.muted}>{new Date(row.original.lastDeliveryAt).toLocaleString()}</span>
        ) : (
          <span style={dt.muted}>—</span>
        ),
    },
    {
      id: 'actions', enableSorting: false, header: () => <span style={thLabel}>Actions</span>,
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => handleTest(row.original)} disabled={testApp.isPending}>Test</button>
          <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => openEdit(row.original)}>Edit</button>
          <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => handleRemove(row.original)} disabled={deleteApp.isPending}>Remove</button>
        </div>
      ),
    },
  ];

  const helpForType = URL_HELP[form.type];

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <h2 style={sectionTitle}>Connected Apps (Slack, Teams &amp; Webhooks)</h2>
        <Button onClick={openAdd}>Add connected app</Button>
      </div>
      <div style={{ marginTop: 14 }}>
        <DataTable columns={columns} data={apps ?? []} getRowId={(row) => row.id} hideToolbar emptyMessage="No connected apps yet." />
      </div>

      <Dialog open={modalOpen} onClose={closeModal} title={editingId ? 'Edit connected app' : 'Add connected app'} width={520}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {editingId ? (
            <p style={{ fontSize: 13, color: muted, margin: 0 }}>Type: {APP_TYPE_LABEL[form.type]} (can&apos;t be changed after creation)</p>
          ) : (
            <div>
              <label className="v2-label">Type</label>
              <Combobox options={APP_TYPE_OPTIONS} value={form.type} onChange={(value) => setForm((current) => ({ ...current, type: value as AppType }))} width="100%" />
            </div>
          )}
          <TextField id="ca-label" label="Name" value={form.label} onChange={(value) => setForm((current) => ({ ...current, label: value }))} required />
          <div>
            <TextField
              id="ca-url"
              label="Webhook URL"
              value={form.targetUrl}
              onChange={(value) => setForm((current) => ({ ...current, targetUrl: value }))}
              placeholder={editingId ? 'Leave blank to keep the existing URL' : 'https://hooks.slack.com/services/…'}
              required={!editingId}
            />
            <a href={helpForType.href} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--org-primary)', textDecoration: 'underline', display: 'inline-block', marginTop: 4 }}>
              {helpForType.text}
            </a>
          </div>
          <fieldset style={{ display: 'flex', flexDirection: 'column', gap: 8, border: 'none', margin: 0, padding: 0 }}>
            <legend className="v2-label" style={{ padding: 0 }}>Events</legend>
            {INTEGRATION_EVENTS.map((event) => (
              <label key={event.value} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: ink, cursor: 'pointer' }}>
                <Cb checked={form.events.includes(event.value)} onChange={(checked) => toggleEvent(event.value, checked)} />
                {event.label}
              </label>
            ))}
          </fieldset>
          {formError && <p role="alert" style={errorText}>{formError}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={closeModal}>Cancel</button>
            <Button type="submit" loading={createApp.isPending || updateApp.isPending}>{editingId ? 'Save changes' : 'Add app'}</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
