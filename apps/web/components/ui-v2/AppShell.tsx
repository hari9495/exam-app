'use client';

// Combines two 21st.dev sources: the "Dashboard Sidebar" collapse toggle (hide/unhide, driven
// from the TopBar) and the "Animated Sidebar" (sidebar-001) pointer drag-to-resize. Owns the
// collapsed + width state and composes Sidebar + TopBar + content.
import { useCallback, useRef, useState, type ReactNode } from 'react';
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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
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
        <main style={{ flex: 1, padding: '24px 28px', background: 'var(--surface)' }}>{children}</main>
      </div>
    </div>
  );
}
