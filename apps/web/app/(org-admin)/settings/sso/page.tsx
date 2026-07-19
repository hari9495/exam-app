'use client';

import { useEffect, useState } from 'react';
import { useSsoSettings, useUpdateSsoSettings } from '../../../../lib/hooks/useSso';
import { useAuth } from '../../../../lib/auth-context';
import { Input, Button, Card } from '../../../../components/ui';

export default function SsoSettingsPage() {
  const { organizationSlug } = useAuth();
  const { data: sso } = useSsoSettings();
  const updateSso = useUpdateSsoSettings();

  const [entityId, setEntityId] = useState('');
  const [ssoUrl, setSsoUrl] = useState('');
  const [certificate, setCertificate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sso?.samlIdpEntityId != null) setEntityId(sso.samlIdpEntityId);
    if (sso?.samlIdpSsoUrl != null) setSsoUrl(sso.samlIdpSsoUrl);
    if (sso?.samlIdpCertificate != null) setCertificate(sso.samlIdpCertificate);
  }, [sso?.samlIdpEntityId, sso?.samlIdpSsoUrl, sso?.samlIdpCertificate]);

  const apiOrigin = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';
  const metadataUrl = `${apiOrigin}/auth/saml/${organizationSlug}/metadata`;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    updateSso.mutate(
      { samlIdpEntityId: entityId, samlIdpSsoUrl: ssoUrl, samlIdpCertificate: certificate },
      { onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save SSO settings') },
    );
  }

  function handleToggleEnabled() {
    setError(null);
    updateSso.mutate(
      { samlEnabled: !sso?.samlEnabled },
      { onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update SSO status') },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-recruiter-text">Single Sign-On</h1>

      <Card className="max-w-lg">
        <h2 className="mb-1 text-lg font-semibold text-recruiter-text">SAML configuration</h2>
        <p className="mb-4 text-sm text-recruiter-text-secondary">
          {sso?.samlEnabled ? 'Configured and enabled — staff can log in via SSO.' : 'Not configured — staff use password login only.'}
        </p>

        <div className="mb-4 rounded-md bg-recruiter-bg-subtle p-3">
          <p className="mb-1 text-xs font-semibold text-recruiter-text-secondary">Give this to your IdP admin</p>
          <p className="break-all font-mono text-xs text-recruiter-text">{metadataUrl}</p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <Input label="IdP Entity ID" value={entityId} onChange={setEntityId} required />
          <Input label="IdP SSO URL" value={ssoUrl} onChange={setSsoUrl} required />
          <label className="flex flex-col gap-1 text-sm font-medium text-recruiter-text">
            IdP Certificate
            <textarea
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
              required
              rows={6}
              className="rounded border border-recruiter-border p-2 font-mono text-xs"
              placeholder="-----BEGIN CERTIFICATE-----"
            />
          </label>
          <Button type="submit" loading={updateSso.isPending}>
            Save IdP settings
          </Button>
        </form>

        <Button
          className="mt-3"
          variant="secondary"
          loading={updateSso.isPending}
          onClick={handleToggleEnabled}
          disabled={!sso?.samlEnabled && (!entityId || !ssoUrl || !certificate)}
        >
          {sso?.samlEnabled ? 'Disable SSO' : 'Enable SSO'}
        </Button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
