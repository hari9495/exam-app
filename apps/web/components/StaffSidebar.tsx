'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SkipToContent } from './SkipToContent';
import clsx from 'clsx';
import { Menu, X, type LucideIcon } from 'lucide-react';
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
}

/**
 * The left-nav shell shared by the recruiter, org-admin, and panel consoles.
 * Chrome (background, active-state tint) is platform-branded navy regardless
 * of org theming; the org's own logo/name up top is the one thing that stays
 * tenant-specific, since this sidebar is shared across every organization.
 *
 * The header row is a fixed h-16 so its bottom border lines up exactly with
 * StaffTopBar's border across the seam between sidebar and content.
 *
 * Below `md` the same nav becomes an off-canvas drawer: a fixed 224px panel that
 * slides in over a backdrop, opened by a hamburger pinned over the top bar. At
 * `md` and up it reverts to the static sticky column and the mobile affordances
 * disappear — so the desktop console is byte-for-byte the layout it always was.
 */
export function StaffSidebar({ navItems, pathname, orgName, orgLogoUrl, orgInitial }: StaffSidebarProps) {
  const [open, setOpen] = useState(false);

  // Route changes must close the drawer, or tapping a nav item leaves it covering the page it
  // just navigated to.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes it, matching every other overlay in the kit (Modal/DropdownMenu).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <SkipToContent />

      {/* Pinned over the top bar's empty left edge (the bar's own content is justify-end). */}
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-30 rounded-lg border border-rule bg-paper p-2 text-ink transition-colors hover:bg-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 md:hidden print:hidden"
      >
        <Menu size={18} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <nav
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-56 flex-col bg-brand-navy transition-transform duration-200 print:hidden',
          'md:sticky md:top-0 md:z-auto md:shrink-0 md:translate-x-0 md:transition-none',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-4">
          {orgLogoUrl ? (
            <img src={orgLogoUrl} alt="Organization logo" className="max-h-7 max-w-7 rounded" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-on-primary">
              {orgInitial}
            </div>
          )}
          <span className="truncate font-display text-sm font-bold text-white">{orgName}</span>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="ml-auto shrink-0 rounded-md p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:hidden"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="nav-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto p-2.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname?.startsWith(item.href) ?? false;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 font-body text-sm font-medium transition-colors duration-150',
                    isActive
                      ? 'border-l-[3px] border-primary pl-[7px] font-semibold text-primary'
                      : 'text-[#a7b3c8] hover:bg-white/5 hover:text-white',
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
        <div className="flex h-16 shrink-0 items-center justify-end px-4">
          <PrudentMark className="h-8 aspect-[100/148] text-white/20" />
        </div>
      </nav>
    </>
  );
}
