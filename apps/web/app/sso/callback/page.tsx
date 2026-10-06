'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { useAuth, SSO_PENDING_SLUG_KEY } from '../../../lib/auth-context';
import { decodeJwtPayload } from '../../../lib/jwt';
import { MfaProof, SecondFactorForm } from '../../../components/auth/SecondFactorForm';
import { MfaChallengeScreen } from '@yukthix/ui/auth';
import { YX_SSO_RETURN_KEY } from '../../../lib/auth-context';
import { passkeyAssertion } from '../../../lib/yx-security';

const GENERIC_ERROR = 'Sign-in failed. Please try again or use your password.';
const ERROR_REDIRECT_DELAY_MS = 3000;

function SsoCallbackRedeemer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // The IdP's sign-in is a first factor; an enrolled YukthiX factor is still owed (P12 YX-IAM-01).
  const [challenge, setChallenge] = useState<{ mfaToken: string; factors: string[]; slug: string } | null>(null);
  // Started from the YukthiX sign-in page (/yx/sign-in): finish in the YukthiX screens.
  const [yx] = useState(() => typeof window !== 'undefined' && window.sessionStorage.getItem(YX_SSO_RETURN_KEY) === '1');
  const signInPath = yx ? '/yx/sign-in' : '/login';

  function finish(slug: string, result: { accessToken: string; mfa?: { required: boolean } }) {
    login(slug, result.accessToken);
    const payload = decodeJwtPayload(result.accessToken);
    if (result.mfa?.required) {
      router.push(yx ? '/yx/setup-mfa' : '/profile?mfa=setup');
      return;
    }
    router.push(payload?.role === 'org_admin' ? '/users' : payload?.role === 'panel' ? '/reports' : '/dashboard');
  }

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => router.push(signInPath), ERROR_REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [error, router, signInPath]);

  useEffect(() => {
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
        // The org slug was stashed in sessionStorage by the login page right before it
        // navigated to the IdP, since that in-memory form state doesn't survive the redirect.
        const stashedSlug = window.sessionStorage.getItem(SSO_PENDING_SLUG_KEY) ?? '';
        window.sessionStorage.removeItem(SSO_PENDING_SLUG_KEY);
        window.sessionStorage.removeItem(YX_SSO_RETURN_KEY);
        if (result.mfaRequired) {
          setChallenge({ mfaToken: result.mfaToken, factors: result.factors, slug: stashedSlug });
          return;
        }
        finish(stashedSlug, result);
      })
      .catch((err: Error) => {
        setError(err.message || GENERIC_ERROR);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (challenge) {
    const post = (path: string, body: object) =>
      apiFetch(path, { method: 'POST', body: JSON.stringify({ mfaToken: challenge.mfaToken, ...body }) });
    if (yx) {
      return (
        <div className="yx-root">
          <MfaChallengeScreen
            factors={challenge.factors}
            getPasskey={() => passkeyAssertion(() => post('/auth/mfa/passkey-options', {}))}
            submit={async (proof) => finish(challenge.slug, await post('/auth/mfa/verify', proof))}
            sendCode={async (channel) => {
              await post('/auth/mfa/otp/send', { channel });
            }}
            onStartAgain={() => router.push(signInPath)}
          />
        </div>
      );
    }
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div>
            <h1 className="text-lg font-semibold">Two-step verification</h1>
            <p className="text-sm text-muted">Confirm it&apos;s you to finish signing in.</p>
          </div>
          <SecondFactorForm
            factors={challenge.factors}
            getPasskeyOptions={() => post('/auth/mfa/passkey-options', {})}
            submit={async (proof: MfaProof) => finish(challenge.slug, await post('/auth/mfa/verify', proof))}
            sendCode={async (channel) => {
              await post('/auth/mfa/otp/send', { channel });
            }}
          />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
        <Link href={signInPath} className="text-sm font-medium text-primary hover:underline">
          Back to login
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
