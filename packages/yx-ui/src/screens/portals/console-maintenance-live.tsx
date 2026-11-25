// YX-10 Maintenance, live (YukthiX console C-5, answers 948 and 1053): the designed IncidentComposerScreen's maintenance
// part with the API's windows. Staff schedule a window (the drawn checks, from the platform settings), a second staff
// member approves it, anyone may cancel it with a reason. Companies see the 6.5 availability banner before and during it.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, DescriptionList } from '../../components/shell';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { NumberField, TextArea, TextField, TimeField } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { Segment } from '../../components/segment';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { ConsolePage } from '../console/console-kit';
import type { LoadState } from '../console/types';
import { AvailabilityBanner } from '../settings/help';

export interface MaintenanceRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: 'pending_approval' | 'scheduled' | 'in_progress' | 'ended' | 'cancelled';
  writtenBy: string;
  mine: boolean;
  decidedBy: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  version: number;
}
export interface MaintenanceSettingRow {
  key: string;
  label: string;
  value: number;
  default: number;
  min: number;
  max: number;
}
export interface CurrentMaintenance {
  phase: 'upcoming' | 'now';
  title: string;
  startsAt: string;
  endsAt: string;
}
export interface LiveMaintenance {
  state: LoadState;
  onRetry: () => void;
  now: Date;
  windows: MaintenanceRow[];
  settings: { numbers: MaintenanceSettingRow[]; blockDates: number[] };
  current: CurrentMaintenance | null;
  onSchedule: (input: { title: string; startsAt: string; hours: number }) => Promise<unknown>;
  onApprove: (id: string, version: number) => Promise<unknown>;
  onCancel: (id: string, version: number, reason: string) => Promise<unknown>;
  /** Answer 1183: the rules change only on Console › Platform settings (security key and a reason). */
  onOpenPlatformSettings?: () => void;
  /** Stories: the schedule form filled with this start. */
  defaultStart?: Date;
  /** Staff roles (answer 1058): false for someone who only sees the windows (Customer success); default true. */
  canManage?: boolean;
}

