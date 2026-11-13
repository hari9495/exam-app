// YX-10 Incidents, live (YukthiX console C-8, and answer 1124): the designed IncidentComposerScreen's incident part with
// the API's data. Staff declare an incident (title, severity, affected products) with its first update; a second staff
// member approves each update before companies see it in the availability banner. A security breach linked to a
// containment shows its CERT-In and DPDP clocks, and staff are reminded before each.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, DescriptionList } from '../../components/shell';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { ConsolePage } from '../console/console-kit';
import type { LoadState } from '../console/types';
import { AvailabilityBanner, type CurrentIncident } from '../settings/help';
import { FilteredTable, opts } from './list-kit';
import { BoardNoticeSteps } from './board-notice';

export type IncidentStage = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export interface IncidentUpdateRow {
  id: string;
  stage: IncidentStage;
  impact: string;
  action: string;
  nextUpdateAt: string | null;
  payrollNote: boolean;
  status: 'pending' | 'posted' | 'sent_back';
  writtenBy: string;
  mine: boolean;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
}
export interface ContainmentChoice {
  id: string;
  organizationId?: string;
  company: string;
  containedAt: string;
  certinDueAt: string;
  dpdpDueAt: string;
  open: boolean;
}
export interface IncidentLiveRow {
  id: string;
  ref: string;
  title: string;
  severity: number;
  products: string[];
  status: 'open' | 'resolved';
  stage: IncidentStage | null;
  openedAt: string;
  openedBy: string;
  resolvedAt: string | null;
  securityBreach: boolean;
  breach: (ContainmentChoice & { certinRemindedAt: string | null; dpdpRemindedAt: string | null; boardNotifiedAt?: string | null; boardNoticeNote?: string | null }) | null;
  updates: IncidentUpdateRow[];
}
export interface IncidentUpdateInput {
  stage: IncidentStage;
  impact: string;
  action: string;
  nextUpdateMinutes?: number;
  payrollNote?: boolean;
}
export interface IncidentOpenInput extends IncidentUpdateInput {
  title: string;
  severity: number;
  products: string[];
}
export interface LiveIncidents {
  state: LoadState;
  onRetry: () => void;
  incidents: IncidentLiveRow[];
  containments: ContainmentChoice[];
  products: { code: string; name: string }[];
  settings: { leadHours: number; leadHoursDefault: number };
  onOpen: (input: IncidentOpenInput) => Promise<unknown>;
  onUpdate: (id: string, input: IncidentUpdateInput) => Promise<unknown>;
  onReview: (id: string, updateId: string, approve: boolean, note?: string) => Promise<unknown>;
  onMarkBreach: (id: string, containmentId: string) => Promise<unknown>;
  /** DPDP Rule 7: mark the first notice to the Board as sent for the contained company (security key). */
  onBoardNotice?: (organizationId: string, sentAt: string, note: string) => Promise<unknown>;
  /** Answer 1261: the lead time changes only in Console › Platform settings (absent without platform.settings.manage). */
  onOpenPlatformSettings?: () => void;
  /** Stories: open the drawer on this incident (or a new one). */
  defaultOpen?: string | 'new';
}

