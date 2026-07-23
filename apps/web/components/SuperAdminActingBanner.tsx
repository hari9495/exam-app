'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';

export function SuperAdminActingBanner() {
  const router = useRouter();
  const { actingSuperAdmin, actingOrgName, switchOutOfOrg } = useAuth();

  if (!actingSuperAdmin) {
    return null;
  }

  async function handleExit() {
    // Navigate first, then switch out. The acting token's `role` claim is always 'super_admin'
    // regardless of actingSuperAdmin, so /organizations' own gate is satisfied throughout. This
    // ordering matters: swapping it (switch-out first, navigate second) lets the *current* shell
    // layout's own role-gate `useEffect` -- e.g. (recruiter)/(org-admin)/(panel)/layout.tsx's
    // `role !== '<shell role>' && !actingSuperAdmin` check -- observe actingSuperAdmin flip to
    // false while still mounted on that shell's page, and it races this function's own redirect
    // to /organizations with a competing `router.push('/login')`, which can win.
    router.push('/organizations');
    await switchOutOfOrg();
  }

  return (
    <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <span>
        Viewing as super_admin — <strong>{actingOrgName}</strong>
      </span>
      <button
        type="button"
        onClick={handleExit}
        className="rounded-md border border-white/40 px-3 py-1 text-xs font-semibold hover:bg-white/10"
      >
        Exit to platform admin
      </button>
    </div>
  );
}
