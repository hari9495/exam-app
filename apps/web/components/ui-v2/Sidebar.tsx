'use client';

// Adapted from 21st.dev "Dashboard Sidebar" (arunjdass/dashboard-sidebar), retoned to the v2
// Azure shadcn tokens. Collisions renamed (bg-primary→bg-vprimary). Wired to our real nav via
// next/link + usePathname; active state uses the org color (--org-primary) for white-label.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, LogOut } from 'lucide-react';
import type { StaffNavItem } from '../StaffSidebar';
import { cn } from '../../lib/cn';

export function Sidebar({
  navItems, orgName, orgLogoUrl, orgInitial, roleLabel, onLogout, width = 248,
}: {
  navItems: StaffNavItem[]; orgName: string; orgLogoUrl?: string; orgInitial: string;
  roleLabel: string; onLogout: () => void; width?: number;
}) {
  const pathname = usePathname();

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

      <nav className="flex-1 overflow-y-auto flex flex-col gap-0.5 mt-1 [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href) ?? false;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'group relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-[6px] transition-colors select-none',
                active ? 'font-medium' : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground/90',
              )}
              style={active ? { color: 'var(--org-primary)', background: 'color-mix(in srgb, var(--org-primary) 10%, transparent)' } : undefined}
            >
              {active && <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r" style={{ background: 'var(--org-primary)' }} />}
              {Icon && <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} style={active ? { color: 'var(--org-primary)' } : undefined} />}
              <span className="text-[13px] tracking-wide truncate">{item.label}</span>
            </Link>
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
