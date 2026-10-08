import { useMemo, useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { Checkbox, Switch } from '../../components/choice';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { ErrorSummary, FormField, FormSection, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextArea } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { MultiSelect } from '../../components/select';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { formatDate } from '../../lib/format';
import { useStep, when } from './kit';
import type { EmailDomainRow, IdentityProviderRow, PersonOption, SecurityFloor, SecurityPolicy } from './types';

/** YukthiX defaults when a company leaves a session limit unset. */
export const SESSION_DEFAULTS = { idleMinutes: 30, absoluteMinutes: 720 };

const FACTORS = [
  { value: 'passkey', label: 'Passkey', description: 'Face, fingerprint or PIN. Signs in on its own, no password. The safest choice.' },
  { value: 'totp', label: 'Authenticator app', description: 'A 6-digit code from an app on the phone, after the password.' },
  { value: 'otp', label: 'Code by SMS or WhatsApp (backup only)', description: 'Never for admins, payroll admins or YukthiX staff.' },
];
const CODE_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];
const PROVIDER_TYPE: Record<IdentityProviderRow['type'], string> = { saml: 'SAML 2.0', oidc_google: 'Google', oidc_entra: 'Microsoft Entra ID', oidc_generic: 'OpenID Connect' };

type Draft = SecurityPolicy;
type Key = keyof SecurityPolicy;

