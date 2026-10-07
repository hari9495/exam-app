import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ForgotPasswordScreen, ResetPasswordScreen, SignInScreen, type SignInFields, type SignInScreenProps, type SignInStep } from './sign-in';
import { MfaChallengeScreen, MfaEnrolScreen } from './mfa';
import { COMPANIES, NOW, ORG_NAME, PROVIDERS, RECOVERY_CODES, TOTP_SETUP } from './data';

const meta: Meta = { title: 'Screens/Security/Sign in', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const KAVERI = { name: ORG_NAME, logoUrl: null };
const ALL_WAYS = { google: true, microsoft: true, sms: true, whatsapp: true, emailCode: true };
const NO_WAYS = { google: false, microsoft: false, sms: false, whatsapp: false, emailCode: true };

// Email first, no company code: identify -> password / code -> (several companies) choose one.
function SignIn({ start = {}, ...over }: Partial<SignInScreenProps> & { start?: Partial<SignInFields> }) {
  const [fields, setFields] = useState<SignInFields>({ identifier: '', mobile: '', password: '', code: '', ...start });
  const [step, setStep] = useState<SignInStep>(over.step ?? 'identify');
  const [company, setCompany] = useState(over.company ?? null);
  return (
    <SignInScreen
      fields={fields}
      onFieldChange={(k, v) => setFields((f) => ({ ...f, [k]: v }))}
      providers={[]}
      companies={COMPANIES}
      options={ALL_WAYS}
      onIdentify={() => setStep('password')}
      onPasswordSubmit={() => setStep('choose-company')}
      onSendCode={(channel) => setStep(channel ? 'mobile-code' : 'code')}
      onMobile={() => setStep('mobile')}
      onSocial={() => setStep('redirecting')}
      onVerifyCode={() => setStep('choose-company')}
      onRestart={() => setStep('identify')}
      onSso={() => setStep('redirecting')}
      onPickCompany={() => {}}
      onForgetCompany={() => setCompany(null)}
      forgotPasswordHref="#forgot"
      {...over}
      step={step}
      company={company}
    />
  );
}

const DIVYA = { identifier: 'divya.r@kaverifoods.in' };
const MOBILE = { mobile: '+91 98450 12345' };
export const Identify: S = { name: 'Sign in · work email, or another way', render: () => <SignIn /> };
export const IdentifyEmailOnly: S = { name: 'Sign in · work email only (no other way set up)', render: () => <SignIn options={NO_WAYS} /> };
export const IdentifySomeWays: S = { name: 'Sign in · company allows mobile only', render: () => <SignIn company={KAVERI} options={{ ...NO_WAYS, sms: true }} /> };
export const Mobile: S = { name: 'Sign in · mobile number', render: () => <SignIn step="mobile" /> };
export const MobileWhatsApp: S = { name: 'Sign in · mobile number, WhatsApp only', render: () => <SignIn step="mobile" options={{ ...ALL_WAYS, sms: false }} start={MOBILE} /> };
export const MobileCode: S = { name: 'Sign in · mobile code sent', render: () => <SignIn step="mobile-code" codeChannel="sms" start={MOBILE} /> };
export const RedirectingProvider: S = { name: 'Sign in · going to the provider', render: () => <SignIn step="redirecting" redirectingTo="your account provider" start={DIVYA} /> };
export const SignInFailed: S = { name: 'Sign in · provider sign-in refused', render: () => <SignIn error="We couldn't sign you in with that account. Try another way, or ask your admin." /> };
export const PhoneWays: S = { name: 'Sign in · phone, all ways', globals: { viewport: { value: 'phone' } }, render: () => <SignIn /> };
export const PhoneMobile: S = { name: 'Sign in · phone, mobile number', globals: { viewport: { value: 'phone' } }, render: () => <SignIn step="mobile" start={MOBILE} /> };
export const Remembered: S = { name: 'Sign in · remembered company', render: () => <SignIn company={KAVERI} providers={PROVIDERS} /> };
export const Password: S = { name: 'Sign in · password', render: () => <SignIn step="password" start={DIVYA} /> };
export const PasswordNoEmailCode: S = { name: 'Sign in · password, email codes off', render: () => <SignIn step="password" company={KAVERI} options={{ ...ALL_WAYS, emailCode: false }} start={DIVYA} /> };
export const CodeSent: S = { name: 'Sign in · code sent', render: () => <SignIn step="code" start={DIVYA} /> };
export const Redirecting: S = { name: 'Sign in · going to single sign-on', render: () => <SignIn step="redirecting" start={DIVYA} /> };
export const ChooseCompany: S = { name: 'Sign in · choose your company', render: () => <SignIn step="choose-company" start={DIVYA} /> };
export const Loading: S = { name: 'Sign in · signing in', render: () => <SignIn step="password" busy start={{ ...DIVYA, password: 'correct horse battery' }} /> };
export const Error: S = {
  name: 'Sign in · wrong password',
  render: () => <SignIn step="password" error="Invalid email or password." start={{ ...DIVYA, password: 'not the password' }} />,
};
export const Phone: S = { name: 'Sign in · phone', globals: { viewport: { value: 'phone' } }, render: () => <SignIn company={KAVERI} providers={PROVIDERS} /> };
export const PhoneChoose: S = {
  name: 'Sign in · choose your company, phone',
  globals: { viewport: { value: 'phone' } },
  render: () => <SignIn step="choose-company" start={DIVYA} />,
};

function Forgot({ sent = false }: { sent?: boolean }) {
  const [email, setEmail] = useState(sent ? DIVYA.identifier : '');
  const [done, setDone] = useState(sent);
  return <ForgotPasswordScreen email={email} onEmailChange={setEmail} onSubmit={() => setDone(true)} sent={done} signInHref="#sign-in" />;
}
export const ForgotPassword: S = { name: 'Forgot password · work email only', render: () => <Forgot /> };
export const ForgotPasswordSent: S = { name: 'Forgot password · link sent', render: () => <Forgot sent /> };

function Reset({ error = null, done = false }: { error?: string | null; done?: boolean }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  return <ResetPasswordScreen password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} onSubmit={() => {}} done={done} error={error} signInHref="#sign-in" forgotHref="#forgot" />;
}
export const ResetPassword: S = { name: 'Reset password · new password', render: () => <Reset /> };
export const ResetPasswordExpired: S = { name: 'Reset password · link expired', render: () => <Reset error="This reset link is invalid or has expired" /> };
export const ResetPasswordDone: S = { name: 'Reset password · done', render: () => <Reset done /> };

