'use client';

import Link from 'next/link';
import { Button } from '@yukthix/ui';
import { AuthFrame } from '@yukthix/ui/auth';

// The YukthiX 404 under /yx (the root global-not-found is Prudent Hire's): the public YukthiX frame, a way home.
export default function YxNotFound() {
  return (
    <AuthFrame title="We couldn't find that page" subtitle="The link may be old, or the page has moved. Check the address, or go back to YukthiX home." note="">
      <div className="yx-auth__form">
        <Button asChild variant="primary" fullWidth>
          <Link href="/yx/home">Go to YukthiX home</Link>
        </Button>
      </div>
    </AuthFrame>
  );
}
