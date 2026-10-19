'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationsInboxScreen } from '@yukthix/ui/frame';
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from '../../../../lib/hooks/useNotifications';
import { toInboxItem } from '../../../../lib/yx-me-pages';

// Notifications (PLT-03, design audit step 2): the person's own inbox, the same feed as the bell (newest 50).
export default function YxNotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const list = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const counts = () => void qc.invalidateQueries({ queryKey: ['yx', 'workspace', 'counts'] });
  return (
    <NotificationsInboxScreen
      items={(list.data ?? []).map(toInboxItem)}
      state={list.isLoading ? 'loading' : list.isError ? 'error' : 'ready'}
      live={{
        onOpen: (n) => {
          if (!n.read) markRead.mutate(n.id, { onSuccess: counts });
          if (n.href) router.push(n.href);
        },
        onMarkRead: (ids) => void Promise.all(ids.map((id) => markRead.mutateAsync(id))).then(counts),
        onMarkAllRead: () => markAll.mutate(undefined, { onSuccess: counts }),
        preferencesHref: '/yx/me/notifications',
        onRetry: () => void list.refetch(),
      }}
    />
  );
}
