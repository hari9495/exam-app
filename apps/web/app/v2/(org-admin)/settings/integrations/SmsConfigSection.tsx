'use client';

// SMS provider config card (Zoho #16, reshaped for catalog-driven providers) -- mirrors the
// Email (SMTP) section of this same Integrations page: enabled toggle, provider picker, then
// that provider's fields (secret fields write-only -- shows "Configured", never renders the
// value). A separate component (not inlined in page.tsx) so it's unit-testable on its own;
// deep-imports ui-v2 (no barrel).
import { useEffect, useState } from 'react';
import { useSmsConfig, useSmsProviders, useUpdateSmsConfig } from '../../../../../lib/hooks/useSmsConfig';
import { SmsConfigField } from '../../../../../lib/types';
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { PasswordField } from '../../../../../components/ui-v2/PasswordField';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const errorText: React.CSSProperties = { fontSize: 12.5, color: 'var(--danger)', margin: 0 };
const configuredNote: React.CSSProperties = { fontSize: 12, color: muted, margin: '4px 0 0' };
// Same secondary-button look as ui-v2/DataTable.tsx's `dt.toolBtn` (canonical secondary per
// [[feedback_button_sizing_consistent]]), inlined here rather than imported: DataTable.tsx pulls
// in @tanstack/react-table, which isn't transformed under ts-jest and breaks this file's tests.
const toolBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };

export function SmsConfigSection() {
  const { data: smsConfig } = useSmsConfig();
  const { data: providers } = useSmsProviders();
  const updateSmsConfig = useUpdateSmsConfig();

  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const catalog = providers ?? [];
  const selectedProvider = catalog.find((p) => p.id === provider);
  const currentProviderLabel = catalog.find((p) => p.id === smsConfig?.smsProvider)?.label ?? smsConfig?.smsProvider;
  // The "Configured" note on a secret field only applies while editing the SAME provider the
  // server already has credentials for -- switching providers means starting from scratch.
  const isCurrentProvider = provider === smsConfig?.smsProvider;

  // Not-yet-configured orgs render the form straight away (no "Edit" gate) -- seed its state
  // once the catalog/config have loaded, the same defaults startEditing() would apply.
  useEffect(() => {
    if (!editing && !provider && catalog.length > 0) {
      const initialProvider = smsConfig?.smsProvider ?? catalog[0]?.id ?? '';
      setEnabled(smsConfig?.smsEnabled ?? false);
      setProvider(initialProvider);
      setFieldValues(prefillFor(initialProvider));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.length, smsConfig, editing, provider]);

  function startEditing() {
    setEnabled(smsConfig?.smsEnabled ?? false);
    const initialProvider = smsConfig?.smsProvider ?? catalog[0]?.id ?? '';
    setProvider(initialProvider);
    setFieldValues(prefillFor(initialProvider));
    setError(null);
    setEditing(true);
  }

  function prefillFor(providerId: string): Record<string, string> {
    const fields = catalog.find((p) => p.id === providerId)?.configFields ?? [];
    const values: Record<string, string> = {};
    for (const field of fields) {
      // Secret fields are never returned by the server -- always start blank.
      values[field.key] = !field.secret && providerId === smsConfig?.smsProvider ? (smsConfig?.config[field.key] ?? '') : '';
    }
    return values;
  }

  function handleProviderChange(newProviderId: string) {
    setProvider(newProviderId);
    setFieldValues(prefillFor(newProviderId));
  }

  function setFieldValue(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const config: Record<string, string> = {};
    for (const field of selectedProvider?.configFields ?? []) {
      const value = fieldValues[field.key] ?? '';
      // Blank secret -> omit so the server keeps the existing value; non-secret fields are
      // always sent as entered.
      if (field.secret) {
        if (value.trim()) config[field.key] = value;
      } else {
        config[field.key] = value;
      }
    }
    updateSmsConfig.mutate(
      { smsEnabled: enabled, smsProvider: provider, config },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save SMS settings'),
      },
    );
  }

  return (
    <section style={card}>
      <h2 style={sectionTitle}>SMS</h2>
      <p style={desc}>
        {smsConfig?.configured
          ? `Configured — ${currentProviderLabel}${smsConfig.smsEnabled ? '' : ' (disabled)'}`
          : 'Not configured — candidate SMS sends are inert until a provider is set up.'}
      </p>
      <div style={{ marginTop: 14 }}>
        {smsConfig?.configured && !editing ? (
          <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={startEditing}>Edit SMS settings</button>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: ink, cursor: 'pointer' }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enable SMS sending
            </label>
            <div>
              <label htmlFor="sms-provider" className="v2-label">Provider</label>
              <select
                id="sms-provider"
                className="v2-field"
                value={provider || catalog[0]?.id || ''}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {catalog.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            {(selectedProvider?.configFields ?? []).map((field) => (
              <SmsConfigFieldInput
                key={field.key}
                field={field}
                value={fieldValues[field.key] ?? ''}
                onChange={(v) => setFieldValue(field.key, v)}
                showConfiguredNote={isCurrentProvider && field.secret && Boolean(smsConfig?.configured)}
              />
            ))}
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

function SmsConfigFieldInput({
  field, value, onChange, showConfiguredNote,
}: { field: SmsConfigField; value: string; onChange: (v: string) => void; showConfiguredNote: boolean }) {
  const id = `sms-field-${field.key}`;
  const label = showConfiguredNote ? `${field.label} (leave blank to keep existing)` : field.label;
  if (field.secret) {
    return (
      <div>
        <PasswordField id={id} label={label} value={value} onChange={onChange} required={field.required && !showConfiguredNote} />
        {showConfiguredNote && <p style={configuredNote}>Configured</p>}
      </div>
    );
  }
  return <TextField id={id} label={field.label} value={value} onChange={onChange} required={field.required} placeholder={field.placeholder} />;
}
