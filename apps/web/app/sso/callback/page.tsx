'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { useAuth, SSO_PENDING_SLUG_KEY } from '../../../lib/auth-context';
import { decodeJwtPayload } from '../../../lib/jwt';

const GENERIC_ERROR = 'Sign-in failed. Please try again or use your password.';
const ERROR_REDIRECT_DELAY_MS = 3000;

function SsoCallbackRedeemer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => router.push('/login'), ERROR_REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [error, router]);

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
        login(stashedSlug, result.accessToken);
        const payload = decodeJwtPayload(result.accessToken);
        router.push(payload?.role === 'org_admin' ? '/users' : payload?.role === 'panel' ? '/reports' : '/dashboard');
      })
      .catch((err: Error) => {
        setError(err.message || GENERIC_ERROR);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Back to login
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-recruiter-text-tertiary">Signing you in&hellip;</p>
    </main>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-recruiter-text-tertiary">Signing you in&hellip;</p>
        </main>
      }
    >
      <SsoCallbackRedeemer />
    </Suspense>
  );
}
