'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@yukthix/ui';
import { AuthFrame } from '@yukthix/ui/auth';

// The YukthiX error screen under /yx (the root error.tsx is Prudent Hire's). The reference (digest) is the only
// handle that ties what the person saw to the server log in production.
export default function YxError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <AuthFrame
      title="This page didn't load"
      subtitle="Something went wrong on our side. Try again. If it keeps happening, tell your HR admin."
      note=""
      footer={error.digest ? `Reference: ${error.digest}` : undefined}
    >
      <div className="yx-auth__form">
        <Button variant="primary" fullWidth onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild fullWidth>
          <Link href="/yx/home">Go to YukthiX home</Link>
        </Button>
      </div>
    </AuthFrame>
  );
}
