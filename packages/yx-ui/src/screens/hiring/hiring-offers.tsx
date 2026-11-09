// Hiring › Offers (builder, record, conditions, bulk), BGV tracker, talent CRM, bias audit.
// HIR-09, HIR-29, HIR-28, HIR-10, HIR-20, HIR-23 (M10 Q3 / Q5, YX-ATS-06 / 07 / 08 / 14 / 17 / 20 / 21 / 22 / 23 / 40 / 41, T05 YX-EVAL-32).
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Plus, Scale, Send, UserPlus } from 'lucide-react';
import { Button } from '../../components/button';
import { AiBadge, Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { dayKey } from '../../lib/dates';
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
import type { BulkBatchView, LiveBulkOffers, LiveOfferBuilder, LiveOfferRecord, OfferApiStatus, OfferDraftInput, OfferPreview } from './live/types';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Text } from '../../components/foundations';
import { countText, formatDate, formatINR } from '../../lib/format';
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
  type CtcLine,
  type CrmMember,
  type OfferCondition,
} from './hiring-logic';
import { ConsentBadges, CtcBreakupTable, HireFrame, PostingStrip, RecordLayout, SummaryTiles, useListControls, type Posting } from './hiring-kit';
import { POOL_MEMBERS, type Pool } from './hiring-data';
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
const addDaysTo = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
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
  const [expires, setExpires] = useState<Date | null>(live ? (prevIn ? fromIso(prevIn.expiresAt) : setup?.expiryDays ? addDaysTo(now ?? new Date(), setup.expiryDays) : null) : new Date(2026, 9, 6));
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
  // Answer 336: a sent offer waiting for an answer, or an accepted one with conditions still open.
  const remindable = o.status === 'sent' || (o.status === 'accepted' && o.conditions.some((c) => c.status === 'open'));
  const remindButton = remindable && (
    <Button icon={Send} loading={busy === 'remind'} onClick={() => void run('remind', live.onRemind, (r) => String(r))}>
      Send reminder
    </Button>
  );
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
                <>
                  {remindButton}
                  <Button variant="primary" icon={UserPlus} onClick={() => setDialog('employee')}>
                    Create employee
                  </Button>
                </>
              ) : o.status === 'accepted' ? (
                remindButton || undefined
              ) : open ? (
                <>
                  {remindButton}
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

/** A row of the sent batch: what happened to each candidate's offer (HIR-28, one bad row never blocks the others). */
export interface BulkResultRow {
  id: string;
  name: string;
  ctc: number | null;
  result: 'Sent' | 'Waiting for extra approval' | 'Waiting for approval' | 'Approved, not emailed' | 'Held: no plan line' | 'Skipped: has an offer' | 'Not sent';
  reason: string | null;
  offerId: string | null;
}
const RESULT_TONE: Record<BulkResultRow['result'], BadgeTone> = { Sent: 'success', 'Waiting for extra approval': 'warning', 'Waiting for approval': 'info', 'Approved, not emailed': 'warning', 'Held: no plan line': 'danger', 'Skipped: has an offer': 'neutral', 'Not sent': 'danger' };
const SAMPLE_RESULTS = (rows: BulkOfferRow[], band: Band): BulkResultRow[] =>
  rows.map((r) => ({ id: r.id, name: r.name, ctc: r.ctc, result: !r.planOk ? 'Held: no plan line' : bandCheck(r.ctc, band).extraApproval ? 'Waiting for extra approval' : 'Sent', reason: !r.planOk ? 'No free place on the headcount-plan line. Held until the plan is revised.' : null, offerId: null }));

const resultOf = (r: BulkBatchView['rows'][number]): BulkResultRow['result'] =>
  r.status === 'sent' ? 'Sent' : r.status === 'pending_approval' ? (r.band?.startsWith('Above') ? 'Waiting for extra approval' : 'Waiting for approval') : r.status === 'approved' ? 'Approved, not emailed' : r.status === 'held' ? 'Held: no plan line' : r.status === 'skipped' ? 'Skipped: has an offer' : 'Not sent';

// HIR-28
export function BulkOfferScreen({ rows: sampleRows = [], band: sampleBand = { min: 0, max: 0 }, defaultStep = 'values', sent = false, live }: { rows?: BulkOfferRow[]; band?: Band; defaultStep?: string; sent?: boolean; live?: LiveBulkOffers }) {
  if (live && (live.state !== 'ready' || !(live.setup || live.batch)))
    return (
      <HireFrame active="Offers & BGV">
        {live.state === 'loading' ? (
          <div className="yx-hire-stack" aria-busy="true" aria-label="Loading the bulk offers">
            <Skeleton height={64} />
            <Skeleton height={320} />
          </div>
        ) : live.state === 'error' ? (
          <ErrorState title="The bulk offers could not be loaded." onRetry={live.onRetry} />
        ) : live.state === 'denied' ? (
          <NoAccessState grantedBy="your admin (the offer-pay key)" what="bulk offers" />
        ) : (
          <EmptyState title="Not found" description="This job or batch doesn't exist in your company." />
        )}
      </HireFrame>
    );
  if (live?.batch || sent) return <BulkOfferSent rows={sampleRows} band={sampleBand} live={live} />;
  return <BulkOfferBuilder rows={sampleRows} band={sampleBand} defaultStep={defaultStep} live={live} />;
}

function BulkOfferSent({ rows, band, live }: { rows: BulkOfferRow[]; band: Band; live?: LiveBulkOffers }) {
  const b = live?.batch ?? null;
  const results: BulkResultRow[] = b ? b.rows.map((r) => ({ id: r.entryId, name: r.name, ctc: r.annualCtc, result: resultOf(r), reason: r.reason, offerId: r.offerId })) : SAMPLE_RESULTS(rows, band);
  const count = (res: BulkResultRow['result']) => results.filter((r) => r.result === res).length;
  const failed = count('Not sent') + count('Approved, not emailed');
  const cols: TableColumn<BulkResultRow>[] = [
    { key: 'name', header: 'Candidate', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }) },
    ...(b && !b.canSeePay ? [] : [{ key: 'ctc', header: 'Fixed CTC', type: 'money' as const, value: (r: BulkResultRow) => r.ctc ?? 0 }]),
    { key: 'result', header: 'Result', type: 'status', value: (r) => r.result, statusTone: (v) => RESULT_TONE[v as BulkResultRow['result']] ?? 'neutral' },
    { key: 'reason', header: 'Why', type: 'text', value: (r) => r.reason ?? '' },
  ];
  return (
    <HireFrame active="Offers & BGV">
      <PageHeader title={b ? `Bulk offers · ${b.job.title}` : 'Bulk offers · GET 2027'} status={<Badge tone={failed ? 'warning' : 'success'}>{b?.status === 'running' ? 'Sending' : 'Sent'}</Badge>} />
      <SummaryTiles
        label="Batch status"
        tiles={[
          { label: 'Offers sent', value: count('Sent') },
          { label: 'Waiting for extra approval', value: count('Waiting for extra approval') + count('Waiting for approval'), tone: count('Waiting for extra approval') ? 'warning' : 'default' },
          { label: 'Held: no plan line', value: count('Held: no plan line'), tone: count('Held: no plan line') ? 'danger' : 'default' },
          { label: b ? 'Not sent' : 'E-sign envelopes', value: b ? failed + count('Skipped: has an offer') : count('Sent'), tone: b && failed ? 'danger' : 'default', sub: b ? 'see each row' : 'one per candidate' },
        ]}
      />
      <DataTable
        label="Each candidate's result"
        columns={cols}
        rows={results}
        getRowId={(r) => r.id}
        rowButtons={(r) => (r.offerId ? <Button size="sm" onClick={() => live?.onOpenOffer(r.offerId!)}>Open offer</Button> : null)}
      />
    </HireFrame>
  );
}

