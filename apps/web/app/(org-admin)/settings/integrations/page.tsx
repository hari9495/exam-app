'use client';

import { useState } from 'react';
import { useIntegrations, useUpdateSmtpSettings, useUpdateAiKey } from '../../../../lib/hooks/useIntegrations';
import { Input, Button, Card, useToast } from '../../../../components/ui';

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

  function handleSmtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSmtpError(null);
    updateSmtp.mutate(
      { host: smtpHost, port: parseInt(smtpPort, 10), user: smtpUser, password: smtpPassword, fromAddress },
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-recruiter-text">Integrations</h1>

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
    </div>
  );
}
