import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SignInScreen, type SignInFields, type SignInMethod, type SignInScreenProps } from './sign-in';
import { MfaChallengeScreen, MfaEnrolScreen } from './mfa';
import { NOW, ORG_NAME, PROVIDERS, RECOVERY_CODES, TOTP_SETUP } from './data';

const meta: Meta = { title: 'Screens/Security/Sign in', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));

function SignIn({ start = {}, ...over }: Partial<SignInScreenProps> & { start?: Partial<SignInFields> }) {
  const [fields, setFields] = useState<SignInFields>({ organization: 'kaveri-foods', email: '', password: '', identifier: '', code: '', ...start });
  const [method, setMethod] = useState<SignInMethod>(over.method ?? 'sso');
  const [codeSent, setCodeSent] = useState(over.codeSent ?? false);
  return (
    <SignInScreen
      fields={fields}
      onFieldChange={(k, v) => setFields((f) => ({ ...f, [k]: v }))}
      orgName={ORG_NAME}
      providers={PROVIDERS}
      onPasswordSubmit={() => {}}
      onSendCode={() => setCodeSent(true)}
      onVerifyCode={() => {}}
      onCodeRestart={() => setCodeSent(false)}
      onSso={() => {}}
      forgotPasswordHref="#forgot"
      {...over}
      method={method}
      onMethodChange={setMethod}
      codeSent={codeSent}
    />
  );
}

export const SingleSignOn: S = { name: 'Sign in · single sign-on', render: () => <SignIn /> };
export const Password: S = { name: 'Sign in · password', render: () => <SignIn method="password" start={{ email: 'divya.r@kaverifoods.in' }} /> };
export const OneTimeCode: S = { name: 'Sign in · one-time code', render: () => <SignIn method="code" start={{ identifier: '+91 98450 12345' }} /> };
export const CodeSent: S = { name: 'Sign in · code sent', render: () => <SignIn method="code" codeSent start={{ identifier: 'divya.r@kaverifoods.in' }} /> };
export const Loading: S = { name: 'Sign in · signing in', render: () => <SignIn method="password" busy start={{ email: 'divya.r@kaverifoods.in', password: 'correct horse battery' }} /> };
export const Error: S = {
  name: 'Sign in · wrong password',
  render: () => <SignIn method="password" error="Invalid email or password." start={{ email: 'divya.r@kaverifoods.in', password: 'not the password' }} />,
};
export const NoSso: S = { name: 'Sign in · company without single sign-on', render: () => <SignIn method="password" providers={[]} orgName={null} start={{ organization: '' }} /> };
export const Phone: S = { name: 'Sign in · phone', globals: { viewport: { value: 'phone' } }, render: () => <SignIn /> };

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
