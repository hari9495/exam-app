import { useState, type FormEvent } from 'react';
import { Fingerprint, KeyRound, Smartphone } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Avatar } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { Spinner, Text } from '../../components/foundations';
import { CodeField, PasswordField, TextField } from '../../components/inputs';
import { isEmail, isPhoneNumber } from '../../lib/validators';
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
  /** The other ways in could not be loaded (after retrying): a quiet line with "Try again" instead of nothing. */
  optionsFailed?: boolean;
  onRetryOptions?: () => void;
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

/** A box that says what is wrong once the person leaves it or presses Enter, never while they type. */
function CheckedField({ id, label, value, onChange, autoComplete, mobile, helper, early }: { id?: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; mobile?: boolean; helper?: string; /** Pressed too early: what is missing. */ early?: string }) {
  const [left, setLeft] = useState(false);
  const wrong = left && value.trim() !== '' && !(mobile ? isPhoneNumber(value) : isEmail(value));
  const message = mobile ? 'Enter your full mobile number, like 98450 12345' : 'Enter your full email, like name@company.com';
  return (
    <FormField id={id} label={label} required helper={helper} error={early ?? (wrong ? message : undefined)}>
      <TextField
        type={mobile ? 'tel' : 'email'}
        {...(mobile ? { inputMode: 'tel' as const } : {})}
        value={value}
        onChange={(v) => {
          setLeft(false);
          onChange(v);
        }}
        onBlur={() => setLeft(true)}
        onKeyDown={(e) => e.key === 'Enter' && setLeft(true)}
        autoComplete={autoComplete}
        spellCheck={false}
        autoCapitalize="none"
      />
    </FormField>
  );
}

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
  const typed = isEmail(identifier);
  // Never a greyed-out button (founder rule): pressed too early, the box says what is missing and takes the focus.
  const early = useTooEarly(
    step === 'identify' && !typed
      ? [{ fieldId: 'yx-signin-email', message: identifier ? 'Enter your full email, like name@company.com' : 'Enter your work email.' }]
      : step === 'mobile' && !isPhoneNumber(mobile)
        ? [{ fieldId: 'yx-signin-mobile', message: mobile ? 'Enter your full mobile number, like 98450 12345' : 'Enter your mobile number.' }]
        : step === 'password' && !fields.password
          ? [{ fieldId: 'yx-signin-password', message: 'Enter your password.' }]
          : (step === 'code' || step === 'mobile-code') && fields.code.trim().length < 6
            ? [{ fieldId: 'yx-signin-code', message: 'Enter the 6-digit code.' }]
            : [],
  );
  // While a request runs the other buttons do nothing (the busy one shows `loading`), so nothing is sent twice.
  const idle = (fn?: () => void) => () => {
    if (!busy) fn?.();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || early.stop()) return;
    if (step === 'identify') props.onIdentify();
    else if (step === 'mobile') props.onSendCode(textFirst);
    else if (step === 'password') props.onPasswordSubmit();
    else if (step === 'code' || step === 'mobile-code') props.onVerifyCode();
  };

  const who = (shown: string) => (
    <div className="yx-auth__row yx-auth__who">
      <Text as="span" className="yx-auth__who-id">{shown}</Text>
      <Button size="sm" onClick={idle(props.onRestart)}>Change</Button>
    </div>
  );
  const alert = error && <InlineAlert tone="danger">{error}</InlineAlert>;
  const companyButtons = providers.map((p) => (
    <Button key={p.id} fullWidth size="lg" icon={KeyRound} onClick={idle(() => props.onSso(p.id))}>{providerButtonLabel(p)}</Button>
  ));
  // One blue button: the passkey until an email is typed, then Continue (founder review 19 Oct).
  const passkeyButton = passkeyOn && (
    <Button variant={typed ? 'secondary' : 'primary'} fullWidth size="lg" icon={Fingerprint} onClick={idle(props.onPasskey)}>Sign in with a passkey</Button>
  );
  const ways = (mobileOn || googleOn || microsoftOn || providers.length > 0) && (
    <div className="yx-auth__ways" role="group" aria-label="Other ways to sign in">
      {/* One row, short labels, so the page fits a laptop at 150 % (founder review 19 Oct); the names stay in full. */}
      {(mobileOn || microsoftOn || googleOn) && (
        <div className="yx-auth__ways-row">
          {mobileOn && <Button fullWidth size="lg" icon={Smartphone} onClick={idle(props.onMobile)} aria-label="Continue with mobile">Mobile</Button>}
          {microsoftOn && <Button fullWidth size="lg" icon={MicrosoftMark} onClick={idle(() => props.onSocial!('microsoft'))} aria-label="Continue with Microsoft">Microsoft</Button>}
          {googleOn && <Button fullWidth size="lg" icon={GoogleMark} onClick={idle(() => props.onSocial!('google'))} aria-label="Continue with Google">Google</Button>}
        </div>
      )}
      {companyButtons}
    </div>
  );
  const or = <div className="yx-auth__divider" role="separator"><span>or</span></div>;
  const optionsFailedLine = props.optionsFailed && props.onRetryOptions && (
    <Text as="p" size="sm" tone="secondary" className="yx-auth__options-failed" role="status">
      Couldn&apos;t load other sign-in methods ·{' '}
      <Link asChild>
        <button type="button" onClick={props.onRetryOptions}>Try again</button>
      </Link>
    </Text>
  );

  const title = step === 'choose-company' ? 'Choose your company' : 'Sign in';
  const subtitle: Record<SignInStep, string | undefined> = {
    identify: passkeyOn ? 'Use your passkey, or start with your work email.' : 'Start with your work email. We take you to the right way in for your company.',
    mobile: 'We send a 6-digit code to your mobile number.',
    redirecting: props.redirectingTo ? undefined : 'Your company signs in with single sign-on, so there is no YukthiX password.',
    password: 'Your company lets you sign in with a password.',
    code: undefined,
    'mobile-code': undefined,
    'choose-company': 'Your sign-in works for more than one company. Pick the one you want now.',
  };
  const channelName = props.codeChannel === 'whatsapp' ? 'WhatsApp' : 'SMS';

  return (
    <AuthFrame title={title} subtitle={subtitle[step]} company={company?.name}>
      {company && step !== 'choose-company' && (
        <div className="yx-auth__row yx-auth__company-line">
          <span aria-hidden="true"><Avatar name={company.name} src={company.logoUrl} size={24} /></span>
          <Text as="span" role="status">Signing in to <b>{company.name}</b></Text>
          {props.onForgetCompany && <Button size="sm" onClick={idle(props.onForgetCompany)}>Not your company?</Button>}
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
                <Button fullWidth onClick={idle(() => props.onPickCompany(c.id))}>
                  <span className="yx-auth__company">
                    <span aria-hidden="true"><Avatar name={c.name} src={c.logoUrl} size={24} /></span>
                    {c.name}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          {alert}
          <Button onClick={idle(props.onRestart)}>Sign in another way</Button>
        </div>
      )}

      {step !== 'redirecting' && step !== 'choose-company' && (
        <form className="yx-auth__form" onSubmit={submit} noValidate>
          {step === 'identify' && (
            <>
              {/* SEC-01: where passkeys are on, the passkey is the main way in (the PTR-01 pattern); the work email follows. */}
              {passkeyButton}
              {passkeyOn && ways}
              {passkeyOn && or}
              <CheckedField id="yx-signin-email" early={early.errorOf('yx-signin-email')} label="Work email" value={fields.identifier} onChange={(v) => set('identifier', v)} autoComplete="username webauthn" />
              {alert}
              <Button type="submit" variant={passkeyOn && !typed ? 'secondary' : 'primary'} fullWidth size="lg" loading={busy}>Continue</Button>
              {!passkeyOn && ways && (
                <>
                  {or}
                  {ways}
                </>
              )}
              {optionsFailedLine}
            </>
          )}

          {step === 'mobile' && (
            <>
              <CheckedField id="yx-signin-mobile" early={early.errorOf('yx-signin-mobile')} mobile label="Mobile number" helper="Add the country code if it isn't an Indian number." value={fields.mobile} onChange={(v) => set('mobile', v)} autoComplete="tel" />
              {alert}
              {options?.sms && <Button type="submit" variant="primary" fullWidth loading={busy}>Text me a code</Button>}
              {options?.whatsapp &&
                (options.sms ? (
                  <Button fullWidth onClick={idle(() => !early.stop() && props.onSendCode('whatsapp'))}>Send a code on WhatsApp</Button>
                ) : (
                  <Button type="submit" variant="primary" fullWidth loading={busy}>Send a code on WhatsApp</Button>
                ))}
              <Button onClick={idle(props.onRestart)}>Use my work email instead</Button>
            </>
          )}

          {step === 'password' && (
            <>
              {who(identifier)}
              <FormField id="yx-signin-password" label="Password" required error={early.errorOf('yx-signin-password')}>
                <PasswordField value={fields.password} onChange={(v) => set('password', v)} autoComplete="current-password" />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth loading={busy}>Sign in</Button>
              {options?.emailCode !== false && (
                <div className="yx-auth__row">
                  <Button size="sm" onClick={idle(() => props.onSendCode())}>Email me a code instead</Button>
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
              <FormField id="yx-signin-code" label="6-digit code" required error={early.errorOf('yx-signin-code')}>
                <CodeField value={fields.code} onChange={(v) => set('code', v)} />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth loading={busy}>Sign in</Button>
              <div className="yx-auth__row">
                <Button size="sm" onClick={idle(() => props.onSendCode(step === 'code' ? undefined : (props.codeChannel ?? textFirst)))}>Send a new code</Button>
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
  const early = useTooEarly([
    ...(isEmail(email) ? [] : [{ fieldId: 'yx-staff-email', message: email.trim() ? 'Enter your full email, like name@company.com' : 'Enter your staff email.' }]),
    ...(password ? [] : [{ fieldId: 'yx-staff-password', message: 'Enter your password.' }]),
  ]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || early.stop()) return;
    onSubmit();
  };
  return (
    <AuthFrame title="YukthiX staff sign-in" subtitle="For YukthiX platform staff. Have your security key ready." note="YukthiX staff only · security key required">
      <form className="yx-auth__form" onSubmit={submit} noValidate>
        <CheckedField id="yx-staff-email" early={early.errorOf('yx-staff-email')} label="Staff email" value={email} onChange={onEmailChange} autoComplete="username" />
        <FormField id="yx-staff-password" label="Password" required error={early.errorOf('yx-staff-password')}>
          <PasswordField value={password} onChange={onPasswordChange} autoComplete="current-password" />
        </FormField>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <Button type="submit" variant="primary" fullWidth size="lg" loading={busy}>Continue</Button>
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
  const early = useTooEarly(isEmail(email) ? [] : [{ fieldId: 'yx-forgot-email', message: email.trim() ? 'Enter your full email, like name@company.com' : 'Enter your work email.' }]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || early.stop()) return;
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
          <CheckedField id="yx-forgot-email" early={early.errorOf('yx-forgot-email')} label="Work email" value={email} onChange={onEmailChange} autoComplete="username" />
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Button type="submit" variant="primary" fullWidth loading={busy}>Email me a reset link</Button>
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
  const early = useTooEarly([
    ...(password ? [] : [{ fieldId: 'yx-reset-new', message: 'Enter a new password.' }]),
    ...(!confirm ? [{ fieldId: 'yx-reset-again', message: 'Type the new password again.' }] : mismatch ? [{ fieldId: 'yx-reset-again', message: 'The two passwords are not the same' }] : []),
  ]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || early.stop()) return;
    onSubmit();
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
        <FormField id="yx-reset-new" label="New password" required error={early.errorOf('yx-reset-new')}>
          <PasswordField value={password} onChange={onPasswordChange} autoComplete="new-password" />
        </FormField>
        <FormField id="yx-reset-again" label="Type it again" required error={early.errorOf('yx-reset-again') ?? (mismatch ? 'The two passwords are not the same' : undefined)}>
          <PasswordField value={confirm} onChange={onConfirmChange} autoComplete="new-password" />
        </FormField>
        {error && (
          <InlineAlert tone="danger">
            {error} {/expired|invalid/i.test(error) && <Link href={forgotHref}>Get a new link</Link>}
          </InlineAlert>
        )}
        <Button type="submit" variant="primary" fullWidth loading={busy}>Save new password</Button>
        <Link href={signInHref}>Back to sign in</Link>
      </form>
    </AuthFrame>
  );
}
