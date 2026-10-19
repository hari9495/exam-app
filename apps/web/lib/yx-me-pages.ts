import type { MyRequest, NotifCategory, PlatformNotification, SearchHit } from '@yukthix/ui/frame';
import type { NotificationView } from './types';
import { notificationText } from './notification-text';
import type { SearchResult } from './yx-shell';

// Adapters from the API to the designed Home-panel screens (design audit step 2): PLT-03 notifications, PLT-21 search,
// PLT-06 my requests. Pure, so they are unit-tested.

/** The designed inbox's categories, from the notification type (P04 types). */
export function notifCategory(type: string): NotifCategory {
  if (/approval|privacy\.request|nomination\.proposed|overpayment\.consent/.test(type)) return 'Approvals';
  if (/^time\.|^leave\.|^attendance\./.test(type)) return 'Leave & time';
  if (/^payroll\.|^pay\./.test(type)) return 'Pay';
  if (/^(candidate|interview|offer)|^assigned$|reminder\.(pending_grading|stale_invitation|offer_expiring|interview_upcoming|feedback_owed)/.test(type)) return 'Hiring';
  if (/^system\.|^platform\./.test(type)) return 'From YukthiX';
  return 'Tasks';
}

export function toInboxItem(n: NotificationView): PlatformNotification {
  return { id: n.id, category: notifCategory(n.type), actor: n.actorName ?? 'YukthiX', text: notificationText(n), at: new Date(n.createdAt), read: Boolean(n.readAt), href: n.linkPath };
}

const SOURCES: [keyof SearchResult, SearchHit['source']][] = [
  ['people', 'People'],
  ['requests', 'Requests'],
  ['candidates', 'Candidates'],
  ['tickets', 'Tickets'],
];

export function toSearchHits(r: SearchResult | undefined): SearchHit[] {
  if (!r) return [];
  return SOURCES.flatMap(([key, source]) => r[key].map((h) => ({ id: `${key}:${h.id}`, source, title: h.label, subtitle: h.secondary, entity: '', href: h.href })));
}

export interface MineRow {
  requestId: string;
  type: string;
  title: string;
  status: string;
  submittedAt: string;
  decidedAt: string | null;
  step: { name: string; index: number; of: number } | null;
  waitingOn: string[];
  raisedBy: string | null;
}

const STATUS: Record<string, MyRequest['status']> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', cancelled: 'Withdrawn' };
const onDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** A request as My requests shows it; the reference is the start of its id, which search also finds. */
export function toMyRequest(r: MineRow): MyRequest {
  const status = STATUS[r.status] ?? 'Pending';
  const latestStep =
    status === 'Pending'
      ? r.step
        ? `${r.step.name} (step ${r.step.index} of ${r.step.of})`
        : 'Waiting'
      : status === 'Approved'
        ? `Approved${r.decidedAt ? ` on ${onDay(r.decidedAt)}` : ''}`
        : status === 'Rejected'
          ? `Rejected${r.decidedAt ? ` on ${onDay(r.decidedAt)}` : ''}`
          : 'Withdrawn';
  return {
    id: r.requestId,
    ref: r.requestId.slice(0, 8).toUpperCase(),
    type: r.type,
    summary: r.title,
    submitted: new Date(r.submittedAt),
    status,
    latestStep,
    ...(r.waitingOn.length ? { waitingOn: r.waitingOn.join(', ') } : {}),
    ...(r.raisedBy ? { raisedBy: r.raisedBy } : {}),
  };
}