const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const hours = (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`);

/** Fields that differ from the saved policy: what PATCH /security/policy gets. */
export function policyChanges(saved: SecurityPolicy, draft: SecurityPolicy): Partial<SecurityPolicy> {
  const out: Partial<Record<Key, unknown>> = {};
  for (const k of Object.keys(draft) as Key[]) if (!same(saved[k], draft[k])) out[k] = draft[k];
  return out as Partial<SecurityPolicy>;
}

/** Cross-field rules the page can check before saving; the API checks them again (and CIDR syntax). */
export function policyErrors(d: SecurityPolicy, floor: SecurityFloor, providers: IdentityProviderRow[]): { fieldId: string; message: string }[] {
  const errors: { fieldId: string; message: string }[] = [];
  const range = (fieldId: string, v: number | null, r: { min: number; max: number }, what: string) => {
    if (v != null && (v < r.min || v > r.max)) errors.push({ fieldId, message: `${what} must be between ${r.min} and ${r.max}` });
  };
  if (!d.allowedFactors.some((f) => f === 'passkey' || f === 'totp')) errors.push({ fieldId: 'sec-factor-passkey', message: 'Keep passkey or authenticator app allowed' });
  range('sec-idle', d.sessionIdleMinutes, floor.sessionIdleMinutes, 'Sign out after no activity');
  range('sec-absolute', d.sessionAbsoluteMinutes, floor.sessionAbsoluteMinutes, 'Longest session');
  range('sec-concurrent', d.maxConcurrentSessions, floor.maxConcurrentSessions, 'Sessions per person');
  range('sec-lock-after', d.maxFailedAttempts, floor.maxFailedAttempts, 'Lock after');
  range('sec-lock-for', d.lockMinutes, floor.lockMinutes, 'Lock for');
  const idle = d.sessionIdleMinutes ?? SESSION_DEFAULTS.idleMinutes;
  const absolute = d.sessionAbsoluteMinutes ?? SESSION_DEFAULTS.absoluteMinutes;
  if (idle > absolute) errors.push({ fieldId: 'sec-idle', message: 'Sign out after no activity can’t be longer than the longest session' });
  if (d.passwordMinLength < floor.passwordMinLength || d.passwordMinLength > floor.passwordMaxLength) {
    errors.push({ fieldId: 'sec-password', message: `Minimum password length must be between ${floor.passwordMinLength} and ${floor.passwordMaxLength}` });
  }
  for (const [id, list] of [['sec-ip-desk', d.ipAllowlistDesk], ['sec-ip-admin', d.ipAllowlistAdmin], ['sec-ip-api', d.ipAllowlistApi]] as const) {
    if (list.length > floor.ipAllowlistMaxEntries) errors.push({ fieldId: id, message: `Up to ${floor.ipAllowlistMaxEntries} ranges per list` });
  }
  if (d.ssoOnly) {
    if (!providers.some((p) => p.status === 'active')) errors.push({ fieldId: 'sec-sso-only', message: 'Turn on an identity provider before allowing sign-in only through it' });
    if (d.breakGlassUserIds.length < floor.breakGlassAccounts.minWhenSsoOnly) {
      errors.push({ fieldId: 'sec-break-glass', message: `Name at least ${floor.breakGlassAccounts.minWhenSsoOnly} emergency admins` });
    }
  }
  return errors;
}

export interface SecuritySettingsScreenProps {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  policy: SecurityPolicy | null;
  floor: SecurityFloor | null;
  updatedAt?: string | null;
  providers: IdentityProviderRow[];
  /** Active admins who may be named emergency (break-glass) admins. */
  admins: PersonOption[];
  /** Opens the identity-provider editor. */
  providersHref: string;
  /** Saves the changed fields; the host asks the person to confirm it's them (step-up). */
  onSave: (changes: Partial<SecurityPolicy>) => Promise<void>;
  /** The providers' email domains and their ownership check. */
  domains?: EmailDomainRow[];
  /** Looks the domain's TXT record up now (step-up); rejects with the reason when it is not there yet. */
  onVerifyDomain?: (domain: string) => Promise<void>;
}

/** Verified domains send people with that email straight to the identity provider (email-first sign-in). */
function EmailDomains({ domains, onVerify }: { domains: EmailDomainRow[]; onVerify?: (domain: string) => Promise<void> }) {
  const { busy, error, run } = useStep();
  const [checking, setChecking] = useState<string | null>(null);
  const verify = (domain: string) => {
    setChecking(domain);
    void run(() => onVerify!(domain)).finally(() => setChecking(null));
  };
  return (
    <div className="yx-auth__stack">
      <Text as="p" tone="secondary" size="sm">
        People whose email is at a verified domain go straight to your identity provider when they sign in. To verify one, add the TXT record shown to the domain's DNS, then check it.
      </Text>
      <ul className="yx-auth__list" aria-label="Email domains">
        {domains.map((d) => (
          <li key={d.domain} className="yx-auth__item">
            <div className="yx-auth__item-main">
              <span className="yx-auth__badges">
                <Text weight="medium">{d.domain}</Text>
                <Badge tone={d.verifiedAt ? 'success' : d.lapsedAt ? 'warning' : 'neutral'}>{d.verifiedAt ? 'Verified' : d.lapsedAt ? 'Lapsed' : 'Not verified'}</Badge>
              </span>
              {!d.verifiedAt && d.lapsedAt && (
                <Text tone="secondary" size="sm">
                  Repeated checks have not found the TXT record (lapsed {formatDate(new Date(d.lapsedAt))}), so sign-ins no longer go to your identity provider. Put the record back, then check it.
                </Text>
              )}
              {!d.verifiedAt && (
                <Text tone="secondary" size="sm" className="yx-auth__key">
                  TXT record on {d.txtRecord.name}: <Text mono size="sm">{d.txtRecord.value}</Text>
                </Text>
              )}
            </div>
            {!d.verifiedAt && onVerify && (
              <Button size="sm" loading={checking === d.domain} disabled={busy && checking !== d.domain} onClick={() => verify(d.domain)}>Check record</Button>
            )}
          </li>
        ))}
      </ul>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    </div>
  );
}

/** Settings › People & Access › 2.3 Security (P12 §7, Q8): every limit shows the YukthiX minimum beside it. */
export function SecuritySettingsScreen(props: SecuritySettingsScreenProps) {
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Security' }, { label: 'Security settings' }]} />}
        title="Security"
        description="Sign-in, second steps, single sign-on, sessions, network allow-lists and passwords."
        facts={props.updatedAt ? <span>Last changed {when(props.updatedAt)}</span> : undefined}
      />
      {props.state === 'loading' && (
        <div className="yx-auth__stack" aria-busy="true">
          <Skeleton height={200} />
          <Skeleton height={160} />
        </div>
      )}
      {props.state === 'error' && <ErrorState title="We couldn't load the security settings." description="Nothing has changed. Try again in a moment." onRetry={props.onRetry} />}
      {props.state === 'no-access' && <NoAccessState grantedBy="a System Admin" what="the security settings" />}
      {props.state === 'ready' && props.policy && props.floor && <SecurityForm {...props} policy={props.policy} floor={props.floor} />}
    </div>
  );
}

function SecurityForm({ policy, floor, providers, admins, providersHref, onSave, domains, onVerifyDomain }: SecuritySettingsScreenProps & { policy: SecurityPolicy; floor: SecurityFloor }) {
  const [saved, setSaved] = useState(policy);
  const [draft, setDraft] = useState(policy);
  // IP lists are edited as text so a half-typed line isn't lost; parsed on every change.
  const [ipText, setIpText] = useState({ desk: policy.ipAllowlistDesk.join('\n'), admin: policy.ipAllowlistAdmin.join('\n'), api: policy.ipAllowlistApi.join('\n') });
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'failed'; message: string }>({ kind: 'idle' });

  const changes = useMemo(() => policyChanges(saved, draft), [saved, draft]);
  const dirty = Object.keys(changes).length > 0;
  const errors = policyErrors(draft, floor, providers);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const set = (patch: Partial<SecurityPolicy>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (status.kind !== 'saving') setStatus({ kind: 'idle' });
  };
  const toggle = (key: 'allowedFactors' | 'otpSignInChannels', value: string, on: boolean) =>
    set({ [key]: on ? [...draft[key], value] : draft[key].filter((v) => v !== value) });
  const setIp = (which: 'desk' | 'admin' | 'api', text: string) => {
    setIpText((t) => ({ ...t, [which]: text }));
    set({ [`ipAllowlist${which === 'desk' ? 'Desk' : which === 'admin' ? 'Admin' : 'Api'}`]: lines(text) });
  };
  const activeProvider = providers.some((p) => p.status === 'active');

  const save = async () => {
    if (errors.length) return saveErrors.reveal();
    setStatus({ kind: 'saving' });
    try {
      await onSave(changes);
      setSaved(draft);
      saveErrors.reset();
      setStatus({ kind: 'saved' });
    } catch (err) {
      setStatus({ kind: 'failed', message: err instanceof Error && err.message ? err.message : 'We couldn’t save. Nothing has changed.' });
    }
  };
  const discard = () => {
    setDraft(saved);
    setIpText({ desk: saved.ipAllowlistDesk.join('\n'), admin: saved.ipAllowlistAdmin.join('\n'), api: saved.ipAllowlistApi.join('\n') });
    saveErrors.reset();
    setStatus({ kind: 'idle' });
  };

  return (
    <form className="yx-auth__settings" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <InlineAlert tone="info">YukthiX sets minimums: you can make these stricter, never looser. You confirm it's you before saving.</InlineAlert>
      <ErrorSummary errors={saveErrors.shownErrors} />

      <FormSection title="Passkey or second step" description="Admins, payroll and finance approvers, proctors and evaluators always need it.">
        <FormField label="Who needs one" helper="Minimum allowed: people in sensitive roles.">
          <Segment
            label="Who needs one"
            options={[{ value: 'sensitive_roles', label: 'Sensitive roles' }, { value: 'all', label: 'Everyone' }]}
            value={draft.mfaScope}
            onChange={(mfaScope) => set({ mfaScope })}
          />
        </FormField>
        <fieldset className="yx-auth__fieldset">
          <legend>Allowed sign-in methods</legend>
          {FACTORS.map((f) => (
            <Checkbox key={f.value} id={`sec-factor-${f.value}`} label={f.label} description={f.description} checked={draft.allowedFactors.includes(f.value)} onChange={(on) => toggle('allowedFactors', f.value, on)} />
          ))}
          <Text as="p" tone={errorOf('sec-factor-passkey') ? 'danger' : 'secondary'} size="sm">Minimum allowed: passkey or authenticator app stays on.</Text>
        </fieldset>
      </FormSection>

      <FormSection title="Sign in with a one-time code" description="A code by email or text instead of a password. Off unless you turn it on.">
        <fieldset className="yx-auth__fieldset">
          <legend>Send codes by</legend>
          {CODE_CHANNELS.map((c) => (
            <Checkbox key={c.value} label={c.label} checked={draft.otpSignInChannels.includes(c.value)} onChange={(on) => toggle('otpSignInChannels', c.value, on)} />
          ))}
          <Text as="p" tone="secondary" size="sm">People with a second step still give it after the code.</Text>
        </fieldset>
      </FormSection>

      <FormSection title="Sign in with Google or Microsoft" description="People use the Google or Microsoft account of their work email. Off unless you turn it on.">
        {(['google', 'microsoft'] as const).map((p) => (
          <Switch
            key={p}
            id={`sec-${p}`}
            label={p === 'google' ? 'Allow sign-in with Google' : 'Allow sign-in with Microsoft'}
            description={draft.ssoOnly ? 'Off while sign-in is only through your identity provider.' : 'People with a second step still give it.'}
            checked={!draft.ssoOnly && draft[`${p}SignIn`]}
            disabled={draft.ssoOnly}
            onChange={(on) => set({ [`${p}SignIn`]: on })}
          />
        ))}
      </FormSection>

      <FormSection title="Single sign-on">
        {providers.length === 0 ? (
          <EmptyState compact title="No identity providers yet." description="Add Google, Microsoft Entra ID or a SAML provider so people sign in with their work account." action={<Button asChild><a href={providersHref}>Add identity provider</a></Button>} />
        ) : (
          <>
            <ul className="yx-auth__list" aria-label="Identity providers">
              {providers.map((p) => (
                <li key={p.id} className="yx-auth__item">
                  <div className="yx-auth__item-main">
                    <span className="yx-auth__badges">
                      <Text weight="medium">{p.name}</Text>
                      <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status === 'active' ? 'On' : 'Off'}</Badge>
                    </span>
                    <Text tone="secondary" size="sm">
                      {PROVIDER_TYPE[p.type]} · {p.domains.length ? p.domains.join(', ') : 'existing accounts only'}
                      {p.jitEnabled ? ' · creates accounts on first sign-in' : ''}
                    </Text>
                  </div>
                </li>
              ))}
            </ul>
            <div><Button asChild size="sm"><a href={providersHref}>Manage identity providers</a></Button></div>
            {domains && domains.length > 0 && <EmailDomains domains={domains} onVerify={onVerifyDomain} />}
          </>
        )}
        <Checkbox
          id="sec-sso-only"
          label="Sign in only through your identity provider"
          description={activeProvider ? 'Passwords and codes stop working, except for the emergency admins below.' : 'Turn on an identity provider first.'}
          checked={draft.ssoOnly}
          disabled={!activeProvider && !draft.ssoOnly}
          onChange={(ssoOnly) => set({ ssoOnly })}
        />
        {errorOf('sec-sso-only') && <Text as="p" tone="danger" size="sm">{errorOf('sec-sso-only')}</Text>}
        {draft.ssoOnly && (
          <FormField
            id="sec-break-glass"
            label="Emergency admins (password and second step)"
            required
            error={errorOf('sec-break-glass')}
            helper={`Minimum allowed: ${floor.breakGlassAccounts.minWhenSsoOnly}, all active admins. Every emergency sign-in is emailed to all admins.`}
          >
            <MultiSelect
              value={draft.breakGlassUserIds}
              onChange={(breakGlassUserIds) => set({ breakGlassUserIds: breakGlassUserIds.slice(0, floor.breakGlassAccounts.max) })}
              placeholder="Choose admins"
              options={admins.map((a) => ({ value: a.id, label: a.name, description: a.email, keywords: [a.email] }))}
            />
          </FormField>
        )}
      </FormSection>

      <FormSection title="Sessions" description="Leave a box empty to use the YukthiX default.">
        <FormField id="sec-idle" label="Sign out on the web after no activity for" error={errorOf('sec-idle')} helper={`Default ${SESSION_DEFAULTS.idleMinutes} minutes. Allowed: ${floor.sessionIdleMinutes.min} minutes to ${hours(floor.sessionIdleMinutes.max)}.`}>
          <NumberField value={draft.sessionIdleMinutes} onChange={(v) => set({ sessionIdleMinutes: v })} min={floor.sessionIdleMinutes.min} max={floor.sessionIdleMinutes.max} suffix="minutes" placeholder={String(SESSION_DEFAULTS.idleMinutes)} />
        </FormField>
        <FormField id="sec-absolute" label="Longest web session" error={errorOf('sec-absolute')} helper={`Default and maximum allowed: ${hours(floor.sessionAbsoluteMinutes.max)}. Shortest: ${floor.sessionAbsoluteMinutes.min} minutes.`}>
          <NumberField value={draft.sessionAbsoluteMinutes} onChange={(v) => set({ sessionAbsoluteMinutes: v })} min={floor.sessionAbsoluteMinutes.min} max={floor.sessionAbsoluteMinutes.max} suffix="minutes" placeholder={String(SESSION_DEFAULTS.absoluteMinutes)} />
        </FormField>
        <FormField id="sec-concurrent" label="Sessions per person at once" error={errorOf('sec-concurrent')} helper={`Empty means no limit. When it's reached, the least recently used session is signed out. Allowed: ${floor.maxConcurrentSessions.min} to ${floor.maxConcurrentSessions.max}.`}>
          <NumberField value={draft.maxConcurrentSessions} onChange={(v) => set({ maxConcurrentSessions: v })} min={floor.maxConcurrentSessions.min} max={floor.maxConcurrentSessions.max} placeholder="No limit" />
        </FormField>
      </FormSection>

      <FormSection title="Network allow-lists" description="One IP address or range per line, for example 203.0.113.0/24. An empty list allows any network. The mobile app and outside portals aren't limited.">
        <FormField id="sec-ip-desk" label="Web app" error={errorOf('sec-ip-desk')} helper={`Up to ${floor.ipAllowlistMaxEntries} ranges. Checked at sign-in and on every request.`}>
          <TextArea value={ipText.desk} onChange={(v) => setIp('desk', v)} rows={3} spellCheck={false} />
        </FormField>
        <FormField id="sec-ip-admin" label="Admin pages" error={errorOf('sec-ip-admin')} helper="Applies to user, settings and billing management.">
          <TextArea value={ipText.admin} onChange={(v) => setIp('admin', v)} rows={3} spellCheck={false} />
        </FormField>
        <FormField id="sec-ip-api" label="API keys" error={errorOf('sec-ip-api')} helper="Calls with a valid API key from other networks are refused.">
          <TextArea value={ipText.api} onChange={(v) => setIp('api', v)} rows={3} spellCheck={false} />
        </FormField>
      </FormSection>

      <FormSection title="Account lockout" description="After too many wrong tries in a row the account locks and the person is emailed. Each later lock lasts twice as long, up to 24 hours. Repeated failures from one network are blocked by YukthiX whatever you choose.">
        <FormField id="sec-lock-after" label="Lock after" error={errorOf('sec-lock-after')} helper={`YukthiX minimum: lock by the ${floor.maxFailedAttempts.max}th wrong try. Allowed: ${floor.maxFailedAttempts.min} to ${floor.maxFailedAttempts.max}.`}>
          <NumberField value={draft.maxFailedAttempts} onChange={(v) => set({ maxFailedAttempts: v ?? floor.maxFailedAttempts.max })} min={floor.maxFailedAttempts.min} max={floor.maxFailedAttempts.max} suffix="wrong tries" />
        </FormField>
        <FormField id="sec-lock-for" label="Lock for" error={errorOf('sec-lock-for')} helper={`YukthiX minimum: ${floor.lockMinutes.min} minutes. Allowed: ${floor.lockMinutes.min} minutes to ${hours(floor.lockMinutes.max)}.`}>
          <NumberField value={draft.lockMinutes} onChange={(v) => set({ lockMinutes: v ?? floor.lockMinutes.min })} min={floor.lockMinutes.min} max={floor.lockMinutes.max} suffix="minutes" />
        </FormField>
      </FormSection>

      <FormSection title="Passwords">
        <FormField id="sec-password" label="Minimum password length" error={errorOf('sec-password')} helper={`Minimum allowed: ${floor.passwordMinLength} characters. Passwords found in known breaches are always refused. Nobody is asked to change their password on a schedule.`}>
          <NumberField value={draft.passwordMinLength} onChange={(v) => set({ passwordMinLength: v ?? floor.passwordMinLength })} min={floor.passwordMinLength} max={floor.passwordMaxLength} suffix="characters" />
        </FormField>
      </FormSection>

      {status.kind === 'saved' && <InlineAlert tone="success">Saved. New limits apply to sessions that are already open.</InlineAlert>}
      {status.kind === 'failed' && <InlineAlert tone="danger" title="Not saved">{status.message}</InlineAlert>}
      <div className="yx-auth__row yx-auth__save">
        <Button type="submit" variant="primary" loading={status.kind === 'saving'} disabled={!dirty}>Save changes</Button>
        <Button onClick={discard} disabled={!dirty || status.kind === 'saving'}>Discard changes</Button>
        {!dirty && status.kind !== 'saved' && <Text tone="secondary" size="sm">No changes yet</Text>}
      </div>
    </form>
  );
}
