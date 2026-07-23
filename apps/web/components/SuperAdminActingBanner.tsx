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
    await switchOutOfOrg();
    router.push('/organizations');
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
