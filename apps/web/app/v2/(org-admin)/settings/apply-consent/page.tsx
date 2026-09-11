'use client';

// v2 Settings -> Applicant consent (Zoho #21). Edit the org's apply-consent statement,
// shown as a required checkbox on the public /apply and /walk-in forms before a candidate
// can submit. Layout/card styling mirrors settings/business-hours; the (org-admin) layout
// already gates entry to org_admin / acting super_admin, so no extra role check is needed here.
import { useEffect, useState } from 'react';
import { useApplyConsent, useUpdateApplyConsent } from '../../../../../lib/hooks/useApplyConsent';
// Imported directly from Button.tsx, not the ui-v2 barrel: the barrel re-exports DataTable,
// which pulls in @tanstack/react-table's ESM build and breaks under this repo's jest transform.
import { Button } from '../../../../../components/ui-v2/Button';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const textarea: React.CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 160,
  padding: '10px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))',
  background: 'var(--paper)',
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'inherit',
  resize: 'vertical',
};

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function V2ApplyConsentSettingsPage() {
  const { data, isLoading, isError } = useApplyConsent();
  const update = useUpdateApplyConsent();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', message: string) => {
    setNotice({ type, text: message });
    setTimeout(() => setNotice(null), 4000);
  };

  useEffect(() => {
    if (!data) return;
    setText(data.text ?? '');
  }, [data]);

  function handleSave() {
    update.mutate(
      { text: text.trim() ? text : null },
      {
        onSuccess: () => notify('success', 'Consent statement saved.'),
        onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to save the consent statement.'),
      },
    );
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Applicant consent</h1>
        <p style={{ ...desc, marginTop: 6 }}>
          Candidates must accept this statement before they can apply or register as a walk-in. Leave it blank to
          skip the consent step entirely.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          style={{
            marginBottom: 12,
            fontSize: 13,
            padding: '9px 13px',
            borderRadius: 9,
            border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`,
            background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)',
            color: notice.type === 'success' ? '#15803d' : 'var(--danger)',
          }}
        >
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load the consent statement.</p>}

      <div style={{ ...card, marginBottom: 16 }}>
        <label className="v2-label" htmlFor="apply-consent-text">Consent statement</label>
        <textarea
          id="apply-consent-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ ...textarea, marginTop: 6 }}
        />
        <p style={desc}>
          Saving a change bumps the consent version, so every future applicant is re-prompted -- even ones who
          already accepted an earlier version of this statement.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleSave} loading={update.isPending}>Save</Button>
      </div>
    </div>
  );
}
