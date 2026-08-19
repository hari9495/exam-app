'use client';

import { useEffect, useState } from 'react';
import {
  useIntegrations,
  useUpdateSmtpSettings,
  useUpdateAiKey,
  useGenerateApiKey,
  useRevokeApiKey,
  useUpdateWebhookUrl,
  useGenerateWebhookSecret,
  useWebhookDeliveries,
} from '../../../../lib/hooks/useIntegrations';
import { Input, Button, CollapsibleSection, Table, StatusBadge, Select, RequiredFieldsNote, type SelectOption, type Column, type StatusTone, useToast } from '../../../../components/ui';
import { WebhookDeliveryRow } from '../../../../lib/types';
import { ConnectedAppsSection } from '../../../../components/integrations/ConnectedAppsSection';

function deliveryTone(status: string): StatusTone {
  if (status === 'delivered' || status === 'success') return 'success';
  if (status.includes('fail') || status === 'error') return 'danger';
  return 'neutral';
}

const DELIVERY_COLUMNS: Column<WebhookDeliveryRow>[] = [
  { key: 'index', header: '#', render: (_row, index) => index + 1 },
  { key: 'eventType', header: 'Event', render: (row) => row.eventType, sortValue: (row) => row.eventType },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge tone={deliveryTone(row.status)}>{row.status}</StatusBadge>,
    sortValue: (row) => row.status,
  },
  { key: 'http', header: 'HTTP', render: (row) => row.httpStatusCode ?? '—', sortValue: (row) => row.httpStatusCode ?? 0 },
  { key: 'createdAt', header: 'Time', render: (row) => new Date(row.createdAt).toLocaleString(), sortValue: (row) => row.createdAt },
];
import { motion } from 'framer-motion';

const AI_PROVIDER_OPTIONS: SelectOption[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
];

