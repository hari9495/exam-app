'use client';

// Adapted from 21st.dev "Dashboard Sidebar"'s top bar (breadcrumb + search + avatar), retoned to
// v2 Azure shadcn tokens. Logout lives in the sidebar (per the source). Search is a visual ⌘K stub.
import Link from 'next/link';
import { Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export function TopBar({
  orgName, displayName, initials, avatarUrl, collapsed, onToggleSidebar,
}: {
  orgName: string; displayName: string; initials: string; avatarUrl?: string;
  collapsed?: boolean; onToggleSidebar?: () => void;
}) {
  return (
    <header className="print:hidden h-14 border-b border-border flex items-center px-4 justify-between bg-card shrink-0">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {onToggleSidebar && (
          <button type="button" onClick={onToggleSidebar} aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors">
            {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} /> : <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} />}
          </button>
        )}
        <span className="truncate">{orgName}</span>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="hidden md:flex items-center gap-2 w-64 h-8 px-3 rounded-md border border-border bg-background text-muted-foreground text-[13px]">
          <Search className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5">⌘K</kbd>
        </button>
        <Link href="/profile" className="flex items-center gap-2 no-underline text-foreground" title={displayName}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{ background: 'var(--org-primary)', color: 'var(--org-on-primary)' }}>
              {initials}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
