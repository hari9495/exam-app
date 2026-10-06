// Visitor screens (M02 §B11, YX-AT-22): VIS-01 visitor desk (today), VIS-02 pre-register + my visitors, VIS-03 visitor kiosk,
// VIS-04 visitor log & reports.
import { useState } from 'react';
import { ArrowLeft, Check, LogIn, LogOut, Printer, QrCode, ScanLine, Send, UserPlus, X } from 'lucide-react';
import { KioskFrame, PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { PageBanner } from '../../components/notify';
import { BarChart, DonutChart } from '../../components/charts';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { Actions, CameraFrame, CardGrid, Facts, OpsDesk, PhotoPlaceholder, QrPlaceholder } from './ops-kit';
import { retentionLeft } from './ops-rules';
import type { ListState } from './helpdesk';
import type { Visit, VisitStatus } from './visitors-data';

const time = (d?: Date) => (d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
const TONE: Record<VisitStatus, BadgeTone> = { Expected: 'neutral', 'Waiting for host': 'warning', 'On site': 'success', 'Checked out': 'neutral', Blocked: 'danger', Rejected: 'danger', 'No show': 'neutral' };

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

export interface VisitorDeskProps {
  visits: Visit[];
  today: Date;
  state?: ListState;
  tab?: 'expected' | 'onsite' | 'out';
  checkInId?: string | null;
  blockedAlert?: boolean;
}
export function VisitorDeskScreen({ visits, today, state = 'ready', tab = 'expected', checkInId = null, blockedAlert }: VisitorDeskProps) {
  const [current, setCurrent] = useState(tab);
  const [checkIn, setCheckIn] = useState<string | null>(checkInId);
  const [nda, setNda] = useState(false);
  const groups = {
    expected: visits.filter((v) => v.status === 'Expected' || v.status === 'Waiting for host' || v.status === 'Blocked'),
    onsite: visits.filter((v) => v.status === 'On site'),
    out: visits.filter((v) => v.status === 'Checked out'),
  };
  const visit = visits.find((v) => v.id === checkIn);
  const waiting = visits.find((v) => v.status === 'Waiting for host');
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
        v.status === 'Expected' ? (
          <Button size="sm" icon={LogIn} onClick={() => setCheckIn(v.id)}>
            Check in
          </Button>
        ) : v.status === 'On site' ? (
          <Button size="sm" icon={LogOut}>
            Check out
          </Button>
        ) : v.status === 'Waiting for host' ? (
          <Button size="sm">Decide now</Button>
        ) : null
      }
    />
  );
  return (
    <OpsDesk area="visitors" active="Today's visitors" counts={{ "Today's visitors": groups.onsite.length }}>
      <PageHeader
        title="Today's visitors"
        description="Chennai office reception. Scan the visitor's QR pass or check them in by name."
        facts={`${groups.expected.length} expected · ${groups.onsite.length} on site · ${groups.out.length} checked out`}
        actions={
          <>
            <Button icon={Printer}>Print on-site list</Button>
            <Button icon={UserPlus}>Add walk-in</Button>
            <Button variant="primary" icon={ScanLine}>
              Scan QR pass
            </Button>
          </>
        }
      />
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
      <Drawer
        open={!!visit}
        onOpenChange={(o) => !o && setCheckIn(null)}
        size="lg"
        title={visit ? `Check in ${visit.name}` : ''}
        subtitle={visit ? `${visit.company} · host ${visit.host} · ${time(visit.from)} to ${time(visit.to)}` : ''}
        footer={
          <>
            <Button onClick={() => setCheckIn(null)}>Cancel</Button>
            <Button variant="primary" icon={Printer} disabled={!nda}>
              Check in and print badge
            </Button>
          </>
        }
      >
        {visit && (
          <div className="yx-ops-split">
            <div className="yx-ops-stack">
              <CameraFrame subject="face" state="ready" />
              <FormField label="ID shown">
                <Select value="dl" onChange={() => {}} options={[{ value: 'dl', label: 'Driving licence' }, { value: 'pan', label: 'PAN card' }, { value: 'other', label: 'Other' }]} />
              </FormField>
              <Checkbox checked={nda} onChange={setNda} label="Visitor accepted the NDA and safety notice" description="Required at this location before entry" />
              <p className="yx-ops-muted">ID images are deleted after 30 days; other visitor details after 90 days.</p>
            </div>
            <VisitorBadge visit={{ ...visit, badge: 'V-0413' }} today={today} />
          </div>
        )}
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * VIS-02 · Pre-register a visitor (host invite) + my visitors
 * ======================================================================================= */

export interface PreRegisterProps {
  device?: 'desk' | 'phone';
  visits: Visit[];
  today: Date;
  formOpen?: boolean;
  sent?: boolean;
  approval?: boolean;
}
export function PreRegisterForm({ today }: { today: Date }) {
  const [date, setDate] = useState<Date | null>(new Date(2026, 9, 1));
  const [loc, setLoc] = useState<string | null>('maa');
  const [via, setVia] = useState('whatsapp');
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
        <FormField label="Company" optional>
          <TextField />
        </FormField>
        <FormField label="Purpose" required>
          <Select value="meeting" onChange={() => {}} options={['Meeting', 'Interview', 'Vendor', 'Audit', 'Maintenance'].map((p) => ({ value: p.toLowerCase(), label: p }))} />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Date" required>
          <DatePicker value={date} onChange={setDate} min={today} />
        </FormField>
        <FormField label="Location" required>
          <Select value={loc} onChange={setLoc} options={[{ value: 'maa', label: 'Chennai office' }, { value: 'blr', label: 'Bengaluru head office' }, { value: 'hsr', label: 'Hosur plant' }]} />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Arrives" required>
          <TextField defaultValue="2:00 pm" />
        </FormField>
        <FormField label="Leaves by" required>
          <TextField defaultValue="3:00 pm" />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="ID type" optional>
          <Select value={null} onChange={() => {}} options={[{ value: 'dl', label: 'Driving licence' }, { value: 'pan', label: 'PAN card' }]} placeholder="Not needed" />
        </FormField>
        <FormField label="Vehicle number" optional>
          <TextField />
        </FormField>
      </FieldRow>
      <FormField label="Send the pass by">
        <RadioGroup orientation="horizontal" value={via} onChange={setVia} options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' }]} />
      </FormField>
      <p className="yx-ops-muted">The visitor gets a QR pass, directions and a privacy notice. Hosur plant asks for the safety induction at the gate.</p>
    </div>
  );
}
export function PreRegisterScreen({ device = 'desk', visits, today, formOpen, sent, approval }: PreRegisterProps) {
  const [open, setOpen] = useState(!!formOpen);
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
        </li>
      ))}
    </ul>
  ) : (
    <EmptyState compact title="No visitors invited." description="Invite a visitor so reception has them on the list." />
  );
  const sentNote = sent && <InlineAlert tone="success" title="Invite sent">Rahul Menon got a QR pass on WhatsApp for 1 Oct 2026, 2:00 pm to 3:00 pm, Chennai office.</InlineAlert>;
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
  if (device === 'phone')
    return (
      <PhoneFrame tab="me" title={open ? 'Invite a visitor' : 'My visitors'} back={<IconButton icon={ArrowLeft} label="Back" onClick={() => setOpen(false)} />}>
        {open ? (
          <>
            <PreRegisterForm today={today} />
            <Button variant="primary" icon={Send} fullWidth>
              Send invite
            </Button>
          </>
        ) : (
          <>
            {approvalCard}
            {sentNote}
            <Button variant="primary" icon={UserPlus} fullWidth onClick={() => setOpen(true)}>
              Invite a visitor
            </Button>
            {list}
          </>
        )}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="visitors" active="Invites">
      <PageHeader title="My visitors" description="Invite visitors ahead so they can check in with a QR pass." actions={<Button variant="primary" icon={UserPlus} onClick={() => setOpen(true)}>Invite a visitor</Button>} />
      {approvalCard}
      {sentNote}
      <Card>{list}</Card>
      <Drawer open={open} onOpenChange={setOpen} size="lg" title="Invite a visitor" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" icon={Send}>Send invite</Button></>}>
        <PreRegisterForm today={today} />
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * VIS-03 · Visitor kiosk (self check-in, photo, notice, badge / QR)
 * ======================================================================================= */

export type KioskStep = 'welcome' | 'details' | 'photo' | 'notice' | 'waiting' | 'badge' | 'see-reception' | 'rejected';
export function VisitorKioskScreen({ step = 'welcome', visit, today }: { step?: KioskStep; visit: Visit; today: Date }) {
  const [agree, setAgree] = useState(false);
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
            <Checkbox checked={agree} onChange={setAgree} label="I have read and accept the confidentiality and safety notice" />
            <Actions end>
              <Button>Back</Button>
              <Button variant="primary" disabled={!agree}>
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

export function VisitorLogScreen({ log, today, loading, tab = 'log' }: { log: Visit[]; today: Date; loading?: boolean; tab?: 'log' | 'reports' }) {
  const [current, setCurrent] = useState(tab);
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const fields: FilterFieldDef[] = [
    { key: 'location', label: 'Location', type: 'multi', options: ['Chennai office', 'Bengaluru head office', 'Hosur plant'].map((v) => ({ value: v, label: v })) },
    { key: 'host', label: 'Host', type: 'multi', options: Array.from(new Set(log.map((v) => v.host))).map((v) => ({ value: v, label: v })) },
    { key: 'purpose', label: 'Purpose', type: 'multi', options: ['Meeting', 'Interview', 'Vendor', 'Audit', 'Delivery', 'Maintenance'].map((v) => ({ value: v, label: v })) },
    { key: 'from', label: 'Visit date', type: 'date' },
  ];
  let rows = log;
  for (const f of filters) if (f.type === 'multi' && f.values.length) rows = rows.filter((v) => f.values.includes(String((v as unknown as Record<string, unknown>)[f.key])));
  const byPurpose = ['Meeting', 'Interview', 'Audit', 'Maintenance'].map((p) => log.filter((v) => v.purpose === p).length);
  return (
    <OpsDesk area="visitors" active="Visitor log">
      <PageHeader title="Visitor log" description="Every check-in and check-out by location, for audits. Visitor data is deleted after 90 days; ID images after 30." actions={<Button>Export for audit</Button>} />
      <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
        <TabsList aria-label="Visitor log views">
          <TabsTrigger value="log">Log</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
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
              { key: 'out', header: 'Out', value: (v) => v.checkOut, render: (v) => (v.checkOut ? time(v.checkOut) : <Badge tone="success">On site</Badge>) },
              { key: 'nda', header: 'Notice accepted', value: (v) => (v.nda ? 'Yes' : 'Not required') },
              {
                key: 'ret',
                header: 'Deleted in',
                value: (v) => retentionLeft(v.from, today),
                render: (v) => {
                  const left = retentionLeft(v.from, today);
                  return <Badge tone={left <= 7 ? 'warning' : 'neutral'}>{left === 0 ? 'Today' : `${left} days`}</Badge>;
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
            onExport={() => {}}
          />
        </TabsContent>
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
