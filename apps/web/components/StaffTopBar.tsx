import Link from 'next/link';
import { LogOut } from 'lucide-react';

interface StaffTopBarProps {
  displayName: string;
  initials: string;
  roleLabel: string;
  avatarUrl?: string | null;
  onLogout: () => void;
}

/**
 * Sticky bar above the page content for the recruiter/org-admin/panel shells.
 * Holds the signed-in user's profile link and Logout, both top right, so they
 * stay visible while the page content scrolls underneath. Fixed at h-16 to
 * line up with StaffSidebar's header row across the seam.
 */
export function StaffTopBar({ displayName, initials, roleLabel, avatarUrl, onLogout }: StaffTopBarProps) {
  return (
    <div className="sticky top-0 z-10 flex h-16 items-center justify-end gap-4 border-b border-recruiter-border bg-white px-6 print:hidden">
      <Link
        href="/profile"
        className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-recruiter-bg-subtle"
      >
        {avatarUrl ? (
          // Plain <img>, not next/image: the URL is a time-limited SAS link on a storage host
          // that is not in next.config's remotePatterns, and the optimizer would reject it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-recruiter-border bg-primary text-[11px] font-semibold text-on-primary">
            {initials}
          </div>
        )}
        <div className="min-w-0 text-left">
          <p className="truncate text-xs font-semibold text-recruiter-text">{displayName}</p>
          <p className="text-[10.5px] text-recruiter-text-tertiary">{roleLabel}</p>
        </div>
      </Link>
      <button
        type="button"
        aria-label="Log Out"
        onClick={onLogout}
        className="flex items-center gap-2 rounded-md border border-recruiter-border px-3 py-1.5 text-sm font-medium text-recruiter-text-secondary transition-colors duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
      >
        <LogOut size={15} />
        Logout
      </button>
    </div>
  );
}
