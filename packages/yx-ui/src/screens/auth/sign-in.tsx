import type { FormEvent } from 'react';
import { Button, Link } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { PasswordField, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { AuthFrame } from './kit';
import type { SsoProviderOption } from './types';

export type SignInMethod = 'password' | 'code' | 'sso';

export interface SignInFields {
  /** The company's code (organisation slug). */
  organization: string;
  email: string;
  password: string;
  /** Email or mobile number for a one-time code. */
  identifier: string;
  code: string;
}

export interface SignInScreenProps {
  fields: SignInFields;
  onFieldChange: (field: keyof SignInFields, value: string) => void;
  method: SignInMethod;
  onMethodChange: (method: SignInMethod) => void;
  /** The company's name once its code is recognised. */
  orgName?: string | null;
  /** The company's active identity providers; single sign-on is offered only when there is one. */
  providers: SsoProviderOption[];
  /** A one-time code was sent; ask for it. */
  codeSent: boolean;
  busy?: boolean;
  error?: string | null;
  onPasswordSubmit: () => void;
  onSendCode: (channel?: 'sms' | 'whatsapp') => void;
  onVerifyCode: () => void;
  onCodeRestart: () => void;
  /** No id: the provider that owns the email's domain. */
  onSso: (providerId?: string) => void;
  forgotPasswordHref: string;
}

export function providerButtonLabel(p: SsoProviderOption): string {
  return p.type === 'oidc_google' ? 'Continue with Google' : p.type === 'oidc_entra' ? 'Continue with Microsoft' : `Continue with ${p.name}`;
}

/** Staff sign-in (P12 §6.1): password, a one-time code, or the company's identity provider. */
export function SignInScreen(props: SignInScreenProps) {
  const { fields, onFieldChange: set, providers, codeSent, busy, error, orgName } = props;
  const hasSso = providers.length > 0;
  const method: SignInMethod = props.method === 'sso' && !hasSso ? 'password' : props.method;
  const isMobile = fields.identifier.trim() !== '' && !fields.identifier.includes('@');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (method === 'password') props.onPasswordSubmit();
    else if (method === 'sso') props.onSso();
    else if (codeSent) props.onVerifyCode();
    else props.onSendCode(isMobile ? 'sms' : undefined);
  };

  const options = [
    ...(hasSso ? [{ value: 'sso' as const, label: 'Single sign-on' }] : []),
    { value: 'password' as const, label: 'Password' },
    { value: 'code' as const, label: 'One-time code' },
  ];

  return (
    <AuthFrame title="Sign in" subtitle={orgName ? <span role="status">to {orgName}</span> : 'Use your work account.'}>
      <form className="yx-auth__form" onSubmit={submit} noValidate>
        <FormField label="Company code" required helper="Your company's short code, for example kaveri-foods.">
          <TextField value={fields.organization} onChange={(v) => set('organization', v)} autoComplete="organization" spellCheck={false} autoCapitalize="none" />
        </FormField>

        <Segment label="Sign in with" options={options} value={method} onChange={props.onMethodChange} />

        {method === 'sso' && (
          <>
            <FormField label="Work email" helper="We send you to your company's sign-in page.">
              <TextField type="email" value={fields.email} onChange={(v) => set('email', v)} autoComplete="email" />
            </FormField>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!fields.email.includes('@')}>Continue</Button>
            <div className="yx-auth__or" role="group" aria-label="Or choose your sign-in provider">
              {providers.map((p) => (
                <Button key={p.id} fullWidth disabled={busy} onClick={() => props.onSso(p.id)}>{providerButtonLabel(p)}</Button>
              ))}
            </div>
          </>
        )}

        {method === 'password' && (
          <>
            <FormField label="Work email" required>
              <TextField type="email" value={fields.email} onChange={(v) => set('email', v)} autoComplete="username" />
            </FormField>
            <FormField label="Password" required>
              <PasswordField value={fields.password} onChange={(v) => set('password', v)} autoComplete="current-password" />
            </FormField>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!fields.email || !fields.password}>Sign in</Button>
            <Link href={props.forgotPasswordHref}>Forgot your password?</Link>
          </>
        )}

        {method === 'code' && !codeSent && (
          <>
            <FormField label="Work email or mobile number" required helper="A mobile number gets a text message.">
              <TextField value={fields.identifier} onChange={(v) => set('identifier', v)} autoComplete="username" spellCheck={false} />
            </FormField>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!fields.identifier.trim()}>
              {isMobile ? 'Text me a code' : 'Email me a code'}
            </Button>
            {isMobile && <Button fullWidth disabled={busy} onClick={() => props.onSendCode('whatsapp')}>Send it on WhatsApp</Button>}
          </>
        )}

        {method === 'code' && codeSent && (
          <>
            <Text as="p" tone="secondary" role="status">If an account matches {fields.identifier.trim()}, we sent it a 6-digit code. It expires in 5 minutes.</Text>
            <FormField label="6-digit code" required>
              <TextField value={fields.code} onChange={(v) => set('code', v)} autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
            </FormField>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <Button type="submit" variant="primary" fullWidth loading={busy} disabled={fields.code.trim().length < 6}>Sign in</Button>
            <div className="yx-auth__row">
              <Button size="sm" disabled={busy} onClick={() => props.onSendCode(isMobile ? 'sms' : undefined)}>Send a new code</Button>
              <Button size="sm" disabled={busy} onClick={props.onCodeRestart}>Use a different email or number</Button>
            </div>
          </>
        )}
      </form>
    </AuthFrame>
  );
}
