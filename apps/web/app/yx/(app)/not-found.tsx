'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@yukthix/ui';
import { NotFoundState } from '@yukthix/ui/frame';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';

// T2-G: the designed 6.3 Not found inside the app frame, for any /yx address that matches no page (the catch-all in
// this group) and any page that calls notFound(). The reference support can look up records only the address (answer 947).
export default function YxAppNotFound() {
  const { accessToken } = useAuth();
  const [reference, setReference] = useState<string | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    Promise.resolve(apiFetch('/help/not-found', { method: 'POST', body: JSON.stringify({ path: window.location.pathname.slice(0, 300) }) }, accessToken))
      .then((r: { reference?: string | null } | null) => setReference(r?.reference ?? null))
      .catch(() => setReference(null));
  }, [accessToken]);
  return (
    <NotFoundState
      reference={reference}
      actions={
        <Button asChild variant="primary">
          <Link href="/yx/home">Go to Home</Link>
        </Button>
      }
    />
  );
}