function BulkOfferBuilder({ rows: sampleRows, band: sampleBand, defaultStep, live }: { rows: BulkOfferRow[]; band: Band; defaultStep: string; live?: LiveBulkOffers }) {
  const setup = live?.setup ?? null;
  const toast = useToastIfAny();
  const band = setup ? setup.band : sampleBand;
  const [ctcs, setCtcs] = useState<Record<string, number>>({});
  const [start, setStart] = useState<Date | null>(setup ? null : new Date(2027, 6, 5));
  const [kind, setKind] = useState<string>('loi');
  const [tpl, setTpl] = useState<string | null>(setup ? (setup.structures[0]?.value ?? null) : 'get');
  const [letter, setLetter] = useState<string | null>(setup ? (setup.letters[0]?.value ?? null) : 't1');
  const [place, setPlace] = useState<string | null>(setup ? (setup.job.locationId ?? setup.locations[0]?.value ?? null) : 'hsr');
  const [step, setStep] = useState(defaultStep);
  const [tried, setTried] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const base: BulkOfferRow[] = setup ? setup.candidates.map((c) => ({ id: c.entryId, name: c.name, college: c.email, ctc: ctcs[c.entryId] ?? 0, joining: start ?? new Date(), planOk: true })) : sampleRows;
  const [selected, setSelected] = useState<string[]>(live?.selected?.length ? base.map((r) => r.id).filter((x) => live.selected!.includes(x)) : base.map((r) => r.id));
  // Live: rows beyond the free places on the plan line are held, in the order they are listed.
  const free = setup?.plan.check === 'hold' ? setup.plan.free : null;
  const rows = setup ? base.map((r) => ({ ...r, planOk: free === null || !selected.includes(r.id) || selected.filter((s) => base.findIndex((x) => x.id === s) <= base.findIndex((x) => x.id === r.id)).length <= free })) : base;
  const chosen = rows.filter((r) => selected.includes(r.id));
  const outOfBand = chosen.filter((r) => band && bandCheck(r.ctc, band).extraApproval);
  const noPlan = (setup ? chosen : rows).filter((r) => !r.planOk);
  const chosenLetter = setup?.letters.find((l) => l.value === letter) ?? null;
  const cols: TableColumn<BulkOfferRow>[] = [
    { key: 'name', header: 'Candidate', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.college }) },
    { key: 'ctc', header: 'Fixed CTC', type: 'money', value: (r) => r.ctc, editable: 'money', total: 'sum' },
    { key: 'joining', header: 'Joining', type: 'date', value: (r) => r.joining },
    { key: 'band', header: 'Grade range', type: 'status', value: (r) => (!band ? 'No range set' : bandCheck(r.ctc, band).extraApproval ? 'Out of range' : 'Within range'), statusTone: (v) => (v === 'Within range' ? 'success' : v === 'No range set' ? 'neutral' : 'warning') },
    { key: 'plan', header: 'Plan check', type: 'status', value: (r) => (setup && free === null ? 'Not checked' : r.planOk ? 'Plan line free' : 'No plan line'), statusTone: (v) => (v === 'Plan line free' ? 'success' : v === 'Not checked' ? 'neutral' : 'danger') },
  ];
  const errs: Record<string, string | null> = {
    'bo-tpl': setup && !tpl ? 'Choose the salary structure.' : null,
    'bo-start': !start ? 'Choose the joining date.' : null,
    'bo-place': setup && !place ? 'Choose the work location.' : null,
    'bo-letter': setup && !letter ? 'Choose the offer letter.' : null,
    'bo-rows': !chosen.length ? 'Choose at least one candidate.' : chosen.some((r) => !(r.ctc > 0)) ? `Enter the fixed CTC for ${chosen.filter((r) => !(r.ctc > 0)).map((r) => r.name).join(', ')}.` : null,
  };
  const STEP: Record<string, string[]> = { template: ['bo-tpl', 'bo-start', 'bo-place', 'bo-letter'], values: ['bo-rows'] };
  const err = (id: string) => ([...tried].some((s) => STEP[s]?.includes(id)) ? errs[id] : null);
  const check = (ids: string[]) => {
    setTried((t) => new Set([...t, ...ids]));
    const bad = ids.find((s) => STEP[s]?.some((f) => errs[f]));
    if (!bad) return true;
    setStep(bad);
    const f = STEP[bad]!.find((x) => errs[x])!;
    setTimeout(() => (document.getElementById(f) as HTMLElement | null)?.focus(), 50);
    return false;
  };
  const sendable = chosen.filter((r) => r.planOk);
  const first = chosen[0] ?? rows[0];
  const finish = async () => {
    if (!live || !check(['template', 'values'])) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onSend({ templateVersionId: tpl!, templateId: letter && letter !== 'default' ? letter : null, letterKind: kind as 'offer' | 'loi', startDate: dayKey(start!), locationId: place!, addConditions: true, rows: chosen.map((r) => ({ entryId: r.id, annualCtc: r.ctc })) });
      toast?.toast({ tone: 'success', title: 'Batch sent', description: 'Each candidate’s result is on the next page.' });
    } catch (e) {
      setFailed(failure(e));
    } finally {
      setBusy(false);
    }
  };
  const route = setup?.route;
  return (
    <HireFrame active="Offers & BGV">
      <PageHeader
        title={setup ? `Bulk offers · ${setup.job.title}` : 'Bulk offers · GET 2027 · Hosur campus'}
        description={`One template, values per candidate. Each offer still gets its own headcount-plan check and its own e-sign envelope.${band ? ` Grade ${setup ? (setup.grade ?? '') : 'G3'} range ${formatINR(band.min)} – ${formatINR(band.max)}.` : ' No grade pay range is set for this job.'}`}
      />
      {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
      <Stepper
        title="Bulk offers"
        current={step}
        onCurrentChange={setStep}
        onContinue={(id) => (live ? check([id]) : undefined)}
        finishLabel={`Send ${sendable.length} offers`}
        finishing={busy}
        onFinish={live ? () => void finish() : undefined}
        steps={[
          {
            id: 'template',
            title: 'Template',
            content: (
              <div className="yx-hire-sheet__form">
                <FormField label="Letter" required>
                  <RadioGroup aria-label="Letter" value={kind} onChange={setKind} options={[{ value: 'loi', label: 'Letter of intent (offer later)' }, { value: 'offer', label: 'Offer letter' }]} />
                </FormField>
                <FormField id="bo-tpl" label="CTC template" required error={err('bo-tpl')}>
                  {setup ? <Select aria-label="CTC template" value={tpl} onChange={setTpl} options={setup.structures} placeholder="Choose the salary structure" /> : <Select value="get" onChange={() => {}} options={[{ value: 'get', label: 'Graduate engineer trainee CTC' }]} />}
                </FormField>
                <FormField id="bo-start" label="Joining date" required helper="Everyone in this batch joins on this day" error={err('bo-start')}>
                  <DatePicker id="bo-start" aria-label="Joining date" value={start} onChange={setup ? setStart : () => {}} min={live?.now} />
                </FormField>
                <FormField id="bo-place" label="Work location" required error={err('bo-place')}>
                  {setup ? <Select aria-label="Work location" value={place} onChange={setPlace} options={setup.locations} placeholder="Choose the work location" /> : <Select value="hsr" onChange={() => {}} options={[{ value: 'hsr', label: 'Hosur plant' }]} />}
                </FormField>
                <FormField id="bo-letter" label="Letter template" required error={err('bo-letter')} helper={chosenLetter ? (chosenLetter.esign ? 'Each candidate signs with a one-time code (e-sign is on for this letter).' : 'Each candidate accepts by the link in the email.') : 'One e-sign envelope per candidate.'}>
                  {setup ? <Select aria-label="Letter template" value={letter} onChange={setLetter} options={setup.letters.map((l) => ({ value: l.value, label: l.label }))} /> : <Select value="t1" onChange={() => {}} options={[{ value: 't1', label: 'Campus letter of intent' }]} />}
                </FormField>
              </div>
            ),
            summary: <Text>{kind === 'loi' ? 'Letter of intent' : 'Offer letter'} · {setup ? (setup.structures.find((s) => s.value === tpl)?.label ?? '') : 'GET CTC'} · joining {start ? formatDate(start) : 'not chosen'}</Text>,
          },
          {
            id: 'values',
            title: 'Candidates and values',
            description: countText(rows.length, 'candidate'),
            content: (
              <div className="yx-hire-stack">
                {err('bo-rows') && <InlineAlert tone="danger" title="Check the candidates">{err('bo-rows')}</InlineAlert>}
                {outOfBand.length > 0 && <InlineAlert tone="warning" title={`${outOfBand.length} out of the grade range`}>{route ? `They also go to ${route.bandStep.approvers.join(', ') || 'the extra approver'} (${route.bandStep.name}); the rest follow the company's offer route.` : 'They go to the CFO for extra approval; the rest go straight to HR.'}</InlineAlert>}
                {noPlan.length > 0 && <InlineAlert tone="danger" title={`${noPlan.length} without a free plan line`}>These offers are held until the plan is revised: {noPlan.map((r) => r.name).join(', ')}.</InlineAlert>}
                {setup && !setup.candidates.length ? (
                  <EmptyState title="No candidates to offer" description="Everyone on this job already has an offer, was hired or was rejected." />
                ) : (
                  <div id="bo-rows" tabIndex={-1}>
                    <DataTable label="Offer values" columns={cols} rows={rows} getRowId={(r) => r.id} selectable selectedIds={selected} onSelectedChange={setSelected} onCellEdit={(r, key, v) => key === 'ctc' && setCtcs((m) => ({ ...m, [r.id]: Number(v) || 0 }))} />
                  </div>
                )}
              </div>
            ),
            summary: <Text>{chosen.length} selected · {outOfBand.length} need extra approval · {noPlan.length} held</Text>,
          },
          {
            id: 'preview',
            title: 'Preview',
            content: (
              <div className="yx-hire-letter" role="document" aria-label="Letter preview for the first candidate">
                {chosenLetter && first ? (
                  fillLetter(chosenLetter.body, { candidateName: first.name, jobTitle: setup!.job.title, orgName: setup!.company, recruiterName: '', compensation: `a fixed CTC of ${formatINR(first.ctc)} a year`, startDate: start ? formatDate(start) : 'the joining date', offerExpiry: `${setup!.expiryDays} days after it is sent`, offerLink: '(the link comes with the email)' })
                    .split(/\n{2,}/)
                    .map((para, i) => (
                      <Text key={i} as="p" weight={i === 0 ? 'semibold' : undefined}>
                        {para}
                      </Text>
                    ))
                ) : (
                  <>
                    <Text as="p" weight="semibold">
                      Dear {first?.name},
                    </Text>
                    <Text as="p">
                      Following your selection at the {first?.college} campus drive, Kaveri Foods Pvt Ltd intends to offer you the role of Graduate Engineer Trainee at our Hosur plant with an annual CTC of {formatINR(first?.ctc ?? 0)}, joining on 5 Jul 2027.
                    </Text>
                  </>
                )}
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
                  { label: 'Approval', value: route ? `Per offer: ${route.steps.map((s) => s.name).join(', ') || 'no route in the range (sent at once)'}${outOfBand.length ? `, plus ${route.bandStep.name} for out-of-range offers` : ''}` : 'Per offer: HR, plus CFO for out-of-range offers' },
                  { label: 'E-sign', value: chosenLetter ? (chosenLetter.esign ? 'One envelope per candidate, signed with a one-time code' : 'Accepted by the link in each email') : 'One envelope per candidate, OTP accept' },
                  { label: 'Held', value: noPlan.length ? noPlan.map((r) => r.name).join(', ') : 'None' },
                  ...(setup ? [{ label: 'Expires', value: `${setup.expiryDays} days after it is sent, never after joining` }] : []),
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
