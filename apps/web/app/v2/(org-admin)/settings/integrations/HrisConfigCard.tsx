'use client';

// HRIS / ATS export: on candidate hire, push a hire record to the org's ATS/HRIS. Either the
// generic endpoint (POST a structured record to any inbound API / iPaaS / Zapier), or a vendor
// preset (Greenhouse, Lever, BambooHR, Workday) that maps to that system's API. Bring-your-own
// credentials, inert until configured. Workfox Azure tokens only.
import { useState } from 'react';
// Deep imports (not the ui-v2 barrel): the barrel re-exports DataTable, which pulls
// @tanstack/react-table (ESM-only) and breaks this component's jest test -- same note as
// EmbeddingConfigCard.
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { PasswordField } from '../../../../../components/ui-v2/PasswordField';
import { Combobox } from '../../../../../components/ui-v2/Combobox';
import { useToast } from '../../../../../components/ui';
import { useIntegrations, useUpdateHrisConfig, HrisConfigInput } from '../../../../../lib/hooks/useIntegrations';

const ink = 'var(--ink)';
const toolBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.5 };
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 500, color: ink, marginBottom: 6 };
const errorText: React.CSSProperties = { fontSize: 12.5, color: 'var(--danger)' };

const PROVIDER_OPTIONS = [
  { value: 'generic', label: 'Generic endpoint' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'bamboohr', label: 'BambooHR' },
  { value: 'workday', label: 'Workday (beta)' },
];
const PROVIDER_LABEL: Record<string, string> = Object.fromEntries(PROVIDER_OPTIONS.map((o) => [o.value, o.label]));

