'use client';

import { useState } from 'react';
import { MfaChallengeScreen, SignInScreen, type SignInFields, type SignInMethod } from '@yukthix/ui/auth';
import { useStaffLogin } from '../../../lib/hooks/useStaffLogin';
import { passkeyAssertion } from '../../../lib/yx-security';

// YukthiX staff sign-in (P12 §6.1): password, one-time code or single sign-on, then the second
// step when the account has one. All the API work is the existing useStaffLogin flow.
export default function YxSignInPage() {
  const s = useStaffLogin({ enrolPath: '/yx/setup-mfa', yx: true });
  const [method, setMethod] = useState<SignInMethod>('sso');

  if (s.challenge) {
    return (
      <MfaChallengeScreen
        factors={s.challenge.factors}
        getPasskey={() => passkeyAssertion(s.secondFactorPasskeyOptions)}
        submit={s.verifySecondFactor}
        sendCode={s.sendSecondFactorCode}
        onStartAgain={s.cancelChallenge}
      />
    );
  }

  const fields: SignInFields = { organization: s.organizationSlug, email: s.email, password: s.password, identifier: s.identifier, code: s.otpCode };
  const setters: Record<keyof SignInFields, (v: string) => void> = {
    organization: s.setOrganizationSlug,
    email: s.setEmail,
    password: s.setPassword,
    identifier: s.setIdentifier,
    code: s.setOtpCode,
  };
  const changeMethod = (m: SignInMethod) => {
    if ((m === 'code') !== s.otpMode) s.toggleOtpMode();
    setMethod(m);
  };

  return (
    <SignInScreen
      fields={fields}
      onFieldChange={(k, v) => setters[k](v)}
      method={method}
      onMethodChange={changeMethod}
      orgName={s.branding?.name}
      providers={s.ssoProviders}
      codeSent={Boolean(s.otpSent)}
      busy={s.submitting}
      error={s.error}
      onPasswordSubmit={() => void s.handleSubmit()}
      onSendCode={(channel) => void s.sendOtp(channel)}
      onVerifyCode={() => void s.verifyOtp()}
      onCodeRestart={s.resetOtp}
      onSso={(providerId) => void s.startSso(providerId)}
      forgotPasswordHref="/forgot-password"
    />
  );
}
