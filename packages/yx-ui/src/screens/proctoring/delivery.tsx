// Delivery admin: invitations & drives, slot calendar, capacity planner, connectivity, accommodations,
// campus kit, test centres, invigilator app (T03). PRC-07 … PRC-11, PRC-29, PRC-30.
import { useMemo, useState } from 'react';
import { CheckCircle2, Plus, QrCode, RefreshCw, Send, Upload, UserCheck, WifiOff } from 'lucide-react';
import { Button, ButtonGroup, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { ConfirmDialog } from '../../components/overlay';
import { Timeline } from '../../components/timeline';
import { BarChart } from '../../components/charts';
import { formatClock } from '../../components/exam';
import { Heading, Icon } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { PhoneFrame } from '../_kit/frames';
import { CandidateFrame, PrcFrame, type ViewState } from './proctoring-shared';
import { CameraFrame, IdCapture, QrPlaceholder } from './proctoring-kit';
import { planWaves, slotState, timeCredit } from './proctoring-logic';
import { DRIVES, NAMES, WEEK_DAYS, d, type AccommodationRow, type DriveRow, type InvitationRow, type SlotData } from './proctoring-data';

const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const fmtSlot = (x: Date | null) => (x ? `${formatDate(x)}, ${x.getHours() > 12 ? x.getHours() - 12 : x.getHours()}:00 ${x.getHours() >= 12 ? 'pm' : 'am'} IST` : 'Not booked');
const INV_TONE: Record<InvitationRow['status'], 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  Invited: 'neutral',
  Booked: 'info',
  Started: 'info',
  Completed: 'success',
  'Under review': 'warning',
  Missed: 'danger',
  Expired: 'neutral',
};

/* ================================================================== */
/* PRC-07 · Invitations & drives                                       */
/* ================================================================== */

const INV_FIELDS: FilterFieldDef[] = [
  { key: 'status', label: 'Status', type: 'multi', options: opt(['Invited', 'Booked', 'Started', 'Completed', 'Under review', 'Missed', 'Expired']) },
  { key: 'drive', label: 'Drive', type: 'multi', options: opt(DRIVES.map((x) => x.name)) },
  { key: 'subject', label: 'Test-taker', type: 'multi', options: opt(['Candidate', 'Employee']) },
];

const INV_COLS: TableColumn<InvitationRow>[] = [
  { key: 'name', header: 'Test-taker', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.subject === 'Employee' ? 'Employee · own session' : r.email }), width: 250 },
  { key: 'id', header: 'Invitation', type: 'id', value: (r) => r.id, width: 110 },
  { key: 'test', header: 'Test', value: (r) => r.test, width: 220 },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => INV_TONE[v as InvitationRow['status']], groupable: true, width: 130 },
  { key: 'slot', header: 'Slot (candidate time)', value: (r) => r.slot, render: (r) => fmtSlot(r.slot), width: 220 },
  { key: 'acc', header: 'Accommodation', value: (r) => r.accommodation ?? '', width: 170 },
  { key: 'reminders', header: 'Reminders sent', type: 'number', value: (r) => r.reminders, width: 120 },
];

const DRIVE_COLS: TableColumn<DriveRow>[] = [
  { key: 'name', header: 'Drive', value: (r) => r.name, width: 260 },
  { key: 'test', header: 'Test', value: (r) => r.test, width: 220 },
  { key: 'window', header: 'Window', value: (r) => r.window, width: 170 },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Live' ? 'success' : v === 'Closed' ? 'neutral' : 'info'), width: 150 },
  { key: 'registered', header: 'Registered', type: 'number', value: (r) => r.registered, width: 110 },
  { key: 'invited', header: 'Invited', type: 'number', value: (r) => r.invited, width: 100 },
  { key: 'attempted', header: 'Attempted', type: 'number', value: (r) => r.attempted, width: 110 },
  { key: 'plan', header: 'Capacity plan', value: (r) => (r.expected > 1000 ? 'Needed' : 'Not needed'), render: (r) => (r.expected > 1000 ? <Badge tone="warning">Needed, draft</Badge> : <Badge>Not needed</Badge>), width: 140 },
];

