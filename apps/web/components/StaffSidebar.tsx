import Link from 'next/link';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { PrudentMark } from './PrudentMark';

export interface StaffNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface StaffSidebarProps {
  navItems: StaffNavItem[];
  pathname: string | null;
  orgName: string;
  orgLogoUrl?: string | null;
  orgInitial: string;
  displayName: string;
  initials: string;
  roleLabel: string;
}

/**
 * The left-nav shell shared by the recruiter, org-admin, and panel consoles.
 * Chrome (background, active-state tint) is platform-branded navy regardless
 * of org theming; the org's own logo/name up top is the one thing that stays
 * tenant-specific, since this sidebar is shared across every organization.
 */
export function StaffSidebar({
  navItems,
  pathname,
  orgName,
  orgLogoUrl,
  orgInitial,
  displayName,
  initials,
  roleLabel,
}: StaffSidebarProps) {
  return (
    <nav className="sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-brand-navy print:hidden">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
        {orgLogoUrl ? (
          <img src={orgLogoUrl} alt="Organization logo" className="max-h-7 max-w-7 rounded" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-white">
            {orgInitial}
          </div>
        )}
        <span className="truncate text-sm font-medium text-white">{orgName}</span>
      </div>
      <ul className="flex flex-1 flex-col gap-0.5 p-2.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname?.startsWith(item.href) ?? false;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'border-l-[3px] border-primary pl-[7px] font-semibold text-primary'
                    : 'text-white/60 hover:bg-white/5 hover:text-white',
                )}
                style={
                  isActive
                    ? { backgroundColor: 'color-mix(in srgb, var(--color-primary, #0053e2) 55%, #001E60)', color: '#fff' }
                    : undefined
                }
              >
                <Icon size={16} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="relative overflow-hidden border-t border-white/10 px-3.5 py-3">
        <PrudentMark className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-[6.6rem] text-white/[0.04]" />
        <Link
          href="/profile"
          className="relative flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-white/5"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{displayName}</p>
            <p className="text-[10.5px] text-white/40">{roleLabel}</p>
          </div>
        </Link>
      </div>
    </nav>
  );
}
