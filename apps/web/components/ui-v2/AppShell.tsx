'use client';

// Combines two 21st.dev sources: the "Dashboard Sidebar" collapse toggle (hide/unhide, driven
// from the TopBar) and the "Animated Sidebar" (sidebar-001) pointer drag-to-resize. Owns the
// collapsed + width state and composes Sidebar + TopBar + content.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { StaffNavItem } from '../StaffSidebar';

const MIN_W = 200;
const MAX_W = 360;

export function AppShell({
  navItems, orgName, orgLogoUrl, orgInitial, roleLabel, displayName, initials, avatarUrl, onLogout, children,
}: {
  navItems: StaffNavItem[]; orgName: string; orgLogoUrl?: string; orgInitial: string; roleLabel: string;
  displayName: string; initials: string; avatarUrl?: string; onLogout: () => void; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(248);
  // Responsive: auto-collapse the sidebar when the shell itself gets narrow, and reopen it when it
  // widens. A ResizeObserver on the shell root measures the actual rendered width (robust to the
  // preview pane's scaling, where matchMedia's change event can be unreliable). We only flip on
  // crossing the threshold, so a manual toggle within a size band is preserved.
  const rootRef = useRef<HTMLDivElement>(null);
  const wasNarrow = useRef<boolean | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const narrow = entries[0].contentRect.width < 1024;
      if (narrow !== wasNarrow.current) { wasNarrow.current = narrow; setCollapsed(narrow); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [width]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    setWidth(Math.min(MAX_W, Math.max(MIN_W, startW.current + e.clientX - startX.current)));
  }, []);

  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div ref={rootRef} style={{ display: 'flex', minHeight: '100vh' }}>
      {!collapsed && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Sidebar
            navItems={navItems} orgName={orgName} orgLogoUrl={orgLogoUrl}
            orgInitial={orgInitial} roleLabel={roleLabel} onLogout={onLogout} width={width}
          />
          <div
            role="separator" aria-orientation="vertical" aria-label="Resize sidebar"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            style={{ position: 'absolute', top: 0, right: -2, height: '100%', width: 5, cursor: 'col-resize', zIndex: 20 }}
          />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <TopBar
          orgName={orgName} displayName={displayName} initials={initials} avatarUrl={avatarUrl}
          collapsed={collapsed} onToggleSidebar={() => setCollapsed((c) => !c)}
        />
        <main style={{ flex: 1, padding: '20px 28px', background: 'var(--surface)' }}>{children}</main>
      </div>
    </div>
  );
}
