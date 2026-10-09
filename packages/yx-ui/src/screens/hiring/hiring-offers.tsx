// Hiring › Offers (builder, record, conditions, bulk), BGV tracker, talent CRM, bias audit.
// HIR-09, HIR-29, HIR-28, HIR-10, HIR-20, HIR-23 (M10 Q3 / Q5, YX-ATS-06 / 07 / 08 / 14 / 17 / 20 / 21 / 22 / 23 / 40 / 41, T05 YX-EVAL-32).
import { useState } from 'react';
import { ExternalLink, FileText, Plus, Scale, Send, UserPlus } from 'lucide-react';
import { Button } from '../../components/button';
import { AiBadge, Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { Stepper } from '../../components/stepper';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { ApprovalTimeline, Timeline, type ApprovalStep, type TimelineItem } from '../../components/timeline';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import {
  auditExpired,
  bandCheck,
  campaignAudience,
  ctcBreakup,
  daysBetween,
  grossMonthly,
  impactRatios,
  offerLapse,
  revisionNeedsApproval,
  sourcedPurgeIn,
  totalCtc,
  type AuditCategory,
  type Band,
  type Channel,
  type CrmMember,
  type OfferCondition,
} from './hiring-logic';
import { ConsentBadges, CtcBreakupTable, HireFrame, PostingStrip, RecordLayout, SummaryTiles, useListControls, type Posting } from './hiring-kit';
import type { Pool } from './hiring-data';
import './hiring.css';

type ListState = 'ready' | 'loading' | 'error';

/* ================================================================== HIR-09 · Offer builder */

export interface OfferBuilderProps {
  candidate: string;
  job: string;
  grade: string;
  band: Band;
  defaultCtc: number;
  defaultVariable?: number;
  defaultJoining?: number;
  persona: 'recruiter' | 'hr';
  /** Previous version, when this is a revision (YX-ATS-17). */
  previous?: { version: number; ctc: number; grade: string } | null;
  defaultStep?: string;
  now?: Date;
}

// HIR-09
export function OfferBuilderScreen({ candidate, job, grade, band, defaultCtc, defaultVariable = 0, defaultJoining = 0, persona, previous = null, defaultStep = 'comp', now }: OfferBuilderProps) {
  const [ctc, setCtc] = useState<number | null>(defaultCtc);
  const [variable, setVariable] = useState<number | null>(defaultVariable);
  const [joining, setJoining] = useState<number | null>(defaultJoining);
  const [clawback, setClawback] = useState<number | null>(12);
  const [kind, setKind] = useState('offer');
  const [metro, setMetro] = useState(true);
  const fixed = ctc ?? 0;
  const lines = ctcBreakup(fixed, { variable: variable ?? 0, joiningBonus: joining ?? 0, metro });
  const band$ = bandCheck(fixed, band);
  const reapprove = previous ? revisionNeedsApproval({ ctc: previous.ctc, grade: previous.grade }, { ctc: fixed, grade }) : true;
  const version = previous ? previous.version + 1 : 1;
  const steps: ApprovalStep[] = [
    { id: 'rec', label: 'Recruiter', status: 'done', approver: 'Neha Joshi', at: now },
    { id: 'hr', label: 'HR business partner', status: 'current', approver: 'Lakshmi Venkatesan' },
    ...(band$.extraApproval ? [{ id: 'cfo', label: 'Out-of-range approval (CFO)', status: 'pending' as const, approver: 'Meenakshi Sundaram' }] : []),
  ];
  const bandBadge = <Badge tone={band$.extraApproval ? 'warning' : 'success'}>{band$.text}</Badge>;
  return (
    <HireFrame active="Offers & BGV">
      <PageHeader
        title={`${previous ? 'Revise offer' : 'New offer'} · ${candidate}`}
        description={`${job} · ${grade} · pay range ${formatINR(band.min)} – ${formatINR(band.max)}`}
        status={<Badge tone="info">Version {version}</Badge>}
      />
      {previous && (
        <InlineAlert tone={reapprove ? 'warning' : 'info'} title={`This version supersedes v${previous.version}`}>
          {reapprove
            ? `CTC changed from ${formatINR(previous.ctc)} to ${formatINR(fixed)}, so the offer goes through approval again. The v${previous.version} letter is withdrawn and can't be accepted.`
            : `CTC and grade are unchanged, so no new approval is needed. The v${previous.version} letter is withdrawn.`}
        </InlineAlert>
      )}
      <Stepper
        title="Offer"
        defaultCurrent={defaultStep}
        finishLabel={band$.extraApproval || reapprove ? 'Send for approval' : 'Send offer'}
        review={{ description: 'Check the offer before it goes for approval.' }}
        onSaveAndExit={() => {}}
        steps={[
          {
            id: 'comp',
            title: 'Compensation',
            description: 'From the M03 CTC template',
            content: (
              <div className="yx-hire-sheet">
                <div className="yx-hire-sheet__form">
                  <FormField label="CTC template" required>
                    <Select value="std" onChange={() => {}} options={[{ value: 'std', label: 'Standard CTC, Tamil Nadu (M03)' }, { value: 'plant', label: 'Plant staff CTC' }]} />
                  </FormField>
                  <FormField label="Fixed CTC (annual)" required helper={`Grade ${grade}: ${formatINR(band.min)} – ${formatINR(band.max)}`}>
                    <CurrencyField value={ctc} onChange={setCtc} />
                  </FormField>
                  {bandBadge}
                  <FieldRow>
                    <FormField label="Variable pay (target)" optional>
                      <CurrencyField value={variable} onChange={setVariable} />
                    </FormField>
                    <FormField label="Joining bonus" optional>
                      <CurrencyField value={joining} onChange={setJoining} />
                    </FormField>
                  </FieldRow>
                  {(joining ?? 0) > 0 && (
                    <FormField label="Clawback if the person leaves within" helper="Recovered in the final settlement">
                      <NumberField value={clawback} onChange={setClawback} suffix="months" />
                    </FormField>
                  )}
                  <Switch className="yx-hire-switch" label="Metro city HRA (50% of basic)" checked={metro} onChange={setMetro} />
                  <Button icon={Scale}>Suggest split</Button>
                </div>
                <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="CTC breakup preview">
                  <CtcBreakupTable lines={persona === 'hr' ? lines : lines.filter((l) => l.kind !== 'employer')} caption="Breakup preview" />
                  <Text size="sm" tone="secondary">
                    Gross monthly {formatINR(grossMonthly(lines))} · total CTC incl. variable {formatINR(totalCtc(lines))}
                  </Text>
                  {persona === 'recruiter' && (
                    <Text size="xs" tone="muted">
                      Employer contributions are shown to HR.
                    </Text>
                  )}
                </aside>
              </div>
            ),
            summary: (
              <DescriptionList
                items={[
                  { label: 'Fixed CTC', value: formatINR(fixed) },
                  { label: 'Variable', value: formatINR(variable ?? 0) },
                  { label: 'Joining bonus', value: joining ? `${formatINR(joining)}, clawback ${clawback} months` : 'None' },
                  { label: 'Grade range', value: band$.text },
                ]}
              />
            ),
          },
          {
            id: 'terms',
            title: 'Terms',
            description: 'Joining, expiry, letter type',
            content: (
              <div className="yx-hire-sheet__form">
                <FormField label="Letter type" required>
                  <RadioGroup
                    aria-label="Letter type"
                    value={kind}
                    onChange={setKind}
                    options={[
                      { value: 'offer', label: 'Offer letter' },
                      { value: 'loi', label: 'Letter of intent (campus)', description: 'Offer follows later; long pre-boarding without an employee record.' },
                    ]}
                  />
                </FormField>
                <FieldRow>
                  <FormField label="Joining date" required>
                    <DatePicker value={new Date(2026, 10, 2)} onChange={() => {}} />
                  </FormField>
                  <FormField label="Offer expires" required helper="Unsigned offers lapse after this date">
                    <DatePicker value={new Date(2026, 9, 6)} onChange={() => {}} />
                  </FormField>
                </FieldRow>
                <FormField label="Work location" required>
                  <Select value="maa" onChange={() => {}} options={[{ value: 'maa', label: 'Chennai office' }, { value: 'blr', label: 'Bengaluru head office' }]} />
                </FormField>
                <Checkbox label="Add conditions (background check, documents)" defaultChecked />
              </div>
            ),
            summary: <Text>{kind === 'offer' ? 'Offer letter' : 'Letter of intent'} · joining 2 Nov 2026 · expires 6 Oct 2026</Text>,
          },
          {
            id: 'letter',
            title: 'Letter',
            description: 'Template and e-sign',
            content: (
              <div className="yx-hire-stack">
                <FormField label="Letter template" required>
                  <Select value="t1" onChange={() => {}} options={[{ value: 't1', label: 'Offer letter · Engineering (P05)' }]} />
                </FormField>
                <div className="yx-hire-letter" role="document" aria-label="Letter preview">
                  <Text as="p" weight="semibold">
                    Dear {candidate},
                  </Text>
                  <Text as="p">
                    We are pleased to offer you the position of {job} at Kaveri Foods Pvt Ltd, Chennai, with an annual fixed CTC of {formatINR(fixed)}
                    {variable ? ` and a target variable pay of ${formatINR(variable)}` : ''}. Your joining date is 2 Nov 2026.
                  </Text>
                  <Text as="p">Please accept this offer by 6 Oct 2026 using the one-time password sent to your mobile.</Text>
                </div>
              </div>
            ),
            summary: <Text>Offer letter · Engineering · OTP e-accept</Text>,
          },
          {
            id: 'approval',
            title: 'Approval',
            description: band$.extraApproval ? 'Extra approval needed' : 'Standard chain',
            content: (
              <div className="yx-hire-stack">
                {band$.extraApproval && <InlineAlert tone="warning" title="Out of the grade pay range">{band$.text} The CFO approves after HR.</InlineAlert>}
                <ApprovalTimeline steps={steps} now={now} />
              </div>
            ),
            summary: <Text>{steps.length} approval steps</Text>,
          },
        ]}
      />
    </HireFrame>
  );
}

/* ================================================================== Offer record + HIR-29 conditions tab */

export type OfferStatus = 'Waiting for approval' | 'Sent' | 'Accepted' | 'Joined' | 'Declined' | 'Reneged' | 'Withdrawn' | 'Lapsed';
const OFFER_TONE: Record<OfferStatus, BadgeTone> = { 'Waiting for approval': 'warning', Sent: 'info', Accepted: 'success', Joined: 'success', Declined: 'neutral', Reneged: 'danger', Withdrawn: 'danger', Lapsed: 'danger' };

export interface OfferRecordProps {
  candidate: string;
  job: string;
  status: OfferStatus;
  ctc: number;
  conditions: OfferCondition[];
  lapseDate: Date;
  today: Date;
  handoff?: { mode: 'automatic' | 'manual'; personType: 'New person' | 'Alumni rehire' | 'Internal employee' | 'Contractor conversion' | 'Partial match' };
  declineReason?: string;
  activity: TimelineItem[];
  defaultTab?: 'overview' | 'conditions' | 'versions';
  persona?: 'recruiter' | 'hr';
}

// HIR-29 (conditions tab on the offer record)
export function OfferConditionsTab({ conditions: initial, lapseDate, today }: { conditions: OfferCondition[]; lapseDate: Date; today: Date }) {
  const [conditions, setConditions] = useState(initial);
  const lapse = offerLapse(conditions, lapseDate, today);
  const set = (id: string, status: OfferCondition['status']) => setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
  return (
    <div className="yx-hire-stack">
      {lapse.state === 'lapsed' ? (
        <InlineAlert tone="danger" title="Offer lapsed">
          {lapse.open} condition{lapse.open === 1 ? ' was' : 's were'} not met by {formatDate(lapseDate)}. Pre-boarding tasks were cancelled, accounts not created and the headcount slot released.
        </InlineAlert>
      ) : lapse.state === 'reminder' ? (
        <InlineAlert tone="warning" title={`Auto-lapse on ${formatDate(lapseDate)} (${lapse.daysToLapse} days)`}>
          {lapse.overdue.length ? `Overdue: ${lapse.overdue.join(', ')}. ` : ''}The candidate got a reminder. Mark each condition met or waived before the lapse date.
        </InlineAlert>
      ) : lapse.state === 'clear' ? (
        <InlineAlert tone="success" title="All conditions met or waived">The offer won&rsquo;t lapse.</InlineAlert>
      ) : (
        <InlineAlert tone="info">Auto-lapse on {formatDate(lapseDate)} if any condition is still open.</InlineAlert>
      )}
      <ul className="yx-hire-list" aria-label="Offer conditions">
        {conditions.map((c) => {
          const overdue = c.status === 'open' && daysBetween(c.due, today) > 0;
          return (
            <li key={c.id} className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <Text weight="medium">{c.name}</Text>
                <Text size="sm" tone={overdue ? 'danger' : 'secondary'}>
                  Due {formatDate(c.due)}
                  {overdue ? ' · overdue' : ''}
                </Text>
                {c.status === 'met' && (
                  <Text size="sm" tone="secondary">
                    Evidence: offer-signed.pdf
                  </Text>
                )}
              </div>
              <Badge tone={c.status === 'met' ? 'success' : c.status === 'waived' ? 'info' : overdue ? 'warning' : 'neutral'}>{c.status === 'open' ? 'Open' : c.status === 'met' ? 'Met' : 'Waived'}</Badge>
              {c.status === 'open' && lapse.state !== 'lapsed' && (
                <div className="yx-hire-list__actions">
                  <Button size="sm" onClick={() => set(c.id, 'met')}>
                    Mark met
                  </Button>
                  <Button size="sm" onClick={() => set(c.id, 'waived')}>
                    Waive with reason
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button icon={Plus}>Add condition</Button>
    </div>
  );
}

const PERSON_TYPE_TEXT: Record<NonNullable<OfferRecordProps['handoff']>['personType'], string> = {
  'New person': 'A new employee is created in pre-boarding with draft compensation and pre-boarding tasks.',
  'Alumni rehire': 'A new employment is added to her existing employee record. You choose what continues (service, leave, gratuity) in the preview.',
  'Internal employee': 'No new employee: a transfer on the existing record, effective on the release date agreed with the current manager.',
  'Contractor conversion': 'Employment type changes on the existing record; the running placement ends.',
  'Partial match': 'Email matches an employee but PAN doesn’t. Confirm the match or continue as a new person before anything is created.',
};

// HIR-09 (offer record: status, hand-off, versions) + HIR-29
export function OfferRecordScreen({ candidate, job, status, ctc, conditions, lapseDate, today, handoff, declineReason, activity, defaultTab = 'overview', persona = 'recruiter' }: OfferRecordProps) {
  return (
    <HireFrame active="Offers & BGV">
      <RecordLayout
        banner={
          status === 'Reneged' || status === 'Withdrawn' ? (
            <InlineAlert tone="danger" title={`Offer ${status.toLowerCase()}`}>
              Reason: {declineReason}. Pre-boarding was unwound, the plan line released and REQ-0142 reopened with its pipeline intact.
            </InlineAlert>
          ) : status === 'Declined' ? (
            <InlineAlert tone="info" title="Offer declined">Reason: {declineReason}. Counted in offer-acceptance analytics.</InlineAlert>
          ) : undefined
        }
        header={
          <ObjectHeader
            name={`Offer · ${candidate}`}
            icon={FileText}
            secondary={`${job} · version 2`}
            status={<Badge tone={OFFER_TONE[status]}>{status}</Badge>}
            facts={[
              { label: 'Fixed CTC', value: formatINR(ctc) },
              { label: 'Joining', value: '2 Nov 2026' },
              { label: 'Expires', value: formatDate(lapseDate) },
              { label: 'Hand-off', value: handoff ? `${handoff.mode === 'automatic' ? 'Automatic' : 'Manual'} · ${handoff.personType}` : '—' },
            ]}
            actions={
              status === 'Accepted' && handoff?.mode === 'manual' && persona === 'hr' ? (
                <ConfirmDialog
                  trigger={<Button variant="primary" icon={UserPlus}>Create employee</Button>}
                  title={`Create employee for ${candidate}?`}
                  consequence={PERSON_TYPE_TEXT[handoff.personType]}
                  confirmLabel="Create employee"
                  onConfirm={() => {}}
                />
              ) : status === 'Sent' ? (
                <>
                  <Button>Send reminder</Button>
                  <Button variant="primary">Revise offer</Button>
                </>
              ) : undefined
            }
            menu={
              <>
                <MenuItem>Download letter</MenuItem>
                <MenuItem destructive>Withdraw offer</MenuItem>
              </>
            }
          />
        }
        aside={
          <>
            <Text weight="semibold">Activity</Text>
            <Timeline items={activity} today={today} />
          </>
        }
      >
        {status === 'Accepted' && handoff && (
          <InlineAlert tone={handoff.personType === 'Partial match' ? 'warning' : 'info'} title={handoff.mode === 'manual' ? 'In "Ready to onboard"' : 'Employee created automatically'}>
            {PERSON_TYPE_TEXT[handoff.personType]} Retrying never creates a second employee.
          </InlineAlert>
        )}
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Offer sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="conditions" count={conditions.filter((c) => c.status === 'open').length}>
              Conditions
            </TabsTrigger>
            <TabsTrigger value="versions" count={2}>
              Versions
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <CtcBreakupTable lines={ctcBreakup(ctc, { variable: 1_50_000 })} />
          </TabsContent>
          <TabsContent value="conditions">
            <OfferConditionsTab conditions={conditions} lapseDate={lapseDate} today={today} />
          </TabsContent>
          <TabsContent value="versions">
            <ul className="yx-hire-list">
              <li className="yx-hire-list__item">
                <div className="yx-hire-list__main">
                  <Text weight="medium">Version 2 · {formatINR(ctc)}</Text>
                  <Text size="sm" tone="secondary">
                    CTC raised after counter-offer; re-approved by CFO 26 Sep 2026
                  </Text>
                </div>
                <Badge tone="success">Current</Badge>
              </li>
              <li className="yx-hire-list__item">
                <div className="yx-hire-list__main">
                  <Text weight="medium">Version 1 · {formatINR(18_00_000)}</Text>
                  <Text size="sm" tone="secondary">
                    Sent 22 Sep 2026 · letter withdrawn
                  </Text>
                </div>
                <Badge>Superseded</Badge>
              </li>
            </ul>
          </TabsContent>
        </Tabs>
      </RecordLayout>
    </HireFrame>
  );
}

/* ================================================================== HIR-28 · Bulk offers */

export interface BulkOfferRow {
  id: string;
  name: string;
  college: string;
  ctc: number;
  joining: Date;
  planOk: boolean;
}

// HIR-28
export function BulkOfferScreen({ rows, band, defaultStep = 'values', sent = false }: { rows: BulkOfferRow[]; band: Band; defaultStep?: string; sent?: boolean }) {
  const [selected, setSelected] = useState<string[]>(rows.map((r) => r.id));
  const outOfBand = rows.filter((r) => bandCheck(r.ctc, band).extraApproval);
  const noPlan = rows.filter((r) => !r.planOk);
  const cols: TableColumn<BulkOfferRow>[] = [
    { key: 'name', header: 'Candidate', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.college }) },
    { key: 'ctc', header: 'Fixed CTC', type: 'money', value: (r) => r.ctc, editable: 'money', total: 'sum' },
    { key: 'joining', header: 'Joining', type: 'date', value: (r) => r.joining },
    { key: 'band', header: 'Grade range', type: 'status', value: (r) => (bandCheck(r.ctc, band).extraApproval ? 'Out of range' : 'Within range'), statusTone: (v) => (v === 'Within range' ? 'success' : 'warning') },
    { key: 'plan', header: 'Plan check', type: 'status', value: (r) => (r.planOk ? 'Plan line free' : 'No plan line'), statusTone: (v) => (v === 'Plan line free' ? 'success' : 'danger') },
  ];
  if (sent)
    return (
      <HireFrame active="Offers & BGV">
        <PageHeader title="Bulk offers · GET 2027" status={<Badge tone="success">Sent</Badge>} />
        <SummaryTiles
          label="Batch status"
          tiles={[
            { label: 'Offers sent', value: rows.length - noPlan.length },
            { label: 'Waiting for extra approval', value: outOfBand.length, tone: outOfBand.length ? 'warning' : 'default' },
            { label: 'Held: no plan line', value: noPlan.length, tone: noPlan.length ? 'danger' : 'default' },
            { label: 'E-sign envelopes', value: rows.length - noPlan.length, sub: 'one per candidate' },
          ]}
        />
      </HireFrame>
    );
  return (
    <HireFrame active="Offers & BGV">
      <PageHeader title="Bulk offers · GET 2027 · Hosur campus" description={`One template, values per candidate. Each offer still gets its own headcount-plan check and its own e-sign envelope. Grade G3 range ${formatINR(band.min)} – ${formatINR(band.max)}.`} />
      <Stepper
        title="Bulk offers"
        defaultCurrent={defaultStep}
        finishLabel={`Send ${selected.length - noPlan.filter((r) => selected.includes(r.id)).length} offers`}
        steps={[
          {
            id: 'template',
            title: 'Template',
            content: (
              <div className="yx-hire-sheet__form">
                <FormField label="Letter" required>
                  <RadioGroup aria-label="Letter" defaultValue="loi" options={[{ value: 'loi', label: 'Letter of intent (offer later)' }, { value: 'offer', label: 'Offer letter' }]} />
                </FormField>
                <FormField label="CTC template" required>
                  <Select value="get" onChange={() => {}} options={[{ value: 'get', label: 'Graduate engineer trainee CTC' }]} />
                </FormField>
                <FormField label="Joining batch" required helper="Moving the batch date moves everyone in it">
                  <Select value="b1" onChange={() => {}} options={[{ value: 'b1', label: 'GET batch 1 · joins 5 Jul 2027' }]} />
                </FormField>
              </div>
            ),
            summary: <Text>Letter of intent · GET CTC · batch 1, 5 Jul 2027</Text>,
          },
          {
            id: 'values',
            title: 'Candidates and values',
            description: `${rows.length} candidates`,
            content: (
              <div className="yx-hire-stack">
                {outOfBand.length > 0 && <InlineAlert tone="warning" title={`${outOfBand.length} out of the grade range`}>They go to the CFO for extra approval; the rest go straight to HR.</InlineAlert>}
                {noPlan.length > 0 && <InlineAlert tone="danger" title={`${noPlan.length} without a free plan line`}>These offers are held until the plan is revised: {noPlan.map((r) => r.name).join(', ')}.</InlineAlert>}
                <DataTable label="Offer values" columns={cols} rows={rows} getRowId={(r) => r.id} selectable selectedIds={selected} onSelectedChange={setSelected} onCellEdit={() => {}} />
              </div>
            ),
            summary: <Text>{selected.length} selected · {outOfBand.length} need extra approval · {noPlan.length} held</Text>,
          },
          {
            id: 'preview',
            title: 'Preview',
            content: (
              <div className="yx-hire-letter" role="document" aria-label="Letter preview for the first candidate">
                <Text as="p" weight="semibold">
                  Dear {rows[0]?.name},
                </Text>
                <Text as="p">
                  Following your selection at the {rows[0]?.college} campus drive, Kaveri Foods Pvt Ltd intends to offer you the role of Graduate Engineer Trainee at our Hosur plant with an annual CTC of {formatINR(rows[0]?.ctc ?? 0)}, joining on 5 Jul 2027.
                </Text>
              </div>
            ),
            summary: <Text>Letter checked for the first candidate</Text>,
          },
          {
            id: 'send',
            title: 'Approve and send',
            content: (
              <DescriptionList
                items={[
                  { label: 'Approval', value: 'Per offer: HR, plus CFO for out-of-range offers' },
                  { label: 'E-sign', value: 'One envelope per candidate, OTP accept' },
                  { label: 'Held', value: noPlan.length ? noPlan.map((r) => r.name).join(', ') : 'None' },
                ]}
              />
            ),
          },
        ]}
      />
    </HireFrame>
  );
}

/* ================================================================== HIR-10 · BGV tracker */

export type CheckState = 'Clear' | 'In progress' | 'Discrepancy' | 'Not started' | 'Insufficient';
export interface BgvRow {
  id: string;
  candidate: string;
  job: string;
  package: string;
  consent: 'Given' | 'Pending';
  started: Date | null;
  checks: Record<'Identity' | 'Address' | 'Education' | 'Employment' | 'Criminal', CheckState>;
  mode: 'Partner' | 'Manual';
}
const CHECK_TONE: Record<CheckState, BadgeTone> = { Clear: 'success', 'In progress': 'info', Discrepancy: 'warning', 'Not started': 'neutral', Insufficient: 'warning' };
const overall = (r: BgvRow): CheckState => {
  const v = Object.values(r.checks);
  if (v.includes('Discrepancy')) return 'Discrepancy';
  if (v.includes('Insufficient')) return 'Insufficient';
  if (v.every((c) => c === 'Clear')) return 'Clear';
  if (v.every((c) => c === 'Not started')) return 'Not started';
  return 'In progress';
};

// HIR-10
export function BgvTrackerScreen({ rows, addOn = true, openId = null, state = 'ready', persona = 'hr' }: { rows: BgvRow[]; addOn?: boolean; openId?: string | null; state?: ListState; persona?: 'hr' | 'recruiter' }) {
  const [open, setOpen] = useState<string | null>(openId);
  const cur = rows.find((r) => r.id === open);
  const list = useListControls({
    rows,
    fields: [{ key: 'overall', label: 'Result', type: 'multi', options: ['Clear', 'In progress', 'Discrepancy', 'Not started', 'Insufficient'].map((v) => ({ value: v, label: v })) }],
    text: (r) => `${r.candidate} ${r.job}`,
    fieldValue: (r) => overall(r),
    views: [{ id: 'open', name: 'In progress' }],
  });
  const cols: TableColumn<BgvRow>[] = [
    { key: 'candidate', header: 'Candidate', type: 'person', value: (r) => r.candidate, person: (r) => ({ name: r.candidate, secondary: r.job }) },
    { key: 'package', header: 'Package', value: (r) => r.package },
    { key: 'consent', header: 'Consent', type: 'status', value: (r) => r.consent, statusTone: (v) => (v === 'Given' ? 'success' : 'warning') },
    ...(['Identity', 'Address', 'Education', 'Employment', 'Criminal'] as const).map<TableColumn<BgvRow>>((k) => ({ key: k, header: k, type: 'status', value: (r) => r.checks[k], statusTone: (v) => CHECK_TONE[v as CheckState] })),
    { key: 'overall', header: 'Result', type: 'status', value: overall, statusTone: (v) => CHECK_TONE[v as CheckState] },
    { key: 'started', header: 'Started', type: 'date', value: (r) => r.started },
  ];
  return (
    <HireFrame active="Offers & BGV">
      <PageHeader
        title="Background verification"
        description={addOn ? 'Checks run by the BGV partner after the candidate consents. Reports stay in the document vault; only HR and recruiters in scope see results.' : 'Manual tracking: your company has no BGV partner add-on. Record each check and upload the report.'}
        actions={<Button variant="primary" icon={Plus}>{addOn ? 'Start BGV' : 'Add manual check'}</Button>}
      />
      {!addOn && <InlineAlert tone="info" title="Manual BGV">Enable the partner integration in Settings › Hiring to order checks and get status updates automatically.</InlineAlert>}
      <DataTable
        label="Background verification"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={() => {}}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
        rowButtons={(r) => (r.consent === 'Pending' ? <Button size="sm">Resend consent link</Button> : null)}
        empty={<EmptyState title="No background checks yet." description="Checks start after an offer is accepted and the candidate consents." />}
        onExport={() => {}}
      />
      {cur && (
        <Drawer open onOpenChange={(o) => !o && setOpen(null)} size="lg" title={`BGV · ${cur.candidate}`} subtitle={`${cur.job} · ${cur.package} · ${cur.mode === 'Partner' ? 'partner' : 'manual'}`} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
          <div className="yx-hire-stack">
            {cur.consent === 'Pending' && <InlineAlert tone="warning" title="Waiting for the candidate's consent">No check starts until the candidate gives explicit consent.</InlineAlert>}
            {overall(cur) === 'Discrepancy' && (
              <InlineAlert tone="warning" title="Discrepancy to review">
                Employment dates at the previous employer differ by 4 months. Discuss with the candidate; the offer is never withdrawn automatically.
              </InlineAlert>
            )}
            <ul className="yx-hire-list">
              {Object.entries(cur.checks).map(([k, v]) => (
                <li key={k} className="yx-hire-list__item">
                  <Text weight="medium">{k}</Text>
                  <Badge tone={CHECK_TONE[v]}>{v}</Badge>
                  {persona === 'hr' && v !== 'Not started' && <Button size="sm">View report</Button>}
                </li>
              ))}
            </ul>
          </div>
        </Drawer>
      )}
    </HireFrame>
  );
}

/* ================================================================== HIR-20 · Talent CRM */

export interface SequenceStep {
  id: string;
  kind: 'message' | 'wait';
  channel?: Channel;
  template?: string;
  days?: number;
}
export interface Capture {
  id: string;
  name: string;
  site: 'LinkedIn' | 'Naukri';
  headline: string;
  capturedBy: string;
  capturedAt: Date;
  consent: 'Pending' | 'Given';
  existing?: boolean;
}

export interface TalentCrmProps {
  pools: Pool[];
  members: CrmMember[];
  captures: Capture[];
  postings: { job: string; postings: Posting[] }[];
  steps: SequenceStep[];
  today: Date;
  defaultTab?: 'pools' | 'campaigns' | 'sourced' | 'postings';
  builderOpen?: boolean;
  engagement?: TimelineItem[];
}

// HIR-20
export function TalentCrmScreen({ pools, members, captures, postings, steps, today, defaultTab = 'pools', builderOpen = false, engagement = [] }: TalentCrmProps) {
  const [builder, setBuilder] = useState(builderOpen);
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const audience = campaignAudience(members, channel);
  const poolCols: TableColumn<Pool>[] = [
    { key: 'name', header: 'Pool', value: (r) => r.name, render: (r) => <PersonLabel name={r.name} secondary={r.purpose} /> },
    { key: 'kind', header: 'Type', type: 'status', value: (r) => r.kind, statusTone: (v) => (v === 'Hotlist' ? 'info' : 'neutral') },
    { key: 'members', header: 'Members', type: 'number', value: (r) => r.members, total: 'sum' },
    { key: 'email', header: 'Email opt-in', type: 'number', value: (r) => r.emailConsent },
    { key: 'wa', header: 'WhatsApp opt-in', type: 'number', value: (r) => r.whatsappConsent },
    { key: 'owner', header: 'Owner', type: 'person', value: (r) => r.owner, person: (r) => ({ name: r.owner }) },
    { key: 'updated', header: 'Updated', type: 'date', value: (r) => r.updated },
  ];
  return (
    <HireFrame active="Candidates & talent CRM">
      <PageHeader
        title="Talent CRM"
        description="Pools, hotlists and nurture campaigns. Messages go only to people with consent for that channel; opt-outs apply at once."
        actions={
          <>
            <Button icon={Plus}>New pool</Button>
            <Button variant="primary" icon={Send} onClick={() => setBuilder(true)}>
              New sequence
            </Button>
          </>
        }
      />
      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label="Talent CRM sections">
          <TabsTrigger value="pools" count={pools.length}>
            Pools & hotlists
          </TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns & sequences</TabsTrigger>
          <TabsTrigger value="sourced" count={captures.filter((c) => c.consent === 'Pending').length}>
            Sourced profiles
          </TabsTrigger>
          <TabsTrigger value="postings">Job-board postings</TabsTrigger>
        </TabsList>
        <TabsContent value="pools">
          <DataTable
            label="Pools and hotlists"
            columns={poolCols}
            rows={pools}
            getRowId={(r) => r.id}
            onRowClick={() => {}}
            rowActions={() => (
              <>
                <MenuItem>Start a sequence</MenuItem>
                <MenuItem>Edit saved search</MenuItem>
                <MenuItem destructive>Delete pool</MenuItem>
              </>
            )}
            empty={<EmptyState title="No pools yet." description="Create a pool from a saved search, past applicants or sourced profiles." action={<Button variant="primary" icon={Plus}>New pool</Button>} />}
          />
        </TabsContent>
        <TabsContent value="campaigns">
          <div className="yx-hire-cols">
            <Card title="Java 2027 nurture · sequence" actions={<Badge tone="success">Running</Badge>}>
              <SequenceSteps steps={steps} />
              <SummaryTiles
                label="Sequence results"
                tiles={[
                  { label: 'Enrolled', value: 160 },
                  { label: 'Replied', value: 22 },
                  { label: 'Applied', value: 9 },
                  { label: 'Opted out', value: 4 },
                ]}
              />
            </Card>
            <Card title="Engagement · Arjun Kulkarni" actions={<ConsentBadges email="opted-in" whatsapp="opted-in" />}>
              {engagement.length ? <Timeline items={engagement} today={today} /> : <EmptyState compact title="No messages yet." />}
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="sourced">
          <div className="yx-hire-stack">
            <InlineAlert tone="info">
              Captured one at a time with the browser extension from your own session. Until the person consents, only a first message with the privacy notice is allowed: no AI scoring, ranking, campaigns or submission. With no consent in 30 days the capture is deleted.
            </InlineAlert>
            {captures.length === 0 ? (
              <EmptyState title="No sourced profiles." description="Install the sourcing extension to capture profiles you are viewing." />
            ) : (
              <ul className="yx-hire-list">
                {captures.map((c) => {
                  const left = sourcedPurgeIn(c.capturedAt, today);
                  return (
                    <li key={c.id} className="yx-hire-list__item">
                      <div className="yx-hire-list__main">
                        <PersonLabel name={c.name} secondary={`${c.headline} · ${c.site}`} />
                        <Text size="sm" tone="secondary">
                          Captured by {c.capturedBy} on {formatDate(c.capturedAt)}
                          {c.existing ? ' · already in YukthiX, merged' : ''}
                        </Text>
                      </div>
                      <Badge tone={c.consent === 'Given' ? 'success' : left <= 5 ? 'warning' : 'neutral'}>{c.consent === 'Given' ? 'Consent given' : `Pending consent · deleted in ${left} days`}</Badge>
                      <div className="yx-hire-list__actions">
                        {c.consent === 'Pending' ? <Button size="sm">Send first message</Button> : <Button size="sm">Add to pipeline</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>
        <TabsContent value="postings">
          <div className="yx-hire-stack">
            {postings.map((p) => (
              <Card key={p.job} title={p.job}>
                <PostingStrip postings={p.postings} onAction={() => {}} />
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <Drawer
        open={builder}
        onOpenChange={setBuilder}
        size="lg"
        title="New nurture sequence"
        subtitle="Audience: Java 2027 campus (dynamic pool)"
        footer={
          <>
            <Button onClick={() => setBuilder(false)}>Cancel</Button>
            <Button>Save draft</Button>
            <Button variant="primary" disabled={audience.enrolled.length === 0}>
              Start for {audience.enrolled.length} people
            </Button>
          </>
        }
      >
        <div className="yx-hire-sheet">
          <div className="yx-hire-sheet__form">
            <FormField label="Name" required>
              <TextField defaultValue="Java 2027 nurture" />
            </FormField>
            <FormField label="Channel" required>
              <RadioGroup aria-label="Channel" orientation="horizontal" value={channel} onChange={(v) => setChannel(v as Channel)} options={[{ value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp (approved templates)' }]} />
            </FormField>
            <SequenceSteps steps={steps} editable />
            <FormField label="Stop when the candidate" helper="Always stops on opt-out, hire and retention end">
              <div className="yx-hire-stack">
                <Checkbox label="Replies" defaultChecked />
                <Checkbox label="Applies to a job" defaultChecked />
              </div>
            </FormField>
          </div>
          <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="Audience">
            <Text weight="semibold">Who gets it</Text>
            <Text>
              {audience.enrolled.length} of {members.length} enrolled
            </Text>
            <ul className="yx-hire-plainlist">
              <li>{audience.skipped.noConsent} without {channel === 'email' ? 'email' : 'WhatsApp'} opt-in</li>
              <li>{audience.skipped.optedOut} opted out</li>
              <li>{audience.skipped.pendingConsent} sourced, pending consent</li>
              <li>{audience.skipped.minor} under 18, never enrolled</li>
            </ul>
            <Text size="sm" tone="secondary">
              Quiet hours 9 pm – 9 am. WhatsApp message charges are billed as an add-on.
            </Text>
          </aside>
        </div>
      </Drawer>
    </HireFrame>
  );
}

function SequenceSteps({ steps, editable }: { steps: SequenceStep[]; editable?: boolean }) {
  return (
    <ol className="yx-hire-seq" aria-label="Sequence steps">
      {steps.map((s, i) => (
        <li key={s.id} className="yx-hire-seq__step" data-kind={s.kind}>
          <Text size="sm" weight="semibold">
            Step {i + 1}
          </Text>
          <Text size="sm">{s.kind === 'wait' ? `Wait ${s.days} days` : `${s.channel === 'email' ? 'Email' : 'WhatsApp'}: ${s.template}`}</Text>
        </li>
      ))}
      {editable && (
        <li>
          <Button size="sm" icon={Plus}>
            Add step
          </Button>
        </li>
      )}
    </ol>
  );
}

/* ================================================================== HIR-23 · Bias audit record */

export interface BiasAuditProps {
  feature: string;
  nycOn: boolean;
  lastAudit: Date | null;
  auditor: string | null;
  summaryUrl: string | null;
  sex: AuditCategory[];
  race: AuditCategory[];
  today: Date;
  recordOpen?: boolean;
}

function RatioTable({ title, cats }: { title: string; cats: AuditCategory[] }) {
  const rows = impactRatios(cats);
  return (
    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
    <table className="yx-hire-ctc">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Assessed</th>
          <th scope="col">Selected</th>
          <th scope="col">Selection rate</th>
          <th scope="col">Impact ratio</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">
              {r.label} {r.small && <Badge tone="warning">Small category</Badge>}
            </th>
            <td>{r.assessed.toLocaleString('en-IN')}</td>
            <td>{r.selected.toLocaleString('en-IN')}</td>
            <td>{r.rate}%</td>
            <td>
              {r.ratio.toFixed(2)} {r.ratio < 0.8 && <Badge tone="warning">Below 0.80</Badge>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

// HIR-23
export function BiasAuditScreen({ feature, nycOn, lastAudit, auditor, summaryUrl, sex, race, today, recordOpen = false }: BiasAuditProps) {
  const [open, setOpen] = useState(recordOpen);
  const expired = auditExpired(lastAudit, today);
  if (!nycOn)
    return (
      <HireFrame active="Bias audits">
        <PageHeader title="Bias audits" />
        <EmptyState title="Bias audits aren't needed for your company." description="They apply when AI-scored hiring is used for New York City jobs. Switch on the NYC setting in Settings › Hiring if you hire there." />
      </HireFrame>
    );
  return (
    <HireFrame active="Bias audits">
      <RecordLayout
        banner={
          expired ? (
            <InlineAlert tone="danger" title={`${feature} is blocked for New York City jobs`}>
              {lastAudit ? `The last audit was on ${formatDate(lastAudit)}, more than a year ago.` : 'No audit is recorded.'} Record a new independent audit to use it again. Other jobs are not affected.
            </InlineAlert>
          ) : undefined
        }
        header={
          <ObjectHeader
            name={`Bias audit · ${feature}`}
            icon={Scale}
            secondary="NYC Local Law 144 · data 1 Oct 2025 – 30 Sep 2026 · no candidate identities"
            status={<Badge tone={expired ? 'danger' : 'success'}>{expired ? 'Audit overdue' : 'Audit valid'}</Badge>}
            facts={[
              { label: 'Last audit', value: lastAudit ? formatDate(lastAudit) : 'None' },
              { label: 'Independent auditor', value: auditor ?? '—' },
              { label: 'Valid until', value: lastAudit ? formatDate(new Date(lastAudit.getFullYear() + 1, lastAudit.getMonth(), lastAudit.getDate())) : '—' },
              { label: 'Published summary', value: summaryUrl ?? 'Not published' },
            ]}
            actions={
              <>
                <Button icon={ExternalLink}>Download export</Button>
                <Button variant="primary" onClick={() => setOpen(true)}>
                  Record audit
                </Button>
              </>
            }
          />
        }
        aside={
          <Card title="Auditor access">
            <Text as="p" size="sm">
              Read-only access to this export and the model card, time-boxed.
            </Text>
            <DescriptionList items={[{ label: 'Access', value: auditor ? `${auditor} · until 31 Oct 2026` : 'Not granted' }]} />
            <Button size="sm">Grant access</Button>
          </Card>
        }
      >
        <div className="yx-hire-chips">
          <AiBadge />
          <Text size="sm" tone="secondary">
            Selection rate = selected ÷ assessed. Impact ratio = category rate ÷ highest category rate.
          </Text>
        </div>
        <RatioTable title="By sex" cats={sex} />
        <RatioTable title="By race / ethnicity" cats={race} />
      </RecordLayout>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Record independent audit"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary">Save audit</Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          <FormField label="Audit date" required>
            <DatePicker value={null} onChange={() => {}} max={today} />
          </FormField>
          <FormField label="Independent auditor" required>
            <TextField placeholder="Firm or person" />
          </FormField>
          <FormField label="Published summary URL" required helper="The public page with the audit summary">
            <TextField type="url" placeholder="https://" />
          </FormField>
          <FormField label="Note" optional>
            <TextArea rows={3} />
          </FormField>
        </div>
      </Drawer>
    </HireFrame>
  );
}
