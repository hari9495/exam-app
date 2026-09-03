'use client';

// v2 in-app notification bell + inbox for the AppShell TopBar. Same hooks/behavior as the old
// components/NotificationBell (team-collab); v2-styled and rendered through the v2 Dropdown portal
// (so the menu isn't clipped by the sticky header).
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotifications, useUnreadCount, useMarkNotificationRead, useMarkAllNotificationsRead } from '../../lib/hooks/useNotifications';
import { NotificationView } from '../../lib/types';
import { Dropdown } from './Dropdown';

function label(n: NotificationView): string {
  const who = n.actorName ?? 'A teammate';
  const on = n.contextText ? ` on ${n.contextText}` : '';
  if (n.type === 'mention') return `${who} mentioned you${on}`;
  if (n.type === 'assigned') return `${who} assigned you${on}`;
  return `${who} sent you a notification`;
}

export function NotificationBell() {
  const router = useRouter();
  const { data: notifications } = useNotifications();
  const { data: unread } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const count = unread?.count ?? 0;

  function openItem(n: NotificationView, close: () => void) {
    if (!n.readAt) markRead.mutate(n.id);
    close();
    router.push(n.linkPath);
  }

  return (
    <Dropdown align="end" menuWidth={320} trigger={
      <span
        role="button" tabIndex={0}
        aria-label={count ? `Notifications (${count} unread)` : 'Notifications'}
        className="v2-hoverbtn"
        style={{ position: 'relative', display: 'inline-grid', placeItems: 'center', width: 36, height: 36, borderRadius: 9, border: '1px solid color-mix(in srgb, var(--ink) 16%, var(--hair))', background: 'var(--paper)', color: 'var(--muted)', cursor: 'pointer' }}
      >
        <Bell size={16} />
        {count > 0 && (
          <span style={{ position: 'absolute', right: -3, top: -3, display: 'grid', placeItems: 'center', minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 99, background: 'var(--org-primary)', color: 'var(--org-on-primary)', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </span>
    }>
      {(close) => (
        <div style={{ margin: -6, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--hair)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Notifications</span>
            {count > 0 && (
              <button type="button" onClick={() => markAll.mutate()} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 500, color: 'var(--org-primary)', cursor: 'pointer' }}>Mark all read</button>
            )}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 360, overflowY: 'auto' }}>
            {(notifications ?? []).length === 0 ? (
              <li style={{ padding: '24px 12px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No notifications yet.</li>
            ) : (
              (notifications ?? []).map((n) => (
                <li key={n.id}>
                  <button
                    type="button" onClick={() => openItem(n, close)} className="wf-opt"
                    style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', cursor: 'pointer', background: n.readAt ? 'transparent' : 'color-mix(in srgb, var(--org-primary) 6%, transparent)' }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>{label(n)}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(n.createdAt).toLocaleString()}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </Dropdown>
  );
}
