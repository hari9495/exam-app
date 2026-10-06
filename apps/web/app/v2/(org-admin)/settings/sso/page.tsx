'use client';

// v2 Single sign-on (org-admin), P12 YX-IAM-04/05: several identity providers per company --
// any SAML IdP, Google, Microsoft Entra or another OpenID Connect provider -- each with the email
// domains it signs in for and an optional just-in-time rule. Saving asks the admin to confirm it
// is them (step-up), handled by apiFetch.
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useDeleteIdentityProvider, useIdentityProviders, useSaveIdentityProvider, IdentityProviderInput } from '../../../../../lib/hooks/useSso';
import { useAuth } from '../../../../../lib/auth-context';
import { Button, TextField, dt } from '../../../../../components/ui-v2';
import { STATUS } from '../../../../../components/ui-v2/viz';
import type { IdentityProvider, IdentityProviderType } from '../../../../../lib/types';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const mono: React.CSSProperties = { margin: 0, wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: 12, color: ink };
const selectStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: ink };

const TYPE_LABEL: Record<IdentityProviderType, string> = {
  saml: 'SAML',
  oidc_google: 'Google',
  oidc_entra: 'Microsoft Entra',
  oidc_generic: 'OpenID Connect',
};
// JIT never grants an administrator role; the API also refuses any role holding sensitive permissions.
const JIT_ROLES = [
  { value: 'panel', label: 'Panel' },
  { value: 'hiring_manager', label: 'Hiring manager' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'recruiter', label: 'Recruiter' },
];

interface Draft {
  id?: string;
  type: IdentityProviderType;
  name: string;
  domains: string;
  samlEntityId: string;
  samlSsoUrl: string;
  samlCertificate: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  entraTenantId: string;
  jitEnabled: boolean;
  jitRole: string;
  mfaTrusted: boolean;
}

const list = (v: string) => v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
const draftOf = (p?: IdentityProvider): Draft => ({
  id: p?.id,
  type: p?.type ?? 'oidc_google',
  name: p?.name ?? '',
  domains: p?.domains.join(', ') ?? '',
  samlEntityId: p?.samlEntityId ?? '',
  samlSsoUrl: p?.samlSsoUrl ?? '',
  samlCertificate: p?.samlCertificate ?? '',
  oidcIssuer: p?.oidcIssuer ?? '',
  oidcClientId: p?.oidcClientId ?? '',
  oidcClientSecret: '',
  entraTenantId: p?.entraTenantId ?? '',
  jitEnabled: p?.jitEnabled ?? false,
  jitRole: p?.jitRole ?? 'panel',
  mfaTrusted: p?.mfaTrusted ?? false,
});

