'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ErrorScreen } from '../components/ErrorScreen';

/**
 * Route-level error boundary. Without this, any thrown render/data error shows Next's unstyled
 * "Application error: a client-side exception has occurred" screen, which reads as a dead product.
 *
 * `digest` is deliberately surfaced: in production Next replaces the real error message with a
 * generic one, so the digest is the only handle that correlates what the user saw with the server
 * log — worth the small amount of screen real estate when someone reports "it just broke".
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      eyebrow="Something went wrong"
      title="This page didn't load."
      description="The problem has been logged. Try again — if it keeps happening, share the reference below with support."
      actions={
        <>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-ink px-4 py-2 font-body text-sm font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-rule px-4 py-2 font-body text-sm font-semibold text-ink transition-colors hover:bg-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            Back to Prudent Hire
          </Link>
        </>
      }
      footnote={error.digest ? `Reference: ${error.digest}` : undefined}
    />
  );
}