export default function IntegrationsSettingsPage() {
  const { data: integrations } = useIntegrations();
  const updateSmtp = useUpdateSmtpSettings();
  const updateAiKey = useUpdateAiKey();
  const { toast } = useToast();

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
          toast('SMTP settings saved.');
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
          toast('AI API key saved.');
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-center text-2xl font-semibold text-ink">Integrations</h1>
      <RequiredFieldsNote />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
        <CollapsibleSection title="Email (SMTP)">
          <p className="text-sm text-muted sm:col-span-2">
            {integrations?.smtpConfigured
              ? `Configured — ${integrations.smtpHost}:${integrations.smtpPort}${integrations.emailFromAddress ? `, from ${integrations.emailFromAddress}` : ''}`
              : 'Not configured — invites and password resets currently use the platform default.'}
          </p>
          {integrations?.smtpConfigured && !smtpEditing ? (
            <div className="sm:col-span-2">
              <Button variant="secondary" onClick={() => setSmtpEditing(true)}>
                Edit SMTP settings
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSmtpSubmit} className="contents">
              <Input label="SMTP Host" value={smtpHost} onChange={setSmtpHost} required />
              <Input label="SMTP Port" type="number" value={smtpPort} onChange={setSmtpPort} required />
              <Input label="SMTP Username" value={smtpUser} onChange={setSmtpUser} required />
              <Input label="SMTP Password" type="password" value={smtpPassword} onChange={setSmtpPassword} required />
              <div className="sm:col-span-2">
                <Input label="From Address (Optional)" type="email" value={fromAddress} onChange={setFromAddress} />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" loading={updateSmtp.isPending}>
                  {integrations?.smtpConfigured ? 'Replace SMTP settings' : 'Save SMTP settings'}
                </Button>
                {integrations?.smtpConfigured && (
                  <Button
                    type="button"
                    variant="secondary"
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
                  </Button>
                )}
              </div>
            </form>
          )}
          {smtpError && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {smtpError}
            </p>
          )}
        </CollapsibleSection>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
        <CollapsibleSection title="AI API Key">
          <p className="text-sm text-muted sm:col-span-2">
            {integrations?.aiKeyConfigured
              ? `Configured — AI features use this organization's ${integrations.aiProvider === 'openai-compatible' ? 'Azure OpenAI / OpenAI-compatible' : 'Anthropic'} endpoint.`
              : 'Not configured — AI features currently use the platform default key.'}
          </p>
          {integrations?.aiKeyConfigured && !aiEditing ? (
            <>
              {integrations.aiProvider === 'openai-compatible' && integrations.aiBaseUrl && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-muted sm:col-span-2">
                  <dt className="font-medium">Base URL</dt>
                  <dd className="break-all">{integrations.aiBaseUrl}</dd>
                  <dt className="font-medium">Fast-tier model</dt>
                  <dd>{integrations.aiModelFast ?? '—'}</dd>
                  <dt className="font-medium">Standard-tier model</dt>
                  <dd>{integrations.aiModelStandard ?? '—'}</dd>
                </dl>
              )}
              <div className="sm:col-span-2">
                <Button variant="secondary" onClick={() => setAiEditing(true)}>
                  Edit AI settings
                </Button>
              </div>
            </>
          ) : (
            <form onSubmit={handleAiKeySubmit} className="contents">
              <Select label="AI Provider" value={aiProvider} onChange={(value) => setAiProvider(value as 'anthropic' | 'openai-compatible')} options={AI_PROVIDER_OPTIONS} required />
              <Input label="AI API Key" type="password" value={aiApiKey} onChange={setAiApiKey} required />
              {aiProvider === 'openai-compatible' && (
                <>
                  <div className="sm:col-span-2">
                    <Input label="Base URL" value={aiBaseUrl} onChange={setAiBaseUrl} required placeholder="https://your-resource.openai.azure.com/openai/v1" />
                  </div>
                  <Input label="Fast-Tier Model/Deployment Name" value={aiModelFast} onChange={setAiModelFast} required />
                  <Input label="Standard-Tier Model/Deployment Name" value={aiModelStandard} onChange={setAiModelStandard} required />
                </>
              )}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" loading={updateAiKey.isPending}>
                  {integrations?.aiKeyConfigured ? 'Replace AI API key' : 'Save AI API key'}
                </Button>
                {integrations?.aiKeyConfigured && (
                  <Button
                    type="button"
                    variant="secondary"
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
                  </Button>
                )}
              </div>
            </form>
          )}
          {aiKeyError && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {aiKeyError}
            </p>
          )}
        </CollapsibleSection>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}>
        <CollapsibleSection title="Public API">
          <p className="text-sm text-muted sm:col-span-2">
            {integrations?.apiKeyConfigured
              ? `Active key: ${integrations.apiKeyPrefix}… (created ${new Date(integrations.apiKeyCreatedAt as string).toLocaleDateString()})`
              : 'No API key generated'}
          </p>
          {revealedApiKey && (
            <div className="rounded-md bg-status-warning-bg p-3 sm:col-span-2">
              <p className="mb-1 break-all font-mono text-sm text-status-warning">{revealedApiKey}</p>
              <p className="text-xs text-status-warning">Copy this now &mdash; it won&apos;t be shown again.</p>
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button loading={generateApiKey.isPending} onClick={handleGenerateApiKey}>
              {integrations?.apiKeyConfigured ? 'Regenerate' : 'Generate'}
            </Button>
            {integrations?.apiKeyConfigured && (
              <Button variant="secondary" loading={revokeApiKey.isPending} onClick={handleRevokeApiKey}>
                Revoke
              </Button>
            )}
          </div>
          {apiKeyError && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {apiKeyError}
            </p>
          )}
        </CollapsibleSection>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}>
        <CollapsibleSection title="Webhooks">
          <Input
            label="Webhook URL"
            value={webhookUrlInput}
            onChange={setWebhookUrlInput}
            placeholder="https://your-ats.example.com/webhooks/exam-platform"
            required
          />
          <Button
            loading={updateWebhookUrl.isPending}
            onClick={handleSaveWebhookUrl}
            disabled={!webhookUrlInput.trim()}
            className="self-end"
          >
            Save URL
          </Button>

          {revealedWebhookSecret && (
            <div className="rounded-md bg-status-warning-bg p-3 sm:col-span-2">
              <p className="mb-1 break-all font-mono text-sm text-status-warning">{revealedWebhookSecret}</p>
              <p className="text-xs text-status-warning">Copy this now &mdash; it won&apos;t be shown again.</p>
            </div>
          )}
          <Button
            variant="secondary"
            loading={generateWebhookSecret.isPending}
            onClick={handleGenerateWebhookSecret}
            className="sm:col-span-2 self-start"
          >
            {integrations?.webhookConfigured ? 'Regenerate signing secret' : 'Generate signing secret'}
          </Button>
          {webhookError && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {webhookError}
            </p>
          )}

          <div className="sm:col-span-2">
            <h3 className="mb-2 mt-2 text-sm font-semibold text-ink">Recent Deliveries</h3>
            <Table columns={DELIVERY_COLUMNS} rows={deliveries ?? []} rowKey={(row) => row.id} emptyMessage="No deliveries yet." />
          </div>
        </CollapsibleSection>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2, ease: 'easeOut' }}>
        <ConnectedAppsSection />
      </motion.div>
    </div>
  );
}
