'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { yxLandingPath } from '../../../lib/yx-landing';
import { useAuth } from '../../../lib/auth-context';
import { decodeJwtPayload } from '../../../lib/jwt';
import { MfaChallengeScreen } from '@yukthix/ui/auth';
import { passkeyAssertion } from '../../../lib/yx-security';

const GENERIC_ERROR = 'Sign-in failed. Please try again or use your password.';

// The API puts the one-time code (or the error) in the URL fragment, which never reaches a server,
// a log or a Referer header (ASVS V3.1.1). Read it once and wipe it from the address bar and history.
function takeCallbackParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(null, '', window.location.pathname);
  return params;
}
const ERROR_REDIRECT_DELAY_MS = 3000;
// Every company sign-in is the YukthiX one (founder decision 7 Oct 2026).
const signInPath = '/yx/sign-in';

function SsoCallbackRedeemer() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // The IdP's sign-in is a first factor; an enrolled YukthiX factor is still owed (P12 YX-IAM-01).
  const [challenge, setChallenge] = useState<{ mfaToken: string; factors: string[] } | null>(null);
  async function finish(result: { accessToken: string; mfa?: { required: boolean } }) {
    login('', result.accessToken);
    if (result.mfa?.required) {
      router.push('/yx/setup-mfa');
      return;
    }
    const payload = decodeJwtPayload(result.accessToken);
    router.push(await yxLandingPath(result.accessToken, payload?.role as string | undefined));
  }

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => router.push(signInPath), ERROR_REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [error, router]);

  // The code is single-use and wiped from the URL on first read: run once, even when React
  // re-runs effects (Strict Mode).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const searchParams = takeCallbackParams();
    const ssoError = searchParams.get('ssoError');
    if (ssoError) {
      setError(
        ssoError === 'not_provisioned'
          ? "Your account isn't set up for SSO access. Contact your org admin."
          : GENERIC_ERROR,
      );
      return;
    }

    const code = searchParams.get('code');
    if (!code) {
      setError(GENERIC_ERROR);
      return;
    }

    apiFetch('/auth/sso/exchange', { method: 'POST', body: JSON.stringify({ code }) })
      .then((result) => {
        if (result.mfaRequired) {
          setChallenge({ mfaToken: result.mfaToken, factors: result.factors });
          return;
        }
        return finish(result);
      })
      .catch((err: Error) => {
        setError(err.message || GENERIC_ERROR);
      });
    // Runs once: the code is single-use and has just been wiped from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (challenge) {
    const post = (path: string, body: object) =>
      apiFetch(path, { method: 'POST', body: JSON.stringify({ mfaToken: challenge.mfaToken, ...body }) });
    return (
      <div className="yx-root">
        <MfaChallengeScreen
          factors={challenge.factors}
          getPasskey={() => passkeyAssertion(() => post('/auth/mfa/passkey-options', {}))}
          submit={async (proof) => finish(await post('/auth/mfa/verify', proof))}
          sendCode={async (channel) => {
            await post('/auth/mfa/otp/send', { channel });
          }}
          onStartAgain={() => router.push(signInPath)}
        />
      </div>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
        <Link href={signInPath} className="text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted">Signing you in&hellip;</p>
    </main>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted">Signing you in&hellip;</p>
        </main>
      }
    >
      <SsoCallbackRedeemer />
    </Suspense>
  );
}
