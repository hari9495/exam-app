'use client';

// Adapted from 21st.dev "Dashboard Sidebar" (arunjdass/dashboard-sidebar), retoned to the v2
// Azure shadcn tokens. Collisions renamed (bg-primary→bg-vprimary). Wired to our real nav via
// next/link + usePathname; active state uses the org color (--org-primary) for white-label.
//
// The nav is long for org-admins (~35 items), so items carry an optional `group` (see
// lib/staff-nav.ts NAV_GROUP_ORDER). Ungrouped items pin flat at the top; each group renders as a
// collapsible section. The section holding the current route auto-expands; open/closed state
// persists per-viewer in localStorage. A single-item group renders as a plain link (no header).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, LogOut, ChevronDown } from 'lucide-react';
import type { StaffNavItem } from '../StaffSidebar';
import { NAV_GROUP_ORDER } from '../../lib/staff-nav';
import { cn } from '../../lib/cn';

const OPEN_GROUPS_KEY = 'v2-nav-open-groups';

function NavLink({ item, active }: { item: StaffNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'v2-nav-link group relative flex items-center gap-2.5 py-[7px] px-2.5 rounded-[6px] transition-colors select-none',
        active ? 'font-medium' : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground/90',
      )}
      style={active ? { color: 'var(--org-primary)', background: 'color-mix(in srgb, var(--org-primary) 10%, transparent)' } : undefined}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} style={active ? { color: 'var(--org-primary)' } : undefined} />}
      <span className="text-[13px] tracking-wide truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({
  navItems, orgName, orgLogoUrl, orgInitial, roleLabel, onLogout, width = 248,
}: {
  navItems: StaffNavItem[]; orgName: string; orgLogoUrl?: string; orgInitial: string;
  roleLabel: string; onLogout: () => void; width?: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname?.startsWith(href) ?? false;

  // Partition: ungrouped (or unknown-group, defensively) pin at top; the rest bucket by group.
  const known = new Set<string>(NAV_GROUP_ORDER);
  const pinned = navItems.filter((i) => !i.group || !known.has(i.group));
  const groups = NAV_GROUP_ORDER
    .map((name) => ({ name, items: navItems.filter((i) => i.group === name) }))
    .filter((g) => g.items.length > 0);

  // Which section holds the current route (so it can auto-expand).
  const activeGroup = groups.find((g) => g.items.some((i) => isActive(i.href)))?.name ?? null;

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Restore saved open sections once on mount; seed with the active section if nothing is saved.
  useEffect(() => {
    let saved: string[] | null = null;
    try {
      const raw = localStorage.getItem(OPEN_GROUPS_KEY);
      if (raw) saved = JSON.parse(raw) as string[];
    } catch {
      saved = null;
    }
    setOpenGroups(new Set(saved ?? (activeGroup ? [activeGroup] : [])));
    // Intentionally mount-only: later route changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigating INTO a collapsed section opens it (fires only when the active section changes, so a
  // deliberate collapse of the section you're already in is respected).
  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
  }, [activeGroup]);

  function toggle(name: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode / disabled storage — open state just won't persist */
      }
      return next;
    });
  }

  return (
    <div className="print:hidden flex flex-col h-screen sticky top-0 shrink-0 bg-card border-r border-border p-3" style={{ width }}>
      {/* org header (from the component's workspace switcher, made static) */}
      <div className="flex items-center gap-3 px-2 py-2 mb-3 rounded-lg">
        {orgLogoUrl ? (
          <img src={orgLogoUrl} alt="" className="w-8 h-8 rounded-[6px] object-contain shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-[6px] flex items-center justify-center font-semibold text-[13px] shadow-sm shrink-0"
            style={{ background: 'var(--org-primary)', color: 'var(--org-on-primary)' }}>
            {orgInitial}
          </div>
        )}
        <div className="flex flex-col overflow-hidden">
          <span className="text-[13px] font-medium leading-none mb-1 text-foreground truncate max-w-[150px]">{orgName}</span>
          <span className="text-[11px] text-muted-foreground leading-none">{roleLabel}</span>
        </div>
      </div>

      <nav aria-label="Primary" className="nav-scroll flex-1 overflow-y-auto flex flex-col gap-0.5 mt-1 [&::-webkit-scrollbar]:hidden">
        {pinned.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {groups.map((group) => {
          // A lone item doesn't earn a collapsible header — render it as a plain link.
          if (group.items.length === 1) {
            const item = group.items[0];
            return <NavLink key={item.href} item={item} active={isActive(item.href)} />;
          }
          const open = openGroups.has(group.name);
          const groupActive = group.name === activeGroup;
          const bodyId = `nav-group-${group.name}`;
          return (
            <div key={group.name} className="mt-1.5">
              <button
                type="button"
                onClick={() => toggle(group.name)}
                aria-expanded={open}
                aria-controls={bodyId}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[6px] transition-colors select-none',
                  'text-[11px] font-semibold uppercase tracking-wide',
                  groupActive ? 'text-foreground/80' : 'text-muted-foreground hover:text-foreground/90',
                )}
              >
                <span className="truncate">{group.name}</span>
                {/* a dot marks the section that holds the current page while it's collapsed */}
                {groupActive && !open && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--org-primary)' }} />}
                <ChevronDown
                  className={cn('w-3.5 h-3.5 ml-auto shrink-0 transition-transform', open ? '' : '-rotate-90')}
                  strokeWidth={2}
                />
              </button>
              {open && (
                <div id={bodyId} className="flex flex-col gap-0.5 mt-0.5">
                  {group.items.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(item.href)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto pt-3 border-t border-border flex flex-col gap-0.5">
        <Link href="/profile" className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[6px] text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground/90 transition-colors">
          <Settings className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          <span className="text-[13px] tracking-wide">Settings</span>
        </Link>
        <button onClick={onLogout} className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[6px] text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground/90 transition-colors text-left">
          <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          <span className="text-[13px] tracking-wide">Log out</span>
        </button>
      </div>
    </div>
  );
}
