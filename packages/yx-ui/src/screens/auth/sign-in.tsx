import type { FormEvent } from 'react';
import { Fingerprint, KeyRound, Smartphone } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Avatar } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Spinner, Text } from '../../components/foundations';
import { PasswordField, TextField } from '../../components/inputs';
import { AuthFrame } from './kit';
import { GoogleMark, MicrosoftMark } from './marks';
import type { SignInOptions, SsoProviderOption } from './types';

/**
 * The YukthiX sign-in (founder request 7 Oct 2026): work email + Continue, then "or" and the other
 * ways in -- a passkey, a mobile number, Microsoft, Google -- each shown only when it is on.
 *  - email: identify -> the company's sign-in page, or password / emailed code;
 *  - mobile: number -> a code by SMS or WhatsApp;
 *  - Microsoft / Google: their sign-in page, back through the callback ('redirecting').
 * "Choose your company" only when the sign-in opened accounts in several companies.
 */
export type SignInStep = 'identify' | 'mobile' | 'redirecting' | 'password' | 'code' | 'mobile-code' | 'choose-company';

export type SocialProvider = 'google' | 'microsoft';

export interface SignInFields {
  /** Work email. */
  identifier: string;
  /** Mobile number (Continue with mobile). */
  mobile: string;
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
  /** The other ways in. Omitted: only the work email. */
  options?: SignInOptions;
  /** Step choose-company: the companies the sign-in opened. */
  companies?: CompanyOption[];
  /** Step mobile-code: how the code went. */
  codeChannel?: 'sms' | 'whatsapp';
  /** Step redirecting: where to ("Google", "Microsoft"); omitted = the company's sign-in page. */
  redirectingTo?: string;
  busy?: boolean;
  error?: string | null;
  /** Step identify: where does this email go? */
  onIdentify: () => void;
  onPasswordSubmit: () => void;
  /** Sends a one-time code: by email (no channel) or to the mobile number by SMS / WhatsApp. Also re-sends. */
  onSendCode: (channel?: 'sms' | 'whatsapp') => void;
  onVerifyCode: () => void;
  /** Back to step identify. */
  onRestart: () => void;
  /** "Sign in with a passkey": pass it only where this browser supports passkeys. The work-email field also offers passkeys in its autofill (the host starts that request). */
  onPasskey?: () => void;
  /** "Continue with mobile". */
  onMobile?: () => void;
  onSocial?: (provider: SocialProvider) => void;
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
  const { step, fields, onFieldChange: set, providers, options, busy, error, company } = props;
  const identifier = fields.identifier.trim();
  const mobile = fields.mobile.trim();
  const passkeyOn = Boolean(options?.passkey && props.onPasskey);
  const mobileOn = Boolean(options && (options.sms || options.whatsapp) && props.onMobile);
  // A company's own Google / Microsoft provider replaces YukthiX's button (one button each).
  const googleOn = Boolean(options?.google && props.onSocial) && !providers.some((p) => p.type === 'oidc_google');
  const microsoftOn = Boolean(options?.microsoft && props.onSocial) && !providers.some((p) => p.type === 'oidc_entra');
  const textFirst: 'sms' | 'whatsapp' = options?.sms ? 'sms' : 'whatsapp';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 'identify') props.onIdentify();
    else if (step === 'mobile') props.onSendCode(textFirst);
    else if (step === 'password') props.onPasswordSubmit();
    else if (step === 'code' || step === 'mobile-code') props.onVerifyCode();
  };

  const who = (shown: string) => (
    <div className="yx-auth__row yx-auth__who">
      <Text as="span" className="yx-auth__who-id">{shown}</Text>
      <Button size="sm" disabled={busy} onClick={props.onRestart}>Change</Button>
    </div>
  );
  const alert = error && <InlineAlert tone="danger">{error}</InlineAlert>;
  const companyButtons = providers.map((p) => (
    <Button key={p.id} fullWidth size="lg" icon={KeyRound} disabled={busy} onClick={() => props.onSso(p.id)}>{providerButtonLabel(p)}</Button>
  ));
  const otherWays = (passkeyOn || mobileOn || googleOn || microsoftOn || providers.length > 0) && (
    <>
      <div className="yx-auth__divider" role="separator"><span>or</span></div>
      <div className="yx-auth__ways" role="group" aria-label="Other ways to sign in">
        {passkeyOn && <Button fullWidth size="lg" icon={Fingerprint} disabled={busy} onClick={props.onPasskey}>Sign in with a passkey</Button>}
        {mobileOn && <Button fullWidth size="lg" icon={Smartphone} disabled={busy} onClick={props.onMobile}>Continue with mobile</Button>}
        {microsoftOn && <Button fullWidth size="lg" icon={MicrosoftMark} disabled={busy} onClick={() => props.onSocial!('microsoft')}>Continue with Microsoft</Button>}
        {googleOn && <Button fullWidth size="lg" icon={GoogleMark} disabled={busy} onClick={() => props.onSocial!('google')}>Continue with Google</Button>}
        {companyButtons}
      </div>
    </>
  );

  const title = step === 'choose-company' ? 'Choose your company' : 'Sign in';
  const subtitle =
    step === 'choose-company' ? 'Your sign-in works for more than one company. Pick the one you want now.' : step === 'mobile' ? 'We send a 6-digit code to your mobile number.' : undefined;
  const channelName = props.codeChannel === 'whatsapp' ? 'WhatsApp' : 'SMS';

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
          <Text as="span">{props.redirectingTo ? `Taking you to ${props.redirectingTo}…` : `Taking you to your company's sign-in page…`}</Text>
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
          <Button disabled={busy} onClick={props.onRestart}>Sign in another way</Button>
        </div>
      )}

      {step !== 'redirecting' && step !== 'choose-company' && (
        <form className="yx-auth__form" onSubmit={submit} noValidate>
          {step === 'identify' && (
            <>
              <FormField label="Work email" required>
                <TextField type="email" value={fields.identifier} onChange={(v) => set('identifier', v)} autoComplete="username webauthn" spellCheck={false} autoCapitalize="none" />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth size="lg" loading={busy} disabled={!identifier.includes('@')}>Continue</Button>
              {otherWays}
            </>
          )}

          {step === 'mobile' && (
            <>
              <FormField label="Mobile number" required helper="Add the country code if it isn't an Indian number.">
                <TextField type="tel" value={fields.mobile} onChange={(v) => set('mobile', v)} autoComplete="tel" inputMode="tel" />
              </FormField>
              {alert}
              {options?.sms && <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!mobile}>Text me a code</Button>}
              {options?.whatsapp &&
                (options.sms ? (
                  <Button fullWidth disabled={busy || !mobile} onClick={() => props.onSendCode('whatsapp')}>Send a code on WhatsApp</Button>
                ) : (
                  <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!mobile}>Send a code on WhatsApp</Button>
                ))}
              <Button disabled={busy} onClick={props.onRestart}>Use my work email instead</Button>
            </>
          )}

          {step === 'password' && (
            <>
              {who(identifier)}
              <FormField label="Password" required>
                <PasswordField value={fields.password} onChange={(v) => set('password', v)} autoComplete="current-password" />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!fields.password}>Sign in</Button>
              {options?.emailCode !== false && (
                <div className="yx-auth__row">
                  <Button size="sm" disabled={busy} onClick={() => props.onSendCode()}>Email me a code instead</Button>
                </div>
              )}
              <Link href={props.forgotPasswordHref}>Forgot your password?</Link>
              {providers.length > 0 && (
                <div className="yx-auth__or" role="group" aria-label="Or sign in with your company account">
                  {companyButtons}
                </div>
              )}
            </>
          )}

          {(step === 'code' || step === 'mobile-code') && (
            <>
              {who(step === 'code' ? identifier : mobile)}
              <Text as="p" tone="secondary" role="status">
                {step === 'code'
                  ? `If ${identifier} can sign in by code, we sent it a 6-digit code. It expires in 5 minutes.`
                  : `If ${mobile} can sign in by code, we sent it a 6-digit code by ${channelName}. It expires in 5 minutes.`}
              </Text>
              <FormField label="6-digit code" required>
                <TextField value={fields.code} onChange={(v) => set('code', v)} autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth loading={busy} disabled={fields.code.trim().length < 6}>Sign in</Button>
              <div className="yx-auth__row">
                <Button size="sm" disabled={busy} onClick={() => props.onSendCode(step === 'code' ? undefined : (props.codeChannel ?? textFirst))}>Send a new code</Button>
              </div>
            </>
          )}
        </form>
      )}
    </AuthFrame>
  );
}

