'use client';

// Integrations "WhatsApp" section -- catalog-driven (GET /organizations/whatsapp-providers), so
// adding a provider server-side (see apps/api/src/whatsapp/providers) needs no web change: this
// card just renders whatever configFields the selected provider declares. Deep-imports only (new
// file) to dodge the ui-v2 barrel's @tanstack/react-table pull-in (see ScheduleInterviewModal.test.tsx).
import { useEffect, useState } from 'react';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { PasswordField } from '../../../../../components/ui-v2/PasswordField';
import { Combobox } from '../../../../../components/ui-v2/Combobox';
import { Button } from '../../../../../components/ui-v2/Button';
import { useWhatsappProviders, useWhatsappConfig, useUpdateWhatsappConfig } from '../../../../../lib/hooks/useWhatsappConfig';
import type { WhatsappConfigField } from '../../../../../lib/types';

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' };
const errorText: React.CSSProperties = { fontSize: 12.5, color: 'var(--danger)', margin: 0 };
const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--muted)', margin: '4px 0 0' };

// Secret fields never arrive from the server (GET strips them) and a blank one on save keeps the
// existing value (see apps/api organizations.service.ts putWhatsappConfig) -- so they always seed
// blank here; only non-secret fields pre-fill from the saved (non-secret) config blob.
function seedValues(fields: WhatsappConfigField[], config: Record<string, unknown>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of fields) {
    if (field.secret) {
      next[field.key] = '';
      continue;
    }
    const raw = config[field.key];
    next[field.key] = typeof raw === 'string' ? raw : raw != null ? String(raw) : '';
  }
  return next;
}

export function WhatsappConfigCard() {
  const { data: providers } = useWhatsappProviders();
  const { data: config } = useWhatsappConfig();
  const update = useUpdateWhatsappConfig();

  const [enabled, setEnabled] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [providerTouched, setProviderTouched] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // One-shot hydrate from the loaded config -- same pattern as the SMTP card's integrations sync
  // in the parent page. Doesn't re-run once the recruiter has picked a different provider locally.
  useEffect(() => {
    if (!config) return;
    setEnabled(config.whatsappEnabled);
    if (!providerTouched) setProviderId(config.whatsappProvider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.whatsappEnabled, config?.whatsappProvider]);

  const provider = (providers ?? []).find((p) => p.id === providerId);

  // Re-seeds field values whenever the selected provider (or the loaded config) changes --
  // switching providers always starts that provider's own fields fresh from its own saved blob,
  // never carries over a previous provider's typed-in values.
  useEffect(() => {
    if (!provider) return;
    setValues(seedValues(provider.configFields, config?.config ?? {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id, config?.config]);

  function handleFieldChange(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    update.mutate(
      { whatsappEnabled: enabled, whatsappProvider: providerId, config: values },
      { onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save WhatsApp settings') },
    );
  }

  const providerOptions = (providers ?? []).map((p) => ({ value: p.id, label: p.label }));

  return (
    <section style={card}>
      <h2 style={sectionTitle}>WhatsApp</h2>
      <p style={desc}>
        {config?.configured
          ? `Configured — sending via ${provider?.label ?? config.whatsappProvider}${config.whatsappEnabled ? '' : ' (currently disabled)'}`
          : "Not configured — WhatsApp messages won't send until a provider is set up."}
      </p>
      <form onSubmit={handleSave} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable WhatsApp messaging
        </label>
        <div>
          <label className="v2-label">Provider</label>
          <Combobox
            width="100%"
            value={providerId}
            onChange={(v) => { setProviderTouched(true); setProviderId(v); }}
            options={providerOptions}
          />
        </div>
        {provider?.configFields.map((field) =>
          field.secret ? (
            <div key={field.key}>
              <PasswordField
                id={`wa-${field.key}`}
                label={field.label}
                value={values[field.key] ?? ''}
                onChange={(v) => handleFieldChange(field.key, v)}
                required={field.required && !config?.configured}
              />
              <p style={hint}>{config?.configured ? 'Configured — leave blank to keep the existing value.' : 'Not set.'}</p>
            </div>
          ) : (
            <TextField
              key={field.key}
              id={`wa-${field.key}`}
              label={field.label}
              value={values[field.key] ?? ''}
              onChange={(v) => handleFieldChange(field.key, v)}
              placeholder={field.placeholder}
              required={field.required}
            />
          ),
        )}
        <div>
          <Button type="submit" loading={update.isPending}>Save WhatsApp settings</Button>
        </div>
        {error && <p role="alert" style={errorText}>{error}</p>}
      </form>
    </section>
  );
}
