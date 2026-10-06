import type { FormEvent } from 'react';
import { Button, Link } from '../../components/button';
import { Avatar } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Spinner, Text } from '../../components/foundations';
import { PasswordField, TextField } from '../../components/inputs';
import { AuthFrame } from './kit';
import type { SsoProviderOption } from './types';

/**
 * Email first, no company code (founder decision 7 Oct 2026):
 * identify (email or mobile) -> the company's sign-in page, or password / one-time code ->
 * "Choose your company" only when the credential opened accounts in several companies.
 */
export type SignInStep = 'identify' | 'redirecting' | 'password' | 'code' | 'choose-company';

export interface SignInFields {
  /** Work email or mobile number. */
  identifier: string;
  password: string;
  code: string;
}

/** A company the person may sign in to. Name and logo only. */
export interface CompanyOption {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface SignInScreenProps {
  step: SignInStep;
  fields: SignInFields;
  onFieldChange: (field: keyof SignInFields, value: string) => void;
  /** The company this device signed in to last ("Signing in to ..."), or the one in the web address. */
  company?: Omit<CompanyOption, 'id'> | null;
  /** "Not your company?": forget it on this device. Omit when the company comes from the web address. */
  onForgetCompany?: () => void;
  /** The known company's identity providers ("Continue with ..."). */
  providers: SsoProviderOption[];
  /** Step choose-company: the companies the credential opened. */
  companies?: CompanyOption[];
  busy?: boolean;
  error?: string | null;
  /** Step identify: where does this email or number go? */
  onIdentify: () => void;
  onPasswordSubmit: () => void;
  /** Sends a one-time code (a mobile number may ask for WhatsApp). Also re-sends. */
  onSendCode: (channel?: 'sms' | 'whatsapp') => void;
  onVerifyCode: () => void;
  /** Back to step identify with another email or number. */
  onRestart: () => void;
  onSso: (providerId: string) => void;
  onPickCompany: (companyId: string) => void;
  forgotPasswordHref: string;
}

export function providerButtonLabel(p: SsoProviderOption): string {
  return p.type === 'oidc_google' ? 'Continue with Google' : p.type === 'oidc_entra' ? 'Continue with Microsoft' : `Continue with ${p.name}`;
}

export const isMobileIdentifier = (value: string) => value.trim() !== '' && !value.includes('@');

/** Staff sign-in (P12 §6.1). Nobody types a company code. */
export function SignInScreen(props: SignInScreenProps) {
  const { step, fields, onFieldChange: set, providers, busy, error, company } = props;
  const identifier = fields.identifier.trim();
  const isMobile = isMobileIdentifier(identifier);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 'identify') props.onIdentify();
    else if (step === 'password') props.onPasswordSubmit();
    else if (step === 'code') props.onVerifyCode();
  };

  const who = (
    <div className="yx-auth__row yx-auth__who">
      <Text as="span" className="yx-auth__who-id">{identifier}</Text>
      <Button size="sm" disabled={busy} onClick={props.onRestart}>Change</Button>
    </div>
  );
  const alert = error && <InlineAlert tone="danger">{error}</InlineAlert>;
  const ssoButtons = providers.length > 0 && (
    <div className="yx-auth__or" role="group" aria-label="Or sign in with your company account">
      {providers.map((p) => (
        <Button key={p.id} fullWidth disabled={busy} onClick={() => props.onSso(p.id)}>{providerButtonLabel(p)}</Button>
      ))}
    </div>
  );

  const title = step === 'choose-company' ? 'Choose your company' : 'Sign in';
  const subtitle =
    step === 'choose-company' ? 'Your sign-in works for more than one company. Pick the one you want now.' : company ? undefined : 'Use your work email or mobile number.';

  return (
    <AuthFrame title={title} subtitle={subtitle}>
      {company && step !== 'choose-company' && (
        <div className="yx-auth__row yx-auth__company-line">
          <span aria-hidden="true"><Avatar name={company.name} src={company.logoUrl} size={24} /></span>
          <Text as="span" role="status">Signing in to <b>{company.name}</b></Text>
          {props.onForgetCompany && <Button size="sm" disabled={busy} onClick={props.onForgetCompany}>Not your company?</Button>}
        </div>
      )}

      {step === 'redirecting' && (
        <div className="yx-auth__row" role="status">
          <Spinner />
          <Text as="span">Taking you to your company's sign-in page…</Text>
        </div>
      )}

      {step === 'choose-company' && (
        <div className="yx-auth__form">
          <ul className="yx-auth__companies" aria-label="Companies">
            {(props.companies ?? []).map((c) => (
              <li key={c.id}>
                <Button fullWidth disabled={busy} onClick={() => props.onPickCompany(c.id)}>
                  <span className="yx-auth__company">
                    <span aria-hidden="true"><Avatar name={c.name} src={c.logoUrl} size={24} /></span>
                    {c.name}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          {alert}
          <Button disabled={busy} onClick={props.onRestart}>Use a different email or number</Button>
        </div>
      )}

      {(step === 'identify' || step === 'password' || step === 'code') && (
        <form className="yx-auth__form" onSubmit={submit} noValidate>
          {step === 'identify' && (
            <>
              <FormField label="Work email or mobile number" required>
                <TextField value={fields.identifier} onChange={(v) => set('identifier', v)} autoComplete="username" spellCheck={false} autoCapitalize="none" />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!identifier}>Continue</Button>
              {ssoButtons}
            </>
          )}

          {step === 'password' && (
            <>
              {who}
              <FormField label="Password" required>
                <PasswordField value={fields.password} onChange={(v) => set('password', v)} autoComplete="current-password" />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!fields.password}>Sign in</Button>
              <div className="yx-auth__row">
                <Button size="sm" disabled={busy} onClick={() => props.onSendCode(isMobile ? 'sms' : undefined)}>
                  {isMobile ? 'Text me a code instead' : 'Email me a code instead'}
                </Button>
                {isMobile && <Button size="sm" disabled={busy} onClick={() => props.onSendCode('whatsapp')}>Send a code on WhatsApp</Button>}
              </div>
              <Link href={props.forgotPasswordHref}>Forgot your password?</Link>
              {ssoButtons}
            </>
          )}

          {step === 'code' && (
            <>
              {who}
              <Text as="p" tone="secondary" role="status">If {identifier} can sign in by code, we sent it a 6-digit code. It expires in 5 minutes.</Text>
              <FormField label="6-digit code" required>
                <TextField value={fields.code} onChange={(v) => set('code', v)} autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth loading={busy} disabled={fields.code.trim().length < 6}>Sign in</Button>
              <div className="yx-auth__row">
                <Button size="sm" disabled={busy} onClick={() => props.onSendCode(isMobile ? 'sms' : undefined)}>Send a new code</Button>
              </div>
            </>
          )}
        </form>
      )}
    </AuthFrame>
  );
}

export interface ForgotPasswordScreenProps {
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  /** The request was sent: say so, the same whether or not an account exists. */
  sent: boolean;
  busy?: boolean;
  error?: string | null;
  signInHref: string;
}

/** "Forgot your password?" by work email only: every company account with it gets its own link. */
export function ForgotPasswordScreen({ email, onEmailChange, onSubmit, sent, busy, error, signInHref }: ForgotPasswordScreenProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <AuthFrame title="Reset your password" subtitle={sent ? undefined : 'We email a link to reset it. It works for 15 minutes.'}>
      {sent ? (
        <div className="yx-auth__form">
          <Text as="p" role="status">If {email.trim()} has a YukthiX account, we sent it a reset link. With accounts in more than one company, each gets its own link.</Text>
          <Link href={signInHref}>Back to sign in</Link>
        </div>
      ) : (
        <form className="yx-auth__form" onSubmit={submit} noValidate>
          <FormField label="Work email" required>
            <TextField type="email" value={email} onChange={onEmailChange} autoComplete="username" spellCheck={false} autoCapitalize="none" />
          </FormField>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!email.includes('@')}>Email me a reset link</Button>
          <Link href={signInHref}>Back to sign in</Link>
        </form>
      )}
    </AuthFrame>
  );
}
