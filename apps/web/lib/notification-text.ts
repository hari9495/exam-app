import type { NotificationView } from './types';

/** One line for an in-app notification (the v2 bell and the YukthiX bell). */
export function notificationText(n: NotificationView): string {
  const who = n.actorName ?? 'A teammate';
  const on = n.contextText ? ` on ${n.contextText}` : '';
  if (n.type === 'mention') return `${who} mentioned you${on}`;
  if (n.type === 'assigned') return `${who} assigned you${on}`;
  if (n.type === 'approval.requested') return `${who} needs your approval${on}`;
  if (n.type === 'approval.approved') return `Your submission was approved${on}`;
  if (n.type === 'approval.rejected') return `Your submission was rejected${on}`;
  if (n.type === 'approval.cancelled') return `An approval you were on was withdrawn${on}`;
  if (n.type === 'approval.step_skipped') return `An approval step was skipped${on}`;
  return n.contextText ?? `${who} sent you a notification`;
}
