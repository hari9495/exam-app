'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, InlineAlert, Spinner } from '@yukthix/ui';
import { portalFetch, portalSession, type PortalError } from '../../../../../../lib/yx-portal';

// The link in the "confirm your request" email: makes the ticket, signs the person in and opens their help page with
// the new ticket. Sent once (the API answers 409 to a second try).
function ConfirmPage() {
  const { org, portal } = useParams<{ org: string; portal: string }>();
  const token = useSearchParams().get('token');
  const router = useRouter();
  const sent = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/yx/portal/${encodeURIComponent(org)}/${encodeURIComponent(portal)}`;
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setError('This link is not complete. Open it again from your email.');
      return;
    }
    portalFetch<{ id: string; number: string; token: string }>(org, portal, '/requests/confirm', { method: 'POST', body: { token } })
      .then((r) => {
        portalSession.set(org, portal, r.token);
        router.replace(`${base}?ticket=${encodeURIComponent(r.id)}&opened=${encodeURIComponent(r.number)}`);
      })
      .catch((e: PortalError) =>
        setError(e.status === 404 ? 'This link has expired. Send your request again.' : e.status === 409 ? 'This request was already sent. Sign in to follow it.' : e.message),
      );
  }, [token, org, portal, base, router]);
  return (
    <div className="yx-desk-portal">
      <main className="yx-desk-portal__main">
        {error ? (
          <InlineAlert
            tone="warning"
            title="We could not open your request"
            actions={
              <Button asChild size="sm">
                <Link href={base}>Go to the help page</Link>
              </Button>
            }
          >
            {error}
          </InlineAlert>
        ) : (
          <Spinner label="Opening your request" size="md" />
        )}
      </main>
    </div>
  );
}

export default function YxPortalConfirmPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <ConfirmPage />
    </Suspense>
  );
}
