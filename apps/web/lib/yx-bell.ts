import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast, type NotificationItem } from '@yukthix/ui';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { useNotifications } from './hooks/useNotifications';
import { notificationText } from './notification-text';
import type { NotificationView } from './types';

// The bell as designed (PLT-01 bell open, founder review 19 Oct 2026): the person a notice is about (initials), a
// neutral bell for YukthiX's own notices, and Approve / View on approvals the person may decide right there.

/** A task from GET /workflow/approvals/inbox (the Approvals page's own list and rule). */
export interface InboxTask {
  taskId: string;
  requestId: string;
  /** Set for irreversible types, which are decided only on their own page. */
  decideAt: string | null;
}

const APPROVAL_NOTICE = /^workflow\.approval\.(needed|reminder)$/;

/** Which inbox task, if any, the person may approve straight from this notice. */
export function approvableTask(n: NotificationView, tasks: InboxTask[] | undefined): InboxTask | null {
  if (!APPROVAL_NOTICE.test(n.type) || n.entityType !== 'wf_request') return null;
  return tasks?.find((t) => t.requestId === n.entityId && !t.decideAt) ?? null;
}

export function toBellItem(n: NotificationView): NotificationItem {
  return { id: n.id, actor: { name: n.actorName ?? 'YukthiX' }, system: !n.actorName, text: notificationText(n), at: new Date(n.createdAt), read: Boolean(n.readAt), href: n.linkPath };
}

export function useBellItems(enabled: boolean) {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const qc = useQueryClient();
  const { toast } = useToast();
  const notifications = useNotifications();
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const hasApprovals = Boolean(notifications.data?.some((n) => APPROVAL_NOTICE.test(n.type)));
  // The same query (and cache) as the Approvals page: what waits for this person, and nothing else.
  const inbox = useQuery<InboxTask[]>({ queryKey: ['workflow', '/approvals/inbox'], queryFn: () => apiFetch('/workflow/approvals/inbox', {}, token), enabled: enabled && Boolean(token) && hasApprovals, retry: false });
  const items = (notifications.data ?? []).map((n): NotificationItem => {
    const item = toBellItem(n);
    if (approved.has(n.id)) return { ...item, approval: { onApprove: () => undefined, approved: true } };
    const task = enabled ? approvableTask(n, inbox.data) : null;
    if (!task) return item;
    return {
      ...item,
      approval: {
        onApprove: async () => {
          try {
            // The Approvals page's decide call: the API checks the task is the person's and still open.
            await apiFetch(`/workflow/approvals/tasks/${encodeURIComponent(task.taskId)}/decide`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) }, token);
            setApproved((s) => new Set(s).add(n.id));
            if (!n.readAt) await apiFetch(`/notifications/${encodeURIComponent(n.id)}/read`, { method: 'POST' }, token).catch(() => undefined);
            toast({ tone: 'success', title: 'Approved' });
          } catch (e) {
            toast({ tone: 'error', title: 'Not approved', description: e instanceof Error ? e.message : 'Try again from Approvals.' });
          } finally {
            void qc.invalidateQueries({ queryKey: ['workflow'] });
            void qc.invalidateQueries({ queryKey: ['notifications'] });
            void qc.invalidateQueries({ queryKey: ['yx', 'workspace', 'counts'] });
          }
        },
      },
    };
  });
  return { items, loading: notifications.isLoading };
}
