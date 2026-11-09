// Hiring › Offers (builder, record, conditions, bulk), BGV tracker, talent CRM, bias audit.
// HIR-09, HIR-29, HIR-28, HIR-10, HIR-20, HIR-23 (M10 Q3 / Q5, YX-ATS-06 / 07 / 08 / 14 / 17 / 20 / 21 / 22 / 23 / 40 / 41, T05 YX-EVAL-32).
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Plus, Scale, Send, UserPlus } from 'lucide-react';
import { Button } from '../../components/button';
import { AiBadge, Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { useToastIfAny } from '../../components/notify';
import { dayKey } from '../../lib/dates';
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
import type { LiveOfferBuilder, LiveOfferRecord, OfferApiStatus, OfferDraftInput, OfferPreview } from './live/types';
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
  type CtcLine,
  type CrmMember,
  type OfferCondition,
} from './hiring-logic';
import { ConsentBadges, CtcBreakupTable, HireFrame, PostingStrip, RecordLayout, SummaryTiles, useListControls, type Posting } from './hiring-kit';
import type { Pool } from './hiring-data';
import './hiring.css';

type ListState = 'ready' | 'loading' | 'error';

/* ================================================================== HIR-09 · Offer builder */

export interface OfferBuilderProps {
  candidate?: string;
  job?: string;
  grade?: string;
  band?: Band;
  defaultCtc?: number;
  defaultVariable?: number;
  defaultJoining?: number;
  persona?: 'recruiter' | 'hr';
  /** Previous version, when this is a revision (YX-ATS-17). */
  previous?: { version: number; ctc: number; grade: string } | null;
  defaultStep?: string;
  now?: Date;
  /** Live (HIR-09): the application's facts, Pay's CTC lines, the company's route, saving and sending. */
  live?: LiveOfferBuilder;
}

const fromIso = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);
const failure = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work. Check your connection and try again.');
/** The letter's merge fields filled from the form (the server fills the same ones when it sends). */
const fillLetter = (text: string, f: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => f[k] ?? m);

// HIR-09
export function OfferBuilderScreen(p: OfferBuilderProps) {
  const { live } = p;
  if (live && (live.state !== 'ready' || !live.setup))
    return (
      <HireFrame active="Offers & BGV">
        {live.state === 'loading' ? (
          <div className="yx-hire-stack" aria-busy="true" aria-label="Loading the offer">
            <Skeleton height={64} />
            <Skeleton height={320} />
          </div>
        ) : live.state === 'error' ? (
          <ErrorState title="The offer could not be loaded." onRetry={live.onRetry} />
        ) : live.state === 'denied' ? (
          <NoAccessState grantedBy="your admin (the offer-pay key)" what="offer pay" />
        ) : (
          <EmptyState title="Not found" description="This application or offer doesn't exist in your company." />
        )}
      </HireFrame>
    );
  return <OfferBuilderForm {...p} />;
}

type BuilderField = 'tpl' | 'ctc' | 'claw' | 'start' | 'expires' | 'place' | 'letter';
const STEP_FIELDS: Record<string, BuilderField[]> = { comp: ['tpl', 'ctc', 'claw'], terms: ['start', 'expires', 'place'], letter: ['letter'], approval: [] };
const FIELD_ID: Record<BuilderField, string> = { tpl: 'ob-tpl', ctc: 'ob-ctc', claw: 'ob-claw', start: 'ob-start', expires: 'ob-exp', place: 'ob-place', letter: 'ob-letter' };

