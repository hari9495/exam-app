'use client';

// SMS (Twilio) config card (Zoho #16) -- mirrors the Email (SMTP) section of this same
// Integrations page: enabled toggle, Account SID, Auth Token (write-only -- shows "Configured",
// never renders the token), From number. A separate component (not inlined in page.tsx) so it's
// unit-testable on its own; deep-imports ui-v2 (new file, no barrel).
import { useState } from 'react';
import { useSmsConfig, useUpdateSmsConfig } from '../../../../../lib/hooks/useSmsConfig';
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { PasswordField } from '../../../../../components/ui-v2/PasswordField';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const errorText: React.CSSProperties = { fontSize: 12.5, color: 'var(--danger)', margin: 0 };
// Same secondary-button look as ui-v2/DataTable.tsx's `dt.toolBtn` (canonical secondary per
// [[feedback_button_sizing_consistent]]), inlined here rather than imported: DataTable.tsx pulls
// in @tanstack/react-table, which isn't transformed under ts-jest and breaks this file's tests.
const toolBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };

export function SmsConfigSection() {
  const { data: smsConfig } = useSmsConfig();
  const updateSmsConfig = useUpdateSmsConfig();

  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setEnabled(smsConfig?.smsEnabled ?? false);
    setAccountSid(smsConfig?.smsAccountSid ?? '');
    setAuthToken('');
    setFromNumber(smsConfig?.smsFromNumber ?? '');
    setError(null);
    setEditing(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    updateSmsConfig.mutate(
      { smsEnabled: enabled, smsAccountSid: accountSid, smsFromNumber: fromNumber, ...(authToken.trim() ? { smsAuthToken: authToken } : {}) },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save SMS settings'),
      },
    );
  }

  return (
    <section style={card}>
      <h2 style={sectionTitle}>SMS (Twilio)</h2>
      <p style={desc}>
        {smsConfig?.configured
          ? `Configured — ${smsConfig.smsAccountSid} · from ${smsConfig.smsFromNumber}${smsConfig.smsEnabled ? '' : ' (disabled)'}`
          : 'Not configured — candidate SMS sends are inert until Twilio credentials are set.'}
      </p>
      <div style={{ marginTop: 14 }}>
        {smsConfig?.configured && !editing ? (
          <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={startEditing}>Edit SMS settings</button>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: ink, cursor: 'pointer' }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enable SMS sending
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <TextField id="sms-account-sid" label="Account SID" value={accountSid} onChange={setAccountSid} required />
              <PasswordField
                id="sms-auth-token"
                label={smsConfig?.configured ? 'Auth Token (leave blank to keep existing)' : 'Auth Token'}
                value={authToken}
                onChange={setAuthToken}
                required={!smsConfig?.configured}
              />
            </div>
            <TextField id="sms-from-number" label="From Number" value={fromNumber} onChange={setFromNumber} placeholder="+15551234567" required />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" loading={updateSmsConfig.isPending}>Save SMS settings</Button>
              {smsConfig?.configured && (
                <button
                  type="button"
                  className="v2-hoverbtn"
                  style={toolBtn}
                  onClick={() => { setEditing(false); setError(null); }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
        {error && <p role="alert" style={{ ...errorText, marginTop: 10 }}>{error}</p>}
      </div>
    </section>
  );
}
