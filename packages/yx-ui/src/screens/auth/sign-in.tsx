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
import { useAuthWords } from './words';
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

const providerName = (p: SsoProviderOption) => (p.type === 'oidc_google' ? 'Google' : p.type === 'oidc_entra' ? 'Microsoft' : p.name);

export function providerButtonLabel(p: SsoProviderOption): string {
  return `Continue with ${providerName(p)}`;
}

export const isMobileIdentifier = (value: string) => value.trim() !== '' && !value.includes('@');

/** A box that says what is wrong once the person leaves it or presses Enter, never while they type. */
function CheckedField({ id, label, value, onChange, autoComplete, mobile, helper, early }: { id?: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; mobile?: boolean; helper?: string; /** Pressed too early: what is missing. */ early?: string }) {
  const [left, setLeft] = useState(false);
  const w = useAuthWords();
  const wrong = left && value.trim() !== '' && !(mobile ? isPhoneNumber(value) : isEmail(value));
  const message = mobile ? w.enterFullMobile : w.enterFullEmail;
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
  const w = useAuthWords();
  // Never a greyed-out button (founder rule): pressed too early, the box says what is missing and takes the focus.
  const early = useTooEarly(
    step === 'identify' && !typed
      ? [{ fieldId: 'yx-signin-email', message: identifier ? w.enterFullEmail : w.enterWorkEmail }]
      : step === 'mobile' && !isPhoneNumber(mobile)
        ? [{ fieldId: 'yx-signin-mobile', message: mobile ? w.enterFullMobile : w.enterMobile }]
        : step === 'password' && !fields.password
          ? [{ fieldId: 'yx-signin-password', message: w.enterPassword }]
          : (step === 'code' || step === 'mobile-code') && fields.code.trim().length < 6
            ? [{ fieldId: 'yx-signin-code', message: w.enterCode }]
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
      <Button size="sm" onClick={idle(props.onRestart)}>{w.change}</Button>
    </div>
  );
  const alert = error && <InlineAlert tone="danger">{w.err(error)}</InlineAlert>;
  const companyButtons = providers.map((p) => (
    <Button key={p.id} fullWidth size="lg" icon={KeyRound} onClick={idle(() => props.onSso(p.id))}>{w.continueWith(providerName(p))}</Button>
  ));
  // One blue button: the passkey until an email is typed, then Continue (founder review 19 Oct).
  const passkeyButton = passkeyOn && (
    <Button variant={typed ? 'secondary' : 'primary'} fullWidth size="lg" icon={Fingerprint} onClick={idle(props.onPasskey)}>{w.passkeyButton}</Button>
  );
  const ways = (mobileOn || googleOn || microsoftOn || providers.length > 0) && (
    <div className="yx-auth__ways" role="group" aria-label={w.otherWays}>
      {/* One row, short labels, so the page fits a laptop at 150 % (founder review 19 Oct); the names stay in full. */}
      {(mobileOn || microsoftOn || googleOn) && (
        <div className="yx-auth__ways-row">
          {mobileOn && <Button fullWidth size="lg" icon={Smartphone} onClick={idle(props.onMobile)} aria-label={w.continueWithMobile}>{w.mobile}</Button>}
          {microsoftOn && <Button fullWidth size="lg" icon={MicrosoftMark} onClick={idle(() => props.onSocial!('microsoft'))} aria-label={w.continueWith('Microsoft')}>Microsoft</Button>}
          {googleOn && <Button fullWidth size="lg" icon={GoogleMark} onClick={idle(() => props.onSocial!('google'))} aria-label={w.continueWith('Google')}>Google</Button>}
        </div>
      )}
      {companyButtons}
    </div>
  );
  const or = <div className="yx-auth__divider" role="separator"><span>{w.or}</span></div>;
  const optionsFailedLine = props.optionsFailed && props.onRetryOptions && (
    <Text as="p" size="sm" tone="secondary" className="yx-auth__options-failed" role="status">
      {w.optionsFailed} ·{' '}
      <Link asChild>
        <button type="button" onClick={props.onRetryOptions}>{w.tryAgain}</button>
      </Link>
    </Text>
  );

  const title = step === 'choose-company' ? w.chooseCompany : w.signIn;
  const subtitle: Record<SignInStep, string | undefined> = {
    identify: passkeyOn ? w.subIdentifyPasskey : w.subIdentify,
    mobile: w.subMobile,
    redirecting: props.redirectingTo ? undefined : w.subRedirecting,
    password: w.subPassword,
    code: undefined,
    'mobile-code': undefined,
    'choose-company': w.subChooseCompany,
  };
  const [before, companyName, after] = w.signingInTo(company?.name ?? '');
  const channelName = props.codeChannel === 'whatsapp' ? 'WhatsApp' : 'SMS';

  return (
    <AuthFrame title={title} subtitle={subtitle[step]} company={company?.name}>
      {company && step !== 'choose-company' && (
        <div className="yx-auth__row yx-auth__company-line">
          <span aria-hidden="true"><Avatar name={company.name} src={company.logoUrl} size={24} /></span>
          <Text as="span" role="status">{before}<b>{companyName}</b>{after}</Text>
          {props.onForgetCompany && <Button size="sm" onClick={idle(props.onForgetCompany)}>{w.notYourCompany}</Button>}
        </div>
      )}

      {step === 'redirecting' && (
        <div className="yx-auth__row" role="status">
          <Spinner />
          <Text as="span">{props.redirectingTo ? w.takingYouTo(props.redirectingTo) : w.takingYouToCompany}</Text>
        </div>
      )}

      {step === 'choose-company' && (
        <div className="yx-auth__form">
          <ul className="yx-auth__companies" aria-label={w.companies}>
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
          <Button onClick={idle(props.onRestart)}>{w.signInAnotherWay}</Button>
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
              <CheckedField id="yx-signin-email" early={early.errorOf('yx-signin-email')} label={w.workEmail} value={fields.identifier} onChange={(v) => set('identifier', v)} autoComplete="username webauthn" />
              {alert}
              <Button type="submit" variant={passkeyOn && !typed ? 'secondary' : 'primary'} fullWidth size="lg" loading={busy}>{w.continue}</Button>
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
              <CheckedField id="yx-signin-mobile" early={early.errorOf('yx-signin-mobile')} mobile label={w.mobileNumber} helper={w.mobileHelper} value={fields.mobile} onChange={(v) => set('mobile', v)} autoComplete="tel" />
              {alert}
              {options?.sms && <Button type="submit" variant="primary" fullWidth loading={busy}>{w.textMeACode}</Button>}
              {options?.whatsapp &&
                (options.sms ? (
                  <Button fullWidth onClick={idle(() => !early.stop() && props.onSendCode('whatsapp'))}>{w.sendCodeWhatsApp}</Button>
                ) : (
                  <Button type="submit" variant="primary" fullWidth loading={busy}>{w.sendCodeWhatsApp}</Button>
                ))}
              <Button onClick={idle(props.onRestart)}>{w.useEmailInstead}</Button>
            </>
          )}

          {step === 'password' && (
            <>
              {who(identifier)}
              <FormField id="yx-signin-password" label={w.password} required error={early.errorOf('yx-signin-password')}>
                <PasswordField value={fields.password} onChange={(v) => set('password', v)} autoComplete="current-password" />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth loading={busy}>{w.signIn}</Button>
              {options?.emailCode !== false && (
                <div className="yx-auth__row">
                  <Button size="sm" onClick={idle(() => props.onSendCode())}>{w.emailMeCode}</Button>
                </div>
              )}
              <Link href={props.forgotPasswordHref}>{w.forgot}</Link>
              {providers.length > 0 && (
                <div className="yx-auth__or" role="group" aria-label={w.orCompanyAccount}>
                  {companyButtons}
                </div>
              )}
            </>
          )}

          {(step === 'code' || step === 'mobile-code') && (
            <>
              {who(step === 'code' ? identifier : mobile)}
              <Text as="p" tone="secondary" role="status">
                {step === 'code' ? w.codeSentEmail(identifier) : w.codeSentMobile(mobile, channelName)}
              </Text>
              <FormField id="yx-signin-code" label={w.sixDigitCode} required error={early.errorOf('yx-signin-code')}>
                <CodeField value={fields.code} onChange={(v) => set('code', v)} />
              </FormField>
              {alert}
              <Button type="submit" variant="primary" fullWidth loading={busy}>{w.signIn}</Button>
              <div className="yx-auth__row">
                <Button size="sm" onClick={idle(() => props.onSendCode(step === 'code' ? undefined : (props.codeChannel ?? textFirst)))}>{w.sendNewCode}</Button>
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
  const w = useAuthWords();
  const early = useTooEarly(isEmail(email) ? [] : [{ fieldId: 'yx-forgot-email', message: email.trim() ? w.enterFullEmail : w.enterWorkEmail }]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || early.stop()) return;
    onSubmit();
  };
  return (
    <AuthFrame title={w.resetTitle} subtitle={sent ? undefined : w.resetSub}>
      {sent ? (
        <div className="yx-auth__form">
          <Text as="p" role="status">{w.linkSent(email.trim())}</Text>
          <Link href={signInHref}>{w.backToSignIn}</Link>
        </div>
      ) : (
        <form className="yx-auth__form" onSubmit={submit} noValidate>
          <CheckedField id="yx-forgot-email" early={early.errorOf('yx-forgot-email')} label={w.workEmail} value={email} onChange={onEmailChange} autoComplete="username" />
          {error && <InlineAlert tone="danger">{w.err(error)}</InlineAlert>}
          <Button type="submit" variant="primary" fullWidth loading={busy}>{w.emailResetLink}</Button>
          <Link href={signInHref}>{w.backToSignIn}</Link>
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
  const w = useAuthWords();
  const early = useTooEarly([
    ...(password ? [] : [{ fieldId: 'yx-reset-new', message: w.enterNewPassword }]),
    ...(!confirm ? [{ fieldId: 'yx-reset-again', message: w.typeNewAgain }] : mismatch ? [{ fieldId: 'yx-reset-again', message: w.notSame }] : []),
  ]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || early.stop()) return;
    onSubmit();
  };
  if (done) {
    return (
      <AuthFrame title={w.passwordChanged}>
        <div className="yx-auth__form">
          <Text as="p" role="status">{w.newPasswordWorks}</Text>
          <Button asChild variant="primary" fullWidth>
            <a href={signInHref}>{w.signIn}</a>
          </Button>
        </div>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={w.chooseNewPassword} subtitle={w.passwordRule(minLength)}>
      <form className="yx-auth__form" onSubmit={submit} noValidate>
        <FormField id="yx-reset-new" label={w.newPassword} required error={early.errorOf('yx-reset-new')}>
          <PasswordField value={password} onChange={onPasswordChange} autoComplete="new-password" />
        </FormField>
        <FormField id="yx-reset-again" label={w.typeItAgain} required error={early.errorOf('yx-reset-again') ?? (mismatch ? w.notSame : undefined)}>
          <PasswordField value={confirm} onChange={onConfirmChange} autoComplete="new-password" />
        </FormField>
        {error && (
          <InlineAlert tone="danger">
            {w.err(error)} {/expired|invalid/i.test(error) && <Link href={forgotHref}>{w.getNewLink}</Link>}
          </InlineAlert>
        )}
        <Button type="submit" variant="primary" fullWidth loading={busy}>{w.saveNewPassword}</Button>
        <Link href={signInHref}>{w.backToSignIn}</Link>
      </form>
    </AuthFrame>
  );
}
