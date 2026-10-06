'use client';

import { MfaChallengeScreen, SignInScreen } from '@yukthix/ui/auth';
import { useYxSignIn } from '../../../lib/hooks/useYxSignIn';
import { passkeyAssertion } from '../../../lib/yx-security';

// YukthiX staff sign-in (P12 §6.1), no company code: email or mobile first, then the company's
// sign-in page, a password or a one-time code, a company choice when the credential opens several,
// and the second step when the account has one.
export default function YxSignInPage() {
  const s = useYxSignIn();

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

  return (
    <SignInScreen
      step={s.step}
      fields={s.fields}
      onFieldChange={s.setField}
      company={s.company}
      onForgetCompany={() => void s.forgetCompany()}
      providers={s.providers}
      companies={s.companies}
      busy={s.busy}
      error={s.error}
      onIdentify={() => void s.identify()}
      onPasswordSubmit={() => void s.signIn()}
      onSendCode={(channel) => void s.sendCode(channel)}
      onVerifyCode={() => void s.verifyCode()}
      onRestart={s.restart}
      onSso={(providerId) => void s.sso(providerId)}
      onPickCompany={(id) => void s.pickCompany(id)}
      forgotPasswordHref="/yx/forgot-password"
    />
  );
}
