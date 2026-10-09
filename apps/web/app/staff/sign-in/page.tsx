'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MfaChallengeScreen, StaffSignInScreen, type MfaProof } from '@yukthix/ui/auth';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { botChallengeToken } from '../../../lib/bot-challenge';
import { decodeJwtPayload } from '../../../lib/jwt';
import { takeNext } from '../../../lib/safe-next';
import { roleToLandingPath } from '../../../lib/staff-routing';
import { passkeyAssertion } from '../../../lib/yx-security';
import { message, type MfaChallenge } from '../../../lib/hooks/useYxSignIn';
import { yxProofError } from '../../../lib/yx-auth-messages';

interface SignedIn {
  accessToken: string;
  mfa?: { required: boolean };
}

const post = (path: string, body: object) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) });

// YukthiX platform staff (P12 Q7): POST /auth/platform/login, then their security key (the API offers
// staff nothing else), then the platform console. Company accounts are refused by the API here.
export default function StaffSignInPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function finish(result: SignedIn) {
    login('', result.accessToken);
    const role = decodeJwtPayload(result.accessToken)?.role as string | undefined;
    const next = takeNext();
    if (result.mfa?.required) return router.push(next ? `/yx/setup-mfa?next=${encodeURIComponent(next)}` : '/yx/setup-mfa');
    router.push(next ?? roleToLandingPath(role));
  }

  async function signIn() {
    setError(null);
    setBusy(true);
    try {
      const challengeToken = await botChallengeToken();
      const result = await post('/auth/platform/login', { email: email.trim(), password, ...(challengeToken ? { challengeToken } : {}) });
      if (result.mfaRequired) setChallenge(result as MfaChallenge);
      else finish(result as SignedIn);
    } catch (err) {
      setError(message(err, 'Sign-in failed'));
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <MfaChallengeScreen
        factors={challenge.factors}
        recoveryCode={false}
        getPasskey={() => passkeyAssertion(() => post('/auth/mfa/passkey-options', { mfaToken: challenge.mfaToken }))}
        submit={async (proof: MfaProof) => finish(await post('/auth/mfa/verify', { mfaToken: challenge.mfaToken, ...proof }).catch((err) => Promise.reject(yxProofError(err, proof.factor))))}
        onStartAgain={() => {
          setChallenge(null);
          setPassword('');
        }}
      />
    );
  }

  return (
    <StaffSignInScreen
      email={email}
      password={password}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={() => void signIn()}
      busy={busy}
      error={error}
    />
  );
}