const STATUS: Record<MaintenanceRow['status'], { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' | 'danger' }> = {
  pending_approval: { label: 'Waiting for approval', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'danger' },
  ended: { label: 'Ended', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');
const when = (iso: string) => `${formatDate(new Date(iso))}, ${timeOf(new Date(iso))}`;
const rule = (s: LiveMaintenance['settings'], key: string) => s.numbers.find((n) => n.key === key)?.value ?? 0;

/** The drawn checks (YX-10), from the platform settings; the API checks again with India days. */
export function windowProblem(start: Date, hours: number, s: LiveMaintenance['settings'], now: Date): string | null {
  const ahead = (start.getTime() - now.getTime()) / 3_600_000;
  const notice = rule(s, 'maintenance.notice_hours');
  if (ahead < notice) return `Only ${Math.max(0, Math.floor(ahead))} hours' notice. Maintenance must be announced at least ${notice} hours ahead.`;
  if (hours > rule(s, 'maintenance.max_hours')) return `A window can be at most ${rule(s, 'maintenance.max_hours')} hours.`;
  const day = start.getDate();
  const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const first = rule(s, 'maintenance.block_first_days');
  const end = rule(s, 'maintenance.block_last_days');
  if (day <= first || day > last - end) return `This falls in the payroll-critical days (the first ${first} and last ${end} days of the month).`;
  if (s.blockDates.includes(day)) return `The ${day}th is a statutory due date for some companies.`;
  return null;
}

export function LiveMaintenanceScreen({ live }: { live: LiveMaintenance }) {
  return (
    <ConsolePage
      crumb="Planned maintenance"
      title="Planned maintenance"
      description="Companies see a banner the day before and during a window. A window never blocks sign-in. Another staff member approves each one."
      state={live.state}
      onRetry={live.onRetry}
      what="maintenance windows"
    >
      <div className="yx-ps-stack">
        <Card title="What companies see now">
          {live.current ? <AvailabilityBanner kind="maintenance" live={live.current} /> : <p className="yx-ps-muted">Nothing: no window is close.</p>}
        </Card>
        {live.canManage === false ? (
          <p className="yx-ps-muted">You can see the windows. A Security lead schedules, approves and cancels them.</p>
        ) : (
          <ScheduleCard live={live} />
        )}
        <WindowList live={live} />
        {live.canManage !== false && <RulesCard live={live} />}
      </div>
    </ConsolePage>
  );
}

function ScheduleCard({ live }: { live: LiveMaintenance }) {
  const max = rule(live.settings, 'maintenance.max_hours') || 4;
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<Date | null>(live.defaultStart ?? null);
  const [time, setTime] = useState<string | null>(live.defaultStart ? `${String(live.defaultStart.getHours()).padStart(2, '0')}:${String(live.defaultStart.getMinutes()).padStart(2, '0')}` : '01:00');
  const [hours, setHours] = useState(2);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const start = day && time ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(time.slice(0, 2)), Number(time.slice(3, 5))) : null;
  const problem = start ? windowProblem(start, hours, live.settings, live.now) : null;
  const early = useTooEarly(
    [
      title.trim().length < 3 && { fieldId: 'mw-title', message: 'Write a title of at least 3 characters.' },
      !day && { fieldId: 'mw-day', message: 'Choose the day.' },
      !time && { fieldId: 'mw-time', message: 'Give the start time.' },
      problem && { fieldId: 'mw-day', message: problem },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const send = async () => {
    if (early.stop() || !start) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onSchedule({ title: title.trim(), startsAt: start.toISOString(), hours });
      setTitle('');
      toast({ tone: 'success', title: 'Sent for approval', description: 'Another staff member approves it before companies see it.' });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Schedule maintenance" footer={<Button variant="primary" loading={busy} onClick={() => void send()}>Send for approval</Button>}>
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FormField id="mw-title" label="Title" required helper="Companies see it in the banner, for example Database upgrade." error={early.errorOf('mw-title')}>
          <TextField value={title} onChange={setTitle} maxLength={120} />
        </FormField>
        <FieldRow>
          <FormField id="mw-day" label="Day" required error={early.errorOf('mw-day')}>
            <DatePicker value={day} onChange={setDay} />
          </FormField>
          <FormField id="mw-time" label="Start" required error={early.errorOf('mw-time')}>
            <TimeField value={time} onChange={setTime} />
          </FormField>
          <FormField label="Duration">
            <Segment label="Duration" options={Array.from({ length: Math.min(max, 4) }, (_, i) => ({ value: String(i + 1), label: `${i + 1} h` }))} value={String(hours)} onChange={(v) => setHours(Number(v))} />
          </FormField>
        </FieldRow>
        {start &&
          (problem ? (
            <InlineAlert tone="danger" title="This window can't be used">
              {problem}
            </InlineAlert>
          ) : (
            <InlineAlert tone="success" title="Window passes the checks">
              {rule(live.settings, 'maintenance.notice_hours')} hours' notice, outside the payroll-critical days and statutory due dates. Companies see the banner {rule(live.settings, 'maintenance.banner_hours')} hours before.
            </InlineAlert>
          ))}
      </div>
    </Card>
  );
}

function WindowList({ live }: { live: LiveMaintenance }) {
  const [approving, setApproving] = useState<MaintenanceRow | null>(null);
  const [cancelling, setCancelling] = useState<MaintenanceRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const reasonEarly = useTooEarly(reason.trim() ? [] : [{ fieldId: 'mw-reason', message: 'Say why it is cancelled.' }]);
  return (
    <Card title="Windows">
      {failed && <InlineAlert tone="danger" title={failed} />}
      {live.windows.length ? (
        <ul className="yx-ps-list" aria-label="Maintenance windows">
          {live.windows.map((w) => (
            <li key={w.id}>
              <div className="yx-ps-list__main">
                <span className="yx-ps-list__title">{w.title}</span>
                <span className="yx-ps-list__meta">
                  {when(w.startsAt)} to {timeOf(new Date(w.endsAt))} · scheduled by {w.mine ? 'you' : w.writtenBy}
                  {w.decidedBy ? ` · approved by ${w.decidedBy}` : ''}
                  {w.cancelledBy ? ` · cancelled by ${w.cancelledBy}: “${w.cancelReason ?? ''}”` : ''}
                </span>
              </div>
              <Badge tone={STATUS[w.status].tone}>{STATUS[w.status].label}</Badge>
              {live.canManage !== false && w.status === 'pending_approval' && (w.mine ? <span className="yx-ps-muted">Another staff member approves it</span> : <Button size="sm" variant="approve" onClick={() => setApproving(w)}>Approve</Button>)}
              {live.canManage !== false && (w.status === 'pending_approval' || w.status === 'scheduled' || w.status === 'in_progress') && (
                <Button size="sm" onClick={() => (setReason(''), setCancelling(w))}>
                  Cancel window
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title="No maintenance windows." description="Schedule one above. Companies see nothing until another staff member approves it." />
      )}
      {approving && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setApproving(null)}
          title={`Approve “${approving.title}”?`}
          consequence={`Every company sees the banner from ${rule(live.settings, 'maintenance.banner_hours')} hours before ${when(approving.startsAt)} until it ends. Sign-in is never blocked.`}
          confirmLabel="Approve"
          onConfirm={async () => {
            setFailed(null);
            try {
              await live.onApprove(approving.id, approving.version);
              toast({ tone: 'success', title: 'Window approved' });
            } catch (e) {
              setFailed(errorText(e));
            }
          }}
        />
      )}
      {cancelling && (
        <Dialog
          open
          onOpenChange={(o) => !o && setCancelling(null)}
          size="sm"
          title={`Cancel “${cancelling.title}”?`}
          description="Companies stop seeing its banner at once."
          footer={
            <>
              <Button onClick={() => setCancelling(null)}>Keep it</Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={async () => {
                  if (reasonEarly.stop()) return;
                  setBusy(true);
                  setFailed(null);
                  try {
                    await live.onCancel(cancelling.id, cancelling.version, reason.trim());
                    toast({ tone: 'success', title: 'Window cancelled' });
                  } catch (e) {
                    setFailed(errorText(e));
                  } finally {
                    setBusy(false);
                    setCancelling(null);
                  }
                }}
              >
                Cancel window
              </Button>
            </>
          }
        >
          <FormField id="mw-reason" label="Reason" required error={reasonEarly.errorOf('mw-reason')}>
            <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
          </FormField>
        </Dialog>
      )}
    </Card>
  );
}

/** Answer 948: the maintenance rules are platform settings with the drawn defaults. */
function RulesCard({ live }: { live: LiveMaintenance }) {
  return (
    <Card title="Rules" actions={live.onOpenPlatformSettings ? <Button size="sm" onClick={live.onOpenPlatformSettings}>Change in Platform settings</Button> : undefined}>
      <div className="yx-ps-stack">
        <DescriptionList
          items={[
            ...live.settings.numbers.map((n) => ({ label: n.label, value: n.value === n.default ? `${n.value} (the default)` : `${n.value} (default ${n.default})` })),
            { label: 'Statutory due dates (no windows)', value: live.settings.blockDates.join(', ') || 'None' },
          ]}
        />
        <p className="yx-ps-muted">Changed in Console › Platform settings, with your security key and a reason.</p>
      </div>
    </Card>
  );
}