export default function V2SsoSettingsPage() {
  const { organizationSlug } = useAuth();
  const { data: providers = [] } = useIdentityProviders();
  const save = useSaveIdentityProvider();
  const remove = useDeleteIdentityProvider();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiOrigin = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Could not save the identity provider');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    const input: IdentityProviderInput & { id?: string } = {
      id: draft.id,
      name: draft.name,
      domains: list(draft.domains),
      jitEnabled: draft.jitEnabled,
      ...(draft.jitEnabled ? { jitRole: draft.jitRole } : {}),
      mfaTrusted: draft.mfaTrusted,
    };
    if (!draft.id) Object.assign(input, { type: draft.type });
    if (draft.type === 'saml') {
      Object.assign(input, { samlEntityId: draft.samlEntityId, samlSsoUrl: draft.samlSsoUrl, samlCertificate: draft.samlCertificate });
    } else {
      Object.assign(input, { oidcClientId: draft.oidcClientId });
      if (draft.oidcClientSecret) input.oidcClientSecret = draft.oidcClientSecret;
      if (draft.type === 'oidc_generic') input.oidcIssuer = draft.oidcIssuer;
      if (draft.type === 'oidc_entra') input.entraTenantId = draft.entraTenantId;
    }
    save.mutate(input, { onSuccess: () => setDraft(null), onError: fail });
  }

  const toggle = (p: IdentityProvider) => {
    setError(null);
    save.mutate({ id: p.id, status: p.status === 'active' ? 'disabled' : 'active' }, { onError: fail });
  };
  const drop = (p: IdentityProvider) => {
    if (!window.confirm(`Remove ${p.name}? People who sign in through it will need another way in.`)) return;
    setError(null);
    remove.mutate(p.id, { onError: fail });
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Single Sign-On</h1>
        <p style={{ ...desc, marginTop: 6 }}>Let staff sign in through Google, Microsoft Entra, or any SAML or OpenID Connect identity provider. Each provider signs in the email domains you give it.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section style={card}>
          <h2 style={sectionTitle}>Give these to your identity provider</h2>
          <p style={desc}>SAML apps use the metadata URL; OpenID Connect apps (Google, Entra, others) use the redirect URI.</p>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 8, fontSize: 13, color: muted, margin: '14px 0 0' }}>
            <dt style={{ fontWeight: 500 }}>SAML metadata</dt>
            <dd style={mono}>{`${apiOrigin}/auth/saml/${organizationSlug}/metadata`}</dd>
            <dt style={{ fontWeight: 500 }}>OIDC redirect URI</dt>
            <dd style={mono}>{`${apiOrigin}/auth/oidc/callback`}</dd>
          </dl>
        </section>

        {providers.map((p) => {
          const on = p.status === 'active';
          return (
            <section key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: on ? 'color-mix(in srgb, var(--org-primary) 14%, transparent)' : 'color-mix(in srgb, var(--ink) 6%, transparent)', color: on ? 'var(--org-primary)' : muted, flexShrink: 0 }}>
                  <ShieldCheck size={20} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={sectionTitle}>{p.name}</h2>
                    {TYPE_LABEL[p.type] !== p.name && <span style={{ fontSize: 11.5, color: muted }}>{TYPE_LABEL[p.type]}</span>}
                    <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 99, padding: '2px 10px', background: on ? `color-mix(in srgb, ${STATUS.ok} 14%, transparent)` : 'color-mix(in srgb, var(--ink) 8%, transparent)', color: on ? STATUS.ok : muted }}>{on ? 'On' : 'Off'}</span>
                  </div>
                  <p style={{ ...desc, marginTop: 4 }}>
                    {p.domains.length ? p.domains.join(', ') : 'Existing accounts only (no domains)'}
                    {p.jitEnabled && p.jitRole ? ` · new people join as ${JIT_ROLES.find((r) => r.value === p.jitRole)?.label ?? p.jitRole}` : ''}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => { setError(null); setDraft(draftOf(p)); }}>Edit</button>
                <button type="button" className="v2-hoverbtn" style={dt.toolBtn} disabled={save.isPending} onClick={() => toggle(p)}>{on ? 'Turn off' : 'Turn on'}</button>
                <button type="button" className="v2-hoverbtn" style={{ ...dt.toolBtn, color: 'var(--danger)' }} disabled={remove.isPending} onClick={() => drop(p)}>Remove</button>
              </div>
            </section>
          );
        })}

        {!draft && (
          <div>
            <Button onClick={() => { setError(null); setDraft(draftOf()); }}>Add identity provider</Button>
          </div>
        )}

        {draft && (
          <section style={card}>
            <h2 style={sectionTitle}>{draft.id ? `Edit ${draft.name}` : 'Add identity provider'}</h2>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label htmlFor="idp-type" className="v2-label">Type</label>
                  <select id="idp-type" value={draft.type} disabled={Boolean(draft.id)} onChange={(e) => set({ type: e.target.value as IdentityProviderType })} style={selectStyle}>
                    {(Object.keys(TYPE_LABEL) as IdentityProviderType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                </div>
                <TextField id="idp-name" label="Name shown on the sign-in page" value={draft.name} onChange={(name) => set({ name })} required />
              </div>
              <TextField id="idp-domains" label="Email domains (comma separated)" value={draft.domains} onChange={(domains) => set({ domains })} placeholder="acme.com, acme.in" />

              {draft.type === 'saml' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <TextField id="saml-entity" label="IdP entity ID" value={draft.samlEntityId} onChange={(samlEntityId) => set({ samlEntityId })} required />
                    <TextField id="saml-url" label="IdP sign-in URL" value={draft.samlSsoUrl} onChange={(samlSsoUrl) => set({ samlSsoUrl })} required />
                  </div>
                  <div>
                    <label htmlFor="saml-cert" className="v2-label">IdP signing certificate</label>
                    <textarea id="saml-cert" value={draft.samlCertificate} onChange={(e) => set({ samlCertificate: e.target.value })} required rows={6} placeholder="-----BEGIN CERTIFICATE-----" style={{ ...selectStyle, fontSize: 12, resize: 'vertical', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }} />
                  </div>
                </>
              ) : (
                <>
                  {draft.type === 'oidc_generic' && <TextField id="oidc-issuer" label="Issuer URL" value={draft.oidcIssuer} onChange={(oidcIssuer) => set({ oidcIssuer })} required placeholder="https://login.example.com" />}
                  {draft.type === 'oidc_entra' && <TextField id="entra-tenant" label="Directory (tenant) ID" value={draft.entraTenantId} onChange={(entraTenantId) => set({ entraTenantId })} required placeholder="00000000-0000-0000-0000-000000000000" />}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <TextField id="oidc-client" label="Client ID" value={draft.oidcClientId} onChange={(oidcClientId) => set({ oidcClientId })} required />
                    <TextField id="oidc-secret" label={draft.id ? 'Client secret (leave blank to keep)' : 'Client secret'} type="password" value={draft.oidcClientSecret} onChange={(oidcClientSecret) => set({ oidcClientSecret })} required={!draft.id} autoComplete="off" />
                  </div>
                </>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ink }}>
                <input type="checkbox" checked={draft.jitEnabled} onChange={(e) => set({ jitEnabled: e.target.checked })} />
                Create accounts on first sign-in for people at these domains
              </label>
              {draft.jitEnabled && (
                <div style={{ maxWidth: 280 }}>
                  <label htmlFor="jit-role" className="v2-label">They join as</label>
                  <select id="jit-role" value={draft.jitRole} onChange={(e) => set({ jitRole: e.target.value })} style={selectStyle}>
                    {JIT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <p style={{ ...desc, fontSize: 12 }}>Never an administrator, or any role with security or exam-supervision permissions.</p>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ink }}>
                <input type="checkbox" checked={draft.mfaTrusted} onChange={(e) => set({ mfaTrusted: e.target.checked })} />
                Trust this provider&apos;s own two-step verification
              </label>
              <p style={{ ...desc, fontSize: 12, marginTop: -8 }}>
                When it reports that it did MFA, people skip the YukthiX second step. Only turn this on for a provider that enforces MFA. Break-glass accounts always use their YukthiX factor.
              </p>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="submit" loading={save.isPending}>{draft.id ? 'Save' : 'Add provider'}</Button>
                <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
              </div>
              <p style={{ ...desc, fontSize: 12 }}>New providers start switched off: turn one on once its settings are in.</p>
            </form>
          </section>
        )}

        {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
