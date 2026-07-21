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
import { Input, Button, Card, CardGrid, useToast } from '../../../../components/ui';
import { WebhookDeliveryRow } from '../../../../lib/types';
import { motion } from 'framer-motion';

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

  const [aiApiKey, setAiApiKey] = useState('');
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
    updateAiKey.mutate(aiApiKey, {
      onSuccess: () => {
        toast('AI API key saved.');
        setAiApiKey('');
      },
      onError: (err) => setAiKeyError(err instanceof Error ? err.message : 'Failed to save AI API key'),
    });
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

  function renderDeliveryCard(row: WebhookDeliveryRow) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-semibold text-recruiter-text">{row.eventType}</span>
          <span className="text-xs text-recruiter-text-tertiary">{row.status}</span>
        </div>
        <div className="flex items-center justify-between border-t border-recruiter-border pt-2 text-xs text-recruiter-text-tertiary">
          <span>HTTP <span>{row.httpStatusCode ?? '—'}</span></span>
          <span>{new Date(row.createdAt).toLocaleString()}</span>
        </div>
      </div>
    );
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
              ? 'Configured — AI features use this organization\'s own Anthropic key.'
              : 'Not configured — AI features currently use the platform default key.'}
          </p>
          <form onSubmit={handleAiKeySubmit} className="flex flex-col gap-3">
            <Input label="AI API key" type="password" value={aiApiKey} onChange={setAiApiKey} required />
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
          <CardGrid items={deliveries ?? []} cardKey={(row) => row.id} renderCard={renderDeliveryCard} emptyMessage="No deliveries yet." />
        </Card>
      </motion.div>
    </div>
  );
}