export interface StaffSignInScreenProps {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  error?: string | null;
}

/**
 * YukthiX platform staff only (P12 Q7): email and password, then a hardware security key. Its own
 * page, never linked from the company sign-in; company accounts cannot sign in here.
 */
export function StaffSignInScreen({ email, password, onEmailChange, onPasswordChange, onSubmit, busy, error }: StaffSignInScreenProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <AuthFrame title="YukthiX staff sign-in" subtitle="For YukthiX platform staff. Have your security key ready.">
      <form className="yx-auth__form" onSubmit={submit} noValidate>
        <FormField label="Staff email" required>
          <TextField type="email" value={email} onChange={onEmailChange} autoComplete="username" spellCheck={false} autoCapitalize="none" />
        </FormField>
        <FormField label="Password" required>
          <PasswordField value={password} onChange={onPasswordChange} autoComplete="current-password" />
        </FormField>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <Button type="submit" variant="primary" fullWidth size="lg" loading={busy} disabled={!email.includes('@') || !password}>Continue</Button>
      </form>
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

export interface ResetPasswordScreenProps {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onSubmit: () => void;
  /** The new password is set. */
  done: boolean;
  busy?: boolean;
  /** The API's answer as one sentence (too short, breached, link expired). */
  error?: string | null;
  /** Company minimum; YukthiX never allows fewer than 12. */
  minLength?: number;
  signInHref: string;
  forgotHref: string;
}

/** The page the reset email links to: a new password twice, then back to sign in. The API checks length and breach lists. */
export function ResetPasswordScreen({ password, confirm, onPasswordChange, onConfirmChange, onSubmit, done, busy, error, minLength = 12, signInHref, forgotHref }: ResetPasswordScreenProps) {
  const mismatch = confirm.length > 0 && confirm !== password;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!mismatch) onSubmit();
  };
  if (done) {
    return (
      <AuthFrame title="Password changed">
        <div className="yx-auth__form">
          <Text as="p" role="status">Your new password works now. You were signed out on every device, so sign in again.</Text>
          <Button asChild variant="primary" fullWidth>
            <a href={signInHref}>Sign in</a>
          </Button>
        </div>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Choose a new password" subtitle={`At least ${minLength} characters. Passwords found in known breaches are refused.`}>
      <form className="yx-auth__form" onSubmit={submit} noValidate>
        <FormField label="New password" required>
          <PasswordField value={password} onChange={onPasswordChange} autoComplete="new-password" />
        </FormField>
        <FormField label="Type it again" required error={mismatch ? 'The two passwords are not the same' : undefined}>
          <PasswordField value={confirm} onChange={onConfirmChange} autoComplete="new-password" />
        </FormField>
        {error && (
          <InlineAlert tone="danger">
            {error} {/expired|invalid/i.test(error) && <Link href={forgotHref}>Get a new link</Link>}
          </InlineAlert>
        )}
        <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!password || !confirm || mismatch}>Save new password</Button>
        <Link href={signInHref}>Back to sign in</Link>
      </form>
    </AuthFrame>
  );
}
