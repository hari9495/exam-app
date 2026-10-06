import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SignInScreen, type SignInFields, type SignInScreenProps, type SignInStep } from './sign-in';
import { MfaChallengeScreen, MfaEnrolScreen } from './mfa';
import { COMPANIES, NOW, ORG_NAME, PROVIDERS, RECOVERY_CODES, TOTP_SETUP } from './data';

const meta: Meta = { title: 'Screens/Security/Sign in', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const KAVERI = { name: ORG_NAME, logoUrl: null };

// Email first, no company code: identify -> password / code -> (several companies) choose one.
function SignIn({ start = {}, ...over }: Partial<SignInScreenProps> & { start?: Partial<SignInFields> }) {
  const [fields, setFields] = useState<SignInFields>({ identifier: '', password: '', code: '', ...start });
  const [step, setStep] = useState<SignInStep>(over.step ?? 'identify');
  const [company, setCompany] = useState(over.company ?? null);
  return (
    <SignInScreen
      fields={fields}
      onFieldChange={(k, v) => setFields((f) => ({ ...f, [k]: v }))}
      providers={[]}
      companies={COMPANIES}
      onIdentify={() => setStep('password')}
      onPasswordSubmit={() => setStep('choose-company')}
      onSendCode={() => setStep('code')}
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
export const Identify: S = { name: 'Sign in · email or mobile first', render: () => <SignIn /> };
export const Remembered: S = { name: 'Sign in · remembered company', render: () => <SignIn company={KAVERI} providers={PROVIDERS} /> };
export const Password: S = { name: 'Sign in · password', render: () => <SignIn step="password" start={DIVYA} /> };
export const PasswordMobile: S = { name: 'Sign in · password, mobile number', render: () => <SignIn step="password" start={{ identifier: '+91 98450 12345' }} /> };
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