export function HrisConfigCard() {
  const { data: integrations } = useIntegrations();
  const update = useUpdateHrisConfig();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState('generic');
  const [targetUrl, setTargetUrl] = useState('');
  const [authHeader, setAuthHeader] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [onBehalfOf, setOnBehalfOf] = useState('');
  const [performAs, setPerformAs] = useState('');
  const [error, setError] = useState<string | null>(null);

  const configured = integrations?.hrisExportConfigured ?? false;
  const enabled = integrations?.hrisExportEnabled ?? false;
  const currentProvider = integrations?.hrisProvider ?? 'generic';
  const sameProviderConfigured = configured && currentProvider === provider;
  const needsUrl = provider === 'generic' || provider === 'workday';

  function startEditing() {
    setProvider(currentProvider);
    setTargetUrl(integrations?.hrisTargetUrl ?? '');
    setAuthHeader('');
    setApiKey('');
    setSubdomain('');
    setOnBehalfOf('');
    setPerformAs('');
    setError(null);
    setEditing(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (needsUrl) {
      if (!targetUrl.trim()) { setError('An endpoint URL is required.'); return; }
      if (!/^https:\/\//i.test(targetUrl.trim())) { setError('The endpoint must be an https:// URL.'); return; }
    }
    // Require the vendor key on first-time setup for a provider; blank keeps the existing key when
    // re-saving the same already-configured provider (the server merges it).
    if (!sameProviderConfigured && provider !== 'generic' && !apiKey.trim()) {
      setError('An API key / token is required.'); return;
    }
    setError(null);

    const base: HrisConfigInput = { enabled: true, provider };
    const input: HrisConfigInput =
      provider === 'generic' ? { ...base, targetUrl: targetUrl.trim(), authHeader: authHeader.trim() || undefined }
      : provider === 'workday' ? { ...base, targetUrl: targetUrl.trim(), apiKey: apiKey.trim() || undefined }
      : provider === 'greenhouse' ? { ...base, apiKey: apiKey.trim() || undefined, onBehalfOf: onBehalfOf.trim() || undefined }
      : provider === 'lever' ? { ...base, apiKey: apiKey.trim() || undefined, performAs: performAs.trim() || undefined }
      : { ...base, apiKey: apiKey.trim() || undefined, subdomain: subdomain.trim() || undefined }; // bamboohr

    update.mutate(input, {
      onSuccess: () => { toast('HRIS export saved.'); setEditing(false); setApiKey(''); setAuthHeader(''); },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save.'),
    });
  }

  function toggleEnabled() {
    update.mutate(
      { enabled: !enabled },
      {
        onSuccess: () => toast(enabled ? 'HRIS export disabled.' : 'HRIS export enabled.'),
        onError: (err) => toast(err instanceof Error ? err.message : 'Failed to update.', 'error'),
      },
    );
  }

  const secretKeyLabel = sameProviderConfigured ? 'API key / token (leave blank to keep current)' : 'API key / token';

  return (
    <section style={card}>
      <h2 style={sectionTitle}>HRIS / ATS export</h2>
      <p style={desc}>
        {configured
          ? `${enabled ? 'Enabled' : 'Disabled'} — ${PROVIDER_LABEL[currentProvider] ?? currentProvider}. On hire, a candidate/employee record is pushed to your ATS/HRIS.`
          : 'Not configured — hired candidates are not exported. Connect a vendor (Greenhouse, Lever, BambooHR, Workday) or point the generic endpoint at your HRIS inbound API / iPaaS / Zapier catch-hook.'}
      </p>
      <div style={{ marginTop: 14 }}>
        {configured && !editing ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={toggleEnabled} disabled={update.isPending}>
              {enabled ? 'Disable export' : 'Enable export'}
            </button>
            <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={startEditing}>
              Replace configuration
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={fieldLabel} htmlFor="hris-provider">Provider</label>
              <Combobox options={PROVIDER_OPTIONS} value={provider} onChange={setProvider} width="100%" />
            </div>

            {provider === 'generic' && (
              <>
                <TextField id="hris-target-url" label="HRIS endpoint (https URL)" value={targetUrl} onChange={setTargetUrl} required autoComplete="off" />
                <PasswordField id="hris-auth-header" label={sameProviderConfigured ? 'Authorization header (leave blank to keep current)' : 'Authorization header (e.g. Bearer xxx)'} value={authHeader} onChange={setAuthHeader} />
              </>
            )}
            {provider === 'workday' && (
              <>
                <TextField id="hris-target-url" label="Workday inbound endpoint (https URL)" value={targetUrl} onChange={setTargetUrl} required autoComplete="off" />
                <PasswordField id="hris-api-key" label={secretKeyLabel} value={apiKey} onChange={setApiKey} />
              </>
            )}
            {provider === 'greenhouse' && (
              <>
                <PasswordField id="hris-api-key" label={sameProviderConfigured ? 'Harvest API key (leave blank to keep current)' : 'Harvest API key'} value={apiKey} onChange={setApiKey} />
                <TextField id="hris-on-behalf-of" label="Greenhouse user id (On-Behalf-Of)" value={onBehalfOf} onChange={setOnBehalfOf} autoComplete="off" />
              </>
            )}
            {provider === 'lever' && (
              <>
                <PasswordField id="hris-api-key" label={sameProviderConfigured ? 'Lever API key (leave blank to keep current)' : 'Lever API key'} value={apiKey} onChange={setApiKey} />
                <TextField id="hris-perform-as" label="Lever user id (perform as)" value={performAs} onChange={setPerformAs} autoComplete="off" />
              </>
            )}
            {provider === 'bamboohr' && (
              <>
                <TextField id="hris-subdomain" label="BambooHR company subdomain" value={subdomain} onChange={setSubdomain} autoComplete="off" />
                <PasswordField id="hris-api-key" label={sameProviderConfigured ? 'BambooHR API key (leave blank to keep current)' : 'BambooHR API key'} value={apiKey} onChange={setApiKey} />
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" loading={update.isPending}>{configured ? 'Save configuration' : 'Save & enable'}</Button>
              {configured && <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={() => { setEditing(false); setError(null); }}>Cancel</button>}
            </div>
          </form>
        )}
        {error && <p role="alert" style={{ ...errorText, marginTop: 10 }}>{error}</p>}
      </div>
    </section>
  );
}
