'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@yukthix/ui';
import { AuthFrame } from '@yukthix/ui/auth';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

// The YukthiX 404 under /yx (the root global-not-found is Prudent Hire's): the public YukthiX frame, a way home, and for
// a signed-in person the reference support can look up (answer 947; it records only the address they opened).
export default function YxNotFound() {
  const { accessToken } = useAuth();
  const [reference, setReference] = useState<string | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    Promise.resolve(apiFetch('/help/not-found', { method: 'POST', body: JSON.stringify({ path: window.location.pathname.slice(0, 300) }) }, accessToken))
      .then((r: { reference?: string | null } | null) => setReference(r?.reference ?? null))
      .catch(() => setReference(null));
  }, [accessToken]);
  return (
    <AuthFrame title="We couldn't find that page" subtitle="The link may be old, or the page has moved. Check the address, or go back to YukthiX home." note="">
      <div className="yx-auth__form">
        <Button asChild variant="primary" fullWidth>
          <Link href="/yx/home">Go to YukthiX home</Link>
        </Button>
        {reference && <p className="yx-empty__ref">Reference {reference}</p>}
      </div>
    </AuthFrame>
  );
}
