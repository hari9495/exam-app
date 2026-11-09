// Hiring › Offers (builder, record, conditions, bulk), BGV tracker, talent CRM, bias audit.
// HIR-09, HIR-29, HIR-28, HIR-10, HIR-20, HIR-23 (M10 Q3 / Q5, YX-ATS-06 / 07 / 08 / 14 / 17 / 20 / 21 / 22 / 23 / 40 / 41, T05 YX-EVAL-32).
import { useState } from 'react';
import { ExternalLink, FileText, Plus, Scale, Send, UserPlus } from 'lucide-react';
import { Button } from '../../components/button';
import { AiBadge, Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { Stepper } from '../../components/stepper';
import { Segment } from '../../components/segment';
import { FileUpload } from '../../components/upload';
import { useToastIfAny } from '../../components/notify';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { ApprovalTimeline, Timeline, type ApprovalStep, type TimelineItem } from '../../components/timeline';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { STAGE } from './candidate-dialogs';
import type { GlobalStage } from './live/types';
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
import { POOL_MEMBERS, type Pool } from './hiring-data';
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

export type CheckState = 'Clear' | 'In progress' | 'Discrepancy' | 'Not started' | 'Insufficient' | 'Not added';
export type BgvCheckKey = 'Identity' | 'Address' | 'Education' | 'Employment' | 'Criminal';
export interface BgvRow {
  id: string;
  candidate: string;
  job: string;
  package: string;
  consent: 'Given' | 'Pending' | 'Withdrawn' | 'Not asked';
  started: Date | null;
  checks: Record<BgvCheckKey, CheckState>;
  mode: 'Partner' | 'Manual';
}
const CHECK_TONE: Record<CheckState, BadgeTone> = { Clear: 'success', 'In progress': 'info', Discrepancy: 'warning', 'Not started': 'neutral', Insufficient: 'warning', 'Not added': 'neutral' };
const CONSENT_TONE: Record<BgvRow['consent'], BadgeTone> = { Given: 'success', Pending: 'warning', Withdrawn: 'danger', 'Not asked': 'neutral' };
const BGV_KEYS: BgvCheckKey[] = ['Identity', 'Address', 'Education', 'Employment', 'Criminal'];
const overall = (r: BgvRow): CheckState => {
  const v = Object.values(r.checks).filter((c) => c !== 'Not added');
  if (!v.length) return 'Not started';
  if (v.includes('Discrepancy')) return 'Discrepancy';
  if (v.includes('Insufficient')) return 'Insufficient';
  if (v.every((c) => c === 'Clear')) return 'Clear';
  if (v.every((c) => c === 'Not started')) return 'Not started';
  return 'In progress';
};

/** One check as GET lifecycle/bgv returns it (manual tracking on the joiner, People onboarding's store). */
export interface LiveBgvCheck {
  id: string;
  checkType: 'identity' | 'address' | 'education' | 'employment' | 'criminal' | 'reference' | 'credit';
  status: 'requested' | 'in_progress' | 'clear' | 'discrepancy' | 'unable' | 'cancelled';
  gate: 'none' | 'before_joining' | 'before_confirmation';
  note: string | null;
  addedAt: string;
  addedBy: string | null;
  checkedBy: string | null;
  checkedById: string | null;
  checkedOn: string | null;
  evidence: { documentId: string; version: number; fileName: string; scan: 'pending' | 'clean' | 'infected' } | null;
  decision: { decision: 'proceed' | 'stop'; note: string | null; by: string | null; at: string | null } | null;
  version: number;
}
export interface LiveBgvJoiner {
  id: string;
  journeyId: string | null;
  name: string;
  designation: string | null;
  joiningOn: string;
  status: string;
  consent: 'given' | 'pending' | 'withdrawn' | 'not_asked';
  consentAt: string | null;
  checks: LiveBgvCheck[];
}
export interface BgvResultInput {
  status: 'in_progress' | 'clear' | 'discrepancy' | 'unable';
  note: string;
  checkedOn: string;
  file: File | null;
}
/**
 * The live BGV tracker (HIR-10, founder decision 3): manual checks on joiners in the viewer's BGV scope. No BGV partner
 * is connected, so the partner-only parts stay hidden. The page shows the toasts.
 */
export interface LiveBgv {
  state: 'loading' | 'ready' | 'error' | 'denied';
  onRetry: () => void;
  joiners: LiveBgvJoiner[];
  viewerId: string | null;
  /** Company setting hiring.bgv.decider_other_person: whoever recorded a discrepancy may not decide it. */
  deciderOtherPerson: boolean;
  /** Today in India (YYYY-MM-DD): the latest day a check can be done. */
  today: string;
  onAskConsent: (j: LiveBgvJoiner) => Promise<unknown>;
  onAddCheck: (j: LiveBgvJoiner, checkType: LiveBgvCheck['checkType'], gate: 'none' | 'before_joining') => Promise<unknown>;
  onRecord: (j: LiveBgvJoiner, k: LiveBgvCheck, x: BgvResultInput) => Promise<unknown>;
  onDecide: (j: LiveBgvJoiner, k: LiveBgvCheck, x: { decision: 'proceed' | 'stop'; note: string }) => Promise<unknown>;
  onOpenReport: (k: LiveBgvCheck) => void;
  onOpenJoiner: (j: LiveBgvJoiner) => void;
  onExport?: (rows: LiveBgvJoiner[]) => void;
}

const CHECK_LABEL: Record<LiveBgvCheck['checkType'], string> = { identity: 'Identity', address: 'Address', education: 'Education', employment: 'Employment', criminal: 'Criminal', reference: 'Reference', credit: 'Credit' };
const LIVE_STATE: Record<LiveBgvCheck['status'], CheckState> = { requested: 'Not started', in_progress: 'In progress', clear: 'Clear', discrepancy: 'Discrepancy', unable: 'Insufficient', cancelled: 'Not started' };
const CONSENT_TEXT: Record<LiveBgvJoiner['consent'], BgvRow['consent']> = { given: 'Given', pending: 'Pending', withdrawn: 'Withdrawn', not_asked: 'Not asked' };

/** What the drawer shows of one check, for the drawn screen and the live one alike. */
interface ViewCheck {
  id: string;
  label: string;
  state: CheckState;
  note?: string | null;
  checkedBy?: string | null;
  checkedOn?: string | null;
  evidence?: LiveBgvCheck['evidence'];
  decision?: LiveBgvCheck['decision'];
  /** The viewer recorded this discrepancy and the company wants someone else to decide. */
  decideBlocked?: boolean;
  gate?: LiveBgvCheck['gate'];
  live?: LiveBgvCheck;
}

/** Pressed too early: focus the field after the error renders, and keep the dialog open. */
const focusLater = (focus: () => void) => {
  setTimeout(focus, 0);
  return false as const;
};

const DRAWN_DISCREPANCY = 'Employment dates at the previous employer differ by 4 months.';

function liveRow(j: LiveBgvJoiner): BgvRow {
  const checks = Object.fromEntries(BGV_KEYS.map((k) => [k, 'Not added'])) as Record<BgvCheckKey, CheckState>;
  for (const k of j.checks) if (k.status !== 'cancelled' && (BGV_KEYS as string[]).includes(CHECK_LABEL[k.checkType])) checks[CHECK_LABEL[k.checkType] as BgvCheckKey] = LIVE_STATE[k.status];
  const started = j.checks.length ? new Date(j.checks[0].addedAt) : null;
  return { id: j.id, candidate: j.name, job: j.designation ?? 'Joiner', package: `Manual · ${j.checks.filter((k) => k.status !== 'cancelled').length} ${j.checks.length === 1 ? 'check' : 'checks'}`, consent: CONSENT_TEXT[j.consent], started, checks, mode: 'Manual' };
}

export interface BgvTrackerProps {
  rows: BgvRow[];
  addOn?: boolean;
  openId?: string | null;
  state?: ListState;
  persona?: 'hr' | 'recruiter';
  /** Drawn states: the record-result dialog on this check, the decision dialog on the discrepancy, the add-check dialog. */
  recordOpen?: BgvCheckKey;
  decideOpen?: boolean;
  addOpen?: boolean;
}

// HIR-10
export function BgvTrackerScreen(props: BgvTrackerProps | { live: LiveBgv }) {
  if ('live' in props) return <LiveBgvTracker live={props.live} />;
  const { rows, addOn = true, openId = null, state = 'ready', persona = 'hr', recordOpen, decideOpen, addOpen } = props;
  return (
    <BgvTrackerBody
      rows={rows}
      addOn={addOn}
      openId={openId}
      state={state}
      persona={persona}
      checksOf={(r) =>
        Object.entries(r.checks).map(([k, v]) => ({ id: k, label: k, state: v, note: v === 'Discrepancy' ? DRAWN_DISCREPANCY : null, checkedBy: addOn || v === 'Not started' ? null : 'Neha Joshi', checkedOn: addOn || v === 'Not started' ? null : '2026-10-05' }))
      }
      initialDialog={recordOpen ? { kind: 'record', checkId: recordOpen } : decideOpen ? { kind: 'decide', checkId: 'Employment' } : addOpen ? { kind: 'add' } : null}
    />
  );
}

type BgvDialog = { kind: 'record' | 'decide'; checkId: string } | { kind: 'add' } | null;

function LiveBgvTracker({ live }: { live: LiveBgv }) {
  if (live.state === 'denied')
    return (
      <HireFrame active="Offers & BGV">
        <PageHeader title="Background verification" />
        <NoAccessState grantedBy="HR (the background-check key)" what="background checks" />
      </HireFrame>
    );
  const rows = live.joiners.map(liveRow);
  const byId = new Map(live.joiners.map((j) => [j.id, j]));
  return (
    <BgvTrackerBody
      rows={rows}
      addOn={false}
      openId={null}
      state={live.state}
      persona="hr"
      live={live}
      byId={byId}
      checksOf={(r) =>
        (byId.get(r.id)?.checks ?? [])
          .filter((k) => k.status !== 'cancelled')
          .map((k) => ({ id: k.id, label: CHECK_LABEL[k.checkType], state: LIVE_STATE[k.status], note: k.note, checkedBy: k.checkedBy, checkedOn: k.checkedOn, evidence: k.evidence, decision: k.decision, gate: k.gate, decideBlocked: live.deciderOtherPerson && k.checkedById === live.viewerId, live: k }))
      }
      initialDialog={null}
    />
  );
}

function BgvTrackerBody({ rows, addOn, openId, state, persona, checksOf, initialDialog, live, byId }: { rows: BgvRow[]; addOn: boolean; openId: string | null; state: ListState | 'loading'; persona: 'hr' | 'recruiter'; checksOf: (r: BgvRow) => ViewCheck[]; initialDialog: BgvDialog; live?: LiveBgv; byId?: Map<string, LiveBgvJoiner> }) {
  const toast = useToastIfAny();
  const [open, setOpen] = useState<string | null>(openId);
  const [dialog, setDialog] = useState<BgvDialog>(initialDialog);
  const [asking, setAsking] = useState<string | null>(null);
  const cur = rows.find((r) => r.id === open);
  const joiner = cur ? byId?.get(cur.id) : undefined;
  const checks = cur ? checksOf(cur) : [];
  const list = useListControls({
    rows,
    fields: [{ key: 'overall', label: 'Result', type: 'multi', options: ['Clear', 'In progress', 'Discrepancy', 'Not started', 'Insufficient'].map((v) => ({ value: v, label: v })) }],
    text: (r) => `${r.candidate} ${r.job}`,
    fieldValue: (r) => overall(r),
    views: [{ id: 'open', name: 'In progress' }],
  });
  const cols: TableColumn<BgvRow>[] = [
    { key: 'candidate', header: live ? 'Joiner' : 'Candidate', type: 'person', value: (r) => r.candidate, person: (r) => ({ name: r.candidate, secondary: r.job }) },
    { key: 'package', header: 'Package', value: (r) => r.package },
    { key: 'consent', header: 'Consent', type: 'status', value: (r) => r.consent, statusTone: (v) => CONSENT_TONE[v as BgvRow['consent']] },
    ...BGV_KEYS.map<TableColumn<BgvRow>>((k) => ({ key: k, header: k, type: 'status', value: (r) => r.checks[k], statusTone: (v) => CHECK_TONE[v as CheckState] })),
    { key: 'overall', header: 'Result', type: 'status', value: overall, statusTone: (v) => CHECK_TONE[v as CheckState] },
    { key: 'started', header: 'Started', type: 'date', value: (r) => r.started },
  ];
  const ask = (r: BgvRow) => {
    const j = byId?.get(r.id);
    if (!live || !j) return;
    setAsking(r.id);
    live.onAskConsent(j).then(
      () => void toast?.toast({ tone: 'success', title: `Consent asked of ${j.name}`, description: 'They give it in the joining portal.' }),
      (e: unknown) => void toast?.toast({ tone: 'error', title: 'Not sent', description: e instanceof Error ? e.message : 'Try again.' }),
    ).finally(() => setAsking(null));
  };
  const curCheck = dialog && dialog.kind !== 'add' ? checks.find((k) => k.id === dialog.checkId) : undefined;
  const discrepancies = checks.filter((k) => k.state === 'Discrepancy');
  return (
    <HireFrame active="Offers & BGV">
      <PageHeader
        title="Background verification"
        description={addOn ? 'Checks run by the BGV partner after the candidate consents. Reports stay in the document vault; only HR and recruiters in scope see results.' : live ? 'Manual tracking: no BGV partner is connected. Record each check, who checked it and the report. Only HR with the background-check key sees this page.' : 'Manual tracking: your company has no BGV partner add-on. Record each check and upload the report.'}
        actions={live ? undefined : <Button variant="primary" icon={Plus}>{addOn ? 'Start BGV' : 'Add manual check'}</Button>}
      />
      {!addOn && (
        <InlineAlert tone="info" title={live ? 'No BGV partner' : 'Manual BGV'}>
          {live ? 'Ordering checks from a BGV partner and the candidate ID and selfie check come when a partner is contracted. A discrepancy always goes to a person; nothing is withdrawn automatically.' : 'Enable the partner integration in Settings › Hiring to order checks and get status updates automatically.'}
        </InlineAlert>
      )}
      <DataTable
        label="Background verification"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={live?.onRetry ?? (() => {})}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
        rowButtons={(r) =>
          r.consent === 'Pending' || r.consent === 'Not asked' ? (
            <Button size="sm" loading={asking === r.id} onClick={() => ask(r)}>
              {r.consent === 'Pending' ? 'Resend consent link' : 'Ask for consent'}
            </Button>
          ) : null
        }
        empty={<EmptyState title="No background checks yet." description={live ? 'Ask a joiner for consent from their onboarding page in People; their checks show here.' : 'Checks start after an offer is accepted and the candidate consents.'} />}
        onExport={live?.onExport ? () => live.onExport!(list.rows.map((r) => byId!.get(r.id)!)) : () => {}}
      />
      {cur && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          size="lg"
          title={`BGV · ${cur.candidate}`}
          subtitle={`${cur.job} · ${cur.package} · ${cur.mode === 'Partner' ? 'partner' : 'manual'}${joiner ? ` · joins ${formatDate(new Date(`${joiner.joiningOn}T00:00:00`))}` : ''}`}
          footer={
            <>
              {joiner && <Button onClick={() => live!.onOpenJoiner(joiner)}>Open onboarding</Button>}
              {(!addOn && (live ? cur.consent === 'Given' : true)) && (
                <Button variant="primary" icon={Plus} onClick={() => setDialog({ kind: 'add' })}>
                  Add manual check
                </Button>
              )}
              <Button onClick={() => setOpen(null)}>Close</Button>
            </>
          }
        >
          <div className="yx-hire-stack">
            {cur.consent === 'Pending' && <InlineAlert tone="warning" title="Waiting for the candidate's consent">No check starts until the candidate gives explicit consent.</InlineAlert>}
            {cur.consent === 'Not asked' && <InlineAlert tone="info" title="Consent not asked yet">Ask the joiner for consent first; they give it in the joining portal.</InlineAlert>}
            {cur.consent === 'Withdrawn' && <InlineAlert tone="danger" title="Consent withdrawn">The joiner withdrew consent, so open checks stopped. Results already recorded stay.</InlineAlert>}
            {discrepancies.filter((k) => !k.decision).map((k) => (
              <InlineAlert key={k.id} tone="warning" title={`Discrepancy to review · ${k.label}`}>
                {k.note || 'See the report.'} Discuss with the candidate; a person decides and the offer is never withdrawn automatically.
              </InlineAlert>
            ))}
            {checks.length === 0 ? (
              <EmptyState compact title="No checks added yet." description={cur.consent === 'Given' ? 'Add the checks you will run, then record each result.' : 'Checks can be added once the joiner consents.'} />
            ) : (
              <ul className="yx-hire-list" aria-label="Checks">
                {checks.map((k) => (
                  <li key={k.id} className="yx-hire-list__item">
                    <div className="yx-hire-list__main">
                      <Text weight="medium">{k.label}</Text>
                      {(k.checkedBy || k.checkedOn) && (
                        <Text size="sm" tone="secondary">
                          {[k.checkedBy && `Checked by ${k.checkedBy}`, k.checkedOn && `on ${formatDate(new Date(`${k.checkedOn}T00:00:00`))}`].filter(Boolean).join(' ')}
                          {k.gate === 'before_joining' ? ' · must be clear before joining' : ''}
                        </Text>
                      )}
                      {k.note && k.state !== 'Discrepancy' && <Text size="sm">{k.note}</Text>}
                      {k.decision && (
                        <Text size="sm">
                          Decided: {k.decision.decision === 'proceed' ? 'proceed' : 'do not proceed'}
                          {k.decision.by ? ` by ${k.decision.by}` : ''}
                          {k.decision.at ? ` on ${formatDate(new Date(k.decision.at))}` : ''}
                          {k.decision.note ? ` · ${k.decision.note}` : ''}
                        </Text>
                      )}
                      {k.state === 'Discrepancy' && !k.decision && k.decideBlocked && (
                        <Text size="sm" tone="secondary">
                          You recorded this discrepancy, so another person with the background-check key decides it (company setting).
                        </Text>
                      )}
                    </div>
                    <Badge tone={CHECK_TONE[k.state]}>{k.state}</Badge>
                    <div className="yx-hire-list__actions">
                      {persona === 'hr' && k.evidence?.scan === 'pending' && <Badge tone="info">Report being virus-checked</Badge>}
                      {persona === 'hr' && k.evidence?.scan === 'infected' && <Badge tone="danger">Report failed the virus check</Badge>}
                      {persona === 'hr' && (live ? k.evidence?.scan === 'clean' : k.state !== 'Not started' && k.state !== 'Not added') && (
                        <Button size="sm" onClick={() => k.live && live?.onOpenReport(k.live)}>
                          View report
                        </Button>
                      )}
                      {!addOn && persona === 'hr' && k.state !== 'Not added' && cur.consent !== 'Withdrawn' && (
                        <Button size="sm" onClick={() => setDialog({ kind: 'record', checkId: k.id })}>
                          Record result
                        </Button>
                      )}
                      {!addOn && persona === 'hr' && k.state === 'Discrepancy' && !k.decision && !k.decideBlocked && (
                        <Button size="sm" variant="primary" onClick={() => setDialog({ kind: 'decide', checkId: k.id })}>
                          Decide
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Drawer>
      )}
      {cur && dialog?.kind === 'record' && curCheck && (
        <BgvRecordDialog
          label={curCheck.label}
          who={cur.candidate}
          today={live?.today ?? '2026-10-05'}
          start={curCheck.live?.status && curCheck.live.status !== 'requested' ? (curCheck.live.status as BgvResultInput['status']) : null}
          onClose={() => setDialog(null)}
          onSave={async (x) => {
            if (live && joiner && curCheck.live) await live.onRecord(joiner, curCheck.live, x);
            toast?.toast({ tone: 'success', title: `${curCheck.label} result saved for ${cur.candidate}` });
          }}
        />
      )}
      {cur && dialog?.kind === 'decide' && curCheck && (
        <BgvDecideDialog
          label={curCheck.label}
          who={cur.candidate}
          note={curCheck.note ?? null}
          onClose={() => setDialog(null)}
          onSave={async (x) => {
            if (live && joiner && curCheck.live) await live.onDecide(joiner, curCheck.live, x);
            toast?.toast({ tone: 'success', title: x.decision === 'proceed' ? `${cur.candidate}: proceed recorded` : `${cur.candidate}: do not proceed recorded`, description: x.decision === 'stop' ? 'Nothing was withdrawn. Cancel the joining from their onboarding page if the company decides so.' : undefined });
          }}
        />
      )}
      {cur && dialog?.kind === 'add' && (
        <BgvAddDialog
          who={cur.candidate}
          onClose={() => setDialog(null)}
          onSave={async (type, gate) => {
            if (live && joiner) await live.onAddCheck(joiner, type, gate);
            toast?.toast({ tone: 'success', title: `${CHECK_LABEL[type]} check added for ${cur.candidate}` });
          }}
        />
      )}
    </HireFrame>
  );
}

const RESULTS: { value: BgvResultInput['status']; label: string }[] = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'clear', label: 'Clear' },
  { value: 'discrepancy', label: 'Discrepancy' },
  { value: 'unable', label: 'Could not check' },
];

function BgvRecordDialog({ label, who, today, start, onClose, onSave }: { label: string; who: string; today: string; start: BgvResultInput['status'] | null; onClose: () => void; onSave: (x: BgvResultInput) => Promise<void> }) {
  const [status, setStatus] = useState<BgvResultInput['status'] | null>(start);
  const [note, setNote] = useState('');
  const [day, setDay] = useState<Date | null>(new Date(`${today}T00:00:00`));
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayError = !day ? 'Give the day the check was done.' : iso(day) > today ? 'The day cannot be in the future.' : null;
  const noteError = status === 'discrepancy' && !note.trim() ? 'Say what differs, for the person who decides.' : null;
  return (
    <ConfirmDialog
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={`Record the ${label.toLowerCase()} check · ${who}`}
      consequence="You are recorded as the person who checked it. A discrepancy goes to a person to decide."
      confirmLabel="Save result"
      onConfirm={async () => {
        setTried(true);
        if (!status) return focusLater(() => document.getElementById('bgv-result')?.querySelector<HTMLElement>('[role="radio"]')?.focus());
        if (dayError || noteError) return focusLater(() => document.getElementById(dayError ? 'bgv-day' : 'bgv-note')?.focus());
        await onSave({ status, note: note.trim(), checkedOn: iso(day!), file });
      }}
    >
      <FormField id="bgv-result" label="Result" required error={tried && !status ? 'Choose the result.' : null}>
        <Segment label="Result" value={status} onChange={(v) => setStatus(v as BgvResultInput['status'])} options={RESULTS} />
      </FormField>
      <FormField id="bgv-day" label="Day the check was done" required error={tried ? dayError : null}>
        <DatePicker value={day} onChange={setDay} />
      </FormField>
      <FormField id="bgv-note" label="What was checked and found" optional={status !== 'discrepancy'} required={status === 'discrepancy'} error={tried ? noteError : null}>
        <TextArea value={note} onChange={setNote} rows={3} maxLength={1000} placeholder="For example: called the previous employer's HR; dates confirmed." />
      </FormField>
      <FormField id="bgv-file" label="Evidence (report)" optional helper="PDF, JPG or PNG up to 10 MB. Virus-checked after saving; kept as Special data.">
        <FileUpload id="bgv-file" upload={async (f) => setFile(f)} accept={['.pdf', '.jpg', '.jpeg', '.png']} multiple={false} onItemsChange={(items) => items.length === 0 && setFile(null)} />
      </FormField>
    </ConfirmDialog>
  );
}

function BgvDecideDialog({ label, who, note, onClose, onSave }: { label: string; who: string; note: string | null; onClose: () => void; onSave: (x: { decision: 'proceed' | 'stop'; note: string }) => Promise<void> }) {
  const [decision, setDecision] = useState<'proceed' | 'stop' | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const reasonError = reason.trim().length < 3 ? 'Give the reason for the decision.' : null;
  return (
    <ConfirmDialog
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={`Decide the ${label.toLowerCase()} discrepancy · ${who}`}
      consequence="Your decision and reason are recorded and audited. Nothing is withdrawn automatically: to stop the joining, cancel it from the onboarding page."
      confirmLabel="Record decision"
      onConfirm={async () => {
        setTried(true);
        if (!decision) return focusLater(() => document.getElementById('bgv-decision')?.querySelector<HTMLElement>('[role="radio"]')?.focus());
        if (reasonError) return focusLater(() => document.getElementById('bgv-reason')?.focus());
        await onSave({ decision, note: reason.trim() });
      }}
    >
      {note && <InlineAlert tone="warning" title="What was found">{note}</InlineAlert>}
      <FormField id="bgv-decision" label="Decision" required error={tried && !decision ? 'Choose proceed or do not proceed.' : null}>
        <Segment label="Decision" value={decision} onChange={(v) => setDecision(v as 'proceed' | 'stop')} options={[{ value: 'proceed', label: 'Proceed' }, { value: 'stop', label: 'Do not proceed' }]} />
      </FormField>
      <FormField id="bgv-reason" label="Reason" required error={tried ? reasonError : null}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={1000} placeholder="For example: a career break the candidate explained and showed proof of." />
      </FormField>
    </ConfirmDialog>
  );
}

const ADD_CHECKS: { value: LiveBgvCheck['checkType']; label: string }[] = (['employment', 'education', 'address', 'criminal', 'identity', 'reference', 'credit'] as const).map((v) => ({ value: v, label: CHECK_LABEL[v] }));

function BgvAddDialog({ who, onClose, onSave }: { who: string; onClose: () => void; onSave: (type: LiveBgvCheck['checkType'], gate: 'none' | 'before_joining') => Promise<void> }) {
  const [type, setType] = useState<LiveBgvCheck['checkType'] | null>(null);
  const [gate, setGate] = useState<'none' | 'before_joining'>('none');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={`Add a manual check · ${who}`}
      confirmLabel="Add check"
      onConfirm={async () => {
        setTried(true);
        if (!type) return focusLater(() => document.querySelector<HTMLElement>('#bgv-type button, #bgv-type [role="combobox"]')?.focus());
        await onSave(type, gate);
      }}
    >
      <FormField id="bgv-type" label="What to check" required error={tried && !type ? 'Choose what to check.' : null}>
        <Select aria-label="What to check" value={type} onChange={(v) => setType(v as LiveBgvCheck['checkType'])} options={ADD_CHECKS} />
      </FormField>
      <FormField id="bgv-gate" label="Joining">
        <Segment label="Joining" value={gate} onChange={(v) => setGate(v as 'none' | 'before_joining')} options={[{ value: 'none', label: 'Can join before the result' }, { value: 'before_joining', label: 'Must be clear or decided first' }]} />
      </FormField>
    </ConfirmDialog>
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
  /** Drawn states (HIR-20 build): a pool's members drawer, the new-pool dialog. */
  membersOpen?: string;
  newPoolOpen?: boolean;
}

/** One pool or hotlist as GET hiring/pools returns it (HIR-20 live). */
export interface LivePool {
  id: string;
  name: string;
  kind: 'pool' | 'hotlist';
  description: string | null;
  members: number;
  /** Members whose talent-pool consent is current (a pool holds only them; a hotlist needs none). */
  consented: number;
  ownerName: string | null;
  updatedAt: string;
}
export interface LivePoolMember {
  candidateId: string;
  addedAt: string;
  consent: 'given' | 'none';
  candidate: { id: string; name: string; email: string; globalStage: GlobalStage } | null;
}
export interface LivePostingJob {
  jobId: string;
  title: string;
  status: string;
  postings: (Posting & { boardId: string })[];
}
/**
 * The live Talent CRM (HIR-20): pools and hotlists with their members and consent, and each job's board postings.
 * Campaigns, sequences and sourced profiles are not built (gaps), so their tabs and buttons stay hidden. The page shows
 * the toasts for posting; the CRM shows its own for pools.
 */
export interface LiveTalentCrm {
  state: 'loading' | 'ready' | 'error' | 'denied';
  onRetry: () => void;
  pools: LivePool[];
  /** candidate:manage, signed in as themselves: create and archive lists, remove members. */
  canManage: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  members: { state: 'loading' | 'ready' | 'error'; rows: LivePoolMember[] };
  onCreate: (input: { name: string; kind: 'pool' | 'hotlist'; description: string | null }) => Promise<unknown>;
  onArchive: (pool: LivePool) => Promise<unknown>;
  onRemove: (pool: LivePool, candidateId: string) => Promise<unknown>;
  onOpenCandidate: (candidateId: string) => void;
  postings: { state: 'loading' | 'ready' | 'error'; jobs: LivePostingJob[] };
  /** pipeline:manage: post, refresh and close postings (the same change as the job workspace). */
  canPost: boolean;
  onPosting: (job: LivePostingJob, posting: LivePostingJob['postings'][number], action: 'post' | 'refresh' | 'close') => Promise<unknown>;
  defaultTab?: 'pools' | 'postings';
}

/** One member row, for the drawn screen and the live one alike. */
interface MemberView {
  id: string;
  name: string;
  email: string;
  stage: GlobalStage;
  consent: 'given' | 'none';
  added: Date;
}

function PoolMembersDrawer({ pool, kind, rows, state, canManage, onClose, onOpen, onRemove }: { pool: { name: string; purpose: string | null }; kind: 'pool' | 'hotlist'; rows: MemberView[]; state: 'loading' | 'ready' | 'error'; canManage: boolean; onClose: () => void; onOpen: (id: string) => void; onRemove: (m: MemberView) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [removing, setRemoving] = useState<MemberView | null>(null);
  const cols: TableColumn<MemberView>[] = [
    { key: 'name', header: 'Candidate', type: 'person', value: (m) => m.name, person: (m) => ({ name: m.name, secondary: m.email }) },
    { key: 'stage', header: 'Stage', type: 'status', value: (m) => STAGE[m.stage].label, statusTone: (v) => Object.values(STAGE).find((s) => s.label === v)?.tone ?? 'neutral' },
    { key: 'consent', header: 'Talent-pool consent', type: 'status', value: (m) => (m.consent === 'given' ? 'Given' : 'Not given'), statusTone: (v) => (v === 'Given' ? 'success' : 'neutral') },
    { key: 'added', header: 'Added', type: 'date', value: (m) => m.added },
  ];
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="lg" title={pool.name} subtitle={kind === 'pool' ? 'Talent pool · only people who agreed to be kept for other roles' : 'Hotlist · a short list for a current need'} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="yx-hire-stack">
        {pool.purpose && <Text as="p" tone="secondary">{pool.purpose}</Text>}
        <InlineAlert tone="info">
          Add people from the candidate list. Withdrawing consent takes a person out of every talent pool at once; being on a list never extends how long details are kept.
        </InlineAlert>
        <DataTable
          label={`${pool.name} members`}
          columns={cols}
          rows={rows}
          getRowId={(m) => m.id}
          state={state}
          rowNoun={['person', 'people']}
          empty={<EmptyState compact title="Nobody on this list yet." description="Add people from the candidate list." />}
          rowButtons={(m) => (
            <>
              <Button size="sm" onClick={() => onOpen(m.id)}>
                Open
              </Button>
              {canManage && (
                <Button size="sm" onClick={() => setRemoving(m)}>
                  Remove
                </Button>
              )}
            </>
          )}
        />
      </div>
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`Remove ${removing.name} from ${pool.name}?`}
          consequence="Only the list changes. The candidate, their applications and their consent stay as they are."
          confirmLabel="Remove from list"
          onConfirm={async () => {
            await onRemove(removing);
            toast?.toast({ tone: 'success', title: `${removing.name} removed from ${pool.name}` });
            setRemoving(null);
          }}
        />
      )}
    </Drawer>
  );
}

function NewPoolDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (input: { name: string; kind: 'pool' | 'hotlist'; description: string | null }) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'pool' | 'hotlist'>('pool');
  const [description, setDescription] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New pool or hotlist"
      consequence="A talent pool takes only people who agreed to be kept for other roles. A hotlist is a short list for a current need."
      confirmLabel="Create"
      onConfirm={async () => {
        setTried(true);
        if (!name.trim()) {
          setTimeout(() => document.getElementById('crm-name')?.focus(), 0);
          return false;
        }
        await onCreate({ name: name.trim(), kind, description: description.trim() || null });
        toast?.toast({ tone: 'success', title: `${name.trim()} created` });
        onClose();
      }}
    >
      <FormField id="crm-kind" label="Type">
        <Segment label="Type" value={kind} onChange={(v) => setKind(v as 'pool' | 'hotlist')} options={[{ value: 'pool', label: 'Talent pool' }, { value: 'hotlist', label: 'Hotlist' }]} />
      </FormField>
      <FormField id="crm-name" label="Name" required error={tried && !name.trim() ? 'Enter the name.' : null}>
        <TextField value={name} onChange={setName} maxLength={120} placeholder="For example: QA silver medallists" />
      </FormField>
      <FormField id="crm-purpose" label="Purpose" optional>
        <TextField value={description} onChange={setDescription} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

const DRAWN_MEMBERS = (today: Date): MemberView[] =>
  POOL_MEMBERS.filter((m) => !m.minor).map((m, i) => ({ id: m.id, name: m.name, email: `${m.name.split(' ')[0].toLowerCase()}@mail.test`, stage: i % 3 === 0 ? 'available' : 'rejected', consent: m.sourcedPending ? 'none' : 'given', added: new Date(today.getTime() - (i + 2) * 86_400_000) }));

function LiveTalentCrmView({ live }: { live: LiveTalentCrm }) {
  const toast = useToastIfAny();
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<LivePool | null>(null);
  if (live.state === 'denied')
    return (
      <HireFrame active="Candidates & talent CRM">
        <PageHeader title="Talent CRM" />
        <NoAccessState grantedBy="the recruiter" what="talent pools" />
      </HireFrame>
    );
  const selected = live.pools.find((p) => p.id === live.selectedId) ?? null;
  const rows: Pool[] = live.pools.map((p) => ({ id: p.id, name: p.name, kind: p.kind === 'hotlist' ? 'Hotlist' : 'Static', owner: p.ownerName ?? '—', members: p.members, emailConsent: 0, whatsappConsent: 0, purpose: p.description ?? '', updated: new Date(p.updatedAt) }));
  const consented = new Map(live.pools.map((p) => [p.id, p.consented]));
  const cols: TableColumn<Pool>[] = [
    { key: 'name', header: 'Pool', value: (r) => r.name, render: (r) => <PersonLabel name={r.name} secondary={r.purpose} /> },
    { key: 'kind', header: 'Type', type: 'status', value: (r) => (r.kind === 'Hotlist' ? 'Hotlist' : 'Talent pool'), statusTone: (v) => (v === 'Hotlist' ? 'info' : 'neutral') },
    { key: 'members', header: 'Members', type: 'number', value: (r) => r.members, total: 'sum' },
    { key: 'consented', header: 'With talent-pool consent', type: 'number', value: (r) => consented.get(r.id) ?? 0 },
    { key: 'owner', header: 'Owner', type: 'person', value: (r) => r.owner, person: (r) => ({ name: r.owner }) },
    { key: 'updated', header: 'Updated', type: 'date', value: (r) => r.updated },
  ];
  const post = (job: LivePostingJob, board: string, action: 'post' | 'refresh' | 'close') => {
    const p = job.postings.find((x) => x.board === board);
    if (!p) return;
    live.onPosting(job, p, action).then(
      () => void toast?.toast({ tone: 'success', title: action === 'close' ? `${board} posting closed for ${job.title}` : action === 'refresh' ? `${board} posting refreshed for ${job.title}` : `${job.title} posted to ${board}` }),
      (e: unknown) => void toast?.toast({ tone: 'error', title: `${board}: that did not work`, description: e instanceof Error ? e.message : 'Try again.' }),
    );
  };
  return (
    <HireFrame active="Candidates & talent CRM">
      <PageHeader
        title="Talent CRM"
        description="Pools and hotlists of past candidates, and where each job is posted. A talent pool holds only people who agreed to be kept for other roles; withdrawing consent takes them out at once."
        actions={
          live.canManage ? (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New pool
            </Button>
          ) : undefined
        }
      />
      <Tabs defaultValue={live.defaultTab ?? 'pools'}>
        <TabsList aria-label="Talent CRM sections">
          <TabsTrigger value="pools" count={live.pools.length}>
            Pools & hotlists
          </TabsTrigger>
          <TabsTrigger value="postings">Job-board postings</TabsTrigger>
        </TabsList>
        <TabsContent value="pools">
          <DataTable
            label="Pools and hotlists"
            columns={cols}
            rows={rows}
            getRowId={(r) => r.id}
            state={live.state}
            onRetry={live.onRetry}
            rowNoun={['list', 'lists']}
            activeRowId={live.selectedId}
            onRowClick={(r) => live.onSelect(r.id)}
            rowActions={
              live.canManage
                ? (r) => (
                    <MenuItem destructive onSelect={() => setArchiving(live.pools.find((p) => p.id === r.id) ?? null)}>
                      Delete pool
                    </MenuItem>
                  )
                : undefined
            }
            empty={<EmptyState title="No pools yet." description="Create a pool, then add people to it from the candidate list." action={live.canManage ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New pool</Button> : undefined} />}
          />
        </TabsContent>
        <TabsContent value="postings">
          <div className="yx-hire-stack">
            {live.postings.state === 'loading' ? (
              <Skeleton height={160} />
            ) : live.postings.state === 'error' ? (
              <ErrorState title="Postings could not be loaded." onRetry={live.onRetry} />
            ) : live.postings.jobs.length === 0 ? (
              <EmptyState title="No open jobs." description="Open a job to post it to your job boards." />
            ) : (
              live.postings.jobs.map((j) => (
                <Card key={j.jobId} title={`${j.title}${j.status === 'on_hold' ? ' (on hold)' : j.status === 'closed' ? ' (closed)' : ''}`}>
                  {j.postings.length === 0 ? (
                    <Text as="p" tone="secondary">
                      No job boards are set up. Add them in Hiring › Job boards.
                    </Text>
                  ) : (
                    <PostingStrip postings={j.postings} onAction={live.canPost && j.status === 'open' ? (board, action) => post(j, board, action) : undefined} />
                  )}
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
      {selected && (
        <PoolMembersDrawer
          pool={{ name: selected.name, purpose: selected.description }}
          kind={selected.kind}
          rows={live.members.rows.filter((m) => m.candidate).map((m) => ({ id: m.candidateId, name: m.candidate!.name, email: m.candidate!.email, stage: m.candidate!.globalStage, consent: m.consent, added: new Date(m.addedAt) }))}
          state={live.members.state}
          canManage={live.canManage}
          onClose={() => live.onSelect(null)}
          onOpen={live.onOpenCandidate}
          onRemove={(m) => live.onRemove(selected, m.id)}
        />
      )}
      {creating && <NewPoolDialog onClose={() => setCreating(false)} onCreate={live.onCreate} />}
      {archiving && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setArchiving(null)}
          title={`Delete ${archiving.name}?`}
          consequence="The list goes from the Talent CRM. The people on it, their applications and their consent do not change."
          confirmLabel="Delete pool"
          onConfirm={async () => {
            await live.onArchive(archiving);
            toast?.toast({ tone: 'success', title: `${archiving.name} deleted` });
            setArchiving(null);
          }}
        />
      )}
    </HireFrame>
  );
}

// HIR-20
export function TalentCrmScreen(props: TalentCrmProps | { live: LiveTalentCrm }) {
  if ('live' in props) return <LiveTalentCrmView live={props.live} />;
  return <DrawnTalentCrm {...props} />;
}

function DrawnTalentCrm({ pools, members, captures, postings, steps, today, defaultTab = 'pools', builderOpen = false, engagement = [], membersOpen, newPoolOpen = false }: TalentCrmProps) {
  const [builder, setBuilder] = useState(builderOpen);
  const [openPool, setOpenPool] = useState<string | null>(membersOpen ?? null);
  const [creating, setCreating] = useState(newPoolOpen);
  const shownPool = pools.find((p) => p.id === openPool);
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
            <Button icon={Plus} onClick={() => setCreating(true)}>New pool</Button>
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
            onRowClick={(r) => setOpenPool(r.id)}
            activeRowId={openPool}
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
      {shownPool && <PoolMembersDrawer pool={{ name: shownPool.name, purpose: shownPool.purpose }} kind={shownPool.kind === 'Hotlist' ? 'hotlist' : 'pool'} rows={DRAWN_MEMBERS(today)} state="ready" canManage onClose={() => setOpenPool(null)} onOpen={() => {}} onRemove={async () => {}} />}
      {creating && <NewPoolDialog onClose={() => setCreating(false)} onCreate={async () => {}} />}
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