export function InvitationsScreen({ invitations, drives, state = 'ready', tab = 'invitations', inviteOpen = false, defaultOpenId = null }: { invitations: InvitationRow[]; drives: DriveRow[]; state?: ViewState; tab?: 'drives' | 'invitations'; inviteOpen?: boolean; defaultOpenId?: string | null }) {
  // PRC-07
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [invite, setInvite] = useState(inviteOpen);
  const [openId, setOpenId] = useState(defaultOpenId);
  const [mode, setMode] = useState('slot');
  const rows = useMemo(() => invitations.filter((r) => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f))), [invitations, filters, q]);
  const open = invitations.find((x) => x.id === openId);
  const tableState = state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready';
  return (
    <PrcFrame page="Invitations & drives">
      <PageHeader
        title="Invitations and drives"
        description="Times show in each candidate's own time zone; tests are authored in IST."
        actions={
          <>
            <Button icon={Plus}>New drive</Button>
            <Button variant="primary" icon={Send} onClick={() => setInvite(true)}>
              Invite candidates
            </Button>
          </>
        }
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Delivery">
          <TabsTrigger value="invitations" count={invitations.length}>
            Invitations
          </TabsTrigger>
          <TabsTrigger value="drives" count={drives.length}>
            Drives
          </TabsTrigger>
        </TabsList>
        <TabsContent value="invitations">
          <div className="yx-prc-stack">
            <FilterBar fields={INV_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search name" />
            <DataTable
              label="Invitations"
              columns={INV_COLS}
              rows={state === 'empty' ? [] : rows}
              getRowId={(r) => r.id}
              state={tableState}
              errorTitle="We couldn't load invitations."
              onRetry={() => {}}
              filtered={filters.length > 0 || !!q}
              onClearFilters={() => {
                setFilters([]);
                setQ('');
              }}
              empty={<EmptyState title="No one invited yet." description="Invite candidates one by one, upload a list, or connect a hiring stage so invitations go out automatically." action={<Button>Invite candidates</Button>} />}
              selectable
              selectedIds={sel}
              onSelectedChange={setSel}
              bulkActions={(ids) => (
                <>
                  <Button size="sm">Send reminder to {ids.length}</Button>
                  <Button size="sm">Extend window</Button>
                  <Button size="sm" variant="danger">
                    Revoke
                  </Button>
                </>
              )}
              onRowClick={(r) => setOpenId(r.id)}
              activeRowId={openId}
              pageSize={10}
            />
          </div>
        </TabsContent>
        <TabsContent value="drives">
          <DataTable label="Drives" columns={DRIVE_COLS} rows={state === 'empty' ? [] : drives} getRowId={(r) => r.id} state={tableState} empty={<EmptyState title="No drives yet." description="A drive groups many sessions and slots, across centres if needed." action={<Button>New drive</Button>} />} />
        </TabsContent>
      </Tabs>
      <Drawer
        open={invite}
        onOpenChange={setInvite}
        title="Invite candidates"
        subtitle="Java Backend Developer · L2, v3"
        footer={
          <>
            <Button onClick={() => setInvite(false)}>Cancel</Button>
            <Button variant="primary">Send 24 invitations</Button>
          </>
        }
      >
        <div className="yx-prc-stack">
          <FormField label="Candidates" helper="CSV or XLSX with name, email and mobile. 24 rows found, 2 already invited (skipped).">
            <Button icon={Upload}>Upload list</Button>
          </FormField>
          <FormField label="How candidates take it">
            <RadioGroup value={mode} onChange={setMode} aria-label="Scheduling mode" options={[{ value: 'window', label: 'Any time in a window', description: 'Access from 1 Oct to 7 Oct' }, { value: 'slot', label: 'Book a slot', description: 'Candidates pick a slot with free capacity; up to 2 reschedules until 24 hours before' }]} />
          </FormField>
          <div className="yx-prc-grid2">
            <FormField label="Deadline">
              <TextField value="7 Oct 2026, 11:59 pm IST" readOnly />
            </FormField>
            <FormField label="Reminders">
              <TextField value="24 hours and 1 hour before · email + WhatsApp" readOnly />
            </FormField>
          </div>
          <Switch label="Show the test time in the candidate's time zone" defaultChecked disabled description="Always on. Reminders show both time and zone." />
        </div>
      </Drawer>
      {open && (
        <Drawer open onOpenChange={(o) => !o && setOpenId(null)} title={open.name} subtitle={`${open.id} · ${open.test}`} meta={<Badge tone={INV_TONE[open.status]}>{open.status}</Badge>} footer={open.status === 'Missed' ? <Button variant="primary">Re-invite once, with reason</Button> : <Button>Send reminder</Button>}>
          <div className="yx-prc-stack">
            {open.subject === 'Employee' && <InlineAlert tone="info">Employee test-taker: opens from the Me tab with their own sign-in. The result goes back to their learning record.</InlineAlert>}
            <DescriptionList
              items={[
                { label: 'Slot', value: fmtSlot(open.slot) },
                { label: 'Drive', value: open.drive },
                { label: 'Accommodation', value: open.accommodation ?? 'None' },
                { label: 'Readiness check', value: open.status === 'Invited' ? 'Not run yet' : 'Passed on 27 Sep, microphone warning' },
              ]}
            />
            <Timeline
              items={[
                { id: '1', actor: { name: 'YukthiX' }, action: 'Invitation sent by email and WhatsApp', at: d(24, 8, 10) },
                { id: '2', actor: { name: open.name }, action: 'Booked a slot', at: d(24, 8, 18, 20) },
                { id: '3', actor: { name: 'YukthiX' }, action: 'Reminder, 24 hours before', at: d(27, 8, 10) },
              ]}
            />
          </div>
        </Drawer>
      )}
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-08 · Slot calendar with capacity                                */
/* ================================================================== */

const hourText = (h: number) => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'pm' : 'am'}`;

export function SlotCalendarScreen({ slots, defaultSlot = 's4', state = 'ready' }: { slots: SlotData[]; defaultSlot?: string | null; state?: ViewState }) {
  // PRC-08
  const [sel, setSel] = useState(defaultSlot);
  const slot = slots.find((s) => s.id === sel);
  return (
    <PrcFrame page="Slot calendar">
      <PageHeader
        title="Slot calendar"
        description="Week of 28 Sep 2026 · capacity comes from proctor staffing (online) or centre seats"
        actions={
          <>
            <ButtonGroup aria-label="Week">
              <Button size="sm">Previous week</Button>
              <Button size="sm">Next week</Button>
            </ButtonGroup>
            <Button variant="primary" icon={Plus}>
              Add slot
            </Button>
          </>
        }
      />
      {state === 'loading' ? (
        <Skeleton />
      ) : state === 'error' ? (
        <ErrorState title="We couldn't load slots." onRetry={() => {}} reference="SLOT-500" />
      ) : state === 'empty' || slots.length === 0 ? (
        <EmptyState title="No slots this week." description="Tests in slot mode need slots before candidates can book." action={<Button>Add slot</Button>} />
      ) : (
        <div className="yx-prc-split">
          <div className="yx-prc-slots" role="group" aria-label="Slots by day">
            {WEEK_DAYS.map((day, i) => (
              <div key={day} className="yx-prc-slots__day">
                <h3>{day}</h3>
                {slots
                  .filter((s) => s.day === i)
                  .map((s) => {
                    const st = slotState(s.capacity, s.booked);
                    const needsProctor = s.centre === 'Online' && s.proctors * 12 < s.booked;
                    return (
                      <button key={s.id} type="button" className="yx-prc-slot" data-state={st} aria-pressed={sel === s.id} onClick={() => setSel(s.id)}>
                        <strong>{hourText(s.start)}</strong>
                        <span>{s.centre}</span>
                        <span className="yx-prc-mono">
                          {s.booked} / {s.capacity} booked
                        </span>
                        <Badge tone={st === 'full' ? 'neutral' : st === 'filling' ? 'warning' : 'success'}>{st === 'full' ? 'Full' : st === 'filling' ? 'Filling' : 'Open'}</Badge>
                        {needsProctor && <Badge tone="danger">Short of proctors</Badge>}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          {slot && (
            <section className="yx-prc-box" aria-label="Slot details">
              <h2 className="yx-prc-h">
                {WEEK_DAYS[slot.day]}, {hourText(slot.start)}
              </h2>
              <Meter value={slot.booked} max={slot.capacity} label="Booked" warnAt={Math.round(slot.capacity * 0.8)} valueText={`${slot.booked} of ${slot.capacity}`} />
              <DescriptionList
                items={[
                  { label: 'Where', value: slot.centre },
                  { label: 'Proctors', value: slot.centre === 'Online' ? `${slot.proctors} × 1:12 = ${slot.proctors * 12} seats` : 'Invigilators at the centre' },
                  { label: 'Test', value: 'Campus aptitude 2026' },
                  { label: 'No-show rule', value: 'Recorded 15 minutes after start' },
                ]}
              />
              {slot.centre === 'Online' && slot.proctors * 12 < slot.booked && <InlineAlert tone="danger">Not enough proctors for {slot.booked} candidates. Add a proctor shift in the proctor planner.</InlineAlert>}
              <div className="yx-prc-row">
                <Button size="sm">Change capacity</Button>
                <Button size="sm">Move bookings</Button>
                <Button size="sm" variant="danger">
                  Cancel slot
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-09 · Drive capacity planner                                     */
/* ================================================================== */

export function CapacityPlannerScreen({ expected = 3600, perWave = 1200, approved = false }: { expected?: number; perWave?: number; approved?: boolean }) {
  // PRC-09
  const [wave, setWave] = useState<number | null>(perWave);
  const waves = planWaves(expected, wave || expected);
  const capacity = 1500;
  const over = waves.some((w) => w > capacity);
  const checks = [
    { label: 'Load test at planned concurrency: p95 answer save 410 ms (target ≤ 500 ms)', ok: true },
    { label: 'Runtime pre-warmed for 3 Oct, 8:30 am – 6:00 pm', ok: approved },
    { label: 'Proctor staffing: AI-only mode, reviewers booked for 5 days after', ok: true },
    { label: `Every wave within ${capacity.toLocaleString('en-IN')} concurrent`, ok: !over },
  ];
  return (
    <PrcFrame page="Capacity planner">
      <PageHeader
        title="Drive capacity plan"
        description="Campus drive · Tamil Nadu 2026 · 3 Oct 2026. Drives over 1,000 candidates need an approved plan."
        status={approved ? <Badge tone="success">Approved</Badge> : <Badge tone="warning">Draft</Badge>}
        actions={
          <Button variant="primary" disabled={over || approved}>
            {approved ? 'Plan approved' : 'Submit plan for approval'}
          </Button>
        }
      />
      {over && <InlineAlert tone="danger" title="A wave is over capacity">Wave size {wave?.toLocaleString('en-IN')} is above the reserved {capacity.toLocaleString('en-IN')} concurrent. Use smaller waves or ask for more capacity.</InlineAlert>}
      <div className="yx-prc-split">
        <div className="yx-prc-stack">
          <BarChart
            title="Expected load vs capacity per wave"
            description={`${expected.toLocaleString('en-IN')} expected candidates in ${waves.length} staggered waves, 90 minutes apart`}
            categories={waves.map((_, i) => `Wave ${i + 1} · ${hourText(9 + Math.floor((i * 3) / 2))}`)}
            series={[
              { name: 'Candidates', values: waves },
              { name: 'Reserved capacity', values: waves.map(() => capacity) },
            ]}
            valueLabels
          />
          <Card title="Go-live checklist">
            <ul className="yx-prc-plain">
              {checks.map((c) => (
                <li key={c.label}>
                  <span>{c.label}</span>
                  <Badge tone={c.ok ? 'success' : 'warning'}>{c.ok ? 'Done' : 'Pending'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <section className="yx-prc-box" aria-label="Plan settings">
          <FormField label="Expected candidates">
            <NumberField value={expected} onChange={() => {}} />
          </FormField>
          <FormField label="Candidates per wave" helper={`Platform target: 5,000 per drive, 20,000 at once across all companies`}>
            <NumberField value={wave} onChange={setWave} min={100} />
          </FormField>
          <FormField label="Gap between waves">
            <Select value="90" onChange={() => {}} options={[{ value: '60', label: '60 minutes' }, { value: '90', label: '90 minutes' }, { value: '120', label: '120 minutes' }]} />
          </FormField>
          <DescriptionList items={[{ label: 'Waves', value: waves.length }, { label: 'Largest wave', value: Math.max(...waves).toLocaleString('en-IN') }, { label: 'Reserved', value: `${capacity.toLocaleString('en-IN')} concurrent` }]} />
        </section>
      </div>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-10 · Connectivity panel per attempt                             */
/* ================================================================== */

export function ConnectivityPanelScreen({ lostSeconds = 820, approved = false, confirmOpen = false }: { lostSeconds?: number; approved?: boolean; confirmOpen?: boolean }) {
  // PRC-10
  const c = timeCredit(lostSeconds);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(confirmOpen);
  const gaps = [
    { from: '10:14:05 am', to: '10:15:35 am', secs: 90, note: 'Answers queued on device, synced' },
    { from: '10:32:10 am', to: '10:33:00 am', secs: 50, note: 'Synced' },
    { from: '10:48:20 am', to: '11:00:00 am', secs: Math.max(0, lostSeconds - 140), note: 'Router restart; test paused after 5 minutes offline' },
  ].filter((g) => g.secs > 0);
  return (
    <PrcFrame page="Connectivity">
      <ObjectHeader
        name="Ananya Rao · attempt ATT-88213"
        secondary="Campus aptitude 2026 · started 28 Sep, 10:02 am"
        status={c.reauth ? <Badge tone="warning">Face re-check needed to resume</Badge> : <Badge tone="success">Credited automatically</Badge>}
        facts={[
          { label: 'Lost time (server measured)', value: formatClock(lostSeconds) },
          { label: 'Credited automatically', value: formatClock(c.auto) },
          { label: 'Needs your approval', value: formatClock(c.needsApproval) },
          { label: 'Cap per attempt', value: '10:00' },
        ]}
      />
      <DataTable
        label="Disconnections"
        columns={[
          { key: 'from', header: 'Lost', value: (r: (typeof gaps)[number]) => r.from, width: 140 },
          { key: 'to', header: 'Back', value: (r: (typeof gaps)[number]) => r.to, width: 140 },
          { key: 'secs', header: 'Duration', value: (r: (typeof gaps)[number]) => r.secs, render: (r) => formatClock(r.secs), width: 110 },
          { key: 'note', header: 'What happened', value: (r: (typeof gaps)[number]) => r.note, width: 360 },
        ]}
        rows={gaps}
        getRowId={(r) => r.from}
      />
      {c.needsApproval > 0 && !approved && (
        <Card title={`Approve ${formatClock(c.needsApproval)} more time`}>
          <div className="yx-prc-stack">
            <p className="yx-prc-p">Anything above the 10-minute cap needs an admin decision. The candidate must pass a face re-check before resuming.</p>
            <FormField label="Reason" required helper="Saved in the audit log">
              <TextArea value={reason} onChange={setReason} rows={2} />
            </FormField>
            <div className="yx-prc-row">
              <Button>Decline extra time</Button>
              <Button variant="primary" onClick={() => setOpen(true)}>
                Approve extra time
              </Button>
            </div>
          </div>
        </Card>
      )}
      {approved && <InlineAlert tone="success">Approved {formatClock(c.needsApproval)} extra by Neha Joshi on 28 Sep, 11:06 am. Reason: "Area-wide outage confirmed by the college."</InlineAlert>}
      <ConfirmDialog open={open} onOpenChange={setOpen} title={`Approve ${formatClock(c.needsApproval)} extra time for Ananya Rao?`} consequence="The timer adds this time when she resumes after the face re-check. This is audited." confirmLabel="Approve extra time" onConfirm={() => setOpen(false)} confirmDisabled={reason.trim().length < 10}>
        {reason.trim().length < 10 && <p className="yx-prc-small yx-prc-danger">Enter a reason of at least 10 characters first.</p>}
      </ConfirmDialog>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-11 · Accommodation review queue                                 */
/* ================================================================== */

export function AccommodationQueueScreen({ rows, state = 'ready', defaultOpenId = 'ACC-202', persona = 'Reviewer' }: { rows: AccommodationRow[]; state?: ViewState; defaultOpenId?: string | null; persona?: 'Reviewer' | 'HR / L&D' }) {
  // PRC-11
  const [openId, setOpenId] = useState(defaultOpenId);
  const open = rows.find((r) => r.id === openId);
  const [approved, setApproved] = useState<string[]>(open?.types ?? []);
  return (
    <PrcFrame page="Accommodation queue">
      <PageHeader title="Accommodation requests" description={persona === 'HR / L&D' ? 'Employee test-takers in training and certification (HR / L&D approve)' : 'Decide before the slot. Evaluators never see the reason or the evidence.'} />
      <DataTable
        label="Accommodation requests"
        columns={[
          { key: 'name', header: persona === 'HR / L&D' ? 'Employee' : 'Candidate', type: 'person', value: (r: AccommodationRow) => r.name, person: (r) => ({ name: r.name, secondary: r.test }), width: 260 },
          { key: 'types', header: 'Asked for', value: (r: AccommodationRow) => r.types.join(', '), width: 280 },
          { key: 'slot', header: 'Slot', type: 'date', value: (r: AccommodationRow) => r.slot, width: 120 },
          { key: 'submitted', header: 'Submitted', type: 'date', value: (r: AccommodationRow) => r.submitted, width: 120 },
          { key: 'status', header: 'Status', type: 'status', value: (r: AccommodationRow) => r.status, statusTone: (v) => (v === 'Approved' ? 'success' : v === 'Declined' ? 'danger' : v === 'New' ? 'warning' : 'info'), width: 190 },
        ]}
        rows={state === 'empty' ? [] : rows}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        empty={<EmptyState title="No accommodation requests." description="Candidates ask from the test portal; approved changes apply to their invitation automatically." />}
        onRowClick={(r) => {
          setOpenId(r.id);
          setApproved(r.types);
        }}
        activeRowId={openId}
      />
      {open && state === 'ready' && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpenId(null)}
          title={open.name}
          subtitle={`${open.id} · ${open.test}`}
          footer={
            <>
              <Button>Ask for more information</Button>
              <Button variant="danger">Decline</Button>
              <Button variant="primary" disabled={approved.length === 0}>
                {approved.length === open.types.length ? 'Approve all' : `Approve ${approved.length} of ${open.types.length}`}
              </Button>
            </>
          }
        >
          <div className="yx-prc-stack">
            <InlineAlert tone="info">Special data. Visible only to accommodation reviewers. Evaluators and proctors see only the adjusted settings, never the reason.</InlineAlert>
            <FormField label="Approve each adjustment">
              <div className="yx-prc-stack" data-gap="sm">
                {open.types.map((t) => (
                  <Checkbox key={t} label={t} checked={approved.includes(t)} onChange={(c) => setApproved(c ? [...approved, t] : approved.filter((x) => x !== t))} />
                ))}
              </div>
            </FormField>
            <DescriptionList items={[{ label: 'Evidence', value: <span className="yx-prc-row">{open.evidence} <Button variant="review" size="sm">View</Button></span> }, { label: 'Slot', value: formatDate(open.slot) }, { label: 'What changes automatically', value: 'Timer, breaks, runner display and proctoring profile (e.g. gaze flags off)' }]} />
            <FormField label="Message to the candidate" helper="Tell them exactly what was approved">
              <TextArea rows={3} defaultValue="We have approved screen-reader mode and switched off eye-direction flags for your test on 1 Oct." />
            </FormField>
          </div>
        </Drawer>
      )}
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-29 · Campus drive kit                                           */
/* ================================================================== */

const COLLEGES = [
  { name: 'Coromandel Institute of Technology', code: 'CIT-TN-014', city: 'Chennai', coordinator: 'Dr. Latha Ramesh', visibility: 'Aggregate', registered: 1240, eligible: 1102, attended: 0, passed: 0 },
  { name: 'Kongu Valley Engineering College', code: 'KVEC-TN-022', city: 'Erode', coordinator: 'Prof. Senthil Kumar', visibility: 'None', registered: 980, eligible: 860, attended: 0, passed: 0 },
  { name: 'Vaigai College of Engineering', code: 'VCE-TN-031', city: 'Madurai', coordinator: 'Dr. Priya Natarajan', visibility: 'Per candidate', registered: 1415, eligible: 1210, attended: 0, passed: 0 },
  { name: 'Palar Polytechnic', code: 'PP-TN-040', city: 'Vellore', coordinator: 'Mr. Ashok Babu', visibility: 'Aggregate', registered: 3, eligible: 2, attended: 0, passed: 0 },
];
const REGISTRANTS = NAMES.slice(0, 10).map((n, i) => ({
  id: `REG-${7700 + i}`,
  name: n,
  college: COLLEGES[i % 3].name,
  roll: `21${['CS', 'IT', 'EC'][i % 3]}${140 + i}`,
  branch: ['CSE', 'IT', 'ECE'][i % 3],
  year: 2027,
  cgpa: [8.1, 7.4, 6.2, 8.8, 7.9, 5.8, 7.1, 9.0, 6.9, 7.6][i],
  dedupe: i === 3 ? 'Matched existing candidate' : i === 7 ? 'Matched: same email, new roll number' : 'New',
  eligibility: [8.1, 7.4, 6.2, 8.8, 7.9, 5.8, 7.1, 9.0, 6.9, 7.6][i] >= 6.5 ? 'Eligible' : 'Not eligible: CGPA below 6.5',
  admit: i % 4 === 0 ? 'Reissued (old QR revoked)' : i === 5 ? 'Not issued' : 'Issued',
}));
type Registrant = (typeof REGISTRANTS)[number];

export function CampusKitScreen({ tab = 'registrants' }: { tab?: 'form' | 'registrants' | 'institutions' | 'admit' | 'report' }) {
  // PRC-29
  return (
    <PrcFrame page="Campus kit & institutions">
      <PageHeader
        title="Campus drive · Tamil Nadu 2026"
        description="Registration open until 1 Oct · test 3–5 Oct · public page kaverifoods.careers/drive/tn-2026"
        status={<Badge tone="info">Registration open</Badge>}
        actions={
          <>
            <Button>Copy registration link</Button>
            <Button variant="primary">Issue admit cards</Button>
          </>
        }
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Campus kit">
          <TabsTrigger value="form">Registration form</TabsTrigger>
          <TabsTrigger value="registrants" count={4820}>
            Registrants
          </TabsTrigger>
          <TabsTrigger value="institutions" count={COLLEGES.length}>
            Institutions
          </TabsTrigger>
          <TabsTrigger value="admit">Admit cards</TabsTrigger>
          <TabsTrigger value="report">College-wise report</TabsTrigger>
        </TabsList>
        <TabsContent value="form">
          <div className="yx-prc-split">
            <Card title="Fields (YukthiX starter form, edited)">
              <ul className="yx-prc-plain">
                {['Full name · required', 'Email · OTP verified', 'Mobile · OTP verified', 'College · from institution list', 'Roll number · required', 'Degree and branch', 'Graduation year', 'CGPA / %', 'Photo · for the admit card', 'Consent to the privacy notice · required'].map((f) => (
                  <li key={f}>
                    <span>{f}</span>
                    <Button size="sm">Edit</Button>
                  </li>
                ))}
              </ul>
            </Card>
            <section className="yx-prc-box" aria-label="Eligibility and limits">
              <h2 className="yx-prc-h">Eligibility and limits</h2>
              <FormField label="Branches">
                <TextField value="CSE, IT, ECE" readOnly />
              </FormField>
              <FormField label="Graduation year">
                <TextField value="2027" readOnly />
              </FormField>
              <FormField label="Minimum CGPA">
                <NumberField value={6.5} decimals onChange={() => {}} />
              </FormField>
              <FormField label="Registration cap">
                <NumberField value={6000} onChange={() => {}} />
              </FormField>
              <Switch label="Tell ineligible students why" defaultChecked />
            </section>
          </div>
        </TabsContent>
        <TabsContent value="registrants">
          <DataTable
            label="Registrants"
            columns={[
              { key: 'name', header: 'Student', value: (r: Registrant) => r.name, width: 180 },
              { key: 'college', header: 'College', value: (r: Registrant) => r.college, groupable: true, width: 250 },
              { key: 'roll', header: 'Roll number', type: 'id', value: (r: Registrant) => r.roll, width: 120 },
              { key: 'cgpa', header: 'CGPA', type: 'number', value: (r: Registrant) => r.cgpa, width: 80 },
              { key: 'eligibility', header: 'Eligibility', type: 'status', value: (r: Registrant) => r.eligibility, statusTone: (v) => (String(v).startsWith('Eligible') ? 'success' : 'danger'), width: 220 },
              { key: 'dedupe', header: 'Match with candidates', type: 'status', value: (r: Registrant) => r.dedupe, statusTone: (v) => (v === 'New' ? 'neutral' : 'info'), width: 250 },
              { key: 'admit', header: 'Admit card', value: (r: Registrant) => r.admit, width: 200 },
            ]}
            rows={REGISTRANTS}
            getRowId={(r) => r.id}
            selectable
            bulkActions={(ids) => <Button size="sm">Invite {ids.length} to slots</Button>}
          />
        </TabsContent>
        <TabsContent value="institutions">
          <DataTable
            label="Institutions"
            columns={[
              { key: 'name', header: 'Institution', value: (r: (typeof COLLEGES)[number]) => r.name, width: 280 },
              { key: 'code', header: 'Code', type: 'id', value: (r: (typeof COLLEGES)[number]) => r.code, width: 120 },
              { key: 'city', header: 'City', value: (r: (typeof COLLEGES)[number]) => r.city, width: 110 },
              { key: 'coordinator', header: 'Coordinator login', value: (r: (typeof COLLEGES)[number]) => r.coordinator, width: 190 },
              { key: 'visibility', header: 'Results the coordinator sees', value: (r: (typeof COLLEGES)[number]) => r.visibility, width: 200 },
            ]}
            rows={COLLEGES}
            getRowId={(r) => r.code}
            toolbar={<Button size="sm" icon={Upload}>Import institutions</Button>}
          />
        </TabsContent>
        <TabsContent value="admit">
          <div className="yx-prc-split">
            <Card title="Admit card preview (template #86)">
              <div className="yx-prc-row">
                <CameraFrame state="captured" label="Registration photo" size="sm" />
                <div className="yx-prc-stack" data-gap="sm">
                  <strong>Arjun Nair · REG-7700</strong>
                  <span>Coromandel Institute of Technology · 21CS140</span>
                  <span>3 Oct 2026, 9:00 am · Chennai college hall · Seat C-14</span>
                  <span className="yx-prc-muted yx-prc-small">Bring a photo ID. The QR works for one attempt.</span>
                </div>
                <QrPlaceholder seed="REG-7700-v2" label="Signed QR, version 2" />
              </div>
            </Card>
            <section className="yx-prc-box" aria-label="Admit card status">
              <DescriptionList items={[{ label: 'Issued', value: '3,818' }, { label: 'Reissued', value: '42 (old QRs revoked)' }, { label: 'Not issued', value: '142 · slot not booked' }]} />
              <Button icon={RefreshCw}>Reissue for selected</Button>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="report">
          <div className="yx-prc-stack">
            <BarChart
              title="Registered, eligible and invited by college"
              categories={COLLEGES.map((c) => c.name.split(' ')[0])}
              series={[
                { name: 'Registered', values: COLLEGES.map((c) => c.registered) },
                { name: 'Eligible', values: COLLEGES.map((c) => c.eligible) },
              ]}
              groupSizes={COLLEGES.map((c) => c.registered)}
              minGroupSize={5}
              footnote="Post-test survey results show only for colleges with 5 or more responses."
            />
          </div>
        </TabsContent>
      </Tabs>
    </PrcFrame>
  );
}

/** College coordinator's limited portal (B7, YX-DLV-15): own college only, results at the level the company set. */
export function CoordinatorPortalScreen({ visibility = 'Aggregate' }: { visibility?: 'None' | 'Aggregate' | 'Per candidate' }) {
  return (
    <CandidateFrame user="Dr. Latha Ramesh · coordinator">
      <Heading level={1}>
        Coromandel Institute of Technology · Campus drive Tamil Nadu 2026
      </Heading>
      <div className="yx-prc-grid3">
        <div className="yx-prc-box">
          <span className="yx-prc-muted">Registered</span>
          <strong>1,240</strong>
        </div>
        <div className="yx-prc-box">
          <span className="yx-prc-muted">Eligible</span>
          <strong>1,102</strong>
        </div>
        <div className="yx-prc-box">
          <span className="yx-prc-muted">Admit cards issued</span>
          <strong>1,060</strong>
        </div>
      </div>
      {visibility === 'None' && <InlineAlert tone="info">Kaveri Foods shares registration and attendance only. Results are not shared with coordinators for this drive.</InlineAlert>}
      {visibility === 'Aggregate' && <InlineAlert tone="info">Results will show as counts and pass rates for your college after the drive closes. Individual scores are not shared.</InlineAlert>}
      <Card title="Share the registration link" actions={<Button size="sm">Copy link</Button>}>
        <p className="yx-prc-p yx-prc-mono">kaverifoods.careers/drive/tn-2026?college=CIT-TN-014</p>
      </Card>
      <DataTable
        label="Your college's registrants"
        columns={[
          { key: 'name', header: 'Student', value: (r: Registrant) => r.name, width: 200 },
          { key: 'roll', header: 'Roll number', type: 'id', value: (r: Registrant) => r.roll, width: 130 },
          { key: 'eligibility', header: 'Registration', type: 'status', value: (r: Registrant) => r.eligibility, statusTone: (v) => (String(v).startsWith('Eligible') ? 'success' : 'danger'), width: 240 },
          { key: 'admit', header: 'Admit card', value: (r: Registrant) => r.admit, width: 200 },
        ]}
        rows={REGISTRANTS.filter((r) => r.college === COLLEGES[0].name)}
        getRowId={(r) => r.id}
      />
    </CandidateFrame>
  );
}

/* ================================================================== */
/* Test centres (C5)                                                   */
/* ================================================================== */

export function TestCentresScreen({ syncState = 'syncing' }: { syncState?: 'syncing' | 'offline' | 'verified' }) {
  const seats = Array.from({ length: 40 }, (_, i) => ({ seat: `${String.fromCharCode(65 + Math.floor(i / 10))}-${(i % 10) + 1}`, name: i < 34 ? NAMES[i % 20] : null, checked: i < 28 }));
  return (
    <PrcFrame page="Test centres">
      <PageHeader title="Test centres" description="Chennai college hall · 3 Oct 2026, 9:00 am session · centre server CS-CHN-02" actions={<><Button>Download seat plan</Button><Button variant="primary">Open check-in board</Button></>} />
      {syncState === 'offline' && <InlineAlert tone="warning" title="Centre is offline since 9:42 am">Candidates continue on the local network. Answers and evidence are sealed on the centre server and will sync when the link is back. Results stay held until every hash matches.</InlineAlert>}
      {syncState === 'verified' && <InlineAlert tone="success">Full sync verified: 34 attempts, 1,912 evidence items, all hashes match. Results can be released.</InlineAlert>}
      <div className="yx-prc-grid4">
        <div className="yx-prc-box">
          <span className="yx-prc-muted yx-prc-small">Package</span>
          <strong>Encrypted, key released 8:58 am</strong>
        </div>
        <div className="yx-prc-box">
          <span className="yx-prc-muted yx-prc-small">Clock drift</span>
          <strong className="yx-prc-mono">+0.4 s (logged)</strong>
        </div>
        <div className="yx-prc-box">
          <span className="yx-prc-muted yx-prc-small">Sync</span>
          <strong>{syncState === 'offline' ? 'Queued: 412 items' : syncState === 'verified' ? 'Complete' : 'Live, 18 s behind'}</strong>
        </div>
        <div className="yx-prc-box">
          <span className="yx-prc-muted yx-prc-small">Checked in</span>
          <strong>28 of 34</strong>
        </div>
      </div>
      <Card title="Seat plan and check-in (randomised, one empty seat between candidates from the same college)">
        <div className="yx-prc-grid4" role="list" aria-label="Seats">
          {seats.map((s) => (
            <div key={s.seat} role="listitem" className="yx-prc-box" data-tone={s.name ? undefined : 'subtle'}>
              <span className="yx-prc-row" data-between>
                <strong className="yx-prc-mono">{s.seat}</strong>
                {s.name ? s.checked ? <Badge tone="success">Checked in</Badge> : <Badge tone="warning">Not here yet</Badge> : <Badge>Empty</Badge>}
              </span>
              <span className="yx-prc-small">{s.name ?? '—'}</span>
            </div>
          ))}
        </div>
      </Card>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-30 · Invigilator app (phone)                                    */
/* ================================================================== */

export type InvigilatorView = 'roll' | 'scan' | 'id-mismatch' | 'incident' | 'offline';

export function InvigilatorAppScreen({ view = 'roll' }: { view?: InvigilatorView }) {
  // PRC-30
  const [present, setPresent] = useState<Record<string, 'present' | 'absent' | 'late' | undefined>>({ [NAMES[0]]: 'present', [NAMES[1]]: 'present', [NAMES[2]]: 'late' });
  const titles: Record<InvigilatorView, string> = { roll: 'Roll call', scan: 'Check in', 'id-mismatch': 'Photo ID check', incident: 'Incident log', offline: 'Roll call' };
  return (
    <PhoneFrame tab="me" title={titles[view]} hideTabs actions={<IconButton icon={QrCode} label="Scan admit card" />}>
      <p className="yx-prc-muted yx-prc-small">Chennai college hall · Room C · 9:00 am session · you: Ritika Bansal</p>
      {view === 'offline' ? (
        <InlineAlert tone="warning" title="Offline: 6 entries waiting to sync">
          <span className="yx-prc-row">
            <Icon icon={WifiOff} /> Saved on this phone. They sync through the centre server or when the phone is back online.
          </span>
        </InlineAlert>
      ) : (
        <p className="yx-prc-row yx-prc-small yx-prc-success">
          <Icon icon={CheckCircle2} /> Synced 9:41 am
        </p>
      )}
      {(view === 'roll' || view === 'offline') && (
        <ul className="yx-prc-plain" aria-label="Candidates in Room C">
          {NAMES.slice(0, 8).map((n, i) => (
            <li key={n}>
              <span className="yx-prc-stack" data-gap="sm">
                <strong>{n}</strong>
                <span className="yx-prc-small yx-prc-muted">Seat C-{i + 11}</span>
              </span>
              <ButtonGroup aria-label={`Attendance for ${n}`}>
                {(['present', 'late', 'absent'] as const).map((s) => (
                  <Button key={s} size="sm" aria-pressed={present[n] === s} onClick={() => setPresent({ ...present, [n]: s })}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </ButtonGroup>
            </li>
          ))}
        </ul>
      )}
      {view === 'scan' && (
        <div className="yx-prc-stack">
          <CameraFrame state="live" label="Point at the admit-card QR" size="lg" />
          <InlineAlert tone="success" title="Valid admit card">Arjun Nair · REG-7700 · Seat C-14. Now check the photo ID.</InlineAlert>
          <Button variant="primary" fullWidth icon={UserCheck}>
            Check photo ID
          </Button>
        </div>
      )}
      {view === 'id-mismatch' && (
        <div className="yx-prc-stack">
          <div className="yx-prc-grid2">
            <CameraFrame state="captured" label="Registration photo" size="sm" />
            <IdCapture docType="College ID" state="captured" masked="21CS140" />
          </div>
          <InlineAlert tone="warning" title="Face match is low (0.41)">This is a flag for review, not a refusal. You decide. If you admit the candidate, record why.</InlineAlert>
          <FormField label="Reason" required>
            <TextArea rows={2} defaultValue="Photo is 3 years old; checked college ID and date of birth in person." />
          </FormField>
          <Button variant="primary" fullWidth>
            Admit with reason
          </Button>
          <Button fullWidth>Do not admit</Button>
        </div>
      )}
      {view === 'incident' && (
        <div className="yx-prc-stack">
          <FormField label="Type" required>
            <Select value="talking" onChange={() => {}} options={[{ value: 'talking', label: 'Talking to another candidate' }, { value: 'device', label: 'Phone or device' }, { value: 'notes', label: 'Notes or paper' }, { value: 'health', label: 'Health issue' }, { value: 'other', label: 'Other' }]} />
          </FormField>
          <div className="yx-prc-grid2">
            <FormField label="Seat">
              <TextField value="C-17" readOnly />
            </FormField>
            <FormField label="Time">
              <TextField value="9:38 am" readOnly />
            </FormField>
          </div>
          <FormField label="What you saw" required>
            <TextArea rows={3} defaultValue="C-17 turned to C-18 twice and whispered. Warned once." />
          </FormField>
          <Button icon={Plus}>Add photo</Button>
          <Button variant="primary" fullWidth>
            Save to incident log
          </Button>
          <p className="yx-prc-muted yx-prc-small">Entries are timestamped, carry your name and become evidence for the reviewer.</p>
        </div>
      )}
    </PhoneFrame>
  );
}

