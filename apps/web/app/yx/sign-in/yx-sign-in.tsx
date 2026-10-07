'use client';

import { useEffect, useRef } from 'react';
import { MfaChallengeScreen, SignInScreen } from '@yukthix/ui/auth';
import { useYxSignIn } from '../../../lib/hooks/useYxSignIn';
import { passkeyAssertion } from '../../../lib/yx-security';

// The API puts the single-use code (or "it did not work") in the URL fragment, which never reaches a
// server, a log or a Referer header (ASVS V3.1.1). Read it once, then the address bar is the plain
// sign-in page again (nothing to replay on reload).
function takeCallbackParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(null, '', '/yx/sign-in');
  return params;
}

// YukthiX staff sign-in (P12 §6.1), no company code: work email first, then the company's sign-in
// page, a password or a one-time code; or a mobile number, Google or Microsoft. A company choice when
// the sign-in opens several, and the second step when the account has one. `callback`: back from
// Google / Microsoft (/yx/sign-in/callback).
export function YxSignIn({ callback = false }: { callback?: boolean }) {
  const s = useYxSignIn();

  // The code is single-use and wiped from the URL on first read: run once (React Strict Mode).
  const started = useRef(false);
  useEffect(() => {
    if (!callback || started.current) return;
    started.current = true;
    void s.redeemSocial(takeCallbackParams().get('code'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback]);

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
      options={s.options}
      companies={s.companies}
      codeChannel={s.codeChannel}
      redirectingTo={s.redirectingTo}
      busy={s.busy}
      error={s.error}
      onIdentify={() => void s.identify()}
      onPasswordSubmit={() => void s.signIn()}
      onSendCode={(channel) => void s.sendCode(channel)}
      onVerifyCode={() => void s.verifyCode()}
      onRestart={s.restart}
      onMobile={s.startMobile}
      onPasskey={s.passkeyCapable ? () => void s.passkey() : undefined}
      onSocial={(provider) => void s.social(provider)}
      onSso={(providerId) => void s.sso(providerId)}
      onPickCompany={(id) => void s.pickCompany(id)}
      forgotPasswordHref="/yx/forgot-password"
    />
  );
}
