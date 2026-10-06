// More case screens (M08, P23): HLP-12 accident case workspace with statutory panel, HLP-13 collective dispute / settlement,
// HLP-14 Settings › Policies › Write with AI.
import { useState } from 'react';
import { ArrowLeft, Camera, FileText, Handshake, ShieldAlert } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { AiBadge, Badge } from '../../components/display';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { DataTable } from '../../components/table';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { MenuItem } from '../../components/menu';
import { Dialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { Stepper } from '../../components/stepper';
import { formatDate, formatINR } from '../../lib/format';
import { Actions, CheckList, ClockPanel, Confidential, Facts, MembersList, OpsDesk, PhotoPlaceholder, SourceTag, StatusTrail, Workspace, type CaseMember, type CheckRow } from './ops-kit';
import { addDays, ecCompensation, tdsLateInterest, type EcKind } from './ops-rules';
import { RestrictedNotFound } from './cases';
import type { Device } from './helpdesk';


/* =========================================================================================
 * HLP-12 · Accident case workspace with statutory panel (T3, D+M)
 * ======================================================================================= */

export interface AccidentRecord {
  id: string;
  occurredAt: Date;
  place: string;
  description: string;
  person: { name: string; kind: string; role: string; age: number; monthlyWage: number; esiCovered: boolean; uan: string; ip: string; contractor?: string };
  injuryType: string;
  bodyPart: string;
  firstAid: string;
  hospital: string;
  daysUnable: number;
  witnesses: string[];
  reportedBy: string;
}
export type AccidentView = 'safety' | 'manager' | 'non-member';
export interface AccidentWorkspaceProps {
  record: AccidentRecord;
  members: CaseMember[];
  today: Date;
  view?: AccidentView;
  /** EC claim for a person not covered by ESI (YX-CASE-16). */
  ec?: { kind: EcKind; factor: number; disablementPct?: number; dueOn: Date; paidOn?: Date | null };
  /** Reportable accident (death / disablement beyond the prescribed days). */
  reportable?: boolean;
  esicSubmitted?: boolean;
  /** Contract worker: contractor is the immediate employer; principal alerted if not filed. */
  contractorNotFiled?: boolean;
}
export function AccidentWorkspaceScreen({ record, members, today, view = 'safety', ec, reportable, esicSubmitted, contractorNotFiled }: AccidentWorkspaceProps) {
  const [tab, setTab] = useState('incident');
  if (view === 'non-member') return <RestrictedNotFound />;
  const r = record;
  const esi = r.person.esiCovered;
  const clocks = [
    ...(esi ? [{ key: 'esic', label: 'ESIC accident report (employer’s report)', due: addDays(r.occurredAt, 2), doneOn: esicSubmitted ? addDays(r.occurredAt, 1) : null }] : []),
    ...(reportable ? [{ key: 'notice', label: 'Statutory accident notice (OSH Code / Factories)', due: addDays(r.occurredAt, 3) }] : []),
    ...(ec ? [{ key: 'ec', label: 'Employees’ Compensation payment', due: ec.dueOn, doneOn: ec.paidOn ?? null }] : []),
  ];
  const ecCalc = ec && ecCompensation({ kind: ec.kind, monthlyWage: r.person.monthlyWage, factor: ec.factor, disablementPct: ec.disablementPct });
  const ecLate = ec && ecCalc && ec.dueOn < today && !ec.paidOn ? tdsLateInterest(ecCalc.amount, ec.dueOn, ec.dueOn, today) : 0;

  if (view === 'manager')
    return (
      <OpsDesk area="helpdesk" active="Help centre" member={false}>
        <PageHeader title={`Injury leave · ${r.person.name}`} description="You see only the leave dates. The accident record and medical details are with the safety officer and HR." />
        <Card>
          <DescriptionList
            items={[
              { label: 'Injury leave', value: `${formatDate(addDays(r.occurredAt, 1))} to ${formatDate(addDays(r.occurredAt, r.daysUnable))} (${r.daysUnable} days)` },
              { label: 'Expected return', value: formatDate(addDays(r.occurredAt, r.daysUnable + 1)) },
              { label: 'Roster', value: 'Shifts in this period are marked as injury leave' },
            ]}
          />
        </Card>
      </OpsDesk>
    );

  const statutory = (
    <div className="yx-ops-stack">
      <ClockPanel title="Statutory deadlines" items={clocks} today={today} source="Time limits from P07 IN.ESI, IN.OSH, IN.EC valid on the accident date (verify)" />
      {contractorNotFiled && (
        <InlineAlert tone="warning" title="The contractor hasn't filed yet">
          Sri Lakshmi Facility Services is the immediate employer and must file the ESIC report. As principal employer, Kaveri Foods may be liable if they don't. Reminder sent to their contact today.
        </InlineAlert>
      )}
      {esi && (
        <div className="yx-ops-card">
          <div className="yx-ops-card__head">
            <h3 className="yx-ops-card__title">ESIC accident report</h3>
            <Badge tone={esicSubmitted ? 'success' : 'warning'}>{esicSubmitted ? 'Submitted' : 'Draft ready'}</Badge>
          </div>
          <StatusTrail steps={[{ label: 'Draft' }, { label: 'Reviewed' }, { label: 'Submitted' }, { label: 'Acknowledged' }]} current={esicSubmitted ? 3 : 1} />
          <p className="yx-ops-muted">Pre-filled from the case: IP number {r.person.ip}, time, place, injury and first aid. Uses the form version valid on {formatDate(r.occurredAt)}.</p>
          {esicSubmitted ? (
            <FormField label="Acknowledgement number">
              <TextField defaultValue="ESIC/ACC/2026/0917743" />
            </FormField>
          ) : (
            <Actions>
              <Button icon={FileText}>Review report</Button>
              <Button>Mark submitted</Button>
            </Actions>
          )}
        </div>
      )}
      {reportable && (
        <div className="yx-ops-card" data-tone="warning">
          <div className="yx-ops-card__head">
            <h3 className="yx-ops-card__title">Statutory accident notice to the inspector</h3>
            <Badge tone="warning">Reportable: unable to work beyond the prescribed days</Badge>
          </div>
          <p className="yx-ops-muted">Form and time limit from the OSH Code rules for Tamil Nadu valid on the accident date. If late, the estimated penalty shows here.</p>
          <Actions>
            <Button icon={FileText}>Review notice</Button>
            <Button>Mark submitted</Button>
          </Actions>
        </div>
      )}
      {ec && ecCalc && (
        <div className="yx-ops-card" data-tone={ecLate ? 'danger' : undefined}>
          <div className="yx-ops-card__head">
            <h3 className="yx-ops-card__title">Employees’ Compensation claim</h3>
            <Badge tone={ec.paidOn ? 'success' : ecLate ? 'danger' : 'warning'}>{ec.paidOn ? 'Paid' : ecLate ? 'Overdue' : 'To pay'}</Badge>
          </div>
          <p className="yx-ops-muted">Not covered by ESI for this injury, so the employer pays compensation under the P07 IN.EC rules valid on {formatDate(r.occurredAt)}.</p>
          <Facts
            items={[
              { label: 'Wage used (ceiling applied)', value: formatINR(ecCalc.wageUsed) },
              { label: 'Age factor', value: ec.factor },
              { label: 'Compensation', value: formatINR(ecCalc.amount) },
              ...(ecLate ? [{ label: 'Interest (estimate)', value: formatINR(ecLate), tone: 'danger' as const }] : []),
            ]}
          />
          <p className="yx-ops-muted">How it's worked out: {ecCalc.formula}. Estimate from dated rules; your compliance owner verifies.</p>
          <FormField label="How it's paid">
            <RadioGroup
              defaultValue="payroll"
              options={[
                { value: 'payroll', label: 'Lump sum through payroll to the employee' },
                { value: 'deposit', label: 'Deposit with the Commissioner', description: 'Required for death, and other cases the rules list' },
              ]}
            />
          </FormField>
          <Actions>
            <Button icon={FileText}>Draft EC letter</Button>
          </Actions>
        </div>
      )}
      <InlineAlert tone="info">Injury leave for {r.daysUnable} days is recorded in Time. {esi ? 'ESI pays the benefit; company top-up per policy is added in payroll.' : 'Temporary-disablement pay goes through payroll.'} On closure the accidents register for {r.occurredAt.toLocaleString('en-IN', { month: 'long' })} gets this entry automatically.</InlineAlert>
    </div>
  );

  return (
    <OpsDesk area="helpdesk" active="Cases">
      <Confidential>
        <ObjectHeader
          name={`${r.injuryType}, ${r.place}`}
          icon={ShieldAlert}
          secondary={
            <span>
              <span className="yx-ops-mono">{r.id}</span> · Workplace accident · {formatDate(r.occurredAt)}, {r.occurredAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          }
          status={
            <>
              <Badge tone={esi ? 'info' : 'neutral'}>{esi ? 'ESI covered' : 'Not ESI covered'}</Badge>
              {reportable && <Badge tone="warning">Reportable</Badge>}
              {r.person.contractor && <Badge tone="neutral">Contract worker</Badge>}
            </>
          }
          facts={[
            { label: 'Injured person', value: `${r.person.name}, ${r.person.role}` },
            { label: 'Unable to work', value: `${r.daysUnable} days` },
            { label: 'Reported by', value: r.reportedBy },
          ]}
          actions={
            <>
              <Button>Add witness statement</Button>
              <Button variant="primary">Close case</Button>
            </>
          }
          menu={<MenuItem>Link injury leave</MenuItem>}
        />
        <Workspace
          main={
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList aria-label="Accident case sections">
                <TabsTrigger value="incident">Incident</TabsTrigger>
                <TabsTrigger value="statutory" count={clocks.filter((c) => !c.doneOn).length}>
                  Statutory
                </TabsTrigger>
                <TabsTrigger value="medical">Medical</TabsTrigger>
              </TabsList>
              <TabsContent value="incident">
                <div className="yx-ops-stack">
                  <DescriptionList
                    columns={2}
                    items={[
                      { label: 'What happened', value: r.description },
                      { label: 'Place', value: r.place },
                      { label: 'Injured person', value: `${r.person.name} (${r.person.kind}${r.person.contractor ? `, ${r.person.contractor}` : ''})` },
                      { label: 'Injury', value: `${r.injuryType}, ${r.bodyPart}` },
                      { label: 'First aid', value: r.firstAid },
                      { label: 'Hospital', value: r.hospital },
                      { label: 'Witnesses', value: r.witnesses.join('; ') },
                      { label: 'UAN', value: r.person.uan, mono: true },
                    ]}
                  />
                  <div className="yx-ops-row" role="group" aria-label="Photos">
                    <PhotoPlaceholder name="machine guard" size="lg" />
                    <PhotoPlaceholder name="work area" size="lg" />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="statutory">{statutory}</TabsContent>
              <TabsContent value="medical">
                <div className="yx-ops-stack">
                  <InlineAlert tone="info">Special data. Only members with medical access see this section; the manager sees only leave dates.</InlineAlert>
                  <DescriptionList
                    items={[
                      { label: 'Diagnosis', value: 'Crush injury, fracture of left index finger' },
                      { label: 'Certificates', value: 'ESI dispensary certificate, 29 Sep 2026' },
                      { label: 'Disablement', value: ec?.disablementPct ? `${ec.disablementPct} % permanent partial (medical board)` : 'Temporary' },
                    ]}
                  />
                </div>
              </TabsContent>
            </Tabs>
          }
          rail={
            <>
              <ClockPanel title="Next deadline" items={clocks.slice(0, 1)} today={today} />
              <Card>
                <MembersList members={members} />
              </Card>
            </>
          }
        />
      </Confidential>
    </OpsDesk>
  );
}

/** Report an accident (web / phone / on behalf). Near-misses are not recorded here. */
export function ReportAccidentScreen({ device = 'phone', today }: { device?: Device; today: Date }) {
  const [when, setWhen] = useState<Date | null>(today);
  const [person, setPerson] = useState<string>('employee');
  const [loc, setLoc] = useState<string | null>('hsr');
  const form = (
    <div className="yx-ops-stack">
      <InlineAlert tone="info">For a near-miss with no injury, tell your safety officer instead.</InlineAlert>
      <FormField label="Who was injured?" required>
        <RadioGroup
          value={person}
          onChange={setPerson}
          options={[
            { value: 'employee', label: 'An employee' },
            { value: 'contract', label: 'A contract worker', description: 'We link the worker and their contractor' },
          ]}
        />
      </FormField>
      <FormField label="Name" required>
        <TextField defaultValue="Sathish Kumar" />
      </FormField>
      <FieldRow>
        <FormField label="When" required>
          <DatePicker value={when} onChange={setWhen} max={today} />
        </FormField>
        <FormField label="Location" required>
          <Select value={loc} onChange={setLoc} options={[{ value: 'hsr', label: 'Hosur plant' }, { value: 'maa', label: 'Chennai office' }, { value: 'blr', label: 'Bengaluru head office' }]} />
        </FormField>
      </FieldRow>
      <FormField label="Where exactly" required>
        <TextField defaultValue="Packing line 2" />
      </FormField>
      <FormField label="What happened" required>
        <TextArea rows={4} />
      </FormField>
      <FieldRow>
        <FormField label="Injury type">
          <Select value="crush" onChange={() => {}} options={[{ value: 'crush', label: 'Crush' }, { value: 'cut', label: 'Cut' }, { value: 'burn', label: 'Burn' }, { value: 'fall', label: 'Fall' }, { value: 'other', label: 'Other' }]} />
        </FormField>
        <FormField label="Body part">
          <TextField defaultValue="Left hand" />
        </FormField>
      </FieldRow>
      <Checkbox defaultChecked label="First aid was given" />
      <FormField label="Photos" optional>
        <FileUpload multiple accept={['.jpg', '.png']} upload={async () => {}} />
      </FormField>
    </div>
  );
  if (device === 'phone')
    return (
      <PhoneFrame tab="me" title="Report an accident" back={<IconButton icon={ArrowLeft} label="Back" />} hideTabs>
        {form}
        <Button variant="primary" fullWidth icon={Camera}>
          Send report
        </Button>
      </PhoneFrame>
    );
  return (
    <OpsDesk area="helpdesk" active="Speak-up" member={false}>
      <PageHeader title="Report an accident" description="The safety officer and HR get it at once. You stay on the case as the reporter." />
      <Card footer={<Actions end><Button>Cancel</Button><Button variant="primary">Send report</Button></Actions>}>
        <div className="yx-ops-narrow">{form}</div>
      </Card>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-13 · Collective dispute / settlement case (T3, HR, IR lead)
 * ======================================================================================= */

export interface Demand {
  id: string;
  demand: string;
  union: string;
  mgmt: string;
  status: string;
}
export interface DisputeScreenProps {
  demands: Demand[];
  stages: { label: string; at?: Date; note?: string }[];
  members: CaseMember[];
  today: Date;
  stage?: 'conciliation' | 'signed';
  member?: boolean;
}
export function CollectiveDisputeScreen({ demands, stages, members, today, stage = 'conciliation', member = true }: DisputeScreenProps) {
  const [tab, setTab] = useState(stage === 'signed' ? 'settlement' : 'demands');
  if (!member) return <RestrictedNotFound />;
  const signed = stage === 'signed';
  const trail = signed ? stages.map((s, i) => (i === 4 ? { ...s, at: new Date(2026, 9, 6), note: undefined } : i === 5 ? { ...s, at: new Date(2026, 9, 15), note: undefined } : s)) : stages;
  return (
    <OpsDesk area="helpdesk" active="Cases">
      <Confidential note="Confidential. Visible to the HR-IR and legal members of this case. Every view is logged.">
        <ObjectHeader
          name="Charter of demands 2026"
          icon={Handshake}
          secondary={
            <span>
              <span className="yx-ops-mono">IRD-0002</span> · Collective dispute · Kaveri Foods Workers Union (recognised) · Hosur plant
            </span>
          }
          status={<Badge tone={signed ? 'success' : 'info'}>{signed ? 'Settlement signed' : 'Conciliation'}</Badge>}
          facts={[
            { label: 'Workers covered', value: '212' },
            { label: 'Demands', value: `${demands.length} (${demands.filter((d) => d.status.startsWith('Agreed')).length} agreed)` },
            { label: 'Next', value: signed ? 'File with the authority' : 'Conciliation meeting 3, 6 Oct 2026' },
          ]}
          actions={
            signed ? (
              <>
                <Button icon={FileText}>Open signed settlement</Button>
                <Button variant="primary">Send pay terms to payroll arrears</Button>
              </>
            ) : (
              <>
                <Button>Log meeting</Button>
                <Button variant="primary">Record settlement</Button>
              </>
            )
          }
        />
        <StatusTrail steps={trail} current={signed ? 6 : 4} label="Dispute stages" />
        <Workspace
          main={
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList aria-label="Dispute sections">
                <TabsTrigger value="demands" count={demands.length}>
                  Demands
                </TabsTrigger>
                <TabsTrigger value="meetings">Meetings</TabsTrigger>
                <TabsTrigger value="settlement">Settlement terms</TabsTrigger>
              </TabsList>
              <TabsContent value="demands">
                <DataTable
                  label="Demands"
                  columns={[
                    { key: 'id', header: '#', type: 'id', value: (d: Demand) => d.id, width: 60 },
                    { key: 'demand', header: 'Demand', value: (d) => d.demand, width: 320 },
                    { key: 'union', header: 'Union', value: (d) => d.union },
                    { key: 'mgmt', header: 'Management', value: (d) => d.mgmt },
                    { key: 'status', header: 'Status', type: 'status', value: (d) => d.status, statusTone: (v) => (String(v).startsWith('Agreed') ? 'success' : v === 'Open' ? 'warning' : 'neutral') },
                  ]}
                  rows={demands}
                  getRowId={(d) => d.id}
                />
              </TabsContent>
              <TabsContent value="meetings">
                <ol className="yx-ops-conv">
                  {stages
                    .filter((s) => s.at)
                    .map((s) => (
                      <li key={s.label} className="yx-ops-msg">
                        <span className="yx-ops-msg__meta">
                          <span className="yx-ops-msg__who">{s.label}</span>
                          <span>{formatDate(s.at!)}</span>
                        </span>
                        <p className="yx-ops-msg__body">Minutes uploaded. Attended by union office bearers, HR-IR and the conciliation officer where applicable.</p>
                      </li>
                    ))}
                </ol>
              </TabsContent>
              <TabsContent value="settlement">
                {signed ? (
                  <div className="yx-ops-stack">
                    <DescriptionList
                      columns={2}
                      items={[
                        { label: 'Type', value: 'Settlement in conciliation' },
                        { label: 'Signed', value: '15 Oct 2026' },
                        { label: 'Effective', value: '1 Apr 2026 to 31 Mar 2029' },
                        { label: 'Covered categories', value: 'Unskilled, semi-skilled, skilled (Hosur plant)' },
                        { label: 'Pay terms', value: 'Basic +11 %, night-shift allowance ₹120 per shift' },
                        { label: 'Authority copy', value: 'To file per IR Code rules (verify)' },
                      ]}
                    />
                    <InlineAlert tone="info" title="Arrears from 1 Apr 2026">
                      Sending the pay terms opens the wage-settlement arrears worksheet in Pay (PAY-37) for 212 workers. The union's register entry links to this settlement.
                    </InlineAlert>
                  </div>
                ) : (
                  <EmptyState compact title="No settlement yet." description="Record it once both sides sign. Pay terms then go to payroll arrears." />
                )}
              </TabsContent>
            </Tabs>
          }
          rail={
            <>
              <ClockPanel title="Next dates" today={today} items={[{ key: 'm3', label: 'Conciliation meeting 3', due: new Date(2026, 9, 6), doneOn: signed ? new Date(2026, 9, 6) : null }]} />
              <Card>
                <MembersList members={members} />
              </Card>
            </>
          }
        />
      </Confidential>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-14 · Settings › Policies › Write with AI (T3, HR, SA)
 * ======================================================================================= */

export interface Clause {
  id: string;
  title: string;
  text: string;
  source: 'law' | 'company' | 'ai';
  ref?: string;
  finding?: string;
}
export interface Finding {
  id: string;
  state: string;
  text: string;
  status: 'open' | 'resolved' | 'acknowledged';
}
export interface PolicyWriterScreenProps {
  step?: 'questionnaire' | 'draft' | 'generating';
  clauses: Clause[];
  findings: Finding[];
  approveOpen?: boolean;
}
export function PolicyWriterScreen({ step = 'draft', clauses, findings: initial, approveOpen }: PolicyWriterScreenProps) {
  const [findings, setFindings] = useState(initial);
  const [open, setOpen] = useState(!!approveOpen);
  const [states, setStates] = useState<string[]>(['KA', 'TN']);
  const [headcount, setHeadcount] = useState<number | null>(248);
  const openFindings = findings.filter((f) => f.status === 'open');
  const checks: CheckRow[] = findings.map((f) => ({
    id: f.id,
    status: f.status === 'open' ? 'fail' : f.status === 'acknowledged' ? 'warn' : 'pass',
    label: `${f.state}: ${f.text}`,
    detail: f.status === 'open' ? 'Resolve by changing the clause, or acknowledge with a reason.' : f.status === 'acknowledged' ? 'Acknowledged with a reason' : 'Resolved',
    action:
      f.status === 'open' ? (
        <Actions>
          <Button size="sm" onClick={() => setFindings((x) => x.map((y) => (y.id === f.id ? { ...y, status: 'resolved' } : y)))}>
            Use the legal minimum
          </Button>
          <Button size="sm" onClick={() => setFindings((x) => x.map((y) => (y.id === f.id ? { ...y, status: 'acknowledged' } : y)))}>
            Acknowledge
          </Button>
        </Actions>
      ) : undefined,
  }));

  return (
    <OpsDesk area="helpdesk" active="Policies">
      <PageHeader
        title="Write policies with AI"
        description="Settings › Policies. Answer a few questions; we draft the policies and check them against the law for each state. Nothing is published until you approve."
        status={<AiBadge />}
        actions={
          step === 'draft' ? (
            <>
              <Button>Save draft</Button>
              <Button variant="primary" disabled={openFindings.length > 0} onClick={() => setOpen(true)}>
                Approve & load
              </Button>
            </>
          ) : undefined
        }
      />
      <PageBanner tone="info">Not legal advice; review by counsel recommended.</PageBanner>
      {step === 'questionnaire' ? (
        <Stepper
          title="Policy questionnaire"
          finishLabel="Draft policies"
          review={{ title: 'Check your answers' }}
          steps={[
            {
              id: 'company',
              title: 'Your company',
              content: (
                <div className="yx-ops-stack">
                  <FormField label="Industry">
                    <Select value="fmcg" onChange={() => {}} options={[{ value: 'fmcg', label: 'Food and consumer goods (manufacturing)' }, { value: 'it', label: 'IT services' }]} />
                  </FormField>
                  <FormField label="States where people work" helper="The law check runs for each state">
                    <MultiSelect value={states} onChange={setStates} options={[{ value: 'KA', label: 'Karnataka' }, { value: 'TN', label: 'Tamil Nadu' }, { value: 'MH', label: 'Maharashtra' }]} />
                  </FormField>
                  <FormField label="Headcount">
                    <NumberField value={headcount} onChange={setHeadcount} />
                  </FormField>
                </div>
              ),
              summary: `FMCG manufacturing · ${states.join(', ')} · ${headcount} people`,
            },
            {
              id: 'work',
              title: 'How people work',
              content: (
                <FormField label="Work pattern">
                  <RadioGroup defaultValue="shift" options={[{ value: 'office', label: 'Office hours only' }, { value: 'shift', label: 'Office and plant shifts, including nights' }]} />
                </FormField>
              ),
              summary: 'Office and plant shifts, including nights',
            },
            {
              id: 'choices',
              title: 'Your choices',
              content: (
                <div className="yx-ops-stack">
                  <FieldRow>
                    <FormField label="Earned leave days a year">
                      <NumberField value={15} onChange={() => {}} />
                    </FormField>
                    <FormField label="Work-from-home days a week">
                      <NumberField value={2} onChange={() => {}} />
                    </FormField>
                  </FieldRow>
                  <FieldRow>
                    <FormField label="Notice period (days)">
                      <NumberField value={60} onChange={() => {}} />
                    </FormField>
                    <FormField label="Probation (months)">
                      <NumberField value={6} onChange={() => {}} />
                    </FormField>
                  </FieldRow>
                </div>
              ),
              summary: '15 earned leave days · 2 WFH days · 60 days notice · 6 months probation',
            },
          ]}
        />
      ) : step === 'generating' ? (
        <Card title="Drafting 8 policies and the handbook">
          <div className="yx-ops-stack" role="status" aria-busy="true" aria-live="polite" aria-label="Drafting policies">
            <p className="yx-ops-muted">Drafting from your answers and the dated law for Karnataka and Tamil Nadu. This takes about a minute.</p>
            <Skeleton height={24} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        </Card>
      ) : (
        <div className="yx-ops-split">
          <Card title="Leave policy (draft)">
            <div className="yx-ops-stack">
              {clauses.map((c) => (
                <section key={c.id} className="yx-ops-clause" data-finding={c.finding && findings.find((f) => f.id === c.finding)?.status === 'open' ? true : undefined}>
                  <div className="yx-ops-clause__head">
                    <span className="yx-ops-clause__title">{c.title}</span>
                    <SourceTag source={c.source} rule={c.ref} />
                  </div>
                  <TextArea defaultValue={c.text} rows={3} aria-label={c.title} />
                </section>
              ))}
            </div>
          </Card>
          <div className="yx-ops-stack">
            <Card title={`Law check (${openFindings.length} open)`}>
              <p className="yx-ops-muted">Checked against P07 rules valid today for each chosen state.</p>
              <CheckList label="Law-floor findings" items={checks} />
            </Card>
            {openFindings.length > 0 && <InlineAlert tone="warning">Approve & load stays off until every finding is resolved or acknowledged.</InlineAlert>}
          </div>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title="Approve and load the leave policy?"
        description="Rule values go to the leave policy with an impact preview; the text becomes a new policy version that people acknowledge."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Approve & load
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <Facts
            items={[
              { label: 'People affected', value: '22' },
              { label: 'Earned leave change', value: '+3 days (Tamil Nadu plant staff)' },
              { label: 'New policy version', value: 'Leave policy v3' },
            ]}
          />
          <p className="yx-ops-muted">Employees see the new version only after you publish it in Policies.</p>
        </div>
      </Dialog>
    </OpsDesk>
  );
}
