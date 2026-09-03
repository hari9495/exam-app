'use client';

// v2 SSO (org-admin). Format-only re-skin of the old (org-admin)/settings/sso page on v2
// primitives + tokens. Same hooks (useSsoSettings / useUpdateSsoSettings, useAuth), same
// edit-gating, save/toggle logic, validation and metadata URL; only presentation changes
// (old ui kit → ui-v2, CollapsibleSection → a static card).
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSsoSettings, useUpdateSsoSettings } from '../../../../../lib/hooks/useSso';
import { useAuth } from '../../../../../lib/auth-context';
import { Button, TextField, dt } from '../../../../../components/ui-v2';
import { STATUS } from '../../../../../components/ui-v2/viz';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };

export default function V2SsoSettingsPage() {
  const { organizationSlug } = useAuth();
  const { data: sso } = useSsoSettings();
  const updateSso = useUpdateSsoSettings();

  const [entityId, setEntityId] = useState('');
  const [ssoUrl, setSsoUrl] = useState('');
  const [certificate, setCertificate] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Once IdP settings exist, the form stays hidden behind an explicit Edit step so a
  // stray edit can't silently break a working SSO trust relationship.
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (sso?.samlIdpEntityId != null) setEntityId(sso.samlIdpEntityId);
    if (sso?.samlIdpSsoUrl != null) setSsoUrl(sso.samlIdpSsoUrl);
    if (sso?.samlIdpCertificate != null) setCertificate(sso.samlIdpCertificate);
  }, [sso?.samlIdpEntityId, sso?.samlIdpSsoUrl, sso?.samlIdpCertificate]);

  const apiOrigin = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';
  const metadataUrl = `${apiOrigin}/auth/saml/${organizationSlug}/metadata`;

  const idpConfigured = Boolean(sso?.samlIdpEntityId || sso?.samlIdpSsoUrl || sso?.samlIdpCertificate);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    updateSso.mutate(
      { samlIdpEntityId: entityId, samlIdpSsoUrl: ssoUrl, samlIdpCertificate: certificate },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save SSO settings'),
      },
    );
  }

  function handleToggleEnabled() {
    setError(null);
    updateSso.mutate(
      { samlEnabled: !sso?.samlEnabled },
      { onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update SSO status') },
    );
  }

  const toggleDisabled = !sso?.samlEnabled && (!entityId || !ssoUrl || !certificate);

  const enabled = Boolean(sso?.samlEnabled);

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Single Sign-On</h1>
        <p style={{ ...desc, marginTop: 6 }}>Let staff sign in through your identity provider with SAML.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Status hero */}
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', background: enabled ? 'color-mix(in srgb, var(--org-primary) 6%, var(--paper))' : 'var(--paper)', borderColor: enabled ? 'color-mix(in srgb, var(--org-primary) 22%, var(--hair))' : 'color-mix(in srgb, var(--ink) 12%, var(--hair))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, background: enabled ? 'color-mix(in srgb, var(--org-primary) 14%, transparent)' : 'color-mix(in srgb, var(--ink) 6%, transparent)', color: enabled ? 'var(--org-primary)' : muted, flexShrink: 0 }}>
              <ShieldCheck size={22} />
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={sectionTitle}>SAML single sign-on</h2>
                <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 99, padding: '2px 10px', background: enabled ? 'color-mix(in srgb, ' + STATUS.ok + ' 14%, transparent)' : 'color-mix(in srgb, var(--ink) 8%, transparent)', color: enabled ? STATUS.ok : muted }}>{enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <p style={{ ...desc, marginTop: 4 }}>{enabled ? 'Staff can sign in through your identity provider.' : idpConfigured ? 'Configured — enable to let staff use SSO.' : 'Add your IdP details below, then enable.'}</p>
            </div>
          </div>
          {enabled ? (
            <button type="button" className="v2-hoverbtn" onClick={handleToggleEnabled} disabled={updateSso.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Disable SSO</button>
          ) : (
            <Button loading={updateSso.isPending} onClick={handleToggleEnabled} disabled={toggleDisabled}>Enable SSO</Button>
          )}
        </div>

        {/* Service Provider metadata */}
        <section style={card}>
          <h2 style={sectionTitle}>Service provider metadata</h2>
          <p style={desc}>Give this URL to your IdP admin when setting up the SAML app.</p>
          <div style={{ borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--hair)', padding: 12, marginTop: 14 }}>
            <p style={{ margin: 0, wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: 12, color: ink }}>{metadataUrl}</p>
          </div>
        </section>

        {/* IdP configuration */}
        <section style={card}>
          <h2 style={sectionTitle}>Identity provider details</h2>
          <p style={desc}>{idpConfigured ? 'The SAML trust with your IdP.' : 'Paste these from your IdP’s SAML app.'}</p>

        {idpConfigured && !editing ? (
          <div style={{ marginTop: 16 }}>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 4, fontSize: 13, color: muted, margin: 0 }}>
              <dt style={{ fontWeight: 500 }}>Microsoft Entra Identifier</dt>
              <dd style={{ margin: 0, wordBreak: 'break-all' }}>{sso?.samlIdpEntityId ?? '—'}</dd>
              <dt style={{ fontWeight: 500 }}>SSO Url</dt>
              <dd style={{ margin: 0, wordBreak: 'break-all' }}>{sso?.samlIdpSsoUrl ?? '—'}</dd>
              <dt style={{ fontWeight: 500 }}>IdP Certificate</dt>
              <dd style={{ margin: 0 }}>{sso?.samlIdpCertificate ? 'Provided' : '—'}</dd>
            </dl>
            <div style={{ marginTop: 14 }}>
              <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => setEditing(true)}>Edit IdP settings</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <TextField id="saml-entity" label="Microsoft Entra Identifier" value={entityId} onChange={setEntityId} required />
              <TextField id="saml-url" label="SSO Url" value={ssoUrl} onChange={setSsoUrl} required />
            </div>
            <div>
              <label htmlFor="saml-cert" className="v2-label">IdP Certificate</label>
              <textarea
                id="saml-cert"
                value={certificate}
                onChange={(e) => setCertificate(e.target.value)}
                required
                rows={6}
                placeholder="-----BEGIN CERTIFICATE-----"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 12, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: ink, outline: 'none', resize: 'vertical', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" loading={updateSso.isPending}>Save IdP settings</Button>
              {idpConfigured && (
                <button
                  type="button"
                  className="v2-hoverbtn"
                  style={dt.toolBtn}
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                    setEntityId(sso?.samlIdpEntityId ?? '');
                    setSsoUrl(sso?.samlIdpSsoUrl ?? '');
                    setCertificate(sso?.samlIdpCertificate ?? '');
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', margin: '12px 0 0' }}>{error}</p>}
        </section>
      </div>
    </div>
  );
}