const STAGES: IncidentStage[] = ['investigating', 'identified', 'monitoring', 'resolved'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NEXT = [
  { value: '30', label: 'In 30 minutes' },
  { value: '60', label: 'In 1 hour' },
  { value: '120', label: 'In 2 hours' },
  { value: '240', label: 'In 4 hours' },
];
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');
const when = (iso: string) => `${formatDate(new Date(iso))}, ${timeOf(new Date(iso))}`;

/** What companies see now: the latest posted update of the most severe open incident (never a security breach). */
export function companyView(rows: IncidentLiveRow[]): CurrentIncident | null {
  const open = rows.filter((r) => r.status === 'open' && !r.securityBreach && r.updates.some((u) => u.status === 'posted')).sort((a, b) => a.severity - b.severity);
  const i = open[0];
  const u = i?.updates.find((x) => x.status === 'posted');
  return i && u ? { title: i.title, severity: i.severity, stage: u.stage, impact: u.impact, action: u.action, nextUpdateAt: u.nextUpdateAt, payrollNote: u.payrollNote, updatedAt: u.createdAt } : null;
}

export function LiveIncidentsScreen({ live }: { live: LiveIncidents }) {
  const [openId, setOpenId] = useState<string | null>(live.defaultOpen ?? null);
  const now = companyView(live.incidents);
  const current = openId && openId !== 'new' ? live.incidents.find((i) => i.id === openId) : undefined;
  const productName = (c: string) => live.products.find((p) => p.code === c)?.name ?? c;
  return (
    <ConsolePage
      crumb="Incidents"
      title="Incidents and status"
      description="Companies with an affected product see the latest approved update in a banner while the incident is open. A person writes every update; another staff member approves it."
      state={live.state}
      onRetry={live.onRetry}
      what="incidents"
      actions={
        <Button variant="primary" onClick={() => setOpenId('new')}>
          Declare incident
        </Button>
      }
    >
      <div className="yx-ps-stack">
        <Card title="What companies see now">{now ? <AvailabilityBanner kind="degraded" incident={now} /> : <p className="yx-ps-muted">Nothing: no open incident has an approved update.</p>}</Card>
        <FilteredTable
          label="Incidents"
          rows={live.incidents}
          getRowId={(r) => r.id}
          searchText={(r) => `${r.ref} ${r.title}`}
          fields={[{ key: 'stage', label: 'Stage', type: 'multi', options: opts(['Waiting for approval', 'Investigating', 'Identified', 'Monitoring', 'Resolved']) }]}
          columns={[
            { key: 'id', header: 'ID', type: 'id', value: (r) => r.ref, width: 100 },
            { key: 'title', header: 'Title', value: (r) => r.title, width: 260 },
            { key: 'sev', header: 'Severity', value: (r) => `Sev-${r.severity}${r.securityBreach ? ' · breach' : ''}`, width: 130 },
            { key: 'stage', header: 'Stage', type: 'status', value: (r) => (r.status === 'resolved' ? 'Resolved' : r.stage ? cap(r.stage) : 'Waiting for approval'), statusTone: (v) => (v === 'Resolved' ? 'success' : 'warning'), width: 160 },
            { key: 'products', header: 'Products', value: (r) => r.products.map(productName).join(', '), width: 180 },
            { key: 'started', header: 'Started', value: (r) => r.openedAt, render: (r) => when(r.openedAt), width: 160 },
          ]}
          rowButtons={(r) => (
            <Button size="sm" onClick={() => setOpenId(r.id)}>
              Open
            </Button>
          )}
          empty={<EmptyState title="No incidents." description="Declare one when something is wrong for companies; they see it once another staff member approves the update." />}
        />
        <LeadCard live={live} />
      </div>
      {openId === 'new' && <NewIncident live={live} onClose={() => setOpenId(null)} />}
      {current && <IncidentDrawer key={current.id} live={live} incident={current} productName={productName} onClose={() => setOpenId(null)} />}
    </ConsolePage>
  );
}

/** The update fields (stage, impact, what to do, next update) and the preview of the banner companies would see. */
function useUpdateForm(prefix: string, title: string, severity: number) {
  const [stage, setStage] = useState<IncidentStage | null>('investigating');
  const [impact, setImpact] = useState('');
  const [action, setAction] = useState('');
  const [next, setNext] = useState<string | null>('30');
  const [payroll, setPayroll] = useState(false);
  const issues = [
    !stage && { fieldId: `${prefix}-stage`, message: 'Choose the stage.' },
    impact.trim().length < 10 && { fieldId: `${prefix}-impact`, message: 'Say in plain words what companies notice (at least 10 characters).' },
    action.trim().length < 3 && { fieldId: `${prefix}-action`, message: 'Say what companies should do, for example "No action needed".' },
    /[<>]/.test(impact + action) && { fieldId: `${prefix}-impact`, message: 'Write it without < or >.' },
  ].filter(Boolean) as { fieldId: string; message: string }[];
  const input = (): IncidentUpdateInput => ({ stage: stage!, impact: impact.trim(), action: action.trim(), ...(stage !== 'resolved' && next ? { nextUpdateMinutes: Number(next) } : {}), payrollNote: payroll });
  const preview: CurrentIncident = { title: title.trim() || 'Title', severity, stage: stage ?? 'investigating', impact: impact.trim() || 'What companies notice.', action: action.trim(), nextUpdateAt: stage !== 'resolved' && next ? new Date(Date.now() + Number(next) * 60_000).toISOString() : null, payrollNote: payroll, updatedAt: new Date().toISOString() };
  const fields = (errorOf: (id: string) => string | null | undefined) => (
    <>
      <FieldRow>
        <FormField id={`${prefix}-stage`} label="Stage" required error={errorOf(`${prefix}-stage`)}>
          <Select value={stage} onChange={(v) => setStage(v as IncidentStage)} options={STAGES.map((s) => ({ value: s, label: cap(s) }))} />
        </FormField>
        <FormField label="Next update" helper="None once resolved.">
          <Select value={stage === 'resolved' ? null : next} onChange={setNext} options={NEXT} disabled={stage === 'resolved'} placeholder="None" />
        </FormField>
      </FieldRow>
      <FormField id={`${prefix}-impact`} label="Impact in plain words" required error={errorOf(`${prefix}-impact`)}>
        <TextArea rows={3} value={impact} onChange={setImpact} maxLength={500} />
      </FormField>
      <FormField id={`${prefix}-action`} label="What companies should do" required error={errorOf(`${prefix}-action`)}>
        <TextArea rows={2} value={action} onChange={setAction} maxLength={300} />
      </FormField>
      <Checkbox checked={payroll} onChange={setPayroll} label="Add the payroll-day note (last 3 and first 7 days of the month)" />
      <Card title="Preview: what companies see">
        <AvailabilityBanner kind="degraded" incident={preview} />
      </Card>
    </>
  );
  return { issues, input, fields };
}

function NewIncident({ live, onClose }: { live: LiveIncidents; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<string | null>('2');
  const [products, setProducts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const form = useUpdateForm('ni', title, Number(severity ?? 2));
  const early = useTooEarly(
    [
      title.trim().length < 3 && { fieldId: 'ni-title', message: 'Write a title of at least 3 characters.' },
      !products.length && { fieldId: 'ni-products', message: 'Choose at least one affected product.' },
      ...form.issues,
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const send = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onOpen({ title: title.trim(), severity: Number(severity), products, ...form.input() });
      toast({ tone: 'success', title: 'Incident declared', description: 'Companies see it once another staff member approves the update.' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="Declare incident"
      subtitle="Companies see nothing until another staff member approves the first update."
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <Button variant="primary" loading={busy} onClick={() => void send()}>
          Send for approval
        </Button>
      }
    >
      <div className="yx-ps-stack">
        <FormField id="ni-title" label="Title" required helper="Companies see it, for example Payslip PDFs slow to open." error={early.errorOf('ni-title')}>
          <TextField value={title} onChange={setTitle} maxLength={120} />
        </FormField>
        <FieldRow>
          <FormField label="Severity" required>
            <Select value={severity} onChange={setSeverity} options={[{ value: '1', label: 'Sev-1' }, { value: '2', label: 'Sev-2' }, { value: '3', label: 'Sev-3' }]} />
          </FormField>
          <FormField id="ni-products" label="Products" required helper="Only companies with these products see it." error={early.errorOf('ni-products')}>
            <MultiSelect value={products} onChange={setProducts} options={live.products.map((p) => ({ value: p.code, label: p.name }))} />
          </FormField>
        </FieldRow>
        {form.fields(early.errorOf)}
      </div>
    </Drawer>
  );
}

function IncidentDrawer({ live, incident, productName, onClose }: { live: LiveIncidents; incident: IncidentLiveRow; productName: (c: string) => string; onClose: () => void }) {
  const pending = incident.updates.find((u) => u.status === 'pending');
  const [note, setNote] = useState('');
  const [containment, setContainment] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const form = useUpdateForm('iu', incident.title, incident.severity);
  const early = useTooEarly(form.issues);
  const noteEarly = useTooEarly(note.trim() ? [] : [{ fieldId: 'iu-note', message: 'Say what to change before sending it back.' }]);
  const breachEarly = useTooEarly(containment ? [] : [{ fieldId: 'iu-containment', message: 'Choose the contained company.' }]);
  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setFailed(null);
    try {
      await fn();
      toast({ tone: 'success', title: done });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const open = incident.status === 'open';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`${incident.ref} · ${incident.title}`}
      subtitle={`Sev-${incident.severity} · ${incident.products.map(productName).join(', ')} · declared by ${incident.openedBy} ${when(incident.openedAt)}${incident.resolvedAt ? ` · resolved ${when(incident.resolvedAt)}` : ''}`}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        pending ? (
          pending.mine ? (
            <span className="yx-ps-muted">Waiting: another staff member approves your update.</span>
          ) : (
            <>
              <Button loading={busy === 'back'} onClick={() => !noteEarly.stop() && void act('back', () => live.onReview(incident.id, pending.id, false, note.trim()), 'Sent back')}>
                Send back
              </Button>
              <Button variant="primary" loading={busy === 'post'} onClick={() => void act('post', () => live.onReview(incident.id, pending.id, true), pending.stage === 'resolved' ? 'Posted; the incident is resolved' : 'Posted for companies')}>
                Approve and post
              </Button>
            </>
          )
        ) : open ? (
          <Button variant="primary" loading={busy === 'update'} onClick={() => !early.stop() && void act('update', () => live.onUpdate(incident.id, form.input()), 'Sent for approval')}>
            Send for approval
          </Button>
        ) : undefined
      }
    >
      <div className="yx-ps-stack">
        <BreachCard incident={incident} live={live} containment={containment} setContainment={setContainment} errorOf={breachEarly.errorOf} busy={busy === 'breach'} onMark={() => !breachEarly.stop() && void act('breach', () => live.onMarkBreach(incident.id, containment!), 'Marked as a security breach')} />
        {pending ? (
          <Card title={`Waiting for approval · ${cap(pending.stage)} · by ${pending.mine ? 'you' : pending.writtenBy}`}>
            <div className="yx-ps-stack">
              <AvailabilityBanner kind="degraded" incident={{ title: incident.title, severity: incident.severity, stage: pending.stage, impact: pending.impact, action: pending.action, nextUpdateAt: pending.nextUpdateAt, payrollNote: pending.payrollNote, updatedAt: pending.createdAt }} />
              {!pending.mine && (
                <FormField id="iu-note" label="Note for the writer" helper="Needed only to send it back." error={noteEarly.errorOf('iu-note')}>
                  <TextArea rows={2} value={note} onChange={setNote} maxLength={300} />
                </FormField>
              )}
            </div>
          </Card>
        ) : open ? (
          form.fields(early.errorOf)
        ) : null}
        <Card title="Updates">
          {incident.updates.length ? (
            <ul className="yx-ps-list" aria-label="Updates">
              {incident.updates.map((u) => (
                <li key={u.id}>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">
                      {cap(u.stage)}: {u.impact} {u.action}
                    </span>
                    <span className="yx-ps-list__meta">
                      {when(u.createdAt)} · written by {u.mine ? 'you' : u.writtenBy}
                      {u.reviewedBy ? ` · ${u.status === 'posted' ? 'approved' : 'sent back'} by ${u.reviewedBy}` : ''}
                      {u.reviewNote ? `: “${u.reviewNote}”` : ''}
                    </span>
                  </div>
                  <Badge tone={u.status === 'posted' ? 'success' : u.status === 'pending' ? 'warning' : 'neutral'}>{u.status === 'posted' ? 'Posted' : u.status === 'pending' ? 'Waiting' : 'Sent back'}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="yx-ps-muted">No updates.</p>
          )}
        </Card>
      </div>
    </Drawer>
  );
}

/** Answer 1124: a security breach of a contained company shows its CERT-In and DPDP clocks; staff are reminded before each. */
function BreachCard({ incident, live, containment, setContainment, errorOf, busy, onMark }: { incident: IncidentLiveRow; live: LiveIncidents; containment: string | null; setContainment: (v: string | null) => void; errorOf: (id: string) => string | null | undefined; busy: boolean; onMark: () => void }) {
  const b = incident.breach;
  if (b)
    return (
      <>
        <InlineAlert tone="danger" title={`Security breach: ${b.company} (contained ${when(b.containedAt)})`}>
          CERT-In report due {when(b.certinDueAt)}
          {b.certinRemindedAt ? ` (reminded ${when(b.certinRemindedAt)})` : ''}. DPDP detailed report to the Data Protection Board due {when(b.dpdpDueAt)}
          {b.dpdpRemindedAt ? ` (reminded ${when(b.dpdpRemindedAt)})` : ''}. Incident staff get an email {live.settings.leadHours} hours before each. Other companies never see this incident.
        </InlineAlert>
        <BoardNoticeSteps
          notice={b.boardNotifiedAt ? { at: b.boardNotifiedAt, note: b.boardNoticeNote ?? null } : null}
          dpdpDueAt={b.dpdpDueAt}
          onMark={live.onBoardNotice && b.organizationId ? (sentAt, note) => live.onBoardNotice!(b.organizationId!, sentAt, note) : undefined}
        />
      </>
    );
  if (!live.containments.length) return null;
  return (
    <Card title="Security breach" actions={<Button size="sm" variant="danger" loading={busy} onClick={onMark}>Mark as security breach</Button>}>
      <FormField id="iu-containment" label="Contained company" helper="Its CERT-In and DPDP clocks start the reminders. Other companies stop seeing this incident." error={errorOf('iu-containment')}>
        <Select value={containment} onChange={setContainment} placeholder="Choose" options={live.containments.map((c) => ({ value: c.id, label: `${c.company} · contained ${when(c.containedAt)}` }))} />
      </FormField>
    </Card>
  );
}

/** Answer 1124: how long before each due time the reminder goes (a platform setting with a default). */
function LeadCard({ live }: { live: LiveIncidents }) {
  const { leadHours: v, leadHoursDefault: d } = live.settings;
  return (
    <Card title="Breach reminders" actions={live.onOpenPlatformSettings ? <Button size="sm" onClick={live.onOpenPlatformSettings}>Change in Platform settings</Button> : undefined}>
      <div className="yx-ps-stack">
        <DescriptionList items={[{ label: 'Hours before the CERT-In and DPDP due times', value: v === d ? `${v} (the default)` : `${v} (default ${d})` }]} />
        <p className="yx-ps-muted">Changed in Console › Platform settings, with your security key and a reason. 0 sends it at the due time.</p>
      </div>
    </Card>
  );
}
