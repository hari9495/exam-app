'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { useCurrentUser } from '../lib/hooks/useCurrentUser';
import { staffLandingPath } from '../lib/staff-landing';

export function ImpersonationBanner() {
  const { impersonating, impersonatorEmail, stopImpersonating } = useAuth();
  const { data: currentUser } = useCurrentUser();
  const router = useRouter();

  async function handleReturn() {
    const role = await stopImpersonating();
    // Land back in the admin's own console; without this we stay on the impersonated
    // console route, whose guard would bounce the restored admin session to /login.
    router.push(staffLandingPath(role));
  }

  if (!impersonating) {
    return null;
  }

  return (
    <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <span>
        Impersonating <strong>{currentUser?.email ?? 'another user'}</strong>
        {impersonatorEmail ? ` as ${impersonatorEmail}` : ''}
      </span>
      <button
        type="button"
        onClick={() => void handleReturn()}
        className="rounded-md border border-white/40 px-3 py-1 text-xs font-semibold hover:bg-white/10"
      >
        Return to admin
      </button>
    </div>
  );
}
