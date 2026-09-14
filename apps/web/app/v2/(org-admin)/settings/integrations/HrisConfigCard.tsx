'use client';

// HRIS / ATS export: on candidate hire, POST a structured employee record to the org's HRIS inbound
// API / iPaaS endpoint (Merge, Workato, Zapier, or a custom endpoint). Bring-your-own URL + auth
// token. Workfox Azure tokens only.
import { useState } from 'react';
// Deep imports (not the ui-v2 barrel): the barrel re-exports DataTable, which pulls
// @tanstack/react-table (ESM-only) and breaks this component's jest test -- same note as
// EmbeddingConfigCard.
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { PasswordField } from '../../../../../components/ui-v2/PasswordField';
import { useToast } from '../../../../../components/ui';
import { useIntegrations, useUpdateHrisConfig } from '../../../../../lib/hooks/useIntegrations';

const ink = 'var(--ink)';
const toolBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.5 };
const errorText: React.CSSProperties = { fontSize: 12.5, color: 'var(--danger)' };

export function HrisConfigCard() {
  const { data: integrations } = useIntegrations();
  const update = useUpdateHrisConfig();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [authHeader, setAuthHeader] = useState('');
  const [error, setError] = useState<string | null>(null);

  const configured = integrations?.hrisExportConfigured ?? false;
  const enabled = integrations?.hrisExportEnabled ?? false;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!targetUrl.trim()) { setError('A target URL is required.'); return; }
    if (!/^https:\/\//i.test(targetUrl.trim())) { setError('The endpoint must be an https:// URL.'); return; }
    setError(null);
    update.mutate(
      { enabled: true, targetUrl: targetUrl.trim(), authHeader: authHeader.trim() || undefined },
      {
        onSuccess: () => { toast('HRIS export saved.'); setEditing(false); setAuthHeader(''); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save.'),
      },
    );
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

  return (
    <section style={card}>
      <h2 style={sectionTitle}>HRIS / ATS export</h2>
      <p style={desc}>
        {configured
          ? `${enabled ? 'Enabled' : 'Disabled'} — on hire, a structured employee record is posted to ${integrations?.hrisTargetUrl}.`
          : 'Not configured — hired candidates are not exported. Point this at your HRIS inbound API, an iPaaS (Merge, Workato), or a Zapier catch-hook to auto-create an employee record on hire.'}
      </p>
      <div style={{ marginTop: 14 }}>
        {configured && !editing ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={toggleEnabled} disabled={update.isPending}>
              {enabled ? 'Disable export' : 'Enable export'}
            </button>
            <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={() => { setEditing(true); setTargetUrl(integrations?.hrisTargetUrl ?? ''); }}>
              Replace configuration
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField id="hris-target-url" label="HRIS endpoint (https URL)" value={targetUrl} onChange={setTargetUrl} required autoComplete="off" />
            <PasswordField id="hris-auth-header" label={configured ? 'Authorization header (leave blank to keep current)' : 'Authorization header (e.g. Bearer xxx)'} value={authHeader} onChange={setAuthHeader} />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" loading={update.isPending}>{configured ? 'Save configuration' : 'Save & enable'}</Button>
              {configured && <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={() => { setEditing(false); setError(null); setAuthHeader(''); }}>Cancel</button>}
            </div>
          </form>
        )}
        {error && <p role="alert" style={{ ...errorText, marginTop: 10 }}>{error}</p>}
      </div>
    </section>
  );
}
