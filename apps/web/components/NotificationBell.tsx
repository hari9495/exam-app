'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../lib/hooks/useNotifications';
import { NotificationView } from '../lib/types';

function label(n: NotificationView): string {
  const who = n.actorName ?? 'A teammate';
  if (n.type === 'mention') return `${who} mentioned you${n.contextText ? ` on ${n.contextText}` : ''}`;
  return `${who} sent you a notification`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: notifications } = useNotifications();
  const { data: unread } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const count = unread?.count ?? 0;

  function openItem(n: NotificationView) {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    router.push(n.linkPath);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={count ? `Notifications (${count} unread)` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-rule text-muted transition-colors hover:border-primary/30 hover:text-primary"
      >
        <Bell size={16} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-rule bg-paper shadow-lg">
            <div className="flex items-center justify-between border-b border-rule px-3 py-2">
              <span className="text-sm font-semibold text-ink">Notifications</span>
              {count > 0 && (
                <button type="button" onClick={() => markAll.mutate()} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {(notifications ?? []).length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted">No notifications yet.</li>
              ) : (
                (notifications ?? []).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-ground ${n.readAt ? '' : 'bg-primary/5'}`}
                    >
                      <span className="text-sm text-ink">{label(n)}</span>
                      <span className="text-[11px] text-muted">{new Date(n.createdAt).toLocaleString()}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
