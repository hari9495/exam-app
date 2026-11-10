// Visitor screens (M02 §B11, YX-AT-22): VIS-01 visitor desk (today), VIS-02 pre-register + my visitors, VIS-03 visitor kiosk,
// VIS-04 visitor log & reports. VIS-01, VIS-02 and VIS-04 take `live` (Visitors slice 1): the same screens with the API's
// data; what later slices add (walk-ins, photo, ID, badge printing, reports) stays out of the live pages until it is built.
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, LogIn, LogOut, Printer, QrCode, ScanLine, Send, UserPlus, X } from 'lucide-react';
import { KioskFrame, PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextField, TimeField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Dialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { PageBanner } from '../../components/notify';
import { BarChart, DonutChart } from '../../components/charts';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { LivePage } from '../time/live/kit';
import { useRun } from '../org/org-kit';
import { Actions, CameraFrame, CardGrid, Facts, OpsDesk, PhotoPlaceholder, QrPlaceholder, useSay } from './ops-kit';
import { retentionLeft } from './ops-rules';
import type { ListState } from './helpdesk';
import { PURPOSE_CHOICES, visitOf, type Visit, type VisitStatus, type VisitView } from './visitors-data';

const time = (d?: Date) => (d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
const TONE: Record<VisitStatus, BadgeTone> = { Expected: 'neutral', 'Waiting for host': 'warning', 'On site': 'success', 'Checked out': 'neutral', Blocked: 'danger', Rejected: 'danger', 'No show': 'neutral', 'Not checked out': 'warning', Cancelled: 'neutral' };
type Choice = { value: string; label: string };
type LiveState = 'ready' | 'loading' | 'error' | 'no-access';

/** Visitor badge preview (APX-F badge layout via P05). */
export function VisitorBadge({ visit, today }: { visit: Visit; today: Date }) {
  return (
    <div className="yx-ops-badge" role="group" aria-label={`Visitor badge for ${visit.name}`}>
      <span className="yx-ops-badge__kind">Visitor · {visit.location}</span>
      <PhotoPlaceholder name={visit.name} size="lg" />
      <span className="yx-ops-badge__lines">
        <span className="yx-ops-badge__name">{visit.name}</span>
        <span>{visit.company !== '—' ? visit.company : 'Individual'}</span>
        <span>Host: {visit.host}</span>
        <span>
          {formatDate(today)} · valid until {time(visit.to)}
        </span>
        {visit.escort && <Badge tone="warning">Escort required</Badge>}
      </span>
      <QrPlaceholder value={visit.badge ?? visit.id} label={`Badge QR ${visit.badge ?? ''}`} />
      <span className="yx-ops-mono">{visit.badge ?? 'V-0413'}</span>
    </div>
  );
}

/* =========================================================================================
 * VIS-01 · Visitor desk: today's visitors
 * ======================================================================================= */

/** VIS-01 live (Visitors slice 1): reception's day at one location. */
export interface LiveVisitorDesk {
  state: LiveState;
  onRetry: () => void;
  /** The locations this person runs the desk at (the Reception role's reach). */
  locations: Choice[];
  locationId: string | null;
  onLocation: (id: string) => void;
  today: Date;
  visits: VisitView[];
  /** False while acting for someone else: the list only. */
  canChange: boolean;
  /** A pass code typed or scanned (the scanner types it). */
  onFind: (code: string) => Promise<VisitView>;
  onCheckIn: (id: string, noticeAccepted: boolean) => Promise<VisitView>;
  onCheckOut: (id: string) => Promise<unknown>;
}

export interface VisitorDeskProps {
  visits: Visit[];
  today: Date;
  state?: ListState;
  tab?: 'expected' | 'onsite' | 'out';
  checkInId?: string | null;
  blockedAlert?: boolean;
  /** Story: the "Scan QR pass" dialog open. */
  findOpen?: boolean;
  live?: LiveVisitorDesk;
}
export function VisitorDeskScreen({ visits: sample, today, state = 'ready', tab = 'expected', checkInId = null, blockedAlert, findOpen = false, live }: VisitorDeskProps) {
  const { toast } = useSay();
  const visits = live ? live.visits.map(visitOf) : sample;
  const [current, setCurrent] = useState(tab);
  const [checkIn, setCheckIn] = useState<string | null>(checkInId);
  const [nda, setNda] = useState(false);
  const [finding, setFinding] = useState(findOpen);
  const [code, setCode] = useState('');
  const [found, setFound] = useState<VisitView | null>(null);
  const { busy, error, run, clearError } = useRun();
  const view = live ? (found?.id === checkIn ? found : live.visits.find((v) => v.id === checkIn)) : null;
  const needsNotice = live ? !view?.noticeAcceptedAt : true;
  const ndaEarly = useTooEarly(nda || !needsNotice ? [] : [{ fieldId: 'vd-nda', message: live ? 'Tick that the visitor read and accepted the notice.' : 'Tick that the visitor accepted the NDA and safety notice.' }]);
  const groups = {
    expected: visits.filter((v) => v.status === 'Expected' || v.status === 'Waiting for host' || v.status === 'Blocked'),
    onsite: visits.filter((v) => v.status === 'On site'),
    out: visits.filter((v) => v.status === 'Checked out' || v.status === 'Not checked out'),
  };
  const visit = view ? visitOf(view) : visits.find((v) => v.id === checkIn);
  const waiting = visits.find((v) => v.status === 'Waiting for host');
  const canChange = !live || live.canChange;
  const closeCheckIn = () => (setCheckIn(null), setNda(false), setFound(null), clearError());
  const doCheckIn = () =>
    void (async () => {
      if (ndaEarly.stop() || !live || !visit) return;
      const ok = await run('in', async () => {
        const done = await live.onCheckIn(visit.id, nda);
        toast({ tone: 'success', title: `${done.name} checked in`, description: done.badge ? `Badge ${done.badge}` : undefined });
      });
      if (ok) closeCheckIn();
    })();
  const doFind = () =>
    void (async () => {
      if (!live) return void (setFinding(false), setCheckIn('v1'));
      await run('find', async () => {
        const v = await live.onFind(code);
        setFinding(false);
        setCode('');
        if (v.status !== 'expected') return void toast({ title: `${v.name}: ${v.statusText.toLowerCase()}`, description: 'This pass cannot be used to check in.' });
        setFound(v);
        setCheckIn(v.id);
      });
    })();
  const cols: TableColumn<Visit>[] = [
    { key: 'name', header: 'Visitor', value: (v) => v.name, render: (v) => <span className="yx-ops-row"><PhotoPlaceholder name={v.name} size="sm" /><span className="yx-ops-stack" data-gap="sm"><strong>{v.name}</strong><span className="yx-ops-muted">{v.company}</span></span></span>, width: 230 },
    { key: 'host', header: 'Host', value: (v) => v.host },
    { key: 'purpose', header: 'Purpose', value: (v) => v.purpose },
    { key: 'window', header: 'Window', value: (v) => v.from, render: (v) => `${time(v.from)} to ${time(v.to)}` },
    { key: 'in', header: 'In', value: (v) => v.checkIn, render: (v) => time(v.checkIn) },
    { key: 'out', header: 'Out', value: (v) => v.checkOut, render: (v) => time(v.checkOut) },
    { key: 'badge', header: 'Badge', type: 'id', value: (v) => v.badge ?? '—' },
    { key: 'status', header: 'Status', type: 'status', value: (v) => v.status, statusTone: (s) => TONE[s as VisitStatus] },
  ];
  const table = (rows: Visit[], label: string) => (
    <DataTable
      label={label}
      columns={cols}
      rows={state === 'empty' ? [] : rows}
      getRowId={(v) => v.id}
      state={state === 'empty' ? 'ready' : state}
      onRetry={() => {}}
      empty={<EmptyState compact title="No visitors here." description="Pre-registered and walk-in visitors appear as they arrive." />}
      rowButtons={(v) =>
        !canChange ? null : v.status === 'Expected' ? (
          <Button size="sm" icon={LogIn} onClick={() => setCheckIn(v.id)}>
            Check in
          </Button>
        ) : v.status === 'On site' ? (
          <Button
            size="sm"
            icon={LogOut}
            loading={busy === `out-${v.id}`}
            onClick={() => live && void run(`out-${v.id}`, async () => (await live.onCheckOut(v.id), toast({ tone: 'success', title: `${v.name} checked out` })))}
          >
            Check out
          </Button>
        ) : v.status === 'Waiting for host' && !live ? (
          <Button size="sm">Decide now</Button>
        ) : null
      }
    />
  );
  const actions = (
    <>
      {live && live.locations.length > 1 && (
        <FormField label="Location" hideLabel>
          <Select aria-label="Location" value={live.locationId} onChange={(v) => v && live.onLocation(v)} options={live.locations} />
        </FormField>
      )}
      {!live && <Button icon={Printer}>Print on-site list</Button>}
      {!live && <Button icon={UserPlus}>Add walk-in</Button>}
      {canChange && (
        <Button variant="primary" icon={ScanLine} onClick={() => setFinding(true)}>
          Scan QR pass
        </Button>
      )}
    </>
  );
  const place = live ? (live.locations.find((l) => l.value === live.locationId)?.label ?? '') : 'Chennai office';
  const facts = `${groups.expected.length} expected · ${groups.onsite.length} on site · ${groups.out.length} checked out`;
  const body = (
    <>
      {error && !checkIn && !finding && <InlineAlert tone="danger" title="Not done">{error}</InlineAlert>}
      {waiting && (
        <PageBanner tone="warning" action={<Button size="sm">Decide for host</Button>}>
          {waiting.name} ({waiting.company}) is waiting for {waiting.host} to approve. After 10 minutes reception decides.
        </PageBanner>
      )}
      {blockedAlert && (
        <InlineAlert tone="danger" title="Stop at reception">
          Manish Gupta matches the blocked-visitor list. Don't issue a badge. Call the admin on duty; the host is told only that the visit can't go ahead.
        </InlineAlert>
      )}
      <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
        <TabsList aria-label="Visitor lists">
          <TabsTrigger value="expected" count={groups.expected.length}>
            Expected
          </TabsTrigger>
          <TabsTrigger value="onsite" count={groups.onsite.length}>
            On site now
          </TabsTrigger>
          <TabsTrigger value="out" count={groups.out.length}>
            Checked out
          </TabsTrigger>
        </TabsList>
        <TabsContent value="expected">{table(groups.expected, 'Expected visitors')}</TabsContent>
        <TabsContent value="onsite">{table(groups.onsite, 'Visitors on site now')}</TabsContent>
        <TabsContent value="out">{table(groups.out, 'Checked-out visitors')}</TabsContent>
      </Tabs>
      <Dialog
        open={finding}
        onOpenChange={(o) => (setFinding(o), clearError())}
        title="Scan or type the QR pass"
        description="Scan the visitor's QR pass, or type the code under it."
        notice={error && finding ? <InlineAlert tone="danger" title="Not found">{error}</InlineAlert> : undefined}
        footer={
          <>
            <Button onClick={() => setFinding(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'find'} onClick={doFind}>
              Find visitor
            </Button>
          </>
        }
      >
        <FormField label="Pass code" helper="Like V-7KQ2-MX4P">
          <TextField value={code} onChange={setCode} autoFocus autoComplete="off" spellCheck={false} />
        </FormField>
      </Dialog>
      <Drawer
        open={!!visit}
        onOpenChange={(o) => !o && closeCheckIn()}
        size="lg"
        title={visit ? `Check in ${visit.name}` : ''}
        subtitle={visit ? `${visit.company} · host ${visit.host} · ${time(visit.from)} to ${time(visit.to)}` : ''}
        notice={error && checkIn ? <InlineAlert tone="danger" title="Not checked in">{error}</InlineAlert> : undefined}
        footer={
          <>
            <Button onClick={closeCheckIn}>Cancel</Button>
            <Button variant="primary" icon={live ? LogIn : Printer} loading={busy === 'in'} onClick={live ? doCheckIn : () => ndaEarly.stop()}>
              {live ? 'Check in' : 'Check in and print badge'}
            </Button>
          </>
        }
      >
        {visit && (
          <div className="yx-ops-split">
            <div className="yx-ops-stack">
              {!live && <CameraFrame subject="face" state="ready" />}
              {!live && (
                <FormField label="ID shown">
                  <Select value="dl" onChange={() => {}} options={[{ value: 'dl', label: 'Driving licence' }, { value: 'pan', label: 'PAN card' }, { value: 'other', label: 'Other' }]} />
                </FormField>
              )}
              {live && view && (
                <DescriptionList
                  items={[
                    { label: 'Pass', value: view.passCode, mono: true },
                    { label: 'Purpose', value: visit.purpose },
                    ...(view.vehicle ? [{ label: 'Vehicle', value: view.vehicle }] : []),
                  ]}
                />
              )}
              {needsNotice ? (
                <>
                  <Checkbox id="vd-nda" checked={nda} onChange={setNda} label={live ? 'The visitor read and accepted the notice' : 'Visitor accepted the NDA and safety notice'} description={live ? 'They did not accept it on their link, so they read it here.' : 'Required at this location before entry'} />
                  {ndaEarly.errorOf('vd-nda') && <p className="yx-field__error">{ndaEarly.errorOf('vd-nda')}</p>}
                </>
              ) : (
                <InlineAlert tone="info" title="Notice accepted">The visitor accepted the notice on their link.</InlineAlert>
              )}
              <p className="yx-ops-muted">{live ? "Visit details are deleted after the location's retention period (Settings › Visitors)." : 'ID images are deleted after 30 days; other visitor details after 90 days.'}</p>
            </div>
            <VisitorBadge visit={{ ...visit, badge: live ? (visit.badge ?? 'Given at check-in') : 'V-0413' }} today={today} />
          </div>
        )}
      </Drawer>
    </>
  );
  if (live)
    return (
      <LivePage title="Today's visitors" description={`${place} reception. Scan the visitor's QR pass or check them in by name.`} actions={actions} state={live.state} onRetry={live.onRetry} what="today's visitors" grantedBy="an admin (the Reception role)">
        <p className="yx-ops-muted">{facts}</p>
        {body}
      </LivePage>
    );
  return (
    <OpsDesk area="visitors" active="Today's visitors" counts={{ "Today's visitors": groups.onsite.length }}>
      <PageHeader title="Today's visitors" description={`${place} reception. Scan the visitor's QR pass or check them in by name.`} facts={facts} actions={actions} />
      {body}
    </OpsDesk>
  );
}

/* =========================================================================================
 * VIS-02 · Pre-register a visitor (host invite) + my visitors
 * ======================================================================================= */

/** The invite the host sends (Visitors slice 1: the pass goes by email, answer 609). */
export interface VisitorInviteInput {
  name: string;
  mobile: string;
  email: string;
  company?: string;
  purpose: string;
  locationId: string;
  /** yyyy-mm-dd, and "HH:MM" in the location's time. */
  day: string;
  from: string;
  to: string;
  vehicle?: string;
}

/** VIS-02 live: the host's own visitors and the invite. */
export interface LivePreRegister {
  state: LiveState;
  onRetry: () => void;
  visits: VisitView[];
  locations: Choice[];
  today: Date;
  /** False while acting for someone else. */
  canChange: boolean;
  onInvite: (input: VisitorInviteInput) => Promise<VisitView & { emailed?: boolean }>;
  onCancel: (id: string) => Promise<unknown>;
}

export interface PreRegisterProps {
  device?: 'desk' | 'phone';
  visits: Visit[];
  today: Date;
  formOpen?: boolean;
  sent?: boolean;
  approval?: boolean;
  live?: LivePreRegister;
}

type InviteDraft = { name: string; mobile: string; email: string; company: string; purpose: string | null; day: Date | null; locationId: string | null; from: string | null; to: string | null; vehicle: string };
const blankDraft = (locations: Choice[]): InviteDraft => ({ name: '', mobile: '', email: '', company: '', purpose: 'meeting', day: null, locationId: locations.length === 1 ? locations[0]!.value : null, from: null, to: null, vehicle: '' });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inviteErrors = (d: InviteDraft) =>
  [
    !d.name.trim() && { fieldId: 'vi-name', message: "Enter the visitor's name." },
    !d.mobile.trim() && { fieldId: 'vi-mobile', message: "Enter the visitor's mobile number." },
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()) && { fieldId: 'vi-email', message: 'Enter an email like name@example.com: the pass goes there.' },
    !d.day && { fieldId: 'vi-day', message: 'Choose the day.' },
    !d.locationId && { fieldId: 'vi-location', message: 'Choose the location.' },
    !d.from && { fieldId: 'vi-from', message: 'Enter when the visitor arrives.' },
    (!d.to || (d.from && d.to <= d.from)) && { fieldId: 'vi-to', message: d.to ? 'The visitor must leave after they arrive.' : 'Enter when the visitor leaves.' },
  ].filter(Boolean) as { fieldId: string; message: string }[];

/** The invite form. Live, it is controlled by the screen; the story shows the drawn sample. */
export function PreRegisterForm({ today, draft, onDraft, errorOf, locations }: { today: Date; draft?: InviteDraft; onDraft?: (d: InviteDraft) => void; errorOf?: (id: string) => string | null | undefined; locations?: Choice[] }) {
  const [date, setDate] = useState<Date | null>(new Date(2026, 9, 1));
  const [loc, setLoc] = useState<string | null>('maa');
  if (draft && onDraft) {
    const set = (p: Partial<InviteDraft>) => onDraft({ ...draft, ...p });
    const err = (id: string) => errorOf?.(id) ?? null;
    return (
      <div className="yx-ops-stack">
        <FieldRow>
          <FormField id="vi-name" label="Visitor name" required error={err('vi-name')}>
            <TextField value={draft.name} onChange={(v) => set({ name: v })} maxLength={200} />
          </FormField>
          <FormField id="vi-mobile" label="Mobile" required error={err('vi-mobile')} helper="A number outside India starts with + and the country code.">
            <TextField value={draft.mobile} onChange={(v) => set({ mobile: v })} inputMode="tel" maxLength={20} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="vi-email" label="Email" required error={err('vi-email')} helper="The QR pass goes here.">
            <TextField type="email" value={draft.email} onChange={(v) => set({ email: v })} maxLength={254} />
          </FormField>
          <FormField label="Company" optional>
            <TextField value={draft.company} onChange={(v) => set({ company: v })} maxLength={200} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Purpose" required>
            <Select value={draft.purpose} onChange={(v) => set({ purpose: v })} options={PURPOSE_CHOICES} />
          </FormField>
          <FormField id="vi-location" label="Location" required error={err('vi-location')}>
            <Select value={draft.locationId} onChange={(v) => set({ locationId: v })} options={locations ?? []} placeholder="Choose a location" />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="vi-day" label="Date" required error={err('vi-day')}>
            <DatePicker value={draft.day} onChange={(v) => set({ day: v })} min={today} />
          </FormField>
          <FormField label="Vehicle number" optional>
            <TextField value={draft.vehicle} onChange={(v) => set({ vehicle: v })} maxLength={20} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="vi-from" label="Arrives" required error={err('vi-from')}>
            <TimeField value={draft.from} onChange={(v) => set({ from: v })} />
          </FormField>
          <FormField id="vi-to" label="Leaves by" required error={err('vi-to')}>
            <TimeField value={draft.to} onChange={(v) => set({ to: v })} />
          </FormField>
        </FieldRow>
        <p className="yx-ops-muted">The visitor gets an email with a link: their details, the visitor notice and the QR pass for reception. Times are the location's local time.</p>
      </div>
    );
  }
  return (
    <div className="yx-ops-stack">
      <FieldRow>
        <FormField label="Visitor name" required>
          <TextField />
        </FormField>
        <FormField label="Mobile" required>
          <TextField inputMode="tel" prefix="+91" />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Email" required helper="The QR pass goes here.">
          <TextField type="email" />
        </FormField>
        <FormField label="Company" optional>
          <TextField />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Purpose" required>
          <Select value="meeting" onChange={() => {}} options={['Meeting', 'Interview', 'Vendor', 'Audit', 'Maintenance'].map((p) => ({ value: p.toLowerCase(), label: p }))} />
        </FormField>
        <FormField label="Location" required>
          <Select value={loc} onChange={setLoc} options={[{ value: 'maa', label: 'Chennai office' }, { value: 'blr', label: 'Bengaluru head office' }, { value: 'hsr', label: 'Hosur plant' }]} />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Date" required>
          <DatePicker value={date} onChange={setDate} min={today} />
        </FormField>
        <FormField label="Vehicle number" optional>
          <TextField />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Arrives" required>
          <TimeField value="14:00" onChange={() => {}} />
        </FormField>
        <FormField label="Leaves by" required>
          <TimeField value="15:00" onChange={() => {}} />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="ID type" optional>
          <Select value={null} onChange={() => {}} options={[{ value: 'dl', label: 'Driving licence' }, { value: 'pan', label: 'PAN card' }]} placeholder="Not needed" />
        </FormField>
        <FormField label="Send the pass by">
          <RadioGroup orientation="horizontal" value="email" onChange={() => {}} options={[{ value: 'email', label: 'Email' }]} />
        </FormField>
      </FieldRow>
      <p className="yx-ops-muted">The visitor gets a QR pass, directions and a privacy notice. Hosur plant asks for the safety induction at the gate.</p>
    </div>
  );
}
export function PreRegisterScreen({ device = 'desk', visits: sample, today, formOpen, sent, approval, live }: PreRegisterProps) {
  const visits = live ? live.visits.map(visitOf) : sample;
  const [open, setOpen] = useState(!!formOpen);
  const { toast } = useSay();
  const [draft, setDraft] = useState<InviteDraft>(() => blankDraft(live?.locations ?? []));
  const early = useTooEarly(live ? inviteErrors(draft) : []);
  const { busy, error, run, clearError } = useRun();
  const saySent = () => toast({ tone: 'success', title: 'Invite sent', description: 'Rahul Menon got a QR pass on WhatsApp for 1 Oct 2026, 2:00 pm to 3:00 pm, Chennai office.' });
  // The "invite sent" design state shows the toast the host sees after pressing Send invite.
  useEffect(() => void (sent && saySent()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const send = () => {
    if (!live) return void (setOpen(false), saySent());
    if (early.stop()) return;
    void run('send', async () => {
      const made = await live.onInvite({ name: draft.name.trim(), mobile: draft.mobile.trim(), email: draft.email.trim(), ...(draft.company.trim() ? { company: draft.company.trim() } : {}), purpose: draft.purpose ?? 'meeting', locationId: draft.locationId!, day: iso(draft.day!), from: draft.from!, to: draft.to!, ...(draft.vehicle.trim() ? { vehicle: draft.vehicle.trim() } : {}) });
      setOpen(false);
      setDraft(blankDraft(live.locations));
      toast({ tone: made.emailed === false ? 'warning' : 'success', title: made.emailed === false ? 'Invite saved; the email did not go' : 'Invite sent', description: `${made.name}: pass ${made.passCode} for ${formatDate(new Date(made.startsAt))}, ${time(new Date(made.startsAt))} to ${time(new Date(made.endsAt))}, ${made.location}.` });
    });
  };
  const list = visits.length ? (
    <ul className="yx-ops-stack yx-ops-plain" data-gap="sm" aria-label="My visitors">
      {visits.map((v) => (
        <li key={v.id} className="yx-ops-tile">
          <div className="yx-ops-tile__row">
            <span className="yx-ops-tile__title">{v.name}</span>
            <Badge tone={TONE[v.status]}>{v.status}</Badge>
          </div>
          <span className="yx-ops-muted">
            {v.company !== '—' ? `${v.company} · ` : ''}
            {v.purpose} · {formatDate(v.from)}, {time(v.from)} · {v.location}
          </span>
          {live && live.canChange && v.status === 'Expected' && (
            <div>
              <Button size="sm" loading={busy === `cancel-${v.id}`} onClick={() => void run(`cancel-${v.id}`, async () => (await live.onCancel(v.id), toast({ tone: 'success', title: `Visit cancelled`, description: `${v.name}'s pass no longer works.` })))}>
                Cancel visit
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <EmptyState compact title="No visitors invited." description="Invite a visitor so reception has them on the list." />
  );
  const approvalCard = approval && (
    <Card title="A walk-in is asking for you">
      <div className="yx-ops-stack">
        <span className="yx-ops-row">
          <PhotoPlaceholder name="Priyanka Sethi" />
          <span className="yx-ops-stack" data-gap="sm">
            <strong>Priyanka Sethi</strong>
            <span className="yx-ops-muted">Fairview Auditors LLP · Audit · at Chennai reception since 9:31 am</span>
          </span>
        </span>
        <p className="yx-ops-muted">If you don't answer in 10 minutes, reception decides.</p>
        <Actions>
          <Button variant="approve" icon={Check}>Approve</Button>
          <Button>Send someone</Button>
          <Button icon={X}>Reject</Button>
        </Actions>
      </div>
    </Card>
  );
  const form = live ? <PreRegisterForm today={today} draft={draft} onDraft={setDraft} errorOf={early.errorOf} locations={live.locations} /> : <PreRegisterForm today={today} />;
  if (device === 'phone' && !live)
    return (
      <PhoneFrame tab="me" title={open ? 'Invite a visitor' : 'My visitors'} back={<IconButton icon={ArrowLeft} label="Back" onClick={() => setOpen(false)} />}>
        {open ? (
          <>
            {form}
            <Button variant="primary" icon={Send} fullWidth onClick={send}>
              Send invite
            </Button>
          </>
        ) : (
          <>
            {approvalCard}
            <Button variant="primary" icon={UserPlus} fullWidth onClick={() => setOpen(true)}>
              Invite a visitor
            </Button>
            {list}
          </>
        )}
      </PhoneFrame>
    );
  const inviteButton = (!live || live.canChange) && (
    <Button variant="primary" icon={UserPlus} onClick={() => setOpen(true)}>
      Invite a visitor
    </Button>
  );
  const drawer = (
    <Drawer
      open={open}
      onOpenChange={(o) => (setOpen(o), clearError())}
      size="lg"
      title="Invite a visitor"
      dirty={live ? Boolean(draft.name || draft.email || draft.mobile) : undefined}
      notice={error ? <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" icon={Send} loading={busy === 'send'} onClick={send}>
            Send invite
          </Button>
        </>
      }
    >
      {form}
    </Drawer>
  );
  if (live)
    return (
      <LivePage title="My visitors" description="Invite visitors ahead so they can check in with a QR pass." actions={inviteButton} state={live.state} onRetry={live.onRetry} what="your visitors">
        {error && !open && <InlineAlert tone="danger" title="Not done">{error}</InlineAlert>}
        <Card>{list}</Card>
        {drawer}
      </LivePage>
    );
  return (
    <OpsDesk area="visitors" active="Invites">
      <PageHeader title="My visitors" description="Invite visitors ahead so they can check in with a QR pass." actions={inviteButton} />
      {approvalCard}
      <Card>{list}</Card>
      {drawer}
    </OpsDesk>
  );
}

/* =========================================================================================
 * VIS-03 · Visitor kiosk (self check-in, photo, notice, badge / QR)
 * ======================================================================================= */

export type KioskStep = 'welcome' | 'details' | 'photo' | 'notice' | 'waiting' | 'badge' | 'see-reception' | 'rejected';
export function VisitorKioskScreen({ step = 'welcome', visit, today }: { step?: KioskStep; visit: Visit; today: Date }) {
  const [agree, setAgree] = useState(false);
  const agreeEarly = useTooEarly(agree ? [] : [{ fieldId: 'vk-agree', message: 'Tick to accept the notice before you continue.' }]);
  return (
    <KioskFrame tenant="Kaveri Foods · Chennai office">
      <div className="yx-ops-kiosk">
        {step === 'welcome' && (
          <>
            <h1 className="yx-ops-kiosk__title">Welcome. Please check in.</h1>
            <p className="yx-ops-kiosk__lead">Your details are used only for this visit and deleted after 90 days.</p>
            <div className="yx-ops-kiosk__choices">
              <Button variant="primary" icon={QrCode}>
                Scan my QR pass
              </Button>
              <Button icon={UserPlus}>I don't have a pass</Button>
            </div>
          </>
        )}
        {step === 'details' && (
          <>
            <h1 className="yx-ops-kiosk__title">Tell us who you are</h1>
            <FormField label="Your name" required>
              <TextField defaultValue="Priyanka Sethi" />
            </FormField>
            <FormField label="Mobile" required>
              <TextField inputMode="tel" prefix="+91" defaultValue="98110 44319" />
            </FormField>
            <FormField label="Company" optional>
              <TextField defaultValue="Fairview Auditors LLP" />
            </FormField>
            <FormField label="Who are you meeting?" required>
              <TextField defaultValue="Anita Desai" />
            </FormField>
            <Actions end>
              <Button>Back</Button>
              <Button variant="primary">Next</Button>
            </Actions>
          </>
        )}
        {step === 'photo' && (
          <>
            <h1 className="yx-ops-kiosk__title">Look at the camera</h1>
            <CameraFrame subject="face" state="ready" />
            <Actions end>
              <Button>Back</Button>
              <Button variant="primary">Take photo</Button>
            </Actions>
          </>
        )}
        {step === 'notice' && (
          <>
            <h1 className="yx-ops-kiosk__title">Before you enter</h1>
            <div className="yx-ops-kiosk__notice" tabIndex={0} role="region" aria-label="Visitor notice">
              <p>
                <strong>Confidentiality.</strong> You may see information about Kaveri Foods, its products and people. Keep it confidential and don't photograph work areas.
              </p>
              <p>
                <strong>Safety.</strong> Follow signs and your escort. In an emergency, go to the assembly point by the main gate and stay with your host.
              </p>
              <p>
                <strong>Your data.</strong> Your name, mobile, photo and visit times are kept for 90 days for security, then deleted.
              </p>
            </div>
            <Checkbox id="vk-agree" checked={agree} onChange={setAgree} label="I have read and accept the confidentiality and safety notice" />
            {agreeEarly.errorOf('vk-agree') && <p className="yx-field__error">{agreeEarly.errorOf('vk-agree')}</p>}
            <Actions end>
              <Button>Back</Button>
              <Button variant="primary" onClick={() => agreeEarly.stop()}>
                Accept and continue
              </Button>
            </Actions>
          </>
        )}
        {step === 'waiting' && (
          <>
            <h1 className="yx-ops-kiosk__title">We've told {visit.host}</h1>
            <p className="yx-ops-kiosk__lead" aria-live="polite">
              Please take a seat. Waiting for approval; reception will help if there's no answer in 10 minutes.
            </p>
          </>
        )}
        {step === 'badge' && (
          <>
            <h1 className="yx-ops-kiosk__title">You're checked in</h1>
            <p className="yx-ops-kiosk__lead" aria-live="polite">
              Your badge is printing. {visit.host} knows you're here. Scan the badge at the gate when you leave.
            </p>
            <div className="yx-ops-row" data-center>
              <VisitorBadge visit={{ ...visit, badge: 'V-0414' }} today={today} />
            </div>
            <Button variant="primary">Done</Button>
          </>
        )}
        {step === 'see-reception' && (
          <>
            <h1 className="yx-ops-kiosk__title">Please see the reception desk</h1>
            <p className="yx-ops-kiosk__lead">They'll help you complete your check-in.</p>
          </>
        )}
        {step === 'rejected' && (
          <>
            <h1 className="yx-ops-kiosk__title">Your visit can't go ahead today</h1>
            <p className="yx-ops-kiosk__lead">{visit.host} isn't available. Please speak to reception to arrange another time.</p>
          </>
        )}
      </div>
    </KioskFrame>
  );
}

/* =========================================================================================
 * VIS-04 · Visitor log & reports (by location, host, purpose; retention countdown)
 * ======================================================================================= */

/** VIS-04 live (Visitors slice 1): the log of the locations in reach, with the day each visit is deleted (answer 608). */
export interface LiveVisitorLog {
  state: LiveState;
  onRetry: () => void;
  visits: VisitView[];
  locations: Choice[];
  /** Downloads the log as CSV for an audit. */
  onExport: () => Promise<unknown>;
}

export function VisitorLogScreen({ log: sample, today, loading, tab = 'log', live }: { log: Visit[]; today: Date; loading?: boolean; tab?: 'log' | 'reports'; live?: LiveVisitorLog }) {
  const log = live ? live.visits.map(visitOf) : sample;
  const deleted = new Map((live?.visits ?? []).map((v) => [v.id, v.deletedOn]));
  const [current, setCurrent] = useState(tab);
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const { busy, error, run } = useRun();
  const fields: FilterFieldDef[] = [
    { key: 'location', label: 'Location', type: 'multi', options: (live ? live.locations.map((l) => l.label) : ['Chennai office', 'Bengaluru head office', 'Hosur plant']).map((v) => ({ value: v, label: v })) },
    { key: 'host', label: 'Host', type: 'multi', options: Array.from(new Set(log.map((v) => v.host))).map((v) => ({ value: v, label: v })) },
    { key: 'purpose', label: 'Purpose', type: 'multi', options: ['Meeting', 'Interview', 'Vendor', 'Audit', 'Delivery', 'Maintenance'].map((v) => ({ value: v, label: v })) },
    { key: 'from', label: 'Visit date', type: 'date' },
  ];
  let rows = log;
  for (const f of filters) if (f.type === 'multi' && f.values.length) rows = rows.filter((v) => f.values.includes(String((v as unknown as Record<string, unknown>)[f.key])));
  const byPurpose = ['Meeting', 'Interview', 'Audit', 'Maintenance'].map((p) => log.filter((v) => v.purpose === p).length);
  const left = (v: Visit) => {
    const on = deleted.get(v.id);
    return on ? Math.max(0, Math.round((new Date(`${on}T00:00:00`).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000)) : retentionLeft(v.from, today);
  };
  const exportButton = live ? (
    <Button loading={busy === 'export'} onClick={() => void run('export', live.onExport)}>
      Export for audit
    </Button>
  ) : (
    <Button>Export for audit</Button>
  );
  const description = live ? "Every check-in and check-out by location, for audits. Each visit is deleted after its location's retention period (Settings › Visitors)." : 'Every check-in and check-out by location, for audits. Visitor data is deleted after 90 days; ID images after 30.';
  const table = (
    <DataTable
      label="Visitor log"
      columns={[
        { key: 'name', header: 'Visitor', value: (v: Visit) => v.name, width: 180 },
        { key: 'company', header: 'Company', value: (v) => v.company },
        { key: 'host', header: 'Host', value: (v) => v.host },
        { key: 'purpose', header: 'Purpose', value: (v) => v.purpose, groupable: true },
        { key: 'location', header: 'Location', value: (v) => v.location, groupable: true },
        { key: 'from', header: 'Date', type: 'date', value: (v) => v.from },
        { key: 'in', header: 'In', value: (v) => v.checkIn, render: (v) => time(v.checkIn) },
        { key: 'out', header: 'Out', value: (v) => v.checkOut, render: (v) => (v.checkOut ? time(v.checkOut) : v.status === 'Not checked out' ? <Badge tone="warning">Not checked out</Badge> : <Badge tone="success">On site</Badge>) },
        { key: 'nda', header: 'Notice accepted', value: (v) => (v.nda ? 'Yes' : live ? 'No' : 'Not required') },
        {
          key: 'ret',
          header: 'Deleted in',
          value: (v) => left(v),
          render: (v) => {
            const n = left(v);
            return <Badge tone={n <= 7 ? 'warning' : 'neutral'}>{n === 0 ? 'Today' : `${n} days`}</Badge>;
          },
        },
      ]}
      rows={rows}
      getRowId={(v) => v.id}
      state={loading ? 'loading' : 'ready'}
      filtered={filters.length > 0}
      onClearFilters={() => setFilters([])}
      empty={<EmptyState title="No visits in this period." />}
      toolbar={<FilterBar fields={fields} value={filters} onChange={setFilters} searchPlaceholder="Search visitor or company" />}
      onExport={live ? undefined : () => {}}
    />
  );
  if (live)
    return (
      <LivePage title="Visitor log" description={description} actions={exportButton} state={live.state} onRetry={live.onRetry} what="the visitor log" grantedBy="an admin (the Reception or Facility admin role)">
        {error && <InlineAlert tone="danger" title="Not exported">{error}</InlineAlert>}
        {table}
      </LivePage>
    );
  return (
    <OpsDesk area="visitors" active="Visitor log">
      <PageHeader title="Visitor log" description={description} actions={exportButton} />
      <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
        <TabsList aria-label="Visitor log views">
          <TabsTrigger value="log">Log</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="log">{table}</TabsContent>
        <TabsContent value="reports">
          <CardGrid min="lg">
            <BarChart title="Visits by location, September" xLabel="Location" categories={['Chennai office', 'Bengaluru head office', 'Hosur plant']} series={[{ name: 'Visits', values: [142, 96, 61] }]} loading={loading} />
            <DonutChart title="Visits by purpose" slices={['Meeting', 'Interview', 'Audit', 'Maintenance'].map((p, i) => ({ label: p, value: byPurpose[i] * 20 + 10 }))} loading={loading} />
          </CardGrid>
          <Card title="By host, September">
            <Facts items={[{ label: 'Neha Joshi', value: 38 }, { label: 'Anita Desai', value: 21 }, { label: 'Ravi Shankar', value: 17 }, { label: 'Average stay', value: '1 h 25 min' }]} />
          </Card>
          <DescriptionList items={[{ label: 'Retention', value: '90 days for visitor details, 30 days for ID images (company setting, Settings 3.12)' }]} />
        </TabsContent>
      </Tabs>
    </OpsDesk>
  );
}
