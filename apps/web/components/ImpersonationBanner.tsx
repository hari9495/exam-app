'use client';

import { useAuth } from '../lib/auth-context';
import { useCurrentUser } from '../lib/hooks/useCurrentUser';

export function ImpersonationBanner() {
  const { impersonating, impersonatorEmail, stopImpersonating } = useAuth();
  const { data: currentUser } = useCurrentUser();

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
        onClick={() => void stopImpersonating()}
        className="rounded-md border border-white/40 px-3 py-1 text-xs font-semibold hover:bg-white/10"
      >
        Return to admin
      </button>
    </div>
  );
}
