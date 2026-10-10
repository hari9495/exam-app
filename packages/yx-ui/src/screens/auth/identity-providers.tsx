import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { ErrorSummary, FormField, FormSection, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { PasswordField, TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { errorText } from './kit';
import type { IdentityProviderDetail, IdentityProviderInput, IdentityProviderRow } from './types';

type IdpType = IdentityProviderRow['type'];

export const IDP_TYPE_LABEL: Record<IdpType, string> = { oidc_google: 'Google', oidc_entra: 'Microsoft Entra ID', oidc_generic: 'OpenID Connect', saml: 'SAML' };
const TYPES = (Object.keys(IDP_TYPE_LABEL) as IdpType[]).map((value) => ({ value, label: IDP_TYPE_LABEL[value] }));
// Never an administrator; the API also refuses any role that holds a sensitive permission.
const JIT_ROLES = [
  { value: 'panel', label: 'Panel member' },
  { value: 'hiring_manager', label: 'Hiring manager' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'auditor', label: 'Auditor' },
];

export interface IdpDraft {
  type: IdpType;
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

export const idpDraftOf = (p: IdentityProviderDetail | null): IdpDraft => ({
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

const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUrl = (v: string, protocols: string[]) => {
  try {
    return protocols.includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

/** The request body, or the problems to fix first. Mirrors the API's checks; the API checks again. */
export function idpInput(d: IdpDraft, saved: IdentityProviderDetail | null): { input: IdentityProviderInput | null; errors: { fieldId: string; message: string }[] } {
  const errors: { fieldId: string; message: string }[] = [];
  const domains = d.domains.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!d.name.trim()) errors.push({ fieldId: 'idp-name', message: 'Enter the name people see on the sign-in page' });
  const bad = domains.find((x) => !DOMAIN.test(x));
  if (bad) errors.push({ fieldId: 'idp-domains', message: `${bad} is not an email domain, like acme.com` });
  if (d.jitEnabled && !domains.length) errors.push({ fieldId: 'idp-domains', message: 'Add an email domain to create accounts on first sign-in' });

  const input: IdentityProviderInput = { name: d.name.trim(), domains, jitEnabled: d.jitEnabled, mfaTrusted: d.mfaTrusted, ...(d.jitEnabled ? { jitRole: d.jitRole } : {}) };
  if (!saved) input.type = d.type;
  if (d.type === 'saml') {
    if (!d.samlEntityId.trim()) errors.push({ fieldId: 'idp-saml-entity', message: 'Enter the entity ID' });
    if (!isUrl(d.samlSsoUrl.trim(), ['https:'])) errors.push({ fieldId: 'idp-saml-url', message: 'Enter the sign-in URL, starting with https://' });
    if (!d.samlCertificate.includes('BEGIN CERTIFICATE')) errors.push({ fieldId: 'idp-saml-cert', message: 'Paste the certificate, starting with -----BEGIN CERTIFICATE-----' });
    Object.assign(input, { samlEntityId: d.samlEntityId.trim(), samlSsoUrl: d.samlSsoUrl.trim(), samlCertificate: d.samlCertificate.trim() });
  } else {
    if (d.type === 'oidc_generic') {
      if (!isUrl(d.oidcIssuer.trim(), ['https:', 'http:'])) errors.push({ fieldId: 'idp-issuer', message: 'Enter the issuer URL, like https://login.acme.com' });
      input.oidcIssuer = d.oidcIssuer.trim();
    }
    if (d.type === 'oidc_entra') {
      if (!UUID.test(d.entraTenantId.trim())) errors.push({ fieldId: 'idp-tenant', message: 'Enter the directory (tenant) ID, like 00000000-0000-0000-0000-000000000000' });
      input.entraTenantId = d.entraTenantId.trim();
    }
    if (!d.oidcClientId.trim()) errors.push({ fieldId: 'idp-client-id', message: 'Enter the client ID' });
    input.oidcClientId = d.oidcClientId.trim();
    if (d.oidcClientSecret) input.oidcClientSecret = d.oidcClientSecret;
    else if (!saved?.clientSecretSet) errors.push({ fieldId: 'idp-client-secret', message: 'Enter the client secret' });
  }
  return errors.length ? { input: null, errors } : { input, errors };
}

/* ---------- editor ---------- */

interface EditorProps {
  provider: IdentityProviderDetail | null;
  onClose: () => void;
  onSave: (input: IdentityProviderInput) => Promise<void>;
}

function IdentityProviderEditor({ provider, onClose, onSave }: EditorProps) {
  const [draft, setDraft] = useState(() => idpDraftOf(provider));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' } | { kind: 'failed'; message: string }>({ kind: 'idle' });
  const { input, errors } = idpInput(draft, provider);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const set = (patch: Partial<IdpDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const save = async () => {
    if (!input) return saveErrors.reveal();
    setStatus({ kind: 'saving' });
    try {
      await onSave(input);
      setDirty(false);
      onClose();
    } catch (err) {
      setStatus({ kind: 'failed', message: errorText(err) });
    }
  };
  const secretSaved = Boolean(provider?.clientSecretSet);

  return (
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      dirty={dirty}
      notice={status.kind === 'failed' && <InlineAlert tone="danger" title="Not saved">{status.message}</InlineAlert>}
      title={provider ? `Edit ${provider.name}` : 'Add identity provider'}
      subtitle={provider ? IDP_TYPE_LABEL[provider.type] : 'New providers start switched off. Turn one on once its settings are in.'}
      footer={
        <>
          <Button onClick={onClose} disabled={status.kind === 'saving'}>Cancel</Button>
          <Button variant="primary" loading={status.kind === 'saving'} onClick={() => void save()}>{provider ? 'Save changes' : 'Add provider'}</Button>
        </>
      }
    >
      <form className="yx-auth__settings" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <InlineAlert tone="info">Secrets are saved encrypted and never shown again. You confirm it’s you before saving.</InlineAlert>
        <ErrorSummary errors={saveErrors.shownErrors} />

        <FormSection title="Provider">
          {!provider && (
            <FormField label="Type">
              <Segment label="Type" options={TYPES} value={draft.type} onChange={(type) => set({ type })} />
            </FormField>
          )}
          <FormField id="idp-name" label="Name on the sign-in page" required error={errorOf('idp-name')} helper="People see “Sign in with” and this name.">
            <TextField value={draft.name} onChange={(name) => set({ name })} maxLength={100} placeholder={IDP_TYPE_LABEL[draft.type]} />
          </FormField>
          <FormField id="idp-domains" label="Email domains" error={errorOf('idp-domains')} helper="Separate them with commas. Leave empty to sign in only people who already have an account.">
            <TextField value={draft.domains} onChange={(domains) => set({ domains })} placeholder="acme.com, acme.in" spellCheck={false} />
          </FormField>
        </FormSection>

        {draft.type === 'saml' ? (
          <FormSection title="From your identity provider" description="Copy these from the SAML app you created for YukthiX.">
            <FormField id="idp-saml-entity" label="Entity ID" required error={errorOf('idp-saml-entity')}>
              <TextField value={draft.samlEntityId} onChange={(samlEntityId) => set({ samlEntityId })} spellCheck={false} />
            </FormField>
            <FormField id="idp-saml-url" label="Sign-in URL" required error={errorOf('idp-saml-url')}>
              <TextField value={draft.samlSsoUrl} onChange={(samlSsoUrl) => set({ samlSsoUrl })} spellCheck={false} placeholder="https://" />
            </FormField>
            <FormField id="idp-saml-cert" label="Signing certificate" required error={errorOf('idp-saml-cert')}>
              <TextArea value={draft.samlCertificate} onChange={(samlCertificate) => set({ samlCertificate })} rows={6} spellCheck={false} placeholder="-----BEGIN CERTIFICATE-----" />
            </FormField>
          </FormSection>
        ) : (
          <FormSection title="From your identity provider" description="Copy these from the app you registered for YukthiX.">
            {draft.type === 'oidc_generic' && (
              <FormField id="idp-issuer" label="Issuer URL" required error={errorOf('idp-issuer')}>
                <TextField value={draft.oidcIssuer} onChange={(oidcIssuer) => set({ oidcIssuer })} spellCheck={false} placeholder="https://login.acme.com" />
              </FormField>
            )}
            {draft.type === 'oidc_entra' && (
              <FormField id="idp-tenant" label="Directory (tenant) ID" required error={errorOf('idp-tenant')}>
                <TextField value={draft.entraTenantId} onChange={(entraTenantId) => set({ entraTenantId })} spellCheck={false} placeholder="00000000-0000-0000-0000-000000000000" />
              </FormField>
            )}
            <FormField id="idp-client-id" label="Client ID" required error={errorOf('idp-client-id')}>
              <TextField value={draft.oidcClientId} onChange={(oidcClientId) => set({ oidcClientId })} spellCheck={false} />
            </FormField>
            <FormField id="idp-client-secret" label="Client secret" required={!secretSaved} error={errorOf('idp-client-secret')} helper={secretSaved ? 'Saved. It is never shown again; type a new one to replace it.' : undefined}>
              <PasswordField value={draft.oidcClientSecret} onChange={(oidcClientSecret) => set({ oidcClientSecret })} autoComplete="new-password" placeholder={secretSaved ? 'Saved and hidden' : undefined} />
            </FormField>
          </FormSection>
        )}

        <FormSection title="New people and second step">
          <Checkbox label="Create an account the first time someone at these domains signs in" checked={draft.jitEnabled} onChange={(jitEnabled) => set({ jitEnabled })} />
          {draft.jitEnabled && (
            <FormField label="They join as" helper="Never an admin, or a role with security or exam-supervision permissions.">
              <Segment label="They join as" options={JIT_ROLES} value={draft.jitRole} onChange={(jitRole) => set({ jitRole })} />
            </FormField>
          )}
          <Checkbox
            label="Trust this provider’s own second step"
            description="When it says it checked a second step, people skip the YukthiX one. Only for a provider that always asks for one. Emergency admins still use theirs."
            checked={draft.mfaTrusted}
            onChange={(mfaTrusted) => set({ mfaTrusted })}
          />
        </FormSection>

      </form>
    </Drawer>
  );
}

/* ---------- screen ---------- */

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => undefined);
  return (
    <div className="yx-auth__item-main">
      <Text weight="medium" size="sm">{label}</Text>
      <div className="yx-auth__keyrow">
        <Text mono size="sm" className="yx-auth__url">{value}</Text>
        <Button size="sm" icon={copied ? Check : Copy} onClick={copy} aria-label={`Copy ${label}`}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
    </div>
  );
}

export interface IdentityProvidersScreenProps {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  providers: IdentityProviderDetail[];
  /** SAML metadata URL with the company's own web address (slug); null while it loads. */
  samlMetadataUrl: string | null;
  oidcRedirectUri: string;
  /** id null = a new provider. The host asks the person to confirm it's them (step-up). */
  onSave: (id: string | null, input: IdentityProviderInput) => Promise<void>;
  onSetStatus: (id: string, status: 'active' | 'disabled') => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

/** Security › Single sign-on providers (P12 §7, YX-IAM-04/05). */
export function IdentityProvidersScreen(props: IdentityProvidersScreenProps) {
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Security' }, { label: 'Single sign-on providers' }]} />}
        title="Single sign-on providers"
        description="Let people sign in with their work account from Google, Microsoft Entra ID, or any OpenID Connect or SAML provider."
      />
      {props.state === 'loading' && (
        <div className="yx-auth__stack" aria-busy="true">
          <Skeleton height={120} />
          <Skeleton height={160} />
        </div>
      )}
      {props.state === 'error' && <ErrorState title="We couldn't load the identity providers." description="Nothing has changed. Try again in a moment." onRetry={props.onRetry} />}
      {props.state === 'no-access' && <NoAccessState grantedBy="a System Admin" what="the identity providers" />}
      {props.state === 'ready' && <Providers {...props} />}
    </div>
  );
}

function Providers({ providers, samlMetadataUrl, oidcRedirectUri, onSave, onSetStatus, onRemove }: IdentityProvidersScreenProps) {
  const [editing, setEditing] = useState<{ provider: IdentityProviderDetail | null; key: number } | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const add = () => setEditing({ provider: null, key: Date.now() });
  const toggle = async (p: IdentityProviderDetail) => {
    setError(null);
    setToggling(p.id);
    try {
      await onSetStatus(p.id, p.status === 'active' ? 'disabled' : 'active');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="yx-auth__settings">
      <FormSection title="Give these to your identity provider" description="SAML apps use the metadata URL. Google, Microsoft Entra ID and other OpenID Connect apps use the redirect URI.">
        {samlMetadataUrl ? <CopyRow label="SAML metadata URL" value={samlMetadataUrl} /> : <Skeleton height={56} />}
        <CopyRow label="OpenID Connect redirect URI" value={oidcRedirectUri} />
      </FormSection>

      <FormSection title="Providers" description="Each one signs in the people at its email domains. New providers start switched off.">
        {error && <InlineAlert tone="danger" title="Not changed">{error}</InlineAlert>}
        {providers.length === 0 ? (
          <EmptyState compact title="No identity providers yet." description="Add one so people sign in with their work account." action={<Button variant="primary" onClick={add}>Add identity provider</Button>} />
        ) : (
          <>
            <ul className="yx-auth__list" aria-label="Identity providers">
              {providers.map((p) => {
                const on = p.status === 'active';
                return (
                  <li key={p.id} className="yx-auth__item">
                    <div className="yx-auth__item-main">
                      <span className="yx-auth__badges">
                        <Text weight="medium">{p.name}</Text>
                        <Badge tone={on ? 'success' : 'neutral'}>{on ? 'On' : 'Off'}</Badge>
                      </span>
                      <Text tone="secondary" size="sm">
                        {IDP_TYPE_LABEL[p.type]} · {p.domains.length ? p.domains.join(', ') : 'existing accounts only'}
                        {p.jitEnabled ? ' · creates accounts on first sign-in' : ''}
                      </Text>
                    </div>
                    <div className="yx-auth__row">
                      <Button size="sm" onClick={() => setEditing({ provider: p, key: Date.now() })} aria-label={`Edit ${p.name}`}>Edit</Button>
                      <Button size="sm" loading={toggling === p.id} disabled={toggling !== null && toggling !== p.id} onClick={() => void toggle(p)} aria-label={`${on ? 'Turn off' : 'Turn on'} ${p.name}`}>
                        {on ? 'Turn off' : 'Turn on'}
                      </Button>
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="danger" aria-label={`Remove ${p.name}`}>Remove</Button>}
                        title={`Remove ${p.name}?`}
                        consequence="People who sign in through it are signed out and need another way in. You confirm it’s you first."
                        confirmLabel="Remove provider"
                        destructive
                        onConfirm={() => onRemove(p.id)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div><Button onClick={add}>Add identity provider</Button></div>
          </>
        )}
      </FormSection>

      {editing && (
        <IdentityProviderEditor
          key={editing.key}
          provider={editing.provider}
          onClose={() => setEditing(null)}
          onSave={(input) => onSave(editing.provider?.id ?? null, input)}
        />
      )}
    </div>
  );
}
