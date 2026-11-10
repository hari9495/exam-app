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
import { FileUpload } from '../../components/upload';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { LivePage } from '../time/live/kit';
import { useRun } from '../org/org-kit';
import { Actions, CameraFrame, CardGrid, OpsDesk, PhotoPlaceholder, QrPlaceholder, useSay } from './ops-kit';
import { retentionLeft } from './ops-rules';
import type { ListState } from './helpdesk';
import { ID_CHOICES, PURPOSE_CHOICES, visitOf, type Visit, type VisitStatus, type VisitView } from './visitors-data';
import { LiveVisitorKioskView, type KioskNeeds, type LiveVisitorKiosk } from './visitor-kiosk';
import { AddWalkInDrawer, DecideForHostDialog, SendSomeoneDialog, VisitorPhoto, type DeskWalkInParts } from './visitor-walkin';

const time = (d?: Date) => (d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
const TONE: Record<VisitStatus, BadgeTone> = { Expected: 'neutral', 'Waiting for host': 'warning', 'On site': 'success', 'Checked out': 'neutral', Blocked: 'danger', Rejected: 'danger', 'No show': 'neutral', 'Not checked out': 'warning', Cancelled: 'neutral' };
type Choice = { value: string; label: string };
type LiveState = 'ready' | 'loading' | 'error' | 'no-access';
/** Answer 603, per location: no ID, the type and last 4, or also a photo of the ID. */
export type IdCapture = 'off' | 'on' | 'with_image';
/** What reception confirms at check-in (slice 3: the ID shown, the adult with a visitor under 18). */
export interface CheckInInput {
  noticeAccepted: boolean;
  adultPresent?: boolean;
  idType?: string;
  idLast4?: string;
  /** Slice 2 (606): the visit type's NDA and induction ticked at the desk. */
  ndaAccepted?: boolean;
  inductionAccepted?: boolean;
}

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
  onCheckIn: (id: string, input: CheckInInput) => Promise<VisitView>;
  onCheckOut: (id: string) => Promise<unknown>;
  /** The location's ID rule (answer 603). */
  idCapture: IdCapture;
  /** Stores the photo of the ID with its type and last 4; resolves once stored (the virus check follows). */
  onIdImage: (id: string, file: File, idType: string, idLast4: string) => Promise<unknown>;
  /** Visitors slice 2: walk-ins at the desk, deciding for the host, and the visit's type texts at check-in. */
  walkIns?: DeskWalkInParts & {
    onDecide: (id: string, approve: boolean, reason: string | null) => Promise<unknown>;
    visitNeeds: (id: string) => Promise<KioskNeeds>;
    /** 713: the walk-in's photo while it waits or is on site (an object URL the view drops when it goes). */
    photo?: (id: string) => Promise<string | null>;
  };
  /** Slice 4 (607): the location's badge; 'phone_only' prints nothing (the QR pass is on the visitor's phone). */
  badge?: 'name_qr' | 'photo_qr' | 'phone_only';
  /** Opens the label-size badge PDF for the browser to print. */
  onPrintBadge?: (id: string) => Promise<unknown>;
  /** Opens the emergency roll-call (612). */
  onOpenRollCall?: () => void;
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
  /** Story: the location's ID rule (answer 603). */
  idCapture?: IdCapture;
  /** Stories (slice 2): the Add walk-in drawer, and Decide for host. */
  walkInOpen?: boolean;
  decideOpen?: boolean;
  live?: LiveVisitorDesk;
}
export function VisitorDeskScreen({ visits: sample, today, state = 'ready', tab = 'expected', checkInId = null, blockedAlert, findOpen = false, idCapture = 'on', walkInOpen = false, decideOpen = false, live }: VisitorDeskProps) {
  const { toast } = useSay();
  const visits = live ? live.visits.map(visitOf) : sample;
  const [current, setCurrent] = useState(tab);
  const [checkIn, setCheckIn] = useState<string | null>(checkInId);
  const [nda, setNda] = useState(false);
  const [finding, setFinding] = useState(findOpen);
  const [code, setCode] = useState('');
  const [found, setFound] = useState<VisitView | null>(null);
  // Slice 3: a pass found at the desk that can't go ahead (answer 605), the ID shown (603), the adult with a minor (614).
  const [stopped, setStopped] = useState<string | null>(null);
  const [idType, setIdType] = useState<string | null>(null);
  const [last4, setLast4] = useState('');
  const [photoDone, setPhotoDone] = useState(false);
  const [adult, setAdult] = useState(false);
  const { busy, error, run, clearError } = useRun();
  const [adding, setAdding] = useState(walkInOpen);
  const [deciding, setDeciding] = useState(decideOpen);
  const [typeNeeds, setTypeNeeds] = useState<KioskNeeds | null>(null);
  const [typeTicks, setTypeTicks] = useState({ nda: false, induction: false });
  const view = live ? (found?.id === checkIn ? found : live.visits.find((v) => v.id === checkIn)) : null;
  // Slice 2 (606): the visit type's NDA and induction still to accept, read when the check-in drawer opens.
  useEffect(() => {
    setTypeNeeds(null);
    setTypeTicks({ nda: false, induction: false });
    if (!live?.walkIns || !checkIn) return;
    let on = true;
    void live.walkIns.visitNeeds(checkIn).then((n) => on && setTypeNeeds(n), () => undefined);
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn]);
  const needsNotice = live ? !view?.noticeAcceptedAt : true;
  const shown = live ? (view ? visitOf(view) : undefined) : [...sample].find((v) => v.id === checkIn);
  const idRule: IdCapture = live ? live.idCapture : idCapture;
  const minorAdult = shown?.minorAdult;
  const idNeeded = idRule !== 'off' && !minorAdult && !shown?.idText;
  const photoNeeded = idNeeded && idRule === 'with_image' && idType !== 'aadhaar';
  const ndaEarly = useTooEarly(
    [
      !nda && needsNotice && { fieldId: 'vd-nda', message: live ? 'Tick that the visitor read and accepted the notice.' : 'Tick that the visitor accepted the NDA and safety notice.' },
      Boolean(minorAdult) && !adult && { fieldId: 'vd-adult', message: `Tick that ${minorAdult} is here with them.` },
      idNeeded && !idType && { fieldId: 'vd-idtype', message: 'Choose the ID the visitor showed.' },
      idNeeded && !/^[A-Za-z0-9]{4}$/.test(last4.trim()) && { fieldId: 'vd-last4', message: 'Enter only the last 4 characters of the ID number.' },
      photoNeeded && !photoDone && { fieldId: 'vd-idphoto', message: 'Add a photo of the ID: this location keeps one.' },
      typeNeeds?.nda && !typeTicks.nda && { fieldId: 'vd-type-nda', message: `Tick that the visitor accepted ${typeNeeds.nda.title}.` },
      typeNeeds?.induction && !typeTicks.induction && { fieldId: 'vd-type-ind', message: `Tick that the visitor read ${typeNeeds.induction.title}.` },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const groups = {
    expected: visits.filter((v) => v.status === 'Expected' || v.status === 'Waiting for host' || v.status === 'Blocked'),
    onsite: visits.filter((v) => v.status === 'On site'),
    out: visits.filter((v) => v.status === 'Checked out' || v.status === 'Not checked out' || v.status === 'Rejected'),
  };
  const visit = view ? visitOf(view) : visits.find((v) => v.id === checkIn);
  const waiting = visits.find((v) => v.status === 'Waiting for host');
  const canChange = !live || live.canChange;
  // Slice 4 (607): the desk prints a label-size badge from the browser unless the location uses the pass on the phone only.
  const prints = live ? live.badge === 'name_qr' || live.badge === 'photo_qr' : true;
  const printBadge = async (id: string) => {
    if (!live?.onPrintBadge) return;
    await live.onPrintBadge(id).catch(() => toast({ tone: 'warning', title: 'Badge not printed', description: 'Print it again from On site now.' }));
  };
  const closeCheckIn = () => (setCheckIn(null), setNda(false), setFound(null), setIdType(null), setLast4(''), setPhotoDone(false), setAdult(false), clearError());
  const doCheckIn = () =>
    void (async () => {
      if (ndaEarly.stop() || !live || !visit) return;
      const ok = await run('in', async () => {
        const done = await live.onCheckIn(visit.id, { noticeAccepted: nda, ...(minorAdult ? { adultPresent: adult } : {}), ...(idNeeded && idType ? { idType, idLast4: last4.trim().toUpperCase() } : {}), ...(typeNeeds?.nda ? { ndaAccepted: typeTicks.nda } : {}), ...(typeNeeds?.induction ? { inductionAccepted: typeTicks.induction } : {}) });
        toast({ tone: 'success', title: `${done.name} checked in`, description: done.badge ? `Badge ${done.badge}` : undefined });
        if (prints) await printBadge(done.id);
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
        if (v.status === 'blocked') return void setStopped(v.name);
        if (v.status !== 'expected') return void toast({ title: `${v.name}: ${v.statusText.toLowerCase()}`, description: 'This pass cannot be used to check in.' });
        setFound(v);
        setCheckIn(v.id);
      });
    })();
  const cols: TableColumn<Visit>[] = [
    { key: 'name', header: 'Visitor', value: (v) => v.name, render: (v) => <span className="yx-ops-row">{v.hasPhoto && live?.walkIns?.photo ? <VisitorPhoto id={v.id} name={v.name} photo={live.walkIns.photo} size="sm" /> : <PhotoPlaceholder name={v.name} size="sm" />}<span className="yx-ops-stack" data-gap="sm"><strong>{v.name}</strong><span className="yx-ops-muted">{v.company}</span></span></span>, width: 230 },
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
          <>
            {live && prints && live.onPrintBadge && (
              <Button size="sm" icon={Printer} loading={busy === `badge-${v.id}`} onClick={() => void run(`badge-${v.id}`, () => printBadge(v.id))}>
                Print badge
              </Button>
            )}
            <Button
              size="sm"
              icon={LogOut}
              loading={busy === `out-${v.id}`}
              onClick={() => live && void run(`out-${v.id}`, async () => (await live.onCheckOut(v.id), toast({ tone: 'success', title: `${v.name} checked out` })))}
            >
              Check out
            </Button>
          </>
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
      {(!live || live.onOpenRollCall) && (
        <Button icon={Printer} onClick={live?.onOpenRollCall}>
          Roll-call
        </Button>
      )}
      {(!live || (live.walkIns && live.canChange)) && (
        <Button icon={UserPlus} onClick={() => setAdding(true)}>
          Add walk-in
        </Button>
      )}
      {canChange && (
        <Button variant="primary" icon={ScanLine} onClick={() => setFinding(true)}>
          Scan QR pass
        </Button>
      )}
    </>
  );
  // Answer 605: reception sees only that the visit can't go ahead, never the watch-list or its reason.
  const stopNames = Array.from(new Set([...(live ? visits.filter((v) => v.status === 'Blocked').map((v) => v.name) : blockedAlert ? ['Manish Gupta'] : []), ...(stopped ? [stopped] : [])]));
  const place = live ? (live.locations.find((l) => l.value === live.locationId)?.label ?? '') : 'Chennai office';
  const facts = `${groups.expected.length} expected · ${groups.onsite.length} on site · ${groups.out.length} checked out`;
  const body = (
    <>
      {error && !checkIn && !finding && <InlineAlert tone="danger" title="Not done">{error}</InlineAlert>}
      {waiting && (() => {
        // Slice 2 (604): reception decides once the host's minutes have passed.
        const w = live?.visits.find((x) => x.id === waiting.id);
        const due = w?.approvalDueAt ? new Date(w.approvalDueAt) : null;
        const canDecide = !live || (canChange && Boolean(live.walkIns) && (!due || due <= new Date()));
        return (
          <PageBanner tone="warning" action={canDecide ? <Button size="sm" onClick={() => setDeciding(true)}>Decide for host</Button> : undefined}>
            {waiting.name}
            {waiting.company !== '—' ? ` (${waiting.company})` : ''} is waiting for {waiting.host} to approve. {live && due ? (due > new Date() ? `After ${time(due)} reception decides.` : 'The host did not answer in time: reception decides.') : 'After 10 minutes reception decides.'}
          </PageBanner>
        );
      })()}
      {stopNames.length > 0 && (
        <InlineAlert tone="danger" title="Stop at reception">
          {stopNames.join(', ')} can't go ahead today. Don't issue a badge. Call the admin on duty; the host is told only that the visit can't go ahead.
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
            <Button variant="primary" icon={prints ? Printer : LogIn} loading={busy === 'in'} onClick={live ? doCheckIn : () => ndaEarly.stop()}>
              {prints ? 'Check in and print badge' : 'Check in'}
            </Button>
          </>
        }
      >
        {visit && (
          <div className="yx-ops-split">
            <div className="yx-ops-stack">
              {!live && !minorAdult && <CameraFrame subject="face" state="ready" />}
              {live && view && (
                <DescriptionList
                  items={[
                    { label: 'Pass', value: view.passCode, mono: true },
                    { label: 'Purpose', value: visit.purpose },
                    ...(view.vehicle ? [{ label: 'Vehicle', value: view.vehicle }] : []),
                    ...(view.idText ? [{ label: 'ID shown', value: view.idText }] : []),
                  ]}
                />
              )}
              {typeNeeds && (typeNeeds.nda || typeNeeds.induction) && (
                <>
                  <div className="yx-ops-kiosk__notice" tabIndex={0} role="region" aria-label="What the visitor accepts">
                    {typeNeeds.nda && (
                      <p>
                        <strong>{typeNeeds.nda.title}.</strong> {typeNeeds.nda.text}
                      </p>
                    )}
                    {typeNeeds.induction && (
                      <p>
                        <strong>{typeNeeds.induction.title}.</strong> {typeNeeds.induction.text}
                      </p>
                    )}
                  </div>
                  {typeNeeds.nda && (
                    <>
                      <Checkbox id="vd-type-nda" checked={typeTicks.nda} onChange={(v) => setTypeTicks({ ...typeTicks, nda: v })} label={`The visitor accepted ${typeNeeds.nda.title}`} />
                      {ndaEarly.errorOf('vd-type-nda') && <p className="yx-field__error">{ndaEarly.errorOf('vd-type-nda')}</p>}
                    </>
                  )}
                  {typeNeeds.induction && (
                    <>
                      <Checkbox id="vd-type-ind" checked={typeTicks.induction} onChange={(v) => setTypeTicks({ ...typeTicks, induction: v })} label={`The visitor read ${typeNeeds.induction.title}`} />
                      {ndaEarly.errorOf('vd-type-ind') && <p className="yx-field__error">{ndaEarly.errorOf('vd-type-ind')}</p>}
                    </>
                  )}
                </>
              )}
              {minorAdult ? (
                <>
                  <InlineAlert tone="info" title="Under 18">
                    Comes with {minorAdult}. No photo and no ID for them.
                  </InlineAlert>
                  <Checkbox id="vd-adult" checked={adult} onChange={setAdult} label={`${minorAdult} is here with them`} />
                  {ndaEarly.errorOf('vd-adult') && <p className="yx-field__error">{ndaEarly.errorOf('vd-adult')}</p>}
                </>
              ) : (
                idNeeded && (
                  <>
                    <FieldRow>
                      <FormField id="vd-idtype" label="ID shown" required error={ndaEarly.errorOf('vd-idtype')}>
                        <Select value={idType} onChange={(v) => (setIdType(v), setPhotoDone(false))} options={ID_CHOICES} placeholder="Choose the ID" />
                      </FormField>
                      <FormField id="vd-last4" label="Last 4 characters" required error={ndaEarly.errorOf('vd-last4')} helper="Never the full number.">
                        <TextField value={last4} onChange={setLast4} maxLength={4} autoComplete="off" spellCheck={false} />
                      </FormField>
                    </FieldRow>
                    {photoNeeded && (
                      <FormField id="vd-idphoto" label="Photo of the ID" required error={ndaEarly.errorOf('vd-idphoto')} helper="JPG or PNG up to 5 MB. Kept privately, virus-checked, and deleted after the ID retention period.">
                        <FileUpload
                          key={idType ?? 'none'}
                          multiple={false}
                          accept={['.jpg', '.jpeg', '.png']}
                          maxSize={5 * 1024 * 1024}
                          capture="environment"
                          onItemsChange={(items) => setPhotoDone(items.some((i) => i.status === 'done'))}
                          upload={async (file, h) => {
                            if (!idType || !/^[A-Za-z0-9]{4}$/.test(last4.trim())) throw new Error('Choose the ID type and enter its last 4 first.');
                            if (live && visit) await live.onIdImage(visit.id, file, idType, last4.trim().toUpperCase());
                            h.onScanning();
                          }}
                        />
                      </FormField>
                    )}
                    {idRule === 'with_image' && idType === 'aadhaar' && <p className="yx-ops-muted">No photo of an Aadhaar card: it shows the full number. Only the last 4 are kept.</p>}
                  </>
                )
              )}
              {needsNotice ? (
                <>
                  <Checkbox id="vd-nda" checked={nda} onChange={setNda} label={live ? 'The visitor read and accepted the notice' : 'Visitor accepted the NDA and safety notice'} description={live ? 'They did not accept it on their link, so they read it here.' : 'Required at this location before entry'} />
                  {ndaEarly.errorOf('vd-nda') && <p className="yx-field__error">{ndaEarly.errorOf('vd-nda')}</p>}
                </>
              ) : (
                <InlineAlert tone="info" title="Notice accepted">The visitor accepted the notice on their link.</InlineAlert>
              )}
              <p className="yx-ops-muted">{live ? "Visit details are deleted after the location's retention period, ID details sooner (Settings › Visitors)." : 'ID images are deleted after 30 days; other visitor details after 90 days.'}</p>
            </div>
            {prints ? (
              <VisitorBadge visit={{ ...visit, badge: live ? (visit.badge ?? 'Given at check-in') : 'V-0413' }} today={today} />
            ) : (
              <p className="yx-ops-muted">No badge at this location: the visitor shows the QR pass on their phone.</p>
            )}
          </div>
        )}
      </Drawer>
      {adding && <AddWalkInDrawer open idCapture={idRule} onClose={() => setAdding(false)} parts={live?.walkIns ? { ...live.walkIns, onAdd: (i) => live.walkIns!.onAdd({ ...i }) } : undefined} />}
      {deciding && waiting && <DecideForHostDialog open onClose={() => setDeciding(false)} id={waiting.id} name={waiting.name} company={waiting.company !== '—' ? waiting.company : null} host={waiting.host} photo={waiting.hasPhoto ? live?.walkIns?.photo : null} onDecide={live?.walkIns ? (approve, reason) => live.walkIns!.onDecide(waiting.id, approve, reason) : undefined} />}
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
  /** Slice 2 (606): the visitor type, for its NDA and safety induction. */
  typeId?: string;
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
  /** Answer 614. */
  minor?: boolean;
  minorAdult?: string;
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
  /** `outsideHours` (answer 652): the window falls outside the location's allowed hours; the host is warned, never refused. */
  onInvite: (input: VisitorInviteInput) => Promise<VisitView & { emailed?: boolean; outsideHours?: string | null }>;
  onCancel: (id: string) => Promise<unknown>;
  /** Slice 2 (606): the company's visitor types for the invite (none: the field is not shown). */
  types?: Choice[];
  /** Slice 2 (604, 602): walk-ins asking for this host, their photo (only while deciding) and the decision. */
  approvals?: {
    rows: WalkInApproval[];
    photo: (id: string) => Promise<string | null>;
    onDecide: (id: string, approve: boolean) => Promise<unknown>;
    /** Answer 711: colleagues to send (by name) and the send; the colleague gets the card. */
    colleagues?: (id: string, q: string) => Promise<Choice[]>;
    onSend?: (id: string, userId: string) => Promise<{ to: string; dueAt: string | null }>;
  };
}

/** A walk-in asking for the host (GET visitors/approvals). */
export interface WalkInApproval {
  id: string;
  name: string;
  company: string | null;
  purpose: string;
  location: string;
  arrivedAt: string;
  dueAt: string | null;
  hasPhoto: boolean;
}

export interface PreRegisterProps {
  device?: 'desk' | 'phone';
  visits: Visit[];
  today: Date;
  formOpen?: boolean;
  sent?: boolean;
  approval?: boolean;
  /** Story (711): the Send someone dialog open on the approval card. */
  sendOpen?: boolean;
  /** Story: the invite of a visitor under 18 (answer 614). */
  minor?: boolean;
  live?: LivePreRegister;
}

type InviteDraft = { name: string; mobile: string; email: string; company: string; purpose: string | null; day: Date | null; locationId: string | null; from: string | null; to: string | null; vehicle: string; minor: boolean; minorAdult: string; typeId?: string | null };
const blankDraft = (locations: Choice[]): InviteDraft => ({ name: '', mobile: '', email: '', company: '', purpose: 'meeting', day: null, locationId: locations.length === 1 ? locations[0]!.value : null, from: null, to: null, vehicle: '', minor: false, minorAdult: '', typeId: null });
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
    d.minor && d.minorAdult.trim().length < 2 && { fieldId: 'vi-adult', message: 'Name the adult who comes with them.' },
  ].filter(Boolean) as { fieldId: string; message: string }[];

/** The invite form. Live, it is controlled by the screen; the story shows the drawn sample. */
/** Answer 614: a visitor under 18 comes only with a named adult (no photo and no ID for them). */
function MinorFields({ minor, adult, onMinor, onAdult, error }: { minor: boolean; adult: string; onMinor: (v: boolean) => void; onAdult: (v: string) => void; error?: string | null }) {
  return (
    <>
      <Checkbox id="vi-minor" checked={minor} onChange={onMinor} label="The visitor is under 18" description="They come only with a named adult. No photo and no ID are taken from them." />
      {minor && (
        <FormField id="vi-adult" label="Adult who comes with them" required error={error}>
          <TextField value={adult} onChange={onAdult} maxLength={200} />
        </FormField>
      )}
    </>
  );
}

export function PreRegisterForm({ today, draft, onDraft, errorOf, locations, minor: minorStory = false, types }: { today: Date; draft?: InviteDraft; onDraft?: (d: InviteDraft) => void; errorOf?: (id: string) => string | null | undefined; locations?: Choice[]; minor?: boolean; types?: Choice[] }) {
  const [date, setDate] = useState<Date | null>(new Date(2026, 9, 1));
  const [loc, setLoc] = useState<string | null>('maa');
  const [minor, setMinor] = useState(minorStory);
  const [adult, setAdult] = useState(minorStory ? 'Rahul Menon' : '');
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
        {types && types.length > 0 && (
          <FormField label="Visitor type" optional helper="Sets the NDA and safety induction they accept before entry">
            <Select aria-label="Visitor type" value={draft.typeId ?? null} onChange={(v) => set({ typeId: v })} options={types} placeholder="No type" clearable />
          </FormField>
        )}
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
        <MinorFields minor={draft.minor} adult={draft.minorAdult} onMinor={(v) => set({ minor: v })} onAdult={(v) => set({ minorAdult: v })} error={err('vi-adult')} />
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
      {types && types.length > 0 && (
        <FormField label="Visitor type" optional helper="Sets the NDA and safety induction they accept before entry">
          <Select aria-label="Visitor type" value="contractor" onChange={() => {}} options={types} />
        </FormField>
      )}
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
      <MinorFields minor={minor} adult={adult} onMinor={setMinor} onAdult={setAdult} />
      {/* Answer 664: no ID type here; the visitor gives it on their link, or reception at the desk. */}
      <FormField label="Send the pass by">
        <RadioGroup orientation="horizontal" value="email" onChange={() => {}} options={[{ value: 'email', label: 'Email' }]} />
      </FormField>
      <p className="yx-ops-muted">The visitor gets a QR pass, directions and a privacy notice. Hosur plant asks for the safety induction at the gate.</p>
    </div>
  );
}
export function PreRegisterScreen({ device = 'desk', visits: sample, today, formOpen, sent, approval, sendOpen = false, minor, live }: PreRegisterProps) {
  const [sending, setSending] = useState<{ id: string; name: string } | null>(sendOpen ? { id: 'sample', name: 'Priyanka Sethi' } : null);
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
      const made = await live.onInvite({ ...(draft.typeId ? { typeId: draft.typeId } : {}), name: draft.name.trim(), mobile: draft.mobile.trim(), email: draft.email.trim(), ...(draft.company.trim() ? { company: draft.company.trim() } : {}), purpose: draft.purpose ?? 'meeting', locationId: draft.locationId!, day: iso(draft.day!), from: draft.from!, to: draft.to!, ...(draft.vehicle.trim() ? { vehicle: draft.vehicle.trim() } : {}), ...(draft.minor ? { minor: true, minorAdult: draft.minorAdult.trim() } : {}) });
      setOpen(false);
      setDraft(blankDraft(live.locations));
      // Answer 605: the host learns only that the visit can't go ahead.
      if (made.status === 'blocked') return void toast({ tone: 'warning', title: "This visit can't go ahead", description: `No pass was sent to ${made.name}. HR or the Facility admin can tell you more.` });
      const warn = made.emailed === false || Boolean(made.outsideHours);
      toast({
        tone: warn ? 'warning' : 'success',
        title: made.emailed === false ? 'Invite saved; the email did not go' : 'Invite sent',
        description: `${made.name}: pass ${made.passCode} for ${formatDate(new Date(made.startsAt))}, ${time(new Date(made.startsAt))} to ${time(new Date(made.endsAt))}, ${made.location}.${made.outsideHours ? ` This is outside the allowed hours (${made.outsideHours}): tell reception.` : ''}`,
      });
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
            {v.minorAdult ? ` · under 18, with ${v.minorAdult}` : ''}
          </span>
          {v.status === 'Blocked' && <span className="yx-ops-muted">This visit can't go ahead. HR or the Facility admin can tell you more.</span>}
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
          <Button icon={UserPlus} onClick={() => setSending({ id: 'sample', name: 'Priyanka Sethi' })}>
            Send someone
          </Button>
          <Button icon={X}>Reject</Button>
        </Actions>
      </div>
    </Card>
  );
  const form = live ? <PreRegisterForm today={today} draft={draft} onDraft={setDraft} errorOf={early.errorOf} locations={live.locations} types={live.types} /> : <PreRegisterForm today={today} minor={minor} types={[{ value: 'customer', label: 'Customer' }, { value: 'contractor', label: 'Contractor' }]} />;
  // Slice 2 (604): the live approval cards, one per walk-in asking for this host.
  const sendDialog = sending && (
    <SendSomeoneDialog
      open
      onClose={() => setSending(null)}
      name={sending.name}
      colleagues={live?.approvals?.colleagues ? (q) => live.approvals!.colleagues!(sending.id, q) : undefined}
      onSend={live?.approvals?.onSend ? (userId) => live.approvals!.onSend!(sending.id, userId) : undefined}
    />
  );
  const liveCards = live?.approvals?.rows.map((a) => (
    <Card key={a.id} title="A walk-in is asking for you">
      <div className="yx-ops-stack">
        <span className="yx-ops-row">
          {a.hasPhoto ? <VisitorPhoto id={a.id} name={a.name} photo={live.approvals!.photo} /> : <PhotoPlaceholder name={a.name} />}
          <span className="yx-ops-stack" data-gap="sm">
            <strong>{a.name}</strong>
            <span className="yx-ops-muted">
              {a.company ? `${a.company} · ` : ''}
              {PURPOSE_CHOICES.find((p) => p.value === a.purpose)?.label ?? 'Meeting'} · at {a.location} reception since {time(new Date(a.arrivedAt))}
            </span>
          </span>
        </span>
        <p className="yx-ops-muted">{a.dueAt ? `If you don't answer by ${time(new Date(a.dueAt))}, reception decides.` : 'Reception decides if you do not answer.'}</p>
        {live.canChange && (
          <Actions>
            <Button variant="approve" icon={Check} loading={busy === `yes-${a.id}`} onClick={() => void run(`yes-${a.id}`, async () => (await live.approvals!.onDecide(a.id, true), toast({ tone: 'success', title: `${a.name} is checked in`, description: 'Reception gives them a badge.' })))}>
              Approve
            </Button>
            {live.approvals!.onSend && (
              <Button icon={UserPlus} onClick={() => setSending({ id: a.id, name: a.name })}>
                Send someone
              </Button>
            )}
            <Button icon={X} loading={busy === `no-${a.id}`} onClick={() => void run(`no-${a.id}`, async () => (await live.approvals!.onDecide(a.id, false), toast({ tone: 'success', title: `${a.name}'s visit declined`, description: 'Reception lets them know.' })))}>
              Reject
            </Button>
          </Actions>
        )}
      </div>
    </Card>
  ));
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
            {sendDialog}
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
        {liveCards}
        {sendDialog}
        <Card>{list}</Card>
        {drawer}
      </LivePage>
    );
  return (
    <OpsDesk area="visitors" active="Invites">
      <PageHeader title="My visitors" description="Invite visitors ahead so they can check in with a QR pass." actions={inviteButton} />
      {approvalCard}
      {sendDialog}
      <Card>{list}</Card>
      {drawer}
    </OpsDesk>
  );
}

/* =========================================================================================
 * VIS-03 · Visitor kiosk (self check-in, photo, notice, badge / QR)
 * ======================================================================================= */

export type KioskStep = 'welcome' | 'pass' | 'details' | 'photo' | 'notice' | 'waiting' | 'badge' | 'see-reception' | 'rejected';
/** VIS-03. Live (Visitors slice 2): `live` makes it the kiosk on a tablet in visitor mode (LiveVisitorKioskView). */
export function VisitorKioskScreen({ step = 'welcome', visit, today, live }: { step?: KioskStep; visit: Visit; today: Date; live?: LiveVisitorKiosk }) {
  if (live) return <LiveVisitorKioskView live={live} />;
  return <DrawnVisitorKiosk step={step} visit={visit} today={today} />;
}

function DrawnVisitorKiosk({ step, visit, today }: { step: KioskStep; visit: Visit; today: Date }) {
  const [agree, setAgree] = useState(false);
  const [nda, setNda] = useState(false);
  const [induction, setInduction] = useState(false);
  const agreeEarly = useTooEarly([
    !agree && { fieldId: 'vk-agree', message: 'Tick to accept the notice before you continue.' },
    !nda && { fieldId: 'vk-nda', message: 'Tick to accept the visitor NDA.' },
    !induction && { fieldId: 'vk-induction', message: 'Tick to confirm the plant safety induction.' },
  ].filter(Boolean) as { fieldId: string; message: string }[]);
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
        {step === 'pass' && (
          <>
            <h1 className="yx-ops-kiosk__title">Your pass</h1>
            <p className="yx-ops-kiosk__lead">Hold the QR to the scanner, or type the code under it.</p>
            <FormField label="Pass code" required>
              <TextField defaultValue="V-7KQ2-MX4P" />
            </FormField>
            <Actions end>
              <Button>Back</Button>
              <Button variant="primary">Next</Button>
            </Actions>
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
            <FormField label="You are visiting as" optional>
              <Select aria-label="You are visiting as" value="contractor" onChange={() => {}} options={[{ value: 'customer', label: 'Customer' }, { value: 'contractor', label: 'Contractor' }, { value: 'auditor', label: 'Food safety auditor' }]} />
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
            <Checkbox id="vk-agree" checked={agree} onChange={setAgree} label="I have read and accept the visitor notice" />
            {agreeEarly.errorOf('vk-agree') && <p className="yx-field__error">{agreeEarly.errorOf('vk-agree')}</p>}
            {/* Visitors slice 2 (606): the visitor type's NDA and safety induction, each accepted on its own. */}
            <Checkbox id="vk-nda" checked={nda} onChange={setNda} label="I accept the visitor NDA" />
            {agreeEarly.errorOf('vk-nda') && <p className="yx-field__error">{agreeEarly.errorOf('vk-nda')}</p>}
            <Checkbox id="vk-induction" checked={induction} onChange={setInduction} label="I have read the plant safety induction and will follow it" />
            {agreeEarly.errorOf('vk-induction') && <p className="yx-field__error">{agreeEarly.errorOf('vk-induction')}</p>}
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
  /** Opens the photo of the ID (answer 603; audited). */
  onOpenIdImage: (id: string) => Promise<unknown>;
  /** Slice 4 (608): counts only, no names, from the counts kept after deletion and the visits still kept. */
  reports?: { state: 'ready' | 'loading' | 'error'; data: VisitReport | null; onRetry: () => void };
}

/** GET visitors/reports. */
export interface VisitReport {
  from: string;
  to: string;
  total: number;
  byLocation: { label: string; visits: number }[];
  byPurpose: { label: string; visits: number }[];
  byMonth: { month: string; visits: number }[];
}

const SAMPLE_REPORT: VisitReport = {
  from: '2025-10-01',
  to: '2026-09-29',
  total: 299,
  byLocation: [
    { label: 'Chennai office', visits: 142 },
    { label: 'Bengaluru head office', visits: 96 },
    { label: 'Hosur plant', visits: 61 },
  ],
  byPurpose: [
    { label: 'Meeting', visits: 121 },
    { label: 'Interview', visits: 74 },
    { label: 'Audit', visits: 38 },
    { label: 'Maintenance', visits: 66 },
  ],
  byMonth: [
    { month: '2026-07', visits: 88 },
    { month: '2026-08', visits: 104 },
    { month: '2026-09', visits: 107 },
  ],
};
const monthWord = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

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
  const left = (v: Visit) => {
    const on = deleted.get(v.id);
    return on ? Math.max(0, Math.round((new Date(`${on}T00:00:00`).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000)) : retentionLeft(v.from, today);
  };
  const report = live ? (live.reports?.data ?? null) : SAMPLE_REPORT;
  const reportLoading = live ? live.reports?.state === 'loading' : loading;
  const reportsTab = (
    <>
      {live?.reports?.state === 'error' && (
        <InlineAlert tone="danger" title="Reports did not load" actions={<Button size="sm" onClick={live.reports.onRetry}>Try again</Button>}>
          Nothing has changed. Try again in a moment.
        </InlineAlert>
      )}
      <p className="yx-ops-muted">{report ? `${report.total} visits, ${formatDate(new Date(`${report.from}T00:00:00`))} to ${formatDate(new Date(`${report.to}T00:00:00`))}. Counts only: no visitor names.` : ''}</p>
      <CardGrid min="lg">
        <BarChart title="Visits by location" xLabel="Location" categories={(report?.byLocation ?? []).map((x) => x.label)} series={[{ name: 'Visits', values: (report?.byLocation ?? []).map((x) => x.visits) }]} loading={reportLoading} />
        <DonutChart title="Visits by purpose" slices={(report?.byPurpose ?? []).map((x) => ({ label: x.label, value: x.visits }))} loading={reportLoading} />
      </CardGrid>
      <BarChart title="Visits by month" xLabel="Month" categories={(report?.byMonth ?? []).map((x) => monthWord(x.month))} series={[{ name: 'Visits', values: (report?.byMonth ?? []).map((x) => x.visits) }]} loading={reportLoading} />
      <DescriptionList items={[{ label: 'Retention', value: live ? "Visit details are deleted after the location's retention period; these counts stay, without names (Settings › Visitors)." : '90 days for visitor details, 30 days for ID images (company setting, Settings 3.12); the counts stay, without names' }]} />
    </>
  );
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
        { key: 'id', header: 'ID shown', value: (v) => v.idText ?? (v.minorAdult ? `Under 18, with ${v.minorAdult}` : '—') },
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
      rowButtons={(v) =>
        v.idImage ? (
          <Button size="sm" loading={busy === `id-${v.id}`} onClick={() => live && void run(`id-${v.id}`, () => live.onOpenIdImage(v.id))}>
            Photo of ID
          </Button>
        ) : null
      }
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
        {error && <InlineAlert tone="danger" title="Not done">{error}</InlineAlert>}
        {live.reports ? (
          <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
            <TabsList aria-label="Visitor log views">
              <TabsTrigger value="log">Log</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>
            <TabsContent value="log">{table}</TabsContent>
            <TabsContent value="reports">{reportsTab}</TabsContent>
          </Tabs>
        ) : (
          table
        )}
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
        <TabsContent value="reports">{reportsTab}</TabsContent>
      </Tabs>
    </OpsDesk>
  );
}
