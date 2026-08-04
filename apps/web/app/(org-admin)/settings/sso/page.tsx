'use client';

import { useEffect, useState } from 'react';
import { useSsoSettings, useUpdateSsoSettings } from '../../../../lib/hooks/useSso';
import { useAuth } from '../../../../lib/auth-context';
import { motion } from 'framer-motion';
import { Input, Button, CollapsibleSection, RequiredFieldsNote } from '../../../../components/ui';

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-center text-2xl font-semibold text-recruiter-text">Single Sign-On</h1>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        <CollapsibleSection title="SAML configuration">
          <p className="text-sm text-recruiter-text-secondary sm:col-span-2">
            {sso?.samlEnabled ? 'Configured and enabled — staff can log in via SSO.' : 'Not configured — staff use password login only.'}
          </p>

          <div className="rounded-md bg-recruiter-bg-subtle p-3 sm:col-span-2">
            <p className="mb-1 text-xs font-semibold text-recruiter-text-secondary">Give this to your IdP admin</p>
            <p className="break-all font-mono text-xs text-recruiter-text">{metadataUrl}</p>
          </div>

          <div className="sm:col-span-2">
            <RequiredFieldsNote />
          </div>
          <form onSubmit={handleSave} className="contents">
            <Input label="Microsoft Entra Identifier" value={entityId} onChange={setEntityId} required />
            <Input label="SSO Url" value={ssoUrl} onChange={setSsoUrl} required />
            <label className="flex flex-col gap-1 text-sm font-medium text-recruiter-text after:ml-0.5 after:text-status-danger after:content-['*'] sm:col-span-2">
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
            <div className="sm:col-span-2">
              <Button type="submit" loading={updateSso.isPending}>
                Save IdP settings
              </Button>
            </div>
          </form>

          <div className="sm:col-span-2">
            <Button
              variant={sso?.samlEnabled ? 'danger' : 'primary'}
              loading={updateSso.isPending}
              onClick={handleToggleEnabled}
              disabled={!sso?.samlEnabled && (!entityId || !ssoUrl || !certificate)}
            >
              {sso?.samlEnabled ? 'Disable SSO' : 'Enable SSO'}
            </Button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {error}
            </p>
          )}
        </CollapsibleSection>
      </motion.div>
    </div>
  );
}