function OfferBuilderForm({ candidate: sampleCandidate = '', job: sampleJob = '', grade: sampleGrade = '', band: sampleBand = { min: 0, max: 0 }, defaultCtc = 0, defaultVariable = 0, defaultJoining = 0, persona: samplePersona = 'recruiter', previous: samplePrevious = null, defaultStep = 'comp', now, live }: OfferBuilderProps) {
  const setup = live?.setup ?? null;
  const prevIn = live?.previous?.input ?? null;
  const toast = useToastIfAny();
  const candidate = setup ? setup.candidate.name : sampleCandidate;
  const job = setup ? setup.job.title : sampleJob;
  const grade = setup ? (setup.grade?.name ?? 'no grade') : sampleGrade;
  const band = setup ? setup.band : sampleBand;
  // Live, only holders of the offer-pay key reach the builder: they see the employer costs too.
  const persona = live ? 'hr' : samplePersona;
  const previous = live ? (live.previous ? { version: live.previous.version, ctc: live.previous.ctc, grade: live.previous.grade } : null) : samplePrevious;
  const [tpl, setTpl] = useState<string | null>(live ? (prevIn?.templateVersionId ?? setup?.structures[0]?.value ?? null) : 'std');
  const [ctc, setCtc] = useState<number | null>(live ? (prevIn?.annualCtc ?? null) : defaultCtc);
  const [variable, setVariable] = useState<number | null>(live ? (prevIn?.variablePay ?? 0) : defaultVariable);
  const [joining, setJoining] = useState<number | null>(live ? (prevIn?.joiningBonus ?? 0) : defaultJoining);
  const [clawback, setClawback] = useState<number | null>(prevIn?.clawbackMonths ?? 12);
  const [kind, setKind] = useState<string>(prevIn?.letterKind ?? 'offer');
  const [metro, setMetro] = useState(true);
  const [start, setStart] = useState<Date | null>(live ? (prevIn ? fromIso(prevIn.startDate) : null) : new Date(2026, 10, 2));
  const [expires, setExpires] = useState<Date | null>(live ? (prevIn ? fromIso(prevIn.expiresAt) : null) : new Date(2026, 9, 6));
  const [place, setPlace] = useState<string | null>(live ? (prevIn?.locationId ?? setup?.job.locationId ?? setup?.locations[0]?.value ?? null) : 'maa');
  const [letter, setLetter] = useState<string | null>(live ? (prevIn?.templateId ?? setup?.letters[0]?.value ?? null) : 't1');
  const [conditions, setConditions] = useState(true);
  const [step, setStep] = useState(defaultStep);
  const [tried, setTried] = useState<Set<string>>(new Set());
  const [pv, setPv] = useState<OfferPreview | null>(null);
  const [pvError, setPvError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fixed = ctc ?? 0;
  const bonus = joining ?? 0;
  // The page passes a new `live` each render; the preview reads it through a ref so it runs only when the pay changes.
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => {
    const l = liveRef.current;
    if (!l || !tpl || !place || !(fixed > 0)) return setPv(null);
    let gone = false;
    const t = setTimeout(() => {
      l.onPreview({ templateVersionId: tpl, annualCtc: fixed, variablePay: variable ?? 0, joiningBonus: bonus, clawbackMonths: bonus > 0 ? clawback : null, locationId: place }).then(
        (r) => !gone && (setPv(r), setPvError(null)),
        (e) => !gone && (setPv(null), setPvError(failure(e))),
      );
    }, 350);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [Boolean(live), tpl, place, fixed, variable, bonus, clawback]);

  const lines: CtcLine[] = live ? (pv?.lines ?? []) : ctcBreakup(fixed, { variable: variable ?? 0, joiningBonus: bonus, metro });
  const band$ = live
    ? pv
      ? { position: pv.bandPosition, extraApproval: pv.extraApproval, text: pv.bandText }
      : { position: 'none' as const, extraApproval: false, text: band ? 'Enter the fixed CTC to check it against the grade pay range.' : 'No pay range is set for this grade.' }
    : bandCheck(fixed, band ?? { min: 0, max: 0 });
  const reapprove = previous ? revisionNeedsApproval({ ctc: previous.ctc, grade: previous.grade }, { ctc: fixed, grade }) : true;
  const version = previous ? previous.version + 1 : 1;
  const route = setup?.route ?? null;
  const steps: ApprovalStep[] = route
    ? [
        { id: 'you', label: 'You send it', status: 'done' },
        ...route.steps.map((s, i) => ({ id: `s${i}`, label: s.name, status: (i === 0 ? 'current' : 'pending') as ApprovalStep['status'], approver: s.approvers.join(', ') || 'The company admins' })),
        ...(band$.extraApproval ? [{ id: 'band', label: route.bandStep.name, status: (route.steps.length ? 'pending' : 'current') as ApprovalStep['status'], approver: route.bandStep.approvers.join(', ') || 'The company admins' }] : []),
      ]
    : [
        { id: 'rec', label: 'Recruiter', status: 'done', approver: 'Neha Joshi', at: now },
        { id: 'hr', label: 'HR business partner', status: 'current', approver: 'Lakshmi Venkatesan' },
        ...(band$.extraApproval ? [{ id: 'cfo', label: 'Out-of-range approval (CFO)', status: 'pending' as const, approver: 'Meenakshi Sundaram' }] : []),
      ];
  const needsRoute = route ? route.steps.length > 0 || band$.extraApproval : true;
  const finishLabel = live ? ((previous && !reapprove) || !needsRoute ? 'Send offer' : 'Send for approval') : band$.extraApproval || reapprove ? 'Send for approval' : 'Send offer';
  const bandBadge = <Badge tone={band$.extraApproval ? 'warning' : band$.position === 'within' ? 'success' : 'neutral'}>{band$.text}</Badge>;
  const chosenLetter = setup?.letters.find((l) => l.value === letter) ?? null;
  const place$ = setup?.locations.find((l) => l.value === place)?.label ?? 'Chennai office';
  const startText = start ? formatDate(start) : 'the joining date';
  const expiresText = expires ? formatDate(expires) : 'the expiry date';

  const errs: Record<BuilderField, string | null> = {
    tpl: live && !tpl ? 'Choose the salary structure.' : null,
    ctc: !(fixed > 0) ? 'Enter the fixed CTC.' : null,
    claw: bonus > 0 && !(clawback && clawback >= 1 && clawback <= 60) ? 'Give 1 to 60 months.' : null,
    start: !start ? 'Choose the joining date.' : null,
    expires: !expires ? 'Choose when the offer expires.' : start && dayKey(expires) > dayKey(start) ? 'The offer must expire on or before the joining date.' : null,
    place: !place ? 'Choose the work location.' : null,
    letter: live && !letter ? 'Choose the offer letter.' : null,
  };
  const err = (f: BuilderField) => ([...tried].some((s) => STEP_FIELDS[s]?.includes(f)) ? errs[f] : null);
  /** Pressed too early: the step's field errors show and the first one gets the focus (on its step). */
  const check = (ids: string[]) => {
    setTried((t) => new Set([...t, ...ids]));
    const bad = ids.find((id) => STEP_FIELDS[id]?.some((f) => errs[f]));
    if (!bad) return true;
    setStep(bad);
    const f = STEP_FIELDS[bad]!.find((x) => errs[x])!;
    setTimeout(() => document.getElementById(FIELD_ID[f])?.focus(), 50);
    return false;
  };
  const input = (): OfferDraftInput => ({ templateVersionId: tpl!, annualCtc: fixed, variablePay: variable ?? 0, joiningBonus: bonus, clawbackMonths: bonus > 0 ? clawback : null, locationId: place!, startDate: dayKey(start!), expiresAt: `${dayKey(expires!)}T23:59:00+05:30`, letterKind: kind as 'offer' | 'loi', templateId: letter && letter !== 'default' ? letter : null, addConditions: !previous && conditions });
  const act = async (fn: () => Promise<string>) => {
    if (!check(['comp', 'terms', 'letter'])) return;
    setBusy(true);
    setFailed(null);
    try {
      toast?.toast({ tone: 'success', title: await fn() });
    } catch (e) {
      setFailed(failure(e));
    } finally {
      setBusy(false);
    }
  };
  const letterFields = { candidateName: candidate, jobTitle: job, orgName: setup?.company ?? '', recruiterName: '', compensation: `a fixed CTC of ${formatINR(fixed)} a year${variable ? ` and a target variable pay of ${formatINR(variable)}` : ''}`, startDate: startText, offerExpiry: expiresText, offerLink: '(the link comes with the email)' };

  return (
    <HireFrame active="Offers & BGV">
      <PageHeader
        title={`${previous ? 'Revise offer' : 'New offer'} · ${candidate}`}
        description={band ? `${job} · ${grade} · pay range ${formatINR(band.min)} – ${formatINR(band.max)}` : `${job} · ${grade} · no pay range set`}
        status={<Badge tone="info">Version {version}</Badge>}
      />
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      {previous && (
        <InlineAlert tone={reapprove ? 'warning' : 'info'} title={`This version supersedes v${previous.version}`}>
          {reapprove
            ? `CTC changed from ${formatINR(previous.ctc)} to ${formatINR(fixed)}, so the offer goes through approval again. The v${previous.version} letter is withdrawn and can't be accepted.`
            : `CTC and grade are unchanged, so no new approval is needed. The v${previous.version} letter is withdrawn.`}
        </InlineAlert>
      )}
      <Stepper
        title="Offer"
        current={step}
        onCurrentChange={setStep}
        onContinue={(id) => (live ? check([id]) : undefined)}
        finishLabel={finishLabel}
        finishing={busy}
        onFinish={live ? () => void act(() => live.onFinish(input())) : undefined}
        review={{ description: needsRoute ? 'Check the offer before it goes for approval.' : 'Check the offer before it goes to the candidate.' }}
        onSaveAndExit={live ? () => void act(async () => (await live.onSaveDraft(input()), 'Offer saved as a draft')) : () => {}}
        steps={[
          {
            id: 'comp',
            title: 'Compensation',
            description: live ? 'From the company’s salary structure' : 'From the M03 CTC template',
            content: (
              <div className="yx-hire-sheet">
                <div className="yx-hire-sheet__form">
                  <FormField id={FIELD_ID.tpl} label="CTC template" required error={err('tpl')}>
                    {live ? <Select aria-label="CTC template" value={tpl} onChange={setTpl} options={setup!.structures} placeholder="Choose the salary structure" /> : <Select value="std" onChange={() => {}} options={[{ value: 'std', label: 'Standard CTC, Tamil Nadu (M03)' }, { value: 'plant', label: 'Plant staff CTC' }]} />}
                  </FormField>
                  <FormField id={FIELD_ID.ctc} label="Fixed CTC (annual)" required error={err('ctc')} helper={band ? `Grade ${grade}: ${formatINR(band.min)} – ${formatINR(band.max)}` : 'No pay range is set for this grade.'}>
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
                  {bonus > 0 && (
                    <FormField id={FIELD_ID.claw} label="Clawback if the person leaves within" helper="Recovered in the final settlement" error={err('claw')}>
                      <NumberField value={clawback} onChange={setClawback} suffix="months" />
                    </FormField>
                  )}
                  {/* Live: HRA and every other line come from the company's salary structure. */}
                  {!live && <Switch className="yx-hire-switch" label="Metro city HRA (50% of basic)" checked={metro} onChange={setMetro} />}
                  {!live && <Button icon={Scale}>Suggest split</Button>}
                </div>
                <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="CTC breakup preview">
                  {live && pvError ? (
                    <InlineAlert tone="danger" title="No breakup for this CTC">{pvError}</InlineAlert>
                  ) : live && !pv ? (
                    <Text size="sm" tone="secondary">Choose the structure, the work location and the fixed CTC to see the breakup.</Text>
                  ) : (
                    <>
                      <CtcBreakupTable lines={persona === 'hr' ? lines : lines.filter((l) => l.kind !== 'employer')} caption="Breakup preview" />
                      <Text size="sm" tone="secondary">
                        Gross monthly {formatINR(live ? (pv?.monthlyGross ?? 0) : grossMonthly(lines))} · total CTC incl. variable {formatINR(totalCtc(lines))}
                      </Text>
                      {pv?.warnings.map((w) => (
                        <InlineAlert key={w} tone="warning">{w}</InlineAlert>
                      ))}
                    </>
                  )}
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
                  { label: 'Joining bonus', value: bonus ? `${formatINR(bonus)}, clawback ${clawback} months` : 'None' },
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
                  <FormField id={FIELD_ID.start} label="Joining date" required error={err('start')}>
                    <DatePicker id={FIELD_ID.start} aria-label="Joining date" value={start} onChange={live ? setStart : () => {}} min={live ? now : undefined} />
                  </FormField>
                  <FormField id={FIELD_ID.expires} label="Offer expires" required helper="Unsigned offers lapse after this date" error={err('expires')}>
                    <DatePicker id={FIELD_ID.expires} aria-label="Offer expires" value={expires} onChange={live ? setExpires : () => {}} min={live ? now : undefined} />
                  </FormField>
                </FieldRow>
                <FormField id={FIELD_ID.place} label="Work location" required error={err('place')}>
                  {live ? <Select aria-label="Work location" value={place} onChange={setPlace} options={setup!.locations} placeholder="Choose the work location" /> : <Select value="maa" onChange={() => {}} options={[{ value: 'maa', label: 'Chennai office' }, { value: 'blr', label: 'Bengaluru head office' }]} />}
                </FormField>
                {!previous && <Checkbox label={setup ? `Add conditions (${setup.defaultConditions.join(', ').toLowerCase() || 'none set by the company'})` : 'Add conditions (background check, documents)'} checked={conditions} onChange={setConditions} />}
              </div>
            ),
            summary: <Text>{kind === 'offer' ? 'Offer letter' : 'Letter of intent'} · joining {startText} · expires {expiresText}{live ? ` · ${place$}` : ''}</Text>,
          },
          {
            id: 'letter',
            title: 'Letter',
            description: 'Template and e-sign',
            content: (
              <div className="yx-hire-stack">
                <FormField id={FIELD_ID.letter} label="Letter template" required error={err('letter')}>
                  {live ? <Select aria-label="Letter template" value={letter} onChange={setLetter} options={setup!.letters.map((l) => ({ value: l.value, label: l.label }))} /> : <Select value="t1" onChange={() => {}} options={[{ value: 't1', label: 'Offer letter · Engineering (P05)' }]} />}
                </FormField>
                <div className="yx-hire-letter" role="document" aria-label="Letter preview">
                  {chosenLetter ? (
                    fillLetter(chosenLetter.body, letterFields).split(/\n{2,}/).map((para, i) => (
                      <Text key={i} as="p" weight={i === 0 ? 'semibold' : undefined}>
                        {para}
                      </Text>
                    ))
                  ) : (
                    <>
                      <Text as="p" weight="semibold">
                        Dear {candidate},
                      </Text>
                      <Text as="p">
                        We are pleased to offer you the position of {job} at Kaveri Foods Pvt Ltd, Chennai, with an annual fixed CTC of {formatINR(fixed)}
                        {variable ? ` and a target variable pay of ${formatINR(variable)}` : ''}. Your joining date is 2 Nov 2026.
                      </Text>
                      <Text as="p">Please accept this offer by 6 Oct 2026 using the one-time password sent to your mobile.</Text>
                    </>
                  )}
                </div>
                {chosenLetter && (
                  <Text size="sm" tone="secondary">
                    {chosenLetter.esign ? 'The candidate signs with a one-time code sent to their email (this template has e-sign on).' : 'The candidate accepts by the link in the email (this template has no e-sign).'}
                  </Text>
                )}
              </div>
            ),
            summary: <Text>{chosenLetter ? `${chosenLetter.label} · ${chosenLetter.esign ? 'e-sign with a one-time code' : 'accept by the link'}` : 'Offer letter · Engineering · OTP e-accept'}</Text>,
          },
          {
            id: 'approval',
            title: 'Approval',
            description: band$.extraApproval ? 'Extra approval needed' : 'Standard chain',
            content: (
              <div className="yx-hire-stack">
                {band$.extraApproval && <InlineAlert tone="warning" title="Out of the grade pay range">{band$.text} {route ? `${route.bandStep.name.replace(/^Above the pay range \((.*)\)$/, 'The $1')} approves${route.steps.length ? ' after the other steps' : ''}.` : 'The CFO approves after HR.'}</InlineAlert>}
                {live && previous && !reapprove ? (
                  <InlineAlert tone="info">No new approval is needed: the new letter goes to the candidate when you finish.</InlineAlert>
                ) : live && !needsRoute ? (
                  <InlineAlert tone="info">Your company has no approval step for offers in the pay range: the offer goes to the candidate when you finish.</InlineAlert>
                ) : (
                  <ApprovalTimeline steps={steps} now={now} />
                )}
              </div>
            ),
            summary: <Text>{live && (!needsRoute || (previous && !reapprove)) ? 'No approval needed' : `${steps.length} approval steps`}</Text>,
          },
        ]}
      />
    </HireFrame>
  );
}

/* ================================================================== Offer record + HIR-29 conditions tab */

export type OfferStatus = 'Draft' | 'Waiting for approval' | 'Approved' | 'Sent' | 'Accepted' | 'Joined' | 'Declined' | 'Reneged' | 'Withdrawn' | 'Lapsed';
const OFFER_TONE: Record<OfferStatus, BadgeTone> = { Draft: 'neutral', 'Waiting for approval': 'warning', Approved: 'success', Sent: 'info', Accepted: 'success', Joined: 'success', Declined: 'neutral', Reneged: 'danger', Withdrawn: 'danger', Lapsed: 'danger' };
const API_STATUS: Record<OfferApiStatus, OfferStatus> = { draft: 'Draft', pending_approval: 'Waiting for approval', approved: 'Approved', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' };

export interface OfferRecordProps {
  candidate?: string;
  job?: string;
  status?: OfferStatus;
  ctc?: number;
  conditions?: OfferCondition[];
  lapseDate?: Date;
  today?: Date;
  handoff?: { mode: 'automatic' | 'manual'; personType: 'New person' | 'Alumni rehire' | 'Internal employee' | 'Contractor conversion' | 'Partial match' };
  declineReason?: string;
  activity?: TimelineItem[];
  defaultTab?: 'overview' | 'conditions' | 'versions';
  persona?: 'recruiter' | 'hr';
  /** Live (HIR-09 / HIR-29): the offer from the API and its actions. */
  live?: LiveOfferRecord;
}

/** Live conditions: the API's list; each action resolves when done (the page reloads the offer). */
export interface LiveConditions {
  canChange: boolean;
  onAdd: (name: string, dueOn: string) => Promise<void>;
  onMet: (id: string) => Promise<void>;
  onWaive: (id: string, reason: string) => Promise<void>;
  /** The note or the waiver's reason, by condition. */
  notes: Record<string, string | null>;
}

// HIR-29 (conditions tab on the offer record)
export function OfferConditionsTab({ conditions: initial, lapseDate, today, live }: { conditions: OfferCondition[]; lapseDate: Date; today: Date; live?: LiveConditions }) {
  const [local, setLocal] = useState(initial);
  const conditions = live ? initial : local;
  const toast = useToastIfAny();
  const [waiving, setWaiving] = useState<OfferCondition | null>(null);
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [due, setDue] = useState<Date | null>(lapseDate);
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const lapse = offerLapse(conditions, lapseDate, today);
  const set = async (c: OfferCondition, status: OfferCondition['status'], why?: string) => {
    if (live) await (status === 'met' ? live.onMet(c.id) : live.onWaive(c.id, why!));
    else setLocal((cs) => cs.map((x) => (x.id === c.id ? { ...x, status } : x)));
    toast?.toast({ tone: 'success', title: status === 'met' ? `${c.name}: met` : `${c.name}: waived` });
  };
  const met = (c: OfferCondition) => {
    setFailed(null);
    set(c, 'met').catch((e: unknown) => setFailed(e instanceof Error ? e.message : 'That did not work. Try again.'));
  };
  return (
    <div className="yx-hire-stack">
      {failed && <InlineAlert tone="danger" title="Not done">{failed}</InlineAlert>}
      {lapse.state === 'lapsed' ? (
        <InlineAlert tone="danger" title="Offer lapsed">
          {lapse.open} condition{lapse.open === 1 ? ' was' : 's were'} not met by {formatDate(lapseDate)}.{' '}
          {live ? 'Decide now: mark each one met, waive it with a reason, or withdraw the offer.' : 'Pre-boarding tasks were cancelled, accounts not created and the headcount slot released.'}
        </InlineAlert>
      ) : lapse.state === 'reminder' ? (
        <InlineAlert tone="warning" title={`Auto-lapse on ${formatDate(lapseDate)} (${lapse.daysToLapse} days)`}>
          {lapse.overdue.length ? `Overdue: ${lapse.overdue.join(', ')}. ` : ''}
          {live ? 'Mark each condition met or waived before the joining day.' : 'The candidate got a reminder. Mark each condition met or waived before the lapse date.'}
        </InlineAlert>
      ) : lapse.state === 'clear' ? (
        <InlineAlert tone="success" title="All conditions met or waived">The offer won&rsquo;t lapse.</InlineAlert>
      ) : (
        <InlineAlert tone="info">{live ? `Due by the joining day, ${formatDate(lapseDate)}.` : `Auto-lapse on ${formatDate(lapseDate)} if any condition is still open.`}</InlineAlert>
      )}
      <ul className="yx-hire-list" aria-label="Offer conditions">
        {conditions.map((c) => {
          const overdue = c.status === 'open' && daysBetween(c.due, today) > 0;
          const note = live?.notes[c.id] ?? null;
          return (
            <li key={c.id} className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <Text weight="medium">{c.name}</Text>
                <Text size="sm" tone={overdue ? 'danger' : 'secondary'}>
                  Due {formatDate(c.due)}
                  {overdue ? ' · overdue' : ''}
                </Text>
                {live ? (
                  note && (
                    <Text size="sm" tone="secondary">
                      {c.status === 'waived' ? 'Reason' : 'Note'}: {note}
                    </Text>
                  )
                ) : (
                  c.status === 'met' && (
                    <Text size="sm" tone="secondary">
                      Evidence: offer-signed.pdf
                    </Text>
                  )
                )}
              </div>
              <Badge tone={c.status === 'met' ? 'success' : c.status === 'waived' ? 'info' : overdue ? 'warning' : 'neutral'}>{c.status === 'open' ? 'Open' : c.status === 'met' ? 'Met' : 'Waived'}</Badge>
              {c.status === 'open' && (live ? live.canChange : lapse.state !== 'lapsed') && (
                <div className="yx-hire-list__actions">
                  <Button size="sm" onClick={() => met(c)}>
                    Mark met
                  </Button>
                  <Button size="sm" onClick={() => (setWaiving(c), setReason(''), setTried(false))}>
                    Waive with reason
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {conditions.length === 0 && <EmptyState compact title="No conditions on this offer." />}
      {(!live || live.canChange) && (
        <Button icon={Plus} onClick={() => (setAdding(true), setName(''), setDue(lapseDate), setTried(false))}>
          Add condition
        </Button>
      )}
      {waiving && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setWaiving(null)}
          title={`Waive "${waiving.name}"?`}
          consequence="The reason is kept with the offer and shown to everyone who opens it."
          confirmLabel="Waive"
          onConfirm={async () => {
            setTried(true);
            if (reason.trim().length < 3) return (setTimeout(() => document.getElementById('oc-reason')?.focus(), 0), false);
            await set(waiving, 'waived', reason.trim());
            setWaiving(null);
          }}
        >
          <FormField id="oc-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why it is waived, in a few words.' : null}>
            <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
          </FormField>
        </ConfirmDialog>
      )}
      {adding && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAdding(false)}
          title="Add a condition"
          confirmLabel="Add condition"
          onConfirm={async () => {
            setTried(true);
            if (name.trim().length < 2) return (setTimeout(() => document.getElementById('oc-name')?.focus(), 0), false);
            if (!due) return (setTimeout(() => document.getElementById('oc-due')?.focus(), 0), false);
            if (live) await live.onAdd(name.trim(), dayKey(due));
            else setLocal((cs) => [...cs, { id: `oc${cs.length + 1}`, name: name.trim(), due, status: 'open' }]);
            toast?.toast({ tone: 'success', title: 'Condition added' });
            setAdding(false);
          }}
        >
          <FormField id="oc-name" label="Condition" required error={tried && name.trim().length < 2 ? 'Name the condition, e.g. Medical fitness.' : null}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="oc-due" label="Due" required error={tried && !due ? 'Choose the due date.' : null}>
            <DatePicker id="oc-due" aria-label="Due" value={due} onChange={setDue} min={today} />
          </FormField>
        </ConfirmDialog>
      )}
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
export function OfferRecordScreen(p: OfferRecordProps) {
  const { live } = p;
  if (live && (live.state !== 'ready' || !live.offer))
    return (
      <HireFrame active="Offers & BGV">
        {live.state === 'loading' ? (
          <div className="yx-hire-stack" aria-busy="true" aria-label="Loading the offer">
            <Skeleton height={64} />
            <Skeleton height={240} />
          </div>
        ) : live.state === 'error' ? (
          <ErrorState title="This offer could not be loaded." onRetry={live.onRetry} />
        ) : live.state === 'denied' ? (
          <NoAccessState grantedBy="your admin (a hiring key)" what="this offer" />
        ) : (
          <EmptyState title="Not found" description="This offer doesn't exist in your company." action={<Button onClick={live.onBack}>Back</Button>} />
        )}
      </HireFrame>
    );
  return live ? <LiveOfferRecordView live={live} defaultTab={p.defaultTab} /> : <SampleOfferRecord {...p} />;
}

function SampleOfferRecord({ candidate = '', job = '', status = 'Sent', ctc = 0, conditions = [], lapseDate = new Date(), today = new Date(), handoff, declineReason, activity = [], defaultTab = 'overview', persona = 'recruiter' }: OfferRecordProps) {
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

/** The same record with the offer from the API: status-led actions, pay only with the key, versions, conditions. */
function LiveOfferRecordView({ live, defaultTab = 'overview' }: { live: LiveOfferRecord; defaultTab?: OfferRecordProps['defaultTab'] }) {
  const o = live.offer!;
  const toast = useToastIfAny();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'withdraw' | 'cancel' | 'employee'>(null);
  const status = API_STATUS[o.status];
  const lapseDate = fromIso(o.startDate);
  const conditions: OfferCondition[] = o.conditions.map((c) => ({ id: c.id, name: c.name, due: fromIso(c.dueOn), status: c.status }));
  const activity: TimelineItem[] = o.activity.map((a) => ({ id: a.id, actor: { name: a.actor }, action: a.action, at: new Date(a.at) }));
  const ctc = o.current?.annualCtc ?? null;
  const v0 = o.versions.find((v) => v.version === 0) ?? null;
  const run = async (key: string, fn: () => Promise<unknown>, title: string | ((r: unknown) => string)) => {
    setBusy(key);
    setFailed(null);
    try {
      const r = await fn();
      toast?.toast({ tone: 'success', title: typeof title === 'string' ? title : title(r) });
    } catch (e) {
      setFailed(failure(e));
    } finally {
      setBusy(null);
    }
  };
  const open = ['draft', 'pending_approval', 'approved', 'sent'].includes(o.status);
  return (
    <HireFrame active="Offers & BGV">
      <RecordLayout
        banner={
          <>
            {failed && <InlineAlert tone="danger" title="Not done">{failed}</InlineAlert>}
            {o.status === 'withdrawn' ? (
              <InlineAlert tone="danger" title="Offer withdrawn">The candidate can no longer accept it. Make a new offer from the application if needed.</InlineAlert>
            ) : o.status === 'declined' ? (
              <InlineAlert tone="info" title="Offer declined">Counted in offer-acceptance analytics.</InlineAlert>
            ) : undefined}
          </>
        }
        header={
          <ObjectHeader
            name={`Offer · ${o.candidate.name}`}
            icon={FileText}
            secondary={`${o.job.title} · version ${o.currentVersion}`}
            status={<Badge tone={OFFER_TONE[status]}>{status}</Badge>}
            facts={[
              { label: 'Fixed CTC', value: !o.canSeePay ? 'Shown with the offer-pay key' : ctc !== null ? formatINR(ctc) : 'Text offer (version 0)' },
              { label: 'Joining', value: formatDate(lapseDate) },
              { label: 'Expires', value: formatDate(new Date(o.expiresAt)) },
              { label: 'Hand-off', value: o.joiner ? 'Manual · joiner added' : o.status === 'accepted' ? 'Manual · waiting for HR' : '—' },
            ]}
            actions={
              o.status === 'accepted' && !o.joiner ? (
                <Button variant="primary" icon={UserPlus} onClick={() => setDialog('employee')}>
                  Create employee
                </Button>
              ) : open ? (
                <>
                  {o.canSeePay && (
                    <Button variant={o.status === 'sent' ? 'primary' : undefined} onClick={live.onRevise}>
                      Revise offer
                    </Button>
                  )}
                  {o.status === 'draft' && (
                    <Button variant="primary" icon={Send} loading={busy === 'submit'} onClick={() => void run('submit', live.onSubmit, (r) => String(r))}>
                      Send for approval
                    </Button>
                  )}
                  {o.status === 'approved' && (
                    <Button variant="primary" icon={Send} loading={busy === 'send'} onClick={() => void run('send', live.onSend, 'Offer sent to the candidate')}>
                      Send offer
                    </Button>
                  )}
                </>
              ) : undefined
            }
            menu={
              <>
                {o.canSeePay && <MenuItem onSelect={() => void run('letter', live.onLetter, 'Letter opened')}>Download letter</MenuItem>}
                {o.status === 'pending_approval' && <MenuItem onSelect={() => setDialog('cancel')}>Take back from approval</MenuItem>}
                {o.status === 'sent' && (
                  <MenuItem destructive onSelect={() => setDialog('withdraw')}>
                    Withdraw offer
                  </MenuItem>
                )}
              </>
            }
          />
        }
        aside={
          <>
            <Text weight="semibold">Activity</Text>
            <Timeline items={activity} today={live.now} />
          </>
        }
      >
        {o.status === 'accepted' && (
          <InlineAlert tone="info" title={o.joiner ? 'Joiner added in People' : 'In "Ready to onboard"'}>
            {o.joiner ? 'Pre-boarding runs in People.' : 'HR adds the joiner in People from this offer.'} At joining, the offer&rsquo;s pay goes to Pay as the first salary, for approval. Retrying never creates a second employee.
          </InlineAlert>
        )}
        {o.approval?.status === 'pending' && (
          <InlineAlert tone="info" title="Waiting for approval">
            {o.approval.steps.map((s) => `${s.name}: ${s.state === 'approved' ? 'approved' : s.state === 'open' ? `waiting for ${s.approvers.join(', ') || 'an approver'}` : s.state}`).join(' · ')}
          </InlineAlert>
        )}
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Offer sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="conditions" count={conditions.filter((c) => c.status === 'open').length}>
              Conditions
            </TabsTrigger>
            <TabsTrigger value="versions" count={o.versions.length}>
              Versions
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            {!o.canSeePay ? (
              <InlineAlert tone="info" title="Pay hidden">Only people allowed to see offer pay see the amounts. Everything else about the offer is here.</InlineAlert>
            ) : o.current?.lines ? (
              <div className="yx-hire-stack">
                <CtcBreakupTable lines={o.current.lines} />
                <Text size="sm" tone="secondary">
                  {o.current.bandText}
                  {o.current.joiningBonus ? ` Joining bonus ${formatINR(o.current.joiningBonus)}, repaid if the person leaves within ${o.current.clawbackMonths} months.` : ''}
                </Text>
              </div>
            ) : (
              <InlineAlert tone="info" title="Text offer (version 0)">{v0?.text ?? 'Made before CTC lines.'} Revise it to give it CTC lines.</InlineAlert>
            )}
          </TabsContent>
          <TabsContent value="conditions">
            <OfferConditionsTab
              conditions={conditions}
              lapseDate={lapseDate}
              today={live.now}
              live={{
                canChange: o.status !== 'withdrawn' && o.status !== 'declined',
                notes: Object.fromEntries(o.conditions.map((c) => [c.id, c.reason])),
                onAdd: live.onAddCondition,
                onMet: live.onMet,
                onWaive: live.onWaive,
              }}
            />
          </TabsContent>
          <TabsContent value="versions">
            <ul className="yx-hire-list" aria-label="Offer versions">
              {o.versions.map((v) => (
                <li key={v.version} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <Text weight="medium">
                      Version {v.version}
                      {v.annualCtc !== null ? ` · ${formatINR(v.annualCtc)}` : ''}
                    </Text>
                    <Text size="sm" tone="secondary">
                      {v.version === 0 ? (v.text ?? 'Text offer (pay hidden)') : [v.note, v.needsApproval ? 'needed approval' : 'no new approval needed', formatDate(new Date(v.at)), v.by].filter(Boolean).join(' · ')}
                    </Text>
                  </div>
                  <Badge tone={v.current ? 'success' : undefined}>{v.current ? 'Current' : 'Superseded'}</Badge>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </RecordLayout>
      {dialog === 'withdraw' && (
        <ConfirmDialog open destructive onOpenChange={(x) => !x && setDialog(null)} title={`Withdraw the offer to ${o.candidate.name}?`} consequence="The link in their email stops working. You can't undo this." confirmLabel="Withdraw offer" onConfirm={async () => (await live.onWithdraw(), toast?.toast({ tone: 'success', title: 'Offer withdrawn' }), setDialog(null))} />
      )}
      {dialog === 'cancel' && (
        <ConfirmDialog open onOpenChange={(x) => !x && setDialog(null)} title="Take the offer back from approval?" consequence="The approvers' tasks close and the offer goes back to draft for you to change." confirmLabel="Take back" onConfirm={async () => (await live.onCancelApproval(), toast?.toast({ tone: 'success', title: 'Back to draft' }), setDialog(null))} />
      )}
      {dialog === 'employee' && (
        <ConfirmDialog open onOpenChange={(x) => !x && setDialog(null)} title={`Create employee for ${o.candidate.name}?`} consequence="People › Onboarding opens with this offer: check the place and the joining day there, then add the joiner. Someone who worked here before joins on their own record." confirmLabel="Open in People" onConfirm={() => (live.onCreateEmployee(), setDialog(null))} />
      )}
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
