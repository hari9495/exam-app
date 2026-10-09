import { useState, type ReactNode } from 'react';
import { Badge, type BadgeTone } from '../../components/display';
import { ErrorState, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { formatDate } from '../../lib/format';
import type { Lifecycle, LoadState, SupportStatus } from './types';

// Pieces shared by the console screens: plain words for states and actions, the page frame, the reason dialog.

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = { trial: 'Trial', active: 'Active', suspended: 'Suspended', closed: 'Closed' };
export const LIFECYCLE_TONE: Record<Lifecycle, BadgeTone> = { trial: 'info', active: 'success', suspended: 'danger', closed: 'neutral' };

export const SUPPORT_LABEL: Record<SupportStatus, string> = {
  requested: 'Waiting for the company',
  approved: 'Open',
  declined: 'Declined',
  cancelled: 'Withdrawn',
  ended: 'Ended',
  expired: 'Expired',
};
export const SUPPORT_TONE: Record<SupportStatus, BadgeTone> = { requested: 'warning', approved: 'success', declined: 'danger', cancelled: 'neutral', ended: 'neutral', expired: 'neutral' };

export const PRODUCT_LABEL: Record<string, string> = { hrms: 'YukthiX HR', service_desk: 'Service Desk' };
export const productNames = (codes: string[]) => codes.map((c) => PRODUCT_LABEL[c] ?? c).join(', ') || '—';

/** "8 Oct 2026, 3:42 pm" in the viewer's time. */
export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${formatDate(d)}, ${new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d)}`;
}
export const day = (iso: string | null | undefined) => (iso ? formatDate(new Date(iso)) : '—');

/** Whole days from now until `iso` (negative when past). */
export const daysLeft = (iso: string, now = Date.now()) => Math.ceil((new Date(iso).getTime() - now) / 86_400_000);

/** Audit actions in plain words (the founder reads these). */
export function actionWords(action: string, details: Record<string, unknown> | null): string {
  const d = details ?? {};
  switch (action) {
    case 'platform.company.created':
      return 'Created the company';
    case 'platform.company.lifecycle':
      return `Changed the company from ${LIFECYCLE_LABEL[d.from as Lifecycle] ?? d.from} to ${LIFECYCLE_LABEL[d.to as Lifecycle] ?? d.to}`;
    case 'platform.company.trial_extended':
      return `Extended the trial by ${d.days} days`;
    case 'platform.price.scheduled':
      return `Set a new ${PRODUCT_LABEL[String(d.product)] ?? d.product} price (${d.currency} ${d.unitPrice}) from ${d.validFrom}`;
    case 'platform.price.withdrawn':
      return `Withdrew the ${PRODUCT_LABEL[String(d.product)] ?? d.product} price planned from ${d.validFrom}`;
    case 'platform.cross_tenant_read':
      return `Looked across companies (${d.purpose})`;
    case 'support_session.requested':
      return 'Asked for a support session';
    case 'support_session.approved':
      return `Approved the support session for ${d.hours} hours`;
    case 'support_session.declined':
      return 'Declined the support session';
    case 'support_session.cancelled':
      return 'Withdrew the support request';
    case 'support_session.ended':
      return 'Ended the support session';
    case 'support_session.request':
      return d.method === 'GET' ? `Opened ${d.path}` : `${d.method} ${d.path}`;
    case 'super_admin.org_switch_in':
      return 'Opened the company';
    case 'super_admin.org_switch_out':
      return 'Left the company';
    case 'notification.sms_account_created':
      return 'Added a shared SMS account';
    case 'notification.sms_account_updated':
      return 'Changed a shared SMS account';
    case 'notification.sms_account_deleted':
      return 'Removed a shared SMS account';
    case 'notification.sms_account_tested':
      return 'Sent a test SMS';
    case 'step_up.used':
      return 'Confirmed it was them again';
    case 'login.success':
      return 'Signed in';
    case 'mfa.enrolled':
      return 'Added a security key or passkey';
    case 'organization.created':
      return 'Created the company account';
    default:
      // Anything not listed yet: the action's own words, without dots and underscores.
      return action.replace(/[._]+/g, ' ');
  }
}

export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return <Badge tone={LIFECYCLE_TONE[lifecycle]}>{LIFECYCLE_LABEL[lifecycle]}</Badge>;
}

export function SupportBadge({ status }: { status: SupportStatus }) {
  return <Badge tone={SUPPORT_TONE[status]}>{SUPPORT_LABEL[status]}</Badge>;
}

/** Page frame with the four load states; `crumb` is the console area. No `title`: the page has its own object header. */
export function ConsolePage({ crumb, title, description, actions, state, onRetry, what, children }: { crumb: string; title?: string; description?: ReactNode; actions?: ReactNode; state: LoadState; onRetry?: () => void; what: string; children: ReactNode }) {
  return (
    <div className="yx-auth__page">
      {title && <PageHeader breadcrumbs={<Breadcrumbs items={[{ label: 'Console' }, { label: crumb }]} />} title={title} description={description} actions={state === 'ready' ? actions : undefined} />}
      {state === 'loading' && (
        <div className="yx-auth__stack" aria-busy="true">
          <Skeleton height={48} />
          <Skeleton height={240} />
        </div>
      )}
      {state === 'error' && <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="a YukthiX console owner" what={what} />}
      {state === 'ready' && children}
    </div>
  );
}

export interface ReasonAsk {
  title: string;
  consequence: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Field label; the reason is kept in the audit log and shown to the company's admins. */
  label?: string;
  action: (reason: string) => Promise<void>;
}

/** Confirm with a written reason (YX-CONSOLE-02: every staff action carries one). */
export function useReasonDialog(min = 5): [ReactNode, (ask: ReasonAsk) => void] {
  const [ask, setAsk] = useState<ReasonAsk | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const short = reason.trim().length < min;
  const dialog = ask && (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && setAsk(null)}
      title={ask.title}
      consequence={ask.consequence}
      confirmLabel={ask.confirmLabel}
      destructive={ask.destructive}
      size="md"
      onConfirm={async () => {
        setTried(true);
        if (short) throw new Error(`Write a reason of at least ${min} characters.`);
        await ask.action(reason.trim());
      }}
    >
      <FormField label={ask.label ?? 'Reason'} required helper="Kept in the audit log. The company's admins can see it." error={tried && short ? `Write at least ${min} characters` : undefined}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
  return [
    dialog,
    (a: ReasonAsk) => {
      setReason('');
      setTried(false);
      setAsk(a);
    },
  ];
}
