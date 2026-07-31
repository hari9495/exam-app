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
import { Input, Button, Card, Table, StatusBadge, Select, type SelectOption, type Column, type StatusTone, useToast } from '../../../../components/ui';
import { WebhookDeliveryRow } from '../../../../lib/types';

function deliveryTone(status: string): StatusTone {
  if (status === 'delivered' || status === 'success') return 'success';
  if (status.includes('fail') || status === 'error') return 'danger';
  return 'neutral';
}

const DELIVERY_COLUMNS: Column<WebhookDeliveryRow>[] = [
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-recruiter-text">Integrations</h1>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
        <Card className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">Email (SMTP)</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            {integrations?.smtpConfigured
              ? `Configured — ${integrations.smtpHost}:${integrations.smtpPort}${integrations.emailFromAddress ? `, from ${integrations.emailFromAddress}` : ''}`
              : 'Not configured — invites and password resets currently use the platform default.'}
          </p>
          <form onSubmit={handleSmtpSubmit} className="flex flex-col gap-3">
            <Input label="SMTP host" value={smtpHost} onChange={setSmtpHost} required />
            <Input label="SMTP port" type="number" value={smtpPort} onChange={setSmtpPort} required />
            <Input label="SMTP username" value={smtpUser} onChange={setSmtpUser} required />
            <Input label="SMTP password" type="password" value={smtpPassword} onChange={setSmtpPassword} required />
            <Input label="From address (optional)" type="email" value={fromAddress} onChange={setFromAddress} />
            <Button type="submit" loading={updateSmtp.isPending}>
              {integrations?.smtpConfigured ? 'Replace SMTP settings' : 'Save SMTP settings'}
            </Button>
          </form>
          {smtpError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {smtpError}
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
        <Card className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">AI API key</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            {integrations?.aiKeyConfigured
              ? `Configured — AI features use this organization's ${integrations.aiProvider === 'openai-compatible' ? 'Azure OpenAI / OpenAI-compatible' : 'Anthropic'} endpoint.`
              : 'Not configured — AI features currently use the platform default key.'}
          </p>
          <form onSubmit={handleAiKeySubmit} className="flex flex-col gap-3">
            <Select label="AI provider" value={aiProvider} onChange={(value) => setAiProvider(value as 'anthropic' | 'openai-compatible')} options={AI_PROVIDER_OPTIONS} />
            <Input label="AI API key" type="password" value={aiApiKey} onChange={setAiApiKey} required />
            {aiProvider === 'openai-compatible' && (
              <>
                <Input label="Base URL" value={aiBaseUrl} onChange={setAiBaseUrl} required placeholder="https://your-resource.openai.azure.com/openai/v1" />
                <Input label="Fast-tier model/deployment name" value={aiModelFast} onChange={setAiModelFast} required />
                <Input label="Standard-tier model/deployment name" value={aiModelStandard} onChange={setAiModelStandard} required />
              </>
            )}
            <Button type="submit" loading={updateAiKey.isPending}>
              {integrations?.aiKeyConfigured ? 'Replace AI API key' : 'Save AI API key'}
            </Button>
          </form>
          {aiKeyError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {aiKeyError}
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}>
        <Card className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">Public API</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            {integrations?.apiKeyConfigured
              ? `Active key: ${integrations.apiKeyPrefix}… (created ${new Date(integrations.apiKeyCreatedAt as string).toLocaleDateString()})`
              : 'No API key generated'}
          </p>
          {revealedApiKey && (
            <div className="mb-4 rounded-md bg-status-warning-bg p-3">
              <p className="mb-1 break-all font-mono text-sm text-status-warning">{revealedApiKey}</p>
              <p className="text-xs text-status-warning">Copy this now &mdash; it won&apos;t be shown again.</p>
            </div>
          )}
          <div className="flex gap-2">
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
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {apiKeyError}
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}>
        <Card className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">Webhooks</h2>
          <div className="flex flex-col gap-3">
            <Input
              label="Webhook URL"
              value={webhookUrlInput}
              onChange={setWebhookUrlInput}
              placeholder="https://your-ats.example.com/webhooks/exam-platform"
            />
            <Button loading={updateWebhookUrl.isPending} onClick={handleSaveWebhookUrl} className="self-start">
              Save URL
            </Button>
          </div>

          {revealedWebhookSecret && (
            <div className="mt-4 rounded-md bg-status-warning-bg p-3">
              <p className="mb-1 break-all font-mono text-sm text-status-warning">{revealedWebhookSecret}</p>
              <p className="text-xs text-status-warning">Copy this now &mdash; it won&apos;t be shown again.</p>
            </div>
          )}
          <Button
            className="mt-3"
            variant="secondary"
            loading={generateWebhookSecret.isPending}
            onClick={handleGenerateWebhookSecret}
          >
            {integrations?.webhookConfigured ? 'Regenerate signing secret' : 'Generate signing secret'}
          </Button>
          {webhookError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {webhookError}
            </p>
          )}

          <h3 className="mb-2 mt-5 text-sm font-semibold text-recruiter-text">Recent deliveries</h3>
          <Table columns={DELIVERY_COLUMNS} rows={deliveries ?? []} rowKey={(row) => row.id} emptyMessage="No deliveries yet." />
        </Card>
      </motion.div>
    </div>
  );
}
