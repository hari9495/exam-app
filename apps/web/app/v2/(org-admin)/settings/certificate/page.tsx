'use client';

// v2 Settings -> Certificate. Org-admin editor for the pass-certificate copy (one per org): title,
// body and signatory text with {{merge}} fields, on a fixed PDF layout. Mirrors settings/approval-emails.
// Imported directly from Button.tsx, not the ui-v2 barrel (the barrel pulls DataTable -> react-table
// ESM which breaks jest).
import { useEffect, useState } from 'react';
import {
  CERTIFICATE_VARIABLES,
  useCertificateTemplate,
  useUpsertCertificateTemplate,
} from '../../../../../lib/hooks/useCertificateTemplate';
import { Button } from '../../../../../components/ui-v2/Button';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const input: React.CSSProperties = { boxSizing: 'border-box', width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };
const textarea: React.CSSProperties = { ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 };

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function V2CertificateSettingsPage() {
  const { data, isLoading, isError } = useCertificateTemplate();
  const upsert = useUpsertCertificateTemplate();
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [signatoryName, setSignatoryName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setBodyText(data.bodyText);
    setSignatoryName(data.signatoryName ?? '');
    setEnabled(data.enabled);
  }, [data]);

  function handleSave() {
    upsert.mutate(
      { title: title.trim(), bodyText: bodyText.trim(), signatoryName: signatoryName.trim() || undefined, enabled },
      {
        onSuccess: () => { setNotice({ type: 'success', text: 'Certificate template saved.' }); setTimeout(() => setNotice(null), 4000); },
        onError: (err) => setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' }),
      },
    );
  }

  const canSave = Boolean(title.trim() && bodyText.trim());

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Certificate</h1>
        <p style={{ ...desc, marginTop: 6 }}>The wording of the PDF certificate issued to candidates who pass an exam (enable certificates per exam in its settings). The layout is fixed; these fields fill it in.</p>
        <p style={desc}>
          Variables: {CERTIFICATE_VARIABLES.map((v) => (
            <code key={v} style={{ marginRight: 6, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v}</code>
          ))}
        </p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load the certificate template.</p>}

      {data && (
        <div style={card}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)' }}>
            <input type="checkbox" aria-label="Certificate enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }} />
            Use this custom wording (uncheck to fall back to the built-in default)
          </label>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label htmlFor="cert-title" className="v2-label">Title</label>
              <input id="cert-title" aria-label="Certificate title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...input, marginTop: 6 }} />
            </div>
            <div>
              <label htmlFor="cert-body" className="v2-label">Body</label>
              <textarea id="cert-body" aria-label="Certificate body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={5} style={{ ...textarea, marginTop: 6 }} />
            </div>
            <div style={{ maxWidth: 360 }}>
              <label htmlFor="cert-signatory" className="v2-label">Signatory (optional)</label>
              <input id="cert-signatory" aria-label="Certificate signatory" type="text" value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} placeholder="e.g. Jordan Lee, Head of Hiring" style={{ ...input, marginTop: 6 }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button onClick={handleSave} loading={upsert.isPending} disabled={!canSave}>Save certificate</Button>
          </div>
        </div>
      )}
    </div>
  );
}