const challenge = { getPasskey: () => wait(), submit: () => wait(), sendCode: () => wait(), onStartAgain: () => {} };
export const Challenge: S = { name: 'Second step · passkey and app', render: () => <MfaChallengeScreen factors={['passkey', 'totp', 'otp']} {...challenge} /> };
export const ChallengeAppOnly: S = { name: 'Second step · authenticator app only', render: () => <MfaChallengeScreen factors={['totp']} {...challenge} /> };
export const ChallengeError: S = {
  name: 'Second step · wrong code',
  render: () => (
    <MfaChallengeScreen
      factors={['totp']}
      {...challenge}
      submit={async () => {
        await wait(200);
        throw new globalThis.Error('That code is not right. Check the time on your phone and try again.');
      }}
    />
  ),
};
export const ChallengePhone: S = { name: 'Second step · phone', globals: { viewport: { value: 'phone' } }, render: () => <MfaChallengeScreen factors={['passkey', 'totp']} {...challenge} /> };

const enrol = {
  allowedFactors: ['passkey', 'totp'],
  onAddPasskey: async () => (await wait(), { recoveryCodes: RECOVERY_CODES }),
  onStartTotp: async () => (await wait(), TOTP_SETUP),
  onConfirmTotp: async () => (await wait(), { recoveryCodes: RECOVERY_CODES }),
  onContinue: () => {},
  now: NOW,
};
export const Enrol: S = { name: 'First sign-in · set up two-step', render: () => <MfaEnrolScreen dueAt="2026-10-08T00:00:00+05:30" {...enrol} /> };
export const EnrolOverdue: S = { name: 'First sign-in · set up two-step (deadline passed)', render: () => <MfaEnrolScreen dueAt="2026-09-20T00:00:00+05:30" {...enrol} /> };
export const EnrolError: S = {
  name: 'First sign-in · passkey failed',
  render: () => (
    <MfaEnrolScreen
      dueAt="2026-10-08T00:00:00+05:30"
      {...enrol}
      onAddPasskey={async () => {
        await wait(200);
        throw Object.assign(new globalThis.Error('cancelled'), { name: 'NotAllowedError' });
      }}
    />
  ),
};
export const EnrolPhone: S = { name: 'First sign-in · phone', globals: { viewport: { value: 'phone' } }, render: () => <MfaEnrolScreen dueAt="2026-10-08T00:00:00+05:30" {...enrol} /> };
