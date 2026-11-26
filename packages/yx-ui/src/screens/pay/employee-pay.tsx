// Employee pay (desktop Me › My pay and mobile Pay tab): PAY-21 payslip viewer, PAY-40 "Why is my pay different?",
// PAY-22 tax workspace, PAY-41 compare tax regimes, PAY-18 loan / advance request, PAY-26 earned wage access,
// PAY-33 my incentive statement, PAY-39 my pay band.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, Download, FileText, HelpCircle, MessageSquare, Plus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton, Link } from '../../components/button';
import { AiBadge, Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { PdfPages } from '../../components/document';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { useRun } from '../org/org-kit';
import { PayFormDrawer, PayPageState, fromPaise, paise, rupees, sumMoney } from './consultants';
import type { LoadState } from './live/types';
import type { MyPayslip, PayslipDetail, PayslipLine } from './live/types-5j';
import type { DeclarationInput, DeclarationLine, LandlordRelationship, LoanApproval, LoanRequestInput, LoanView, MyCertificate, MyDeclarations, PayslipQueryView } from './live/types-ops';
import type { EwaDrawView, MyEwa, MyIncentives } from './live/types-5i';
import type { PayDocument } from './live/types';
import { FindPerson, type PersonHit } from './equity';
import { FieldRow, FormField, useTooEarly, type FormErrorItem } from '../../components/field';
import { Segment } from '../../components/segment';
import { Slider } from '../../components/slider';
import { PlainTable } from '../../components/plain-table';
import { dateText } from '../time/live/kit';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
import { AssistantPanel } from '../../components/notify';
import { PayslipDocument } from '../../components/print';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { BarChart } from '../../components/charts';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { FileUpload, type UploadItem } from '../../components/upload';
import { formatDate, formatINR } from '../../lib/format';
import {
  Amount,
  CompareBars,
  DaysStrip,
  FactRow,
  MoneySummary,
  MyPayFrame,
  PartnerLink,
  PayFrame,
  RangeMarker,
  SectionTitle,
  StateBlock,
  WhyThisNumber,
  useFileUrl,
  type ExplainedLine,
  type MyPayPage,
  type ViewState,
} from './pay-kit';
import {
  EWA_INPUT,
  ME,
  MY_DAYS,
  MY_DECLARATIONS,
  MY_DEDUCTIONS,
  MY_GROSS,
  MY_LINES,
  MY_LOP_DAY,
  MY_MAY_REFERRAL_BONUS,
  MY_NET,
  MY_PAYSLIP,
  MY_PREV_NET,
  MY_TAX,
  MY_TDS_BY_MONTH,
  PAYSLIP_HISTORY,
  SALES_COMMISSION_PLAN,
  d,
  type DeclLine,
} from './pay-data';
import { EMPLOYEES, TODAY as NOW } from '../_kit/data';
import {
  DEDUCTION_CAPS,
  commission,
  EWA_STARTER,
  NO_DEDUCTIONS,
  compareRegimes,
  computeTax,
  emiAmount,
  emiSchedule,
  ewaAvailable,
  hraExemptionMonth,
  monthlyTds,
  noPanTds,
  type Deductions,
  type EwaInput,
  type Regime,
} from './pay-logic';

export type Layout = 'desktop' | 'phone';

const storyHref = (id: string) => `/?path=/story/${id}`;
const goStory = (id: string) => window.open(storyHref(id), '_top');
/** Opens a story inside the current frame, for links that can't set a target (assistant sources). */
const frameHref = (id: string) => `/iframe.html?id=${id}&viewMode=story`;
const STORY = {
  payslipPhone: 'screens-pay-pay-21-·-payslip-viewer--phone',
  payslip: 'screens-pay-pay-21-·-payslip-viewer--desktop',
  taxDeclarations: 'screens-pay-pay-22-·-tax-workspace--declarations',
  taxPhone: 'screens-pay-pay-22-·-tax-workspace--phone',
  loanSubmitted: 'screens-pay-pay-18-·-loan-or-salary-advance-request--submitted',
  loanSubmittedPhone: 'screens-pay-pay-18-·-loan-or-salary-advance-request--phone-submitted',
  taxOverview: 'screens-pay-pay-22-·-tax-workspace--overview',
  taxDeclarationsPhone: 'screens-pay-pay-22-·-tax-workspace--phone-declarations',
  myDocuments: 'screens-people-ppl-30-·-my-documents-and-letters--desktop',
  myDocumentsPhone: 'screens-people-ppl-30-·-my-documents-and-letters--phone',
  attendance: 'screens-time-extra-·-attendance-calendar--employee',
  askHr: 'screens-helpdesk-hlp-01-·-help-centre--raise-ticket',
  askHrPhone: 'screens-helpdesk-hlp-01-·-help-centre--phone-raise',
  policies: 'screens-helpdesk-hlp-10-·-policy-library-acknowledgement--to-acknowledge',
};

/* Divya's own pay facts used by PAY-21, PAY-22, PAY-40 and PAY-41, all worked out from the payslip lines. */
const lineAmount = (id: string) => MY_LINES.find((l) => l.id === id)?.amount ?? 0;
const MY_BASIC = lineAmount('basic');
const MY_HRA = lineAmount('hra');
const SEP_TDS = lineAmount('tds');
const SEP_LOP = lineAmount('lop');
const SEP_PT = lineAmount('pt');
/** Gross plus the employer's contributions, from the payslip lines (₹1,50,000). */
const MY_MONTHLY_CTC = MY_GROSS + MY_LINES.filter((l) => l.kind === 'employer').reduce((a, l) => a + l.amount, 0);
const DEDUCTED_APR_AUG = MY_TDS_BY_MONTH.reduce((a, b) => a + b, 0);
/** The September run is final, so its TDS is actual: April–September = the payslip's year-to-date tax. */
const TDS_APR_SEP = [...MY_TDS_BY_MONTH, SEP_TDS];
const DEDUCTED_APR_SEP = DEDUCTED_APR_AUG + SEP_TDS;
const OTHER_INCOME = 18_000;
/** 12 months at current gross, less September's unpaid day. */
const SALARY_FOR_YEAR = MY_GROSS * 12 - SEP_LOP;
const TODAY = d(29);
const daysUntil = (to: Date) => Math.round((to.getTime() - TODAY.getTime()) / 86_400_000);
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
/** Months still to be paid after the September run (October–March). */
const MONTHS_LEFT = 12 - TDS_APR_SEP.length;
/** "Oct–Mar" for the last n months of the tax year. */
const monthRange = (n: number) => `${MONTHS[12 - n]}–${MONTHS[11]}`;
const LOP_DATE = `${MY_LOP_DAY} Sep`;

/** Signed-in user for a story that isn't about Divya. */
const asUser = (e: { name: string }) => {
  const [first, last = ''] = e.name.split(' ');
  return { name: e.name, email: `${first.toLowerCase()}.${last.charAt(0).toLowerCase()}@kaverifoods.in` };
};
/** PAY-18 not-eligible story: a fictional new joiner still on probation (Divya was confirmed long ago). */
const NEW_JOINER = [...EMPLOYEES].reverse().find((e) => e.status === 'Active') ?? EMPLOYEES[EMPLOYEES.length - 1];
/** PAY-33 statement: a Sales executive on the South commission plan (Divya, in Quality, isn't on a plan). */
const SALES_REP = EMPLOYEES.find((e) => e.department === 'Sales' && e.manager === 'Vikram Rao') ?? EMPLOYEES[EMPLOYEES.length - 2];

/** Wraps content in the employee desktop frame or the phone frame (Pay tab). `back` is the story the back arrow opens (true = the payslip). */
function EmpFrame({
  layout,
  page,
  title,
  back,
  backLabel = 'Back to payslip',
  user,
  children,
}: {
  layout: Layout;
  page: MyPayPage;
  title: string;
  back?: string | boolean;
  backLabel?: string;
  /** Signed-in person when it isn't Divya (ME). */
  user?: { name: string; email: string };
  children: ReactNode;
}) {
  const backTo = typeof back === 'string' ? back : STORY.payslipPhone;
  if (layout === 'phone')
    return (
      <PhoneFrame tab="pay" title={title} user={user} back={back ? <IconButton icon={ChevronLeft} label={backLabel} onClick={() => goStory(backTo)} /> : undefined}>
        {children}
      </PhoneFrame>
    );
  // Divya (Quality) is on no incentive plan, so My incentives shows only on the incentive story itself (the Sales rep's).
  return (
    <MyPayFrame page={page} user={user} show={{ incentives: page === 'incentives' }}>
      {children}
    </MyPayFrame>
  );
}

/** Keka ideas (2026-11): the tax year's payslips as a month list beside the payslip, newest first. */
export interface PayslipMonth {
  id: string;
  label: string;
  net: number;
  /** "Off-cycle" and the like. */
  note?: string;
}

export function PayslipMonths({ years, year, onYear, months, selectedId, onSelect, onDownloadYear, downloading }: { years: string[]; year: string; onYear: (y: string) => void; months: PayslipMonth[]; selectedId: string | null; onSelect: (id: string) => void; /** T2-B 65 (Keka B4): one zip of the year's payslips. */ onDownloadYear?: () => void; downloading?: boolean }) {
  return (
    <nav className="yx-pay-months__list" aria-label="Payslips by month">
      {years.length > 1 ? (
        <Select aria-label="Tax year" value={year} onChange={(v) => v && onYear(v)} options={years.map((y) => ({ value: y, label: `Tax year ${y}` }))} />
      ) : (
        <p className="yx-pay-muted">Tax year {year}</p>
      )}
      {onDownloadYear && (
        <Button size="sm" icon={Download} loading={downloading} onClick={onDownloadYear} aria-label={`Download the year ${year}`}>
          Download the year
        </Button>
      )}
      <ul>
        {months.map((m) => (
          <li key={m.id}>
            <Button fullWidth className="yx-pay-months__item" aria-current={m.id === selectedId ? 'true' : undefined} onClick={() => onSelect(m.id)}>
              <span>
                {m.label}
                {m.note ? <span className="yx-pay-muted"> · {m.note}</span> : null}
              </span>
              <Amount value={m.net} />
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The tax year (April to March) of a month, as "2026-27". */
export function taxYearOf(month: string): string {
  const y = Number(month.slice(0, 4));
  const start = Number(month.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Drawer on desktop, bottom sheet on phone. */
function Sheet({ layout, open, onOpenChange, title, subtitle, children, footer }: { layout: Layout; open: boolean; onOpenChange: (o: boolean) => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  if (layout === 'phone')
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title={title} description={subtitle} footer={footer}>
        {children}
      </BottomSheet>
    );
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title} subtitle={subtitle} footer={footer} size="lg">
      {children}
    </Drawer>
  );
}

/* ================================================================== PAY-40 "Why is my pay different?" */

export interface PayDiff {
  id: string;
  line: string;
  change: number;
  cause: string | null;
  source?: string;
  /** Story the source link opens. */
  to?: string;
}

const AUG_TDS = MY_TDS_BY_MONTH[MY_TDS_BY_MONTH.length - 1];
export const PAY_DIFFS: PayDiff[] = [
  { id: 'lop', line: 'Unpaid leave, 1 day', change: -SEP_LOP, cause: `No leave was applied for ${LOP_DATE}, and Time marked you absent that day.`, source: `Attendance, ${LOP_DATE}`, to: STORY.attendance },
  { id: 'pt', line: 'Professional tax', change: -SEP_PT, cause: 'Tamil Nadu deducts professional tax twice a year. September is the deduction month for April to September, so August had none.' },
  {
    id: 'tds',
    line: 'Income tax (TDS)',
    change: AUG_TDS - SEP_TDS,
    cause: `Your tax projection was updated on 28 Sep. The tax still due for the year was spread over the ${MY_TAX.remaining} months left (${monthRange(MY_TAX.remaining)}): ${formatINR(AUG_TDS)} in August, ${formatINR(SEP_TDS)} in September.`,
    source: 'Tax workspace, projection 28 Sep',
    to: STORY.taxOverview,
  },
];
export const UNEXPLAINED: PayDiff = { id: 'other', line: 'Canteen recovery', change: -1_000, cause: null };

/** PAY-40 · diff cards per changed line; anything without a payroll record is "not explained" with a query action. */
export function PayDiffPanel({ diffs, previous, current, onQuery, chat, labels = { previous: 'August', current: 'September' } }: { diffs: PayDiff[]; previous: number; current: number; onQuery: (line: string) => void; chat?: boolean; /** Month names of the two payslips (live: from the payslips). */ labels?: { previous: string; current: string } }) {
  const [messages, setMessages] = useState([
    { id: 'm1', role: 'user' as const, text: 'Why did my pay go down this month?' },
    {
      id: 'm2',
      role: 'assistant' as const,
      text: `Your net pay is lower mainly because of 1 unpaid day on ${LOP_DATE} and the half-yearly professional tax. Your income tax went down a little. Each line has its source below.`,
      sources: [
        { label: 'Payslip, September 2026', href: frameHref(STORY.payslip) },
        { label: `Attendance, ${LOP_DATE}`, href: frameHref(STORY.attendance) },
      ],
    },
  ]);
  const total = current - previous;
  return (
    <div className="yx-pay-stack">
      <FactRow
        items={[
          { label: `${labels.previous} net`, value: formatINR(previous) },
          { label: `${labels.current} net`, value: formatINR(current) },
          { label: 'Difference', value: <Amount value={total} signed /> },
        ]}
      />
      {diffs.length === 0 ? (
        <InlineAlert tone="info" title="Your pay is the same as last month">
          No line changed between {labels.previous} and {labels.current}.
        </InlineAlert>
      ) : (
        <ul className="yx-pay-diff" aria-label="Changed lines">
          {diffs.map((x) => (
            <li key={x.id} data-unexplained={x.cause ? undefined : true}>
              <strong>{x.line}</strong>
              <Amount value={x.change} strong signed />
              {x.cause ? (
                <>
                  <p className="yx-pay-diff__cause">{x.cause}</p>
                  {x.source && x.to && (
                    <div className="yx-pay-diff__acts">
                      <Link href={storyHref(x.to)} target="_top">
                        See {x.source}
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="yx-pay-diff__cause">
                    <Badge tone="warning">Not explained</Badge> No payroll record explains this change. Ask payroll and they will reply in the app.
                  </p>
                  <div className="yx-pay-diff__acts">
                    <Button size="sm" icon={MessageSquare} onClick={() => onQuery(x.line)}>
                      Raise payslip query
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="yx-pay-note">Causes come only from payroll records (attendance, arrears, tax projection, component changes, loans, one-time pay). Only you can see this.</p>
      {chat && (
        <section className="yx-pay-panel" data-tone="ai" aria-label="Ask about your payslip">
          <SectionTitle actions={<AiBadge />}>Ask about your payslip</SectionTitle>
          <p className="yx-pay-note">Answers use only your own payslip. Numbers come from payroll, not from the AI.</p>
          <AssistantPanel messages={messages} onSend={(t) => setMessages((m) => [...m, { id: `u${m.length}`, role: 'user', text: t }])} />
        </section>
      )}
    </div>
  );
}

/* ================================================================== PAY-21 Payslip viewer */

export type PayslipVariant = 'default' | 'query' | 'query-sent' | 'query-withdraw' | 'held' | 'not-published' | 'document' | 'why' | 'why-unexplained' | 'why-chat' | 'why-same';

/** PAY-21 · Payslip viewer: net first, days strip, why-this-number, raise a query. Hosts PAY-40. The app passes `live` (Me › Payslips). */
export function PayslipViewerScreen(p: { layout?: Layout; variant?: PayslipVariant; state?: ViewState; live?: LivePayslips }) {
  return p.live ? <LivePayslipViewer live={p.live} /> : <SamplePayslipViewer {...p} />;
}

function SamplePayslipViewer({ layout = 'desktop', variant = 'default', state = 'ready' }: { layout?: Layout; variant?: PayslipVariant; state?: ViewState }) {
  const [query, setQuery] = useState<string | null>(variant === 'query' ? 'Unpaid leave, 1 day' : null);
  const [sent, setSent] = useState(variant === 'query-sent');
  // Founder answer 16: the employee may withdraw their own query, answered or not.
  const [withdrawing, setWithdrawing] = useState(variant === 'query-withdraw');
  const [withdrawn, setWithdrawn] = useState(false);
  const [why, setWhy] = useState(variant.startsWith('why'));
  const [doc, setDoc] = useState(variant === 'document');
  const { toast } = useToast();
  const [aug, setAug] = useState(false);
  /** An earlier month opened from "Earlier payslips". */
  const [past, setPast] = useState<(typeof PAYSLIP_HISTORY)[number] | null>(null);
  const phone = layout === 'phone';
  // The not-explained story carries a ₹1,000 canteen recovery on September, so September (not August) changes.
  const canteen = variant === 'why-unexplained' ? -UNEXPLAINED.change : 0;
  const net = MY_NET - canteen;
  const lines: ExplainedLine[] = canteen
    ? [...MY_LINES, { id: 'canteen', label: UNEXPLAINED.line, amount: canteen, kind: 'deduction', formula: 'Fixed amount entered by payroll', inputs: 'No payroll record gives a reason' }]
    : MY_LINES;
  const prevNet = variant === 'why-same' ? net : MY_PREV_NET;
  const payDate = PAYSLIP_HISTORY[0].paidOn;
  const payIn = daysUntil(payDate);
  // Year to date, April–September: six months' gross plus the May referral bonus.
  const ytd = { gross: MY_GROSS * 6 + MY_MAY_REFERRAL_BONUS, tax: DEDUCTED_APR_SEP, pf: lineAmount('pf') * 6, other: SEP_PT + SEP_LOP };
  const diffs = variant === 'why-same' ? [] : variant === 'why-unexplained' ? [...PAY_DIFFS, UNEXPLAINED] : PAY_DIFFS;
  const openQuery = (line: string) => {
    setWhy(false);
    setQuery(line);
  };
  const actions = (
    <>
      <Button variant="primary" icon={HelpCircle} onClick={() => setWhy(true)}>
        Why is my pay different?
      </Button>
      <Button icon={MessageSquare} onClick={() => setQuery('Whole payslip')}>
        Raise a query
      </Button>
      <Button icon={Download} onClick={() => setDoc(true)}>
        Download PDF
      </Button>
    </>
  );
  const body = past ? (
    <div className="yx-pay-stack">
      <MoneySummary period={past.period} net={past.net} gross={past.gross} deductions={past.gross - past.net} payDate={past.paidOn} status={<Badge tone="success">Paid</Badge>} />
      {phone && (
        <div className="yx-pay-row">
          <Button icon={ChevronLeft} onClick={() => setPast(null)}>
            Back to September 2026
          </Button>
        </div>
      )}
    </div>
  ) : variant === 'not-published' ? (
      aug ? (
        <div className="yx-pay-stack">
          <MoneySummary period="August 2026" net={MY_PREV_NET} gross={PAYSLIP_HISTORY[1].gross} deductions={PAYSLIP_HISTORY[1].gross - MY_PREV_NET} payDate={PAYSLIP_HISTORY[1].paidOn} status={<Badge tone="success">Paid</Badge>} />
          <p className="yx-pay-muted">Your September payslip appears here once payroll publishes it.</p>
        </div>
      ) : (
        <EmptyState title="Your September payslip isn't published yet." description="Payroll publishes payslips after the run is approved and paid. You'll get a notification in the app." action={<Button onClick={() => setAug(true)}>View August payslip</Button>} />
      )
    ) : variant === 'held' ? (
      <div className="yx-pay-stack">
        <InlineAlert
          tone="warning"
          title="Your September salary is on hold"
          actions={
            <Button size="sm" onClick={() => goStory(phone ? STORY.myDocumentsPhone : STORY.myDocuments)}>
              Upload bank proof
            </Button>
          }
        >
          Reason: pending documents (bank proof). PF, professional tax and income tax are still deducted and paid to the government on 30 Sep. Upload the bank proof in Me › Documents; payroll releases the salary in the next bank file.
        </InlineAlert>
        <MoneySummary period="September 2026" net={MY_NET} gross={MY_GROSS} deductions={MY_DEDUCTIONS} payDate={payDate} payLabel="Paid in the next bank file after you upload bank proof" status={<Badge tone="warning">On hold</Badge>} />
      </div>
    ) : (
      <div className="yx-pay-stack">
        <MoneySummary
          period="September 2026"
          net={net}
          gross={MY_GROSS}
          deductions={MY_DEDUCTIONS + canteen}
          employerCost={MY_MONTHLY_CTC}
          payDate={payDate}
          status={<Badge tone="neutral">{payIn <= 0 ? 'Paid' : payIn === 1 ? 'Pays tomorrow' : `Pays in ${payIn} days`}</Badge>}
          change={prevNet === net ? 'Same as August' : `${formatINR(prevNet - net)} less than August`}
          actions={phone && state === 'ready' ? actions : undefined}
        />
        {(sent || variant === 'query-withdraw') && !withdrawn && (
          <section className="yx-pay-panel" aria-label="Your queries on this payslip">
            <SectionTitle>Your queries on this payslip</SectionTitle>
            <ul className="yx-pay-cards">
              <li>
                <div className="yx-pay-cards__row">
                  <strong>Unpaid leave, 1 day</strong>
                  <Badge tone="warning">Waiting for payroll</Badge>
                </div>
                <span className="yx-pay-muted">I applied for casual leave on {LOP_DATE}. Why is it unpaid?</span>
                <div className="yx-pay-row">
                  <Button size="sm" onClick={() => setWithdrawing(true)}>
                    Withdraw query
                  </Button>
                </div>
              </li>
            </ul>
          </section>
        )}
        <ConfirmDialog
          open={withdrawing}
          onOpenChange={setWithdrawing}
          title="Withdraw this query?"
          consequence="Payroll stops working on it and it closes. You can raise a new one any time."
          confirmLabel="Withdraw query"
          onConfirm={() => setWithdrawn(true)}
        />
        <section className="yx-pay-panel" aria-label="Days">
          <SectionTitle>Days in September</SectionTitle>
          <DaysStrip days={MY_DAYS} periodLabel="September 2026" />
          <p className="yx-pay-muted">
            {MY_PAYSLIP.paidDays} paid days of {MY_PAYSLIP.paidDays + MY_PAYSLIP.lopDays} · 1 unpaid day on {LOP_DATE}
          </p>
        </section>
        <div className={phone ? 'yx-pay-stack' : 'yx-pay-split'}>
          <section className="yx-pay-panel" aria-label="Why this number">
            <SectionTitle>How your pay was worked out</SectionTitle>
            <WhyThisNumber lines={lines} onQuery={(l: ExplainedLine) => setQuery(l.label)} defaultOpenId={phone ? undefined : 'lop'} />
          </section>
          <div className="yx-pay-stack">
            <Card title="Year to date">
              <DescriptionList
                items={[
                  { label: 'Gross earnings', value: formatINR(ytd.gross) },
                  { label: 'Income tax', value: formatINR(ytd.tax) },
                  { label: 'Provident fund', value: formatINR(ytd.pf) },
                  { label: 'Professional tax and unpaid leave', value: formatINR(ytd.other) },
                  { label: 'Net pay', value: formatINR(ytd.gross - ytd.tax - ytd.pf - ytd.other) },
                ]}
              />
              <p className="yx-pay-note">April–September. Gross includes the {formatINR(MY_MAY_REFERRAL_BONUS)} referral bonus paid in May.</p>
            </Card>
            {phone && (
              <Card title="Earlier payslips">
                <ul className="yx-pay-cards">
                  {PAYSLIP_HISTORY.slice(1).map((p) => (
                    <li key={p.id}>
                      <div className="yx-pay-cards__row">
                        <Button size="sm" icon={FileText} onClick={() => setPast(p)}>
                          {p.period}
                        </Button>
                        <Amount value={p.net} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  return (
    <EmpFrame layout={layout} page="payslips" title={past ? `Payslip, ${past.period}` : 'Payslip, Sep 2026'}>
      {!phone && (
        <PageHeader
          title={`Payslip for ${past?.period ?? 'September 2026'}`}
          description={`${MY_PAYSLIP.company.name} · ${MY_PAYSLIP.employee.code}`}
          actions={variant === 'not-published' || past || state !== 'ready' ? undefined : actions}
        />
      )}
      <StateBlock state={state} rows={6} errorTitle="We couldn't load your payslip.">
        {phone || variant === 'not-published' ? (
          body
        ) : (
          <div className="yx-pay-months">
            <PayslipMonths
              years={['2026-27']}
              year="2026-27"
              onYear={() => {}}
              months={PAYSLIP_HISTORY.map((p) => ({ id: p.id, label: p.period, net: p.id === 'sep' ? net : p.net }))}
              selectedId={past?.id ?? 'sep'}
              onSelect={(id) => setPast(id === 'sep' ? null : (PAYSLIP_HISTORY.find((p) => p.id === id) ?? null))}
              onDownloadYear={() => toast({ title: 'Payslips downloaded', description: 'Your 2026-27 payslips are in your downloads as one zip file.', tone: 'success' })}
            />
            {body}
          </div>
        )}
      </StateBlock>
      <Sheet
        layout={layout}
        open={query != null}
        onOpenChange={(o) => !o && setQuery(null)}
        title="Raise a query on this payslip"
        subtitle="Your question goes to payroll. The reply stays in the app."
        footer={
          <>
            <Button onClick={() => setQuery(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setQuery(null);
                setSent(true);
                toast({ tone: 'success', title: 'Query sent to payroll', description: "Suresh Pillai will reply here within 2 working days. You'll get a notification in the app." });
              }}
            >
              Send query
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          <FormField label="About">
            <Select value={query ?? 'Whole payslip'} onChange={(v) => setQuery(v ?? 'Whole payslip')} options={['Whole payslip', ...MY_LINES.filter((l) => l.kind !== 'employer').map((l) => l.label), 'Canteen recovery'].map((v) => ({ value: v, label: v }))} />
          </FormField>
          <FormField label="Your question" required helper="Say what you expected, for example the leave you applied for.">
            <TextArea rows={4} defaultValue={variant === 'query' ? `I was at work on ${LOP_DATE}. Why is it unpaid?` : ''} />
          </FormField>
        </div>
      </Sheet>
      <Sheet layout={layout} open={why} onOpenChange={setWhy} title="Why is my pay different?" subtitle="September compared with August" footer={<Button onClick={() => setWhy(false)}>Close</Button>}>
        <PayDiffPanel diffs={diffs} previous={prevNet} current={net} onQuery={openQuery} chat={variant === 'why-chat'} />
      </Sheet>
      <Drawer
        open={doc}
        onOpenChange={setDoc}
        title="Payslip PDF"
        subtitle={`Your September 2026 payslip, as issued by ${MY_PAYSLIP.company.name}`}
        size="full"
        footer={
          <Button variant="primary" icon={Download} onClick={() => toast({ tone: 'success', title: 'Payslip downloaded', description: `Saved as ${MY_PAYSLIP.employee.code}-payslip-Sep-2026.pdf in your downloads.` })}>
            Download PDF
          </Button>
        }
      >
        <div className="yx-pay-preview" tabIndex={0} role="region" aria-label="Payslip preview">
          <PayslipDocument data={MY_PAYSLIP} />
        </div>
      </Drawer>
    </EmpFrame>
  );
}

/* ================================================================== PAY-41 Compare tax regimes */

export interface RegimeCompareProps {
  gross?: number;
  base?: Deductions;
  resident?: boolean;
  /** Monthly basic and HRA from the person's own pay structure; metro uses the 50% of basic limit. */
  basicMonthly?: number;
  hraMonthly?: number;
  metro?: boolean;
  defaultExtra?: { invest: number; rent: number; homeLoan: number; nps: number };
  chosen?: Regime;
  /** Last day the employee can change regime. */
  cutOff?: Date;
  /** Opens Declarations: switches tab inside the workspace, opens PAY-22 when standalone. */
  onOpenDeclarations?: () => void;
}

const sumSection = (lines: DeclLine[], section: string) => lines.filter((l) => l.section === section).reduce((a, l) => a + l.declared, 0);
/** Deductions from the declaration lines; the HRA exemption is worked out from rent separately. */
function declaredDeductions(lines: DeclLine[]): Deductions {
  return { sec80c: sumSection(lines, '80C-equivalent'), sec80d: sumSection(lines, '80D-equivalent'), nps: sumSection(lines, 'NPS (own)'), homeLoanInterest: sumSection(lines, 'Home-loan interest'), hraExemption: 0, employerNps: 0 };
}
const DECL_BASE = declaredDeductions(MY_DECLARATIONS);
const DECL_RENT = Math.round(sumSection(MY_DECLARATIONS, 'HRA') / 12);
/** Salary + May referral bonus + other income; equals MY_TAX.projectedGross. */
const MY_PROJECTED = SALARY_FOR_YEAR + MY_MAY_REFERRAL_BONUS + OTHER_INCOME;
const RULES_TEXT = `Based on Income-tax Act 2025 rates for ${MY_TAX.taxYear.toLowerCase()}.`;

/** PAY-41 · Old vs new regime, what-if sliders, "Estimate, not tax advice". Never picks a regime. */
export function RegimeComparePanel({
  gross = MY_PROJECTED,
  base = DECL_BASE,
  resident = true,
  basicMonthly = MY_BASIC,
  hraMonthly = MY_HRA,
  metro = true,
  defaultExtra = { invest: 0, rent: DECL_RENT, homeLoan: 0, nps: 0 },
  chosen = MY_TAX.regime,
  cutOff = MY_TAX.regimeCutOff,
  onOpenDeclarations = () => goStory(STORY.taxDeclarations),
}: RegimeCompareProps) {
  const [x, setX] = useState(defaultExtra);
  const hraMonth = hraExemptionMonth(hraMonthly, x.rent, basicMonthly, metro);
  const hra = hraMonth * 12;
  // Which of the three HRA limits gives the exemption (the lowest one wins).
  const basicPct = metro ? 50 : 40;
  const hraLimits: [number, string][] = [
    [hraMonthly, `the HRA you receive, ${formatINR(hraMonthly)} a month`],
    [x.rent - basicMonthly * 0.1, `your rent minus 10% of basic, ${formatINR(Math.max(0, Math.round(x.rent - basicMonthly * 0.1)))} a month`],
    [(basicMonthly * basicPct) / 100, `${basicPct}% of basic (${metro ? 'metro' : 'non-metro'} city), ${formatINR(Math.round((basicMonthly * basicPct) / 100))} a month`],
  ];
  const hraLimit = hraLimits.reduce((lo, l) => (l[0] < lo[0] ? l : lo))[1];
  const room80c = Math.max(0, DEDUCTION_CAPS.sec80c - base.sec80c);
  const roomNps = Math.max(0, DEDUCTION_CAPS.nps - base.nps);
  const invest = Math.min(x.invest, room80c);
  const nps = Math.min(x.nps, roomNps);
  const ded: Deductions = { ...base, sec80c: base.sec80c + invest, nps: base.nps + nps, homeLoanInterest: base.homeLoanInterest + x.homeLoan, hraExemption: hra };
  const cmp = compareRegimes(gross, ded, resident);
  const months = MONTHS_LEFT;
  const days = daysUntil(cutOff);
  const parts: [string, number][] = [
    ['80C-equivalent', Math.min(ded.sec80c, DEDUCTION_CAPS.sec80c)],
    ['80D-equivalent', Math.min(ded.sec80d, DEDUCTION_CAPS.sec80d)],
    ['NPS (own)', Math.min(ded.nps, DEDUCTION_CAPS.nps)],
    ['HRA exemption', hra],
    ['Home-loan interest', Math.min(ded.homeLoanInterest, DEDUCTION_CAPS.homeLoanInterest)],
  ];
  return (
    <section className="yx-pay-panel" aria-label="Compare tax regimes">
      <SectionTitle actions={<Badge tone="info">Estimate, not tax advice</Badge>}>Compare tax regimes</SectionTitle>
      <p className="yx-pay-muted">
        On your projected income of {formatINR(gross)}. {RULES_TEXT} This tool never chooses a regime for you.
      </p>
      <CompareBars
        label="Tax for the year under each regime"
        items={[
          { label: 'New regime', value: cmp.new.total, note: chosen === 'new' ? '(your choice)' : undefined, emphasis: chosen === 'new' },
          { label: 'Old regime', value: cmp.old.total, note: chosen === 'old' ? '(your choice)' : undefined, emphasis: chosen === 'old' },
        ]}
      />
      <p aria-live="polite">
        {cmp.lower === 'same'
          ? 'Both regimes give the same tax.'
          : `Tax is ${formatINR(cmp.difference)} lower under the ${cmp.lower} regime with these figures: about ${formatINR(Math.round(cmp.difference / months))} a month for the remaining ${months} months (${monthRange(months)}).`}
      </p>
      <div className="yx-pay-row">
        <Button onClick={onOpenDeclarations}>Open Declarations</Button>
        <span className="yx-pay-muted">
          {days >= 0 ? `You choose your regime in Declarations. You can change it until ${formatDate(cutOff)} (in ${days} days).` : `Your regime was locked on ${formatDate(cutOff)}. Only HR can change it now.`}
        </span>
      </div>
      {!resident && <InlineAlert tone="info">As a non-resident this year, the rebate doesn't apply in either regime.</InlineAlert>}
      <div className="yx-pay-grid">
        <div data-span="6" className="yx-pay-stack">
          <Slider
            valueText={formatINR}
            label="Extra 80C-equivalent investment"
            value={invest}
            max={room80c}
            step={5_000}
            disabled={!room80c}
            onChange={(n) => setX({ ...x, invest: n })}
            hint={room80c ? `You can add up to ${formatINR(room80c)} more.` : `You have used the full ${formatINR(DEDUCTION_CAPS.sec80c)} limit; extra investment won't lower tax.`}
          />
          <Slider
            valueText={formatINR}
            label="Monthly rent"
            value={x.rent}
            max={80_000}
            step={1_000}
            onChange={(n) => setX({ ...x, rent: n })}
            hint={`HRA exemption for the year: ${formatINR(hra)} (old regime only). It is the lowest of three limits; here that is ${hraLimit}.`}
          />
          <Slider valueText={formatINR} label="Home-loan interest for the year" value={x.homeLoan} max={DEDUCTION_CAPS.homeLoanInterest} step={10_000} onChange={(n) => setX({ ...x, homeLoan: n })} />
          <Slider
            valueText={formatINR}
            label="Extra NPS (own)"
            value={nps}
            max={roomNps}
            step={5_000}
            disabled={!roomNps}
            onChange={(n) => setX({ ...x, nps: n })}
            hint={roomNps ? `You can add up to ${formatINR(roomNps)} more.` : `You already declare the full ${formatINR(DEDUCTION_CAPS.nps)} NPS limit.`}
          />
        </div>
        <div data-span="6">
          <PlainTable
            label="Tax working, new vs old"
            rows={(
              [
                ['Income', 'gross'],
                ['Standard deduction', 'standardDeduction'],
                ['Deductions and exemptions', 'deductions'],
                ['Taxable income', 'taxable'],
                ['Tax on slabs', 'slabTax'],
                ['Rebate', 'rebate'],
                ['Health and education cess', 'cess'],
              ] as const
            ).flatMap(([l, k]) => [
              { id: k, label: l, newV: cmp.new[k], oldV: cmp.old[k], sub: false },
              ...(k === 'deductions' ? parts.map(([pl, pv]) => ({ id: pl, label: `of which ${pl}`, newV: 0, oldV: pv, sub: true })) : []),
            ])}
            getRowId={(r) => r.id}
            columns={[
              { key: 'working', header: 'Working', rowHeader: true, cell: (r) => (r.sub ? <span className="yx-pay-muted">{r.label}</span> : r.label) },
              { key: 'new', header: 'New', num: true, cell: (r) => (r.sub ? <span className="yx-pay-muted">{formatINR(r.newV)}</span> : formatINR(r.newV)) },
              { key: 'old', header: 'Old', num: true, cell: (r) => (r.sub ? <span className="yx-pay-muted">{formatINR(r.oldV)}</span> : formatINR(r.oldV)) },
            ]}
            footer={[{ id: 'total', label: 'Tax for the year', cells: { new: formatINR(cmp.new.total), old: formatINR(cmp.old.total) } }]}
          />
        </div>
      </div>
      <p className="yx-pay-note">Only you can see these scenarios. Your manager never sees them, and payroll sees only the regime you choose and your declarations.</p>
    </section>
  );
}

/** PAY-41 as a standalone screen (desktop panel or phone). Live, it is the Compare tab of the tax workspace. */
export function RegimeCompareScreen(p: { layout?: Layout; props?: RegimeCompareProps; state?: ViewState; live?: LiveRegimeCompare }) {
  return p.live ? <LiveRegimeCompare live={p.live} /> : <SampleRegimeCompare {...p} />;
}

function SampleRegimeCompare({ layout = 'desktop', props, state = 'ready' }: { layout?: Layout; props?: RegimeCompareProps; state?: ViewState }) {
  return (
    <EmpFrame layout={layout} page="tax" title="Compare regimes" back={STORY.taxPhone} backLabel="Back to Tax">
      {layout === 'desktop' && <PageHeader title="Compare tax regimes" description={MY_TAX.taxYear} />}
      <StateBlock state={state} rows={6} errorTitle="We couldn't load your tax figures.">
        <RegimeComparePanel onOpenDeclarations={() => goStory(layout === 'phone' ? STORY.taxDeclarationsPhone : STORY.taxDeclarations)} {...props} />
      </StateBlock>
    </EmpFrame>
  );
}

/* ================================================================== PAY-22 Tax workspace */

type ProofStatus = DeclLine['proof'] | 'Proof needed';
const PROOF_TONE: Record<ProofStatus, BadgeTone> = { 'Not due': 'neutral', 'Proof needed': 'info', Uploaded: 'info', Approved: 'success', Rejected: 'danger', 'Partly approved': 'warning' };
const DECL_SECTIONS = ['80C-equivalent', '80D-equivalent', 'NPS (own)', 'HRA', 'Home-loan interest'];
const PROOF_STATUSES: DeclLine['proof'][] = ['Approved', 'Uploaded', 'Rejected', 'Approved', 'Partly approved', 'Not due', 'Uploaded'];
/** Proofs story (old-regime variant): an employee in the old regime since April whose proofs payroll has started checking. */
const PROOF_LINES: DeclLine[] = MY_DECLARATIONS.map((l, i) => ({
  ...l,
  proof: PROOF_STATUSES[i],
  approved: i === 4 ? 22_000 : undefined,
  comment: i === 2 ? 'Premium receipt is for 2025-26. Upload the 2026-27 receipt.' : i === 4 ? `One receipt missing. Upload it to claim the remaining ${formatINR(l.declared - 22_000)}.` : undefined,
}));
/** Deductions from declaration lines, with the HRA exemption worked out from the declared rent (Chennai, metro). */
const deductionsFor = (ls: DeclLine[]): Deductions => ({ ...declaredDeductions(ls), hraExemption: hraExemptionMonth(MY_HRA, Math.round(sumSection(ls, 'HRA') / 12), MY_BASIC, true) * 12 });
/** Old-regime TDS history for the proofs variant: April–September at one twelfth of the old-regime tax declared in April. */
const PROOF_TDS_APR_SEP = Array<number>(TDS_APR_SEP.length).fill(Math.round(computeTax(MY_PROJECTED, 'old', deductionsFor(PROOF_LINES)).total / 12));
const uploaded = (items: UploadItem[]) => items.some((i) => i.status === 'done');
const PROOFS_OPEN = TODAY.getTime() >= MY_TAX.proofWindow.from.getTime() && TODAY.getTime() <= MY_TAX.proofWindow.to.getTime();

export type TaxVariant = 'declare' | 'locked' | 'proofs' | 'non-resident' | 'no-pan';

/** PAY-22 · Tax workspace: regime compare, declarations, proofs, TDS explanation, Form 12B, residential status. The app passes `live`. */
export function TaxWorkspaceScreen(p: { layout?: Layout; tab?: string; variant?: TaxVariant; state?: ViewState; live?: LiveTax }) {
  return p.live ? <LiveTaxWorkspace live={p.live} /> : <SampleTaxWorkspace {...p} />;
}

function SampleTaxWorkspace({ layout = 'desktop', tab = 'overview', variant = 'declare', state = 'ready' }: { layout?: Layout; tab?: string; variant?: TaxVariant; state?: ViewState }) {
  const phone = layout === 'phone';
  const ready = state === 'ready';
  const proofsStory = variant === 'proofs';
  // The locked and proofs stories use an earlier company cut-off (31 Aug), so the regime really is locked on 29 Sep.
  const cutOff = variant === 'locked' || proofsStory ? d(31, 7) : MY_TAX.regimeCutOff;
  const cutOffDays = daysUntil(cutOff);
  const locked = cutOffDays < 0;
  const savedResident = variant !== 'non-resident';
  const [activeTab, setActiveTab] = useState(tab);
  const [regime, setRegime] = useState<Regime>(proofsStory ? 'old' : MY_TAX.regime);
  const [lines, setLines] = useState<DeclLine[]>(proofsStory ? PROOF_LINES : MY_DECLARATIONS);
  // What payroll uses: the header, Overview, Compare and Proofs show these until Save declarations.
  const [savedRegime, setSavedRegime] = useState<Regime>(regime);
  const [savedLines, setSavedLines] = useState<DeclLine[]>(lines);
  const [editing, setEditing] = useState<DeclLine | null>(null);
  const [declDirty, setDeclDirty] = useState(false);
  const [declSaved, setDeclSaved] = useState(false);
  const [prevSalary, setPrevSalary] = useState<number | null>(0);
  const [prevTds, setPrevTds] = useState<number | null>(0);
  const [otherIncome, setOtherIncome] = useState<number | null>(OTHER_INCOME);
  const [form12b, setForm12b] = useState(false);
  const [prevSaved, setPrevSaved] = useState(false);
  const [prevDirty, setPrevDirty] = useState(false);
  const [res, setRes] = useState<'r' | 'nr'>(savedResident ? 'r' : 'nr');
  const [trc, setTrc] = useState(false);
  const [form10f, setForm10f] = useState(false);
  const [resSent, setResSent] = useState(false);
  const [askHr, setAskHr] = useState(false);
  const [hrReason, setHrReason] = useState('');
  const [hrSent, setHrSent] = useState(false);
  const [pan, setPan] = useState(false);
  const [panProof, setPanProof] = useState(false);
  const [panSent, setPanSent] = useState(false);

  // One calculation feeds the header, Overview, chart and Compare tab.
  const projected = SALARY_FOR_YEAR + MY_MAY_REFERRAL_BONUS + (otherIncome ?? 0) + (prevSalary ?? 0);
  const rentMonthly = Math.round(sumSection(savedLines, 'HRA') / 12);
  const declared = declaredDeductions(savedLines);
  const monthsLeft = MONTHS_LEFT;
  // September's payslip is final, so April–September is actual and the rest is spread over October–March.
  const tdsSoFar = proofsStory ? PROOF_TDS_APR_SEP : TDS_APR_SEP;
  const deductedHere = tdsSoFar.reduce((a, b) => a + b, 0);
  const deducted = deductedHere + (prevTds ?? 0);
  const planFor = (rg: Regime, ls: DeclLine[], resident: boolean) => {
    const tax = compareRegimes(projected, deductionsFor(ls), resident)[rg];
    // YX-TAX-10: inoperative PAN → higher of 20% or the average slab rate on taxable income.
    const noPanTax = Math.max(tax.total, noPanTds(tax.taxable, tax.taxable ? (tax.total / tax.taxable) * 100 : 0));
    const annual = variant === 'no-pan' ? noPanTax : tax.total;
    return { tax, annual, monthly: monthlyTds(annual, deducted, monthsLeft), normalMonthly: monthlyTds(tax.total, deducted, monthsLeft) };
  };
  const { tax, annual, monthly, normalMonthly } = planFor(savedRegime, savedLines, savedResident);
  const draft = planFor(regime, lines, savedResident);
  const pickedMonthly = planFor(savedRegime, savedLines, res === 'r').monthly;
  const tdsByMonth = [...tdsSoFar, ...Array<number>(monthsLeft).fill(monthly)];
  const resChanged = (res === 'r') !== savedResident;
  const needs12b = !!prevSalary && !form12b;
  const { toast } = useToast();
  const resEarly = useTooEarly(res === 'nr' ? [...(!trc ? [{ fieldId: 'rs-trc', message: 'Upload your tax residency certificate.' }] : []), ...(!form10f ? [{ fieldId: 'rs-10f', message: 'Tick this once you have filed Form 10F.' }] : [])] : []);
  const prevEarly = useTooEarly(needs12b ? [{ fieldId: 'pe-12b', message: "Upload Form 12B to save a previous employer's salary." }] : []);
  const hrEarly = useTooEarly(!hrReason.trim() ? [{ fieldId: 'hr-reason', message: 'Give a reason to send.' }] : []);
  const panEarly = useTooEarly(!panProof ? [{ fieldId: 'pan-proof', message: 'Upload the confirmation to send.' }] : []);
  const rejected = savedLines.filter((l) => l.proof === 'Rejected').length;
  const partly = savedLines.filter((l) => l.proof === 'Partly approved').length;
  const isNewLine = editing != null && !lines.some((l) => l.id === editing.id);
  const lineEarly = useTooEarly(editing ? [...(!editing.item.trim() ? [{ fieldId: 'dl-item', message: 'Enter the item.' }] : []), ...(!editing.declared ? [{ fieldId: 'dl-amount', message: 'Enter the amount for the year.' }] : [])] : []);
  const leftRange = monthRange(monthsLeft);

  const facts = [
    { label: 'Regime', value: savedRegime === 'new' ? 'New (default)' : 'Old' },
    { label: 'Projected tax', value: formatINR(annual) },
    { label: prevTds ? 'Deducted so far (incl. previous employer)' : 'Deducted so far (Apr–Sep)', value: formatINR(deducted) },
    { label: `Monthly TDS (${leftRange})`, value: formatINR(monthly) },
    { label: 'Residential status', value: resSent ? `${res === 'r' ? 'Resident' : 'Non-resident'} (with HR)` : savedResident ? MY_TAX.residential : 'Non-resident' },
  ];
  const statusBadge = locked ? (
    <Badge tone="neutral">Regime locked on {formatDate(cutOff)}</Badge>
  ) : (
    <Badge tone={cutOffDays <= 7 ? 'warning' : 'info'}>
      Declarations open until {formatDate(cutOff)} · in {cutOffDays} days
    </Badge>
  );
  const form16Button = (
    <Button icon={Download} onClick={() => toast({ tone: 'success', title: 'Form 16 for 2025-26 downloaded', description: `Saved as ${MY_PAYSLIP.employee.code}-Form16-2025-26.pdf in your downloads. Your Form 130 for 2026-27 comes after this tax year ends.` })}>
      Form 16 for 2025-26
    </Button>
  );
  const saveLine = () => {
    if (!editing) return;
    setLines((ls) => (isNewLine ? [...ls, editing] : ls.map((l) => (l.id === editing.id ? editing : l))));
    setEditing(null);
    setDeclDirty(true);
    setDeclSaved(false);
  };
  return (
    <EmpFrame layout={layout} page="tax" title="Tax" back>
      {!phone && <ObjectHeader name={`Tax workspace · ${MY_TAX.taxYear}`} icon={FileText} secondary="Your regime, declarations, proofs and how your monthly tax is worked out." status={ready ? statusBadge : undefined} facts={ready ? facts : undefined} actions={ready ? form16Button : undefined} />}
      {phone && ready && (
        <div className="yx-pay-stack">
          <div>{statusBadge}</div>
          <FactRow items={[facts[0], facts[3], facts[1]]} />
          <div className="yx-pay-row">{form16Button}</div>
        </div>
      )}
      {variant === 'no-pan' && ready && (
        <InlineAlert
          tone="warning"
          title={panSent ? 'PAN link proof sent to payroll' : 'Your PAN is inoperative'}
          actions={panSent ? undefined : <Button size="sm" onClick={() => setPan(true)}>How to link PAN</Button>}
        >
          {panSent
            ? `Suresh Pillai checks it. Until then tax stays at the higher rate: ${formatINR(monthly)} a month.`
            : `Tax is deducted at the higher of 20% or your slab rate until your PAN is linked with Aadhaar. Until then: ${formatINR(monthly)} a month instead of ${formatINR(normalMonthly)}.`}
        </InlineAlert>
      )}
      <StateBlock state={state} rows={8} errorTitle="We couldn't load your tax workspace.">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList aria-label="Tax workspace">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="compare">Compare regimes</TabsTrigger>
            <TabsTrigger value="declarations" count={lines.length}>
              Declarations
            </TabsTrigger>
            <TabsTrigger value="proofs">Proofs</TabsTrigger>
            <TabsTrigger value="previous">Previous employer</TabsTrigger>
            <TabsTrigger value="residential">Residential status</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div className="yx-pay-stack">
              <section className="yx-pay-panel" aria-label="How your monthly tax is worked out">
                <SectionTitle>How your monthly tax is worked out</SectionTitle>
                <ol className="yx-pay-muted">
                  <li>
                    Projected income for the year: {formatINR(projected)} = salary {formatINR(SALARY_FOR_YEAR)} (April–August actual, September payslip after 1 unpaid day, October–March at current pay) + referral bonus {formatINR(MY_MAY_REFERRAL_BONUS)} (May) + other income {formatINR(otherIncome ?? 0)}
                    {prevSalary ? ` + previous employer ${formatINR(prevSalary)}` : ''}.
                  </li>
                  <li>
                    {savedRegime === 'new' ? `New regime: standard deduction ${formatINR(tax.standardDeduction)}` : `Old regime: standard deduction ${formatINR(tax.standardDeduction)} + deductions and exemptions ${formatINR(tax.deductions)}`}; taxable {formatINR(tax.taxable)}.
                  </li>
                  <li>
                    Tax on slabs {formatINR(tax.slabTax)}
                    {tax.rebate ? ` − rebate ${formatINR(tax.rebate)}` : ''} + cess {formatINR(tax.cess)} = {formatINR(tax.total)}.
                  </li>
                  {variant === 'no-pan' && <li>PAN inoperative: tax at 20% of taxable income = {formatINR(annual)}.</li>}
                  <li>
                    Deducted April–September {formatINR(deductedHere)} (September payslip included)
                    {prevTds ? ` + previous employer ${formatINR(prevTds)}` : ''}; the rest, {formatINR(Math.max(0, annual - deducted))} ÷ {monthsLeft} months ({leftRange}) = <strong>{formatINR(monthly)}</strong> a month.
                  </li>
                </ol>
                <p className="yx-pay-note">The tax shown here and the tax on your payslip come from the same calculation. {RULES_TEXT}</p>
              </section>
              <BarChart title="Tax deducted by month" description={`Actual ${MONTHS[0]}–${MONTHS[11 - monthsLeft]}; ${leftRange} at the current projection.`} categories={MONTHS} series={[{ name: 'TDS', values: tdsByMonth }]} money xLabel="Month" height={180} horizontalBelow={600} />
            </div>
          </TabsContent>
          <TabsContent value="compare">
            <RegimeComparePanel gross={projected} base={declared} resident={savedResident} chosen={savedRegime} cutOff={cutOff} defaultExtra={{ invest: 0, rent: rentMonthly, homeLoan: 0, nps: 0 }} onOpenDeclarations={() => setActiveTab('declarations')} />
          </TabsContent>
          <TabsContent value="declarations">
            <div className="yx-pay-stack">
              <section className="yx-pay-panel" aria-label="Regime">
                <SectionTitle>Your regime for {MY_TAX.taxYear.toLowerCase()}</SectionTitle>
                {locked ? (
                  hrSent ? (
                    <InlineAlert tone="info" title="Waiting for HR">
                      Lakshmi Venkatesan is reviewing your request to switch to the {regime === 'new' ? 'old' : 'new'} regime. You'll get a notification in the app.
                    </InlineAlert>
                  ) : (
                    <InlineAlert
                      tone="info"
                      title={`${regime === 'new' ? 'New' : 'Old'} regime, locked on ${formatDate(cutOff)}`}
                      actions={
                        <Button size="sm" onClick={() => setAskHr(true)}>
                          Ask HR to change regime
                        </Button>
                      }
                    >
                      The company cut-off has passed. Only HR can change your regime now, with a reason.
                    </InlineAlert>
                  )
                ) : (
                  <RadioGroup
                    aria-label="Tax regime"
                    value={regime}
                    onChange={(v) => {
                      setRegime(v as Regime);
                      setDeclDirty(true);
                      setDeclSaved(false);
                    }}
                    options={[
                      { value: 'new', label: 'New regime (default)', description: 'Lower slab rates; most deductions not allowed. Standard deduction ₹75,000.' },
                      { value: 'old', label: 'Old regime', description: 'Higher slab rates; 80C-equivalent, 80D-equivalent, HRA, home-loan interest allowed.' },
                    ]}
                  />
                )}
                {regime === 'new' && !locked && <p className="yx-pay-note">In the new regime, the declarations below don't reduce your tax. Keep them if you might switch before the cut-off.</p>}
                {locked && <p className="yx-pay-note">You can still edit and add declarations until {formatDate(MY_TAX.proofWindow.to)}. They count only in the old regime.</p>}
              </section>
              {declDirty && (
                <InlineAlert tone="info" title="Not saved yet">
                  {draft.annual === annual
                    ? `With these changes your tax stays ${formatINR(annual)} for the year.`
                    : `With these changes your tax would be ${formatINR(draft.annual)} for the year (${formatINR(draft.monthly)} a month from October) instead of ${formatINR(annual)}.`}{' '}
                  Nothing changes until you save.
                </InlineAlert>
              )}
              {phone ? (
                <ul className="yx-pay-cards" aria-label="Declarations">
                  {lines.map((l) => (
                    <li key={l.id}>
                      <div className="yx-pay-cards__row">
                        <strong>{l.item}</strong>
                        <Button size="sm" onClick={() => setEditing(l)}>
                          Edit
                        </Button>
                      </div>
                      <span className="yx-pay-muted">
                        {l.section} · {formatINR(l.declared)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <PlainTable
                  label="Declarations"
                  rows={lines}
                  getRowId={(l) => l.id}
                  columns={[
                    {
                      key: 'item',
                      header: 'Item and section',
                      cell: (l) => (
                        <>
                          <strong>{l.item}</strong>
                          <br />
                          <span className="yx-pay-muted">{l.section}</span>
                        </>
                      ),
                    },
                    { key: 'amount', header: 'Declared', num: true, cell: (l) => formatINR(l.declared) },
                    {
                      key: 'act',
                      header: <span className="yx-visually-hidden">Actions</span>,
                      cell: (l) => (
                        <Button size="sm" onClick={() => setEditing(l)}>
                          Edit
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
              <div className="yx-pay-row">
                <Button onClick={() => setEditing({ id: `new-${Date.now()}`, section: DECL_SECTIONS[0], item: '', declared: 0, proof: 'Not due' })}>Add declaration</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!declDirty) return void toast({ title: `Nothing to save yet. ${locked ? 'Edit or add a line.' : 'Change your regime, or edit or add a line.'}` });
                    setSavedRegime(regime);
                    setSavedLines(lines);
                    setDeclDirty(false);
                    setDeclSaved(true);
                    toast({ tone: 'success', title: 'Declarations saved', description: regime === 'new' ? "Your October payslip uses them. In the new regime they don't change your tax." : `Your October payslip uses them: monthly TDS ${formatINR(planFor(regime, lines, savedResident).monthly)}.` });
                  }}
                >
                  Save declarations
                </Button>
                {!declDirty && !declSaved && <span className="yx-pay-note">Nothing to save yet. {locked ? 'Edit or add a line.' : 'Change your regime, or edit or add a line.'}</span>}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="proofs">
            <div className="yx-pay-stack">
              {savedRegime === 'new' ? (
                <InlineAlert tone="info" title="No proofs needed in the new regime">
                  {locked
                    ? "These declarations don't reduce your tax in the new regime, so payroll doesn't ask for proofs."
                    : `These declarations don't reduce your tax in the new regime, so payroll doesn't ask for proofs. If you switch to the old regime by ${formatDate(cutOff)}, upload them between ${formatDate(MY_TAX.proofWindow.from)} and ${formatDate(MY_TAX.proofWindow.to)}.`}
                </InlineAlert>
              ) : (
                <InlineAlert
                  tone={proofsStory && rejected + partly > 0 ? 'warning' : 'info'}
                  title={proofsStory ? `${rejected} proof${rejected === 1 ? '' : 's'} rejected, ${partly} partly approved` : `Proof window: ${formatDate(MY_TAX.proofWindow.from)} to ${formatDate(MY_TAX.proofWindow.to)}`}
                >
                  {proofsStory
                    ? `Upload a corrected proof by ${formatDate(MY_TAX.proofWindow.to)}. After that date, unproven items are dropped and the extra tax is spread over the remaining months.`
                    : 'Payroll verifies each line. Until then, your declarations are used for the projection.'}
                </InlineAlert>
              )}
              <ul className="yx-pay-cards">
                {savedLines.map((l) => {
                  // Inside the proof window every line without a proof needs one.
                  const shown: ProofStatus = l.proof === 'Not due' && PROOFS_OPEN ? 'Proof needed' : l.proof;
                  return (
                    <li key={l.id}>
                      <div className="yx-pay-cards__row">
                        <strong>{l.item}</strong>
                        {savedRegime === 'old' && <Badge tone={PROOF_TONE[shown]}>{shown}</Badge>}
                      </div>
                      <span className="yx-pay-muted">
                        {savedRegime === 'new' ? `${l.section} · not needed in the new regime` : l.approved != null ? `${l.section} · approved ${formatINR(l.approved)} of ${formatINR(l.declared)}` : `${l.section} · declared ${formatINR(l.declared)}`}
                      </span>
                      {savedRegime === 'old' && l.comment && <span className="yx-pay-note">Payroll: {l.comment}</span>}
                      {savedRegime === 'old' && (shown === 'Rejected' || shown === 'Partly approved' || shown === 'Proof needed') && <FileUpload upload={async () => {}} accept={['.pdf', '.jpg', '.png']} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          </TabsContent>
          <TabsContent value="previous">
            <div className="yx-pay-stack">
              <p className="yx-pay-muted">If you worked for another employer earlier this tax year, enter the figures from their Form 12B. They are added to your projection so TDS is correct.</p>
              <FieldRow>
                <FormField label="Salary from previous employer">
                  <CurrencyField
                    value={prevSalary}
                    onChange={(v) => {
                      setPrevSalary(v);
                      setPrevSaved(false);
                      setPrevDirty(true);
                    }}
                  />
                </FormField>
                <FormField label="Tax deducted by previous employer">
                  <CurrencyField
                    value={prevTds}
                    onChange={(v) => {
                      setPrevTds(v);
                      setPrevSaved(false);
                      setPrevDirty(true);
                    }}
                  />
                </FormField>
              </FieldRow>
              <FormField label="Other income (interest, rent)" optional>
                <CurrencyField
                  value={otherIncome}
                  onChange={(v) => {
                    setOtherIncome(v);
                    setPrevSaved(false);
                    setPrevDirty(true);
                  }}
                />
              </FormField>
              <FormField id="pe-12b" error={prevEarly.errorOf('pe-12b')} label="Form 12B from previous employer" required={!!prevSalary} optional={!prevSalary} helper="PDF signed by the previous employer. Needed when you enter a salary above.">
                <FileUpload upload={async () => {}} accept={['.pdf']} multiple={false} onItemsChange={(items) => setForm12b(uploaded(items))} />
              </FormField>
              <FactRow
                items={[
                  { label: 'Projected income', value: formatINR(projected) },
                  { label: 'Projected tax', value: formatINR(annual) },
                  { label: `Monthly TDS (${leftRange})`, value: formatINR(monthly) },
                ]}
              />
              <div className="yx-pay-row">
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!prevDirty) return void toast({ title: 'Nothing to save yet.' });
                    if (prevEarly.stop()) return;
                    setPrevSaved(true);
                    setPrevDirty(false);
                    toast({ tone: 'success', title: 'Saved', description: `Your October payslip uses the new projection: ${formatINR(monthly)} a month.` });
                  }}
                >
                  Save
                </Button>
                {!prevDirty && !prevSaved && <span className="yx-pay-note">Nothing to save yet.</span>}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="residential">
            <div className="yx-pay-stack">
              <RadioGroup
                aria-label="Residential status"
                value={res}
                onChange={(v) => {
                  setRes(v as 'r' | 'nr');
                  setResSent(false);
                }}
                options={[
                  { value: 'r', label: 'Resident', description: 'In India 182 days or more in the tax year, or the other residence tests apply.' },
                  { value: 'nr', label: 'Non-resident', description: 'No rebate. Treaty rate only with a valid tax residency certificate and Form 10F.' },
                ]}
              />
              {res === 'nr' && (
                <>
                  {!resChanged && (
                    <InlineAlert tone="info" title="Non-resident, approved by HR">
                      Your tax is worked out without the rebate. To get a lower treaty rate, add your tax residency certificate and file Form 10F.
                    </InlineAlert>
                  )}
                  <FormField id="rs-trc" error={resEarly.errorOf('rs-trc')} label={resChanged ? 'Tax residency certificate (TRC)' : 'Add TRC for treaty rate'} required={resChanged} optional={!resChanged} helper="Valid for the tax year.">
                    <FileUpload upload={async () => {}} accept={['.pdf']} multiple={false} onItemsChange={(items) => setTrc(uploaded(items))} />
                  </FormField>
                  <FormField id="rs-10f" label="Form 10F" error={resEarly.errorOf('rs-10f')} hideLabel>
                    <Checkbox checked={form10f} onChange={setForm10f} label="I have filed Form 10F on the income-tax portal" />
                  </FormField>
                </>
              )}
              <p className="yx-pay-muted">
                {!resChanged
                  ? `Your monthly TDS is ${formatINR(monthly)}.`
                  : pickedMonthly === monthly
                    ? `Your monthly TDS stays ${formatINR(monthly)}: at your income no rebate applies either way.`
                    : `Your monthly TDS would be ${formatINR(pickedMonthly)} instead of ${formatINR(monthly)}.`}
              </p>
              {resSent ? (
                <InlineAlert tone="info" title="Waiting for HR review">
                  Lakshmi Venkatesan checks it. Your TDS changes from the payslip after she approves.
                </InlineAlert>
              ) : (
                (resChanged || res === 'nr') && (
                  <div className="yx-pay-row">
                    <Button variant="primary" onClick={() => !resEarly.stop() && (setResSent(true), toast({ tone: 'success', title: 'Sent for HR review' }))}>
                      {resChanged ? 'Send for HR review' : 'Send TRC to HR'}
                    </Button>
                  </div>
                )
              )}
            </div>
          </TabsContent>
        </Tabs>
      </StateBlock>
      <Sheet
        layout={layout}
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={isNewLine ? 'Add declaration' : 'Edit declaration'}
        subtitle="Amounts are for the whole tax year."
        footer={
          <>
            {editing && !isNewLine && (
              <Button
                onClick={() => {
                  setLines((ls) => ls.filter((l) => l.id !== editing.id));
                  setEditing(null);
                  setDeclDirty(true);
                  setDeclSaved(false);
                }}
              >
                Remove line
              </Button>
            )}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => !lineEarly.stop() && saveLine()}>
              Save line
            </Button>
          </>
        }
      >
        {editing && (
          <div className="yx-pay-stack">
            <FormField label="Section" required>
              <Select value={editing.section} onChange={(v) => setEditing({ ...editing, section: v ?? editing.section })} options={DECL_SECTIONS.map((s) => ({ value: s, label: s }))} />
            </FormField>
            <FormField id="dl-item" error={lineEarly.errorOf('dl-item')} label="Item" required>
              <TextField value={editing.item} onChange={(v) => setEditing({ ...editing, item: v })} />
            </FormField>
            <FormField id="dl-amount" error={lineEarly.errorOf('dl-amount')} label="Amount for the year" required>
              <CurrencyField value={editing.declared || null} onChange={(v) => setEditing({ ...editing, declared: v ?? 0 })} />
            </FormField>
          </div>
        )}
      </Sheet>
      <Sheet
        layout={layout}
        open={askHr}
        onOpenChange={setAskHr}
        title="Ask HR to change your regime"
        subtitle={`From ${regime === 'new' ? 'new' : 'old'} to ${regime === 'new' ? 'old' : 'new'} regime for ${MY_TAX.taxYear.toLowerCase()}`}
        footer={
          <>
            <Button onClick={() => setAskHr(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (hrEarly.stop()) return;
                setAskHr(false);
                setHrSent(true);
                toast({ tone: 'success', title: 'Request sent to HR', description: "Lakshmi Venkatesan reviews it. You'll get a notification in the app." });
              }}
            >
              Send request
            </Button>
          </>
        }
      >
        <FormField id="hr-reason" error={hrEarly.errorOf('hr-reason')} label="Reason" required helper="For example, a home loan taken after the cut-off. Lakshmi Venkatesan reviews it.">
          <TextArea rows={3} value={hrReason} onChange={setHrReason} />
        </FormField>
      </Sheet>
      <Sheet
        layout={layout}
        open={pan}
        onOpenChange={setPan}
        title="Link your PAN with Aadhaar"
        subtitle="Normal-rate tax resumes once payroll sees your PAN working."
        footer={
          <>
            <Button onClick={() => setPan(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (panEarly.stop()) return;
                setPan(false);
                setPanSent(true);
              }}
            >
              Send to payroll
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          <ol className="yx-pay-muted">
            <li>On the income-tax e-filing portal, choose Link Aadhaar and enter your PAN and Aadhaar.</li>
            <li>Pay the late-linking fee if the portal asks for it, then submit.</li>
            <li>Download the confirmation once the portal shows your PAN as operative.</li>
          </ol>
          <FormField id="pan-proof" error={panEarly.errorOf('pan-proof')} label="Link confirmation from the portal" required helper="This also updates your PAN in Me › Documents.">
            <FileUpload upload={async () => {}} accept={['.pdf', '.jpg', '.png']} multiple={false} onItemsChange={(items) => setPanProof(uploaded(items))} />
          </FormField>
        </div>
      </Sheet>
    </EmpFrame>
  );
}

/* ================================================================== PAY-18 Loan / salary-advance request */

export type LoanVariant = 'form' | 'over-limit' | 'not-eligible' | 'submitted';

/** PAY-18 · Loan / salary-advance request (T4) with EMI schedule preview. The app passes `live` (Me › Loans and advances). */
export function LoanRequestScreen(p: { layout?: Layout; variant?: LoanVariant; live?: LiveLoanRequest }) {
  return p.live ? <LiveLoanRequest live={p.live} /> : <SampleLoanRequest {...p} />;
}

function SampleLoanRequest({ layout = 'desktop', variant = 'form' }: { layout?: Layout; variant?: LoanVariant }) {
  const [type, setType] = useState<string>(variant === 'form' ? 'advance' : 'loan');
  const [amount, setAmount] = useState<number | null>(variant === 'over-limit' ? 3_50_000 : type === 'advance' ? 30_000 : 1_50_000);
  const [emis, setEmis] = useState<number | null>(variant === 'form' ? 3 : 12);
  const [reason, setReason] = useState('Medical expenses for a family member');
  const rate = type === 'advance' ? 0 : 6;
  const limit = type === 'advance' ? 60_000 : 3_00_000;
  const maxEmis = type === 'advance' ? 6 : 24;
  const over = (amount ?? 0) > limit;
  const emisBad = !emis || emis < 1 || emis > maxEmis;
  const noReason = !reason.trim();
  // EMI and schedule use one count, so they always agree.
  const count = Math.min(Math.max(emis ?? 1, 1), maxEmis);
  const emi = emiAmount(amount ?? 0, rate, count);
  const schedule = emiSchedule(amount ?? 0, rate, count, 9, 2026);
  // Interest saved against the benchmark rate is a taxable perquisite once loans add up to more than ₹20,000.
  const BENCHMARK = 9;
  const perquisite = Math.round(((amount ?? 0) * (BENCHMARK - rate)) / 100 / 12);
  // October has no professional tax or unpaid day, so its take-home starts from September's net plus both.
  const octoberNet = MY_NET + SEP_LOP + SEP_PT;
  const early = useTooEarly([
    ...(over ? [{ fieldId: 'lr-amount', message: `Enter ${formatINR(limit)} or less.` }] : []),
    ...(emisBad ? [{ fieldId: 'lr-emis', message: `Enter 1 to ${maxEmis} EMIs.` }] : []),
    ...(noReason ? [{ fieldId: 'lr-reason', message: 'Give a reason for the request.' }] : []),
  ]);
  const { toast } = useToast();
  // The submitted page is where Send request lands: the done message is a toast there.
  useEffect(() => {
    if (variant === 'submitted') toast({ tone: 'success', title: 'Request sent', description: `${formatINR(1_50_000)} over 12 EMIs of ${formatINR(emiAmount(1_50_000, 6, 12))}. You'll be notified at each step.` });
  }, [variant]);
  const phone = layout === 'phone';
  if (variant === 'not-eligible')
    return (
      <EmpFrame layout={layout} page="loans" title="Loan or advance" back user={asUser(NEW_JOINER)}>
        {!phone && <PageHeader title="Request a loan or salary advance" description={`${NEW_JOINER.name} · ${NEW_JOINER.code} · joined 15 Jun 2026`} />}
        <EmptyState
          title="You can request a loan after your probation is confirmed."
          description="Your probation ends on 14 Dec 2026. Loans and salary advances are open to confirmed employees with no active advance."
          help={
            <Link href={storyHref(STORY.policies)} target="_top">
              Read the loans policy
            </Link>
          }
        />
      </EmpFrame>
    );
  if (variant === 'submitted') {
    const status = <Badge tone="info">Waiting for approval</Badge>;
    return (
      <EmpFrame layout={layout} page="loans" title="Loan or advance" back>
        {!phone && <PageHeader title="Personal loan request" status={status} />}
        <div className="yx-pay-stack">
          {phone && (
            <div className="yx-pay-row">
              <strong>Personal loan request</strong>
              {status}
            </div>
          )}
          <ApprovalTimeline
            now={NOW}
            steps={[
              { id: '1', label: 'Submitted', status: 'done', approver: ME.name, at: new Date(2026, 8, 29, 9, 15) },
              { id: '2', label: 'Manager approval', status: 'current', approver: ME.manager },
              { id: '3', label: 'HR approval', status: 'pending', approver: 'Lakshmi Venkatesan' },
              { id: '4', label: 'Paid in the next bank file', status: 'pending' },
            ]}
          />
        </div>
      </EmpFrame>
    );
  }
  return (
    <EmpFrame layout={layout} page="loans" title="Loan or advance" back>
      {!phone && <PageHeader title="Request a loan or salary advance" description="Recovered from your salary each month. If you leave, the balance is recovered in your final settlement." />}
      <div className={phone ? 'yx-pay-stack' : 'yx-pay-split'}>
        <div className="yx-pay-stack">
          <FormField label="Type" required>
            <RadioGroup
              value={type}
              onChange={(t) => {
                setType(t);
                // Keep the EMI count inside the new type's limit.
                const most = t === 'advance' ? 6 : 24;
                setEmis((n) => (n == null ? n : Math.min(n, most)));
              }}
              options={[
                { value: 'advance', label: 'Salary advance', description: 'Interest-free · up to ₹60,000 · up to 6 EMIs' },
                { value: 'loan', label: 'Personal loan', description: '6% a year · up to ₹3,00,000 · up to 24 EMIs' },
              ]}
            />
          </FormField>
          <FieldRow>
            <FormField id="lr-amount" label="Amount" required error={over ? `Enter ${formatINR(limit)} or less. That is the limit for your grade.` : undefined}>
              <CurrencyField value={amount} onChange={setAmount} />
            </FormField>
            <FormField id="lr-emis" label="Number of EMIs" required helper={`1 to ${maxEmis}`} error={emisBad ? `Enter 1 to ${maxEmis} EMIs. That is the limit for a ${type === 'advance' ? 'salary advance' : 'personal loan'}.` : undefined}>
              <NumberField value={emis} onChange={setEmis} min={1} max={maxEmis} />
            </FormField>
          </FieldRow>
          <FormField id="lr-reason" label="Reason" required error={noReason ? 'Give a reason for the request.' : undefined}>
            <TextArea rows={2} value={reason} onChange={setReason} />
          </FormField>
        </div>
        <aside className="yx-pay-panel" aria-label="Effect on your pay">
          <SectionTitle>Effect on your pay</SectionTitle>
          <FactRow
            items={[
              { label: 'EMI', value: formatINR(emi) },
              { label: 'First EMI', value: 'October 2026 payslip' },
              { label: 'October take-home after EMI', value: formatINR(octoberNet - emi) },
            ]}
          />
          {(amount ?? 0) > 20_000 && perquisite > 0 && (
            <p className="yx-pay-note">
              Your loans add up to more than {formatINR(20_000)}, so the interest you save against the {BENCHMARK}% benchmark rate is a taxable perquisite: about {formatINR(perquisite)} a month is added to your taxable income. Loans for treating specified diseases are exempt.
            </p>
          )}
          <PlainTable
            label="Repayment schedule"
            caption="Repayment schedule"
            rows={schedule.slice(0, 6)}
            getRowId={(r) => String(r.no)}
            columns={[
              { key: 'month', header: 'Month', rowHeader: true, cell: (r) => r.month },
              { key: 'emi', header: 'EMI', num: true, cell: (r) => formatINR(r.emi) },
              { key: 'balance', header: 'Balance', num: true, cell: (r) => formatINR(r.balance) },
            ]}
          />
          {schedule.length > 6 && <p className="yx-pay-note">and {schedule.length - 6} more months</p>}
        </aside>
      </div>
      <div className={phone ? 'yx-pay-phone-actions' : 'yx-pay-row'}>
        <Button onClick={() => goStory(phone ? STORY.payslipPhone : STORY.payslip)}>Cancel</Button>
        <Button variant="primary" onClick={() => !early.stop() && goStory(phone ? STORY.loanSubmittedPhone : STORY.loanSubmitted)}>
          Send request
        </Button>
      </div>
    </EmpFrame>
  );
}

/* ================================================================== PAY-26 Earned wage access */

export type EwaVariant = 'available' | 'confirm' | 'disbursed' | 'blackout' | 'on-hold' | 'draws-used' | 'off';

/** PAY-26 · Earned wage access request: available amount, partner fee, terms, recovery preview. The app passes `live` (desktop). */
export function EwaRequestScreen(p: { layout?: Layout; variant?: EwaVariant; live?: LiveEwaRequest }) {
  return p.live ? <LiveEwaRequest live={p.live} /> : <SampleEwaRequest {...p} />;
}

function SampleEwaRequest({ layout = 'phone', variant = 'available' }: { layout?: Layout; variant?: EwaVariant }) {
  const input: EwaInput =
    variant === 'blackout' ? { ...EWA_INPUT, daysEarned: 27, daysToCutOff: 2 } : variant === 'on-hold' ? { ...EWA_INPUT, onHold: true } : variant === 'draws-used' ? { ...EWA_INPUT, drawsThisPeriod: 3, drawnThisPeriod: 4_000 } : EWA_INPUT;
  const policy = variant === 'off' ? { ...EWA_STARTER, on: false } : EWA_STARTER;
  const r = ewaAvailable(policy, input);
  const [amount, setAmount] = useState<number | null>(variant === 'confirm' || variant === 'disbursed' ? 5_000 : 3_000);
  const [agree, setAgree] = useState(variant === 'confirm');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>(variant === 'confirm' ? 'confirm' : variant === 'disbursed' ? 'done' : 'form');
  const tooMuch = (amount ?? 0) > r.available;
  const amountEarly = useTooEarly(!amount ? [{ fieldId: 'ew-amount', message: 'Enter the amount.' }] : tooMuch ? [{ fieldId: 'ew-amount', message: `Enter ${formatINR(r.available)} or less.` }] : []);
  const agreeEarly = useTooEarly(agree ? [] : [{ fieldId: 'ew-agree', message: 'Tick the box to accept the fee and the recovery.' }]);
  const { toast } = useToast();
  const phone = layout === 'phone';
  return (
    <EmpFrame layout={layout} page="ewa" title="Get paid early" back>
      {!phone && <PageHeader title="Get paid early" description="Take part of the salary you have already earned this month, before payday." />}
      {r.reason ? (
        <div className="yx-pay-stack">
          <InlineAlert tone="info" title="Not available right now">
            {r.reason}
          </InlineAlert>
          {variant !== 'off' && <FactRow items={[{ label: 'Earned so far this month', value: formatINR(r.earnedToDate) }, { label: 'Next payday', value: formatDate(d(30)) }]} />}
        </div>
      ) : step === 'done' ? (
        <div className="yx-pay-stack">
          <DescriptionList
            items={[
              { label: 'Amount', value: formatINR(amount ?? 0) },
              { label: 'Fee (paid by you)', value: formatINR(policy.fee) },
              { label: 'Recovered on', value: 'September payslip, 30 Sep 2026' },
              { label: 'Draws left this month', value: '2 of 3' },
            ]}
          />
        </div>
      ) : (
        <div className="yx-pay-stack">
          <section className="yx-pay-panel" aria-label="Available">
            <p className="yx-pay-muted">You can take up to</p>
            <p className="yx-pay-money__figure">{formatINR(r.available)}</p>
            <p className="yx-pay-note">
              {policy.pct}% of {formatINR(r.earnedToDate)} earned so far ({input.daysEarned} of {input.periodDays} days, unpaid days not counted), rounded down to ₹100.
            </p>
          </section>
          {step === 'form' ? (
            <>
              <FormField id="ew-amount" label="Amount" required helper={`${formatINR(policy.min)} to ${formatINR(r.available)}`} error={tooMuch ? `Enter ${formatINR(r.available)} or less.` : amountEarly.errorOf('ew-amount')}>
                <CurrencyField value={amount} onChange={setAmount} min={policy.min} max={r.available} />
              </FormField>
              <div className={phone ? 'yx-pay-phone-actions' : 'yx-pay-row'}>
                <Button variant="primary" onClick={() => !amountEarly.stop() && setStep('confirm')}>
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <>
              <section className="yx-pay-disclosure" aria-label="Fee and recovery">
                <p>
                  <strong>You get {formatINR(amount ?? 0)}</strong> in your salary account today.
                </p>
                <p>
                  <strong>Fee {formatINR(policy.fee)}</strong>, charged by the EWA partner Pragati EarlyPay Pvt Ltd and paid by you. The company does not charge anything.
                </p>
                <p>
                  <strong>Recovery:</strong> {formatINR(amount ?? 0)} is deducted from your September salary on 30 Sep 2026. If you leave, it is recovered in your final settlement.
                </p>
                <PartnerLink>Read the partner's terms</PartnerLink>
              </section>
              <FormField id="ew-agree" label="Fee and recovery" error={agreeEarly.errorOf('ew-agree')} hideLabel>
                <Checkbox checked={agree} onChange={setAgree} label={`I agree to the fee of ${formatINR(policy.fee)} and the recovery from my September salary`} />
              </FormField>
              <p className="yx-pay-note">You'll confirm with your fingerprint or PIN.</p>
              <div className={phone ? 'yx-pay-phone-actions' : 'yx-pay-row'}>
                <Button onClick={() => setStep('form')}>Back</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (agreeEarly.stop()) return;
                    setStep('done');
                    toast({ tone: 'success', title: `${formatINR(amount ?? 0)} sent to your salary account`, description: 'Cauvery Co-operative Bank ••••8834. It will be recovered as "Earned wage access" on your September payslip.' });
                  }}
                >
                  Get {formatINR(amount ?? 0)}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </EmpFrame>
  );
}

/* ================================================================== PAY-33 My incentive / commission statement */

export type IncentiveVariant = 'default' | 'clawback' | 'empty';

/** Sales commission South 2026-27, the plan PAY-32 builds (one source in pay-data). */
const SALES_PLAN = SALES_COMMISSION_PLAN;
/** Net sales by month for the statement's Sales executive: Q1 ₹22,80,000 (95%), Q2 ₹28,80,000 (120%). */
const SALES_QUARTERS = [
  { id: 'Q1', label: 'Q1 (Apr–Jun)', months: [['Apr', 7_60_000], ['May', 7_60_000], ['Jun', 7_60_000]] as [string, number][], paidOn: 'July payslip' },
  { id: 'Q2', label: 'Q2 (Jul–Sep)', months: [['Jul', 9_00_000], ['Aug', 10_80_000], ['Sep', 9_00_000]] as [string, number][], paidOn: null },
];
/** Clawback story: a ₹3,00,000 June order from Malgudi Stores, cancelled on 22 Sep, inside the 90-day window. */
const CANCELLED_JUNE_ORDER = 3_00_000;

interface StatementRow {
  month: string;
  sales: number;
  earned: number;
  paid: number;
  due: number;
  held: number;
  clawback: number;
}

/** PAY-33 · My incentive / commission statement: earned, paid, held, clawbacks per period, worked out from the plan. The app passes `live`. */
export function IncentiveStatementScreen(p: { layout?: Layout; variant?: IncentiveVariant; live?: LiveIncentives }) {
  return p.live ? <LiveIncentiveStatement live={p.live} /> : <SampleIncentiveStatement {...p} />;
}

function SampleIncentiveStatement({ layout = 'desktop', variant = 'default' }: { layout?: Layout; variant?: IncentiveVariant }) {
  const phone = layout === 'phone';
  const claw = variant === 'clawback';
  const quarters = SALES_QUARTERS.map((q) => {
    const achieved = q.months.reduce((a, [, s]) => a + s, 0);
    const c = commission(achieved, SALES_PLAN.quota, SALES_PLAN.tiers, SALES_PLAN.cap);
    // The plan pays quarterly; each month's share of the quarter's commission follows its net sales.
    let left = c.amount;
    const rows: StatementRow[] = q.months.map(([month, sales], i) => {
      const earned = i === q.months.length - 1 ? left : Math.round((c.amount * sales) / achieved);
      left -= earned;
      const closed = q.paidOn != null;
      // Q2: September's orders wait for customer payment; July and August are due on the October payslip.
      const held = !closed && i === q.months.length - 1 ? earned : 0;
      return { month, sales, earned, paid: closed ? earned : 0, due: closed ? 0 : earned - held, held, clawback: 0 };
    });
    return { ...q, achieved, c, rows };
  });
  const [q1, q2] = quarters;
  // Cancelling the June order lowers Q1's achievement; the commission already paid on it is recovered.
  const clawback = claw ? q1.c.amount - commission(q1.achieved - CANCELLED_JUNE_ORDER, SALES_PLAN.quota, SALES_PLAN.tiers, SALES_PLAN.cap).amount : 0;
  if (claw) q1.rows[2].clawback = clawback;
  const sum = (rows: StatementRow[], k: keyof Omit<StatementRow, 'month'>) => rows.reduce((a, r) => a + r[k], 0);
  const allRows = quarters.flatMap((q) => q.rows);
  const tier = [...SALES_PLAN.tiers].reverse().find((t) => q2.c.attainment > t.fromPct) ?? SALES_PLAN.tiers[0];
  const nextTier = SALES_PLAN.tiers.find((t) => t.fromPct > tier.fromPct);
  const q2Due = sum(q2.rows, 'due');
  const rows = [
    { label: 'Quota (Q2, net sales)', value: formatINR(SALES_PLAN.quota) },
    { label: 'Achieved', value: `${formatINR(q2.achieved)} · ${q2.c.attainment}%` },
    { label: 'Tier reached', value: `${tier.fromPct}–${nextTier?.fromPct ?? ''}%: ${tier.ratePct}%${tier.fromPct >= 100 ? ' accelerator' : ''}` },
    { label: 'Earned this quarter', value: formatINR(q2.c.amount) },
    { label: 'Held (waiting for payment from customer)', value: formatINR(sum(q2.rows, 'held')) },
    { label: 'Due on your October payslip', value: formatINR(q2Due) },
    ...(claw
      ? [
          { label: 'Recovered (clawback)', value: `−${formatINR(clawback)}` },
          { label: 'Net commission on your October payslip', value: formatINR(q2Due - clawback) },
        ]
      : []),
  ];
  const cols: [keyof Omit<StatementRow, 'month' | 'sales'>, string][] = [
    ['earned', 'Earned'],
    ['paid', 'Paid'],
    ['due', 'Due in October'],
    ['held', 'Held'],
    ...(claw ? ([['clawback', 'Clawback']] as [keyof Omit<StatementRow, 'month' | 'sales'>, string][]) : []),
  ];
  // The word joiner keeps "−" and "₹" together when a card line wraps.
  const money = (k: string, v: number) => (v === 0 ? '—' : k === 'clawback' ? `−⁠${formatINR(v)}` : formatINR(v));
  const parts = (r: StatementRow) =>
    cols
      .filter(([k]) => r[k] !== 0)
      .map(([k, l]) => `${l} ${money(k, r[k])}`)
      .join(' · ');
  const planLine = `${SALES_PLAN.name} · Quarterly · Clawback window ${SALES_PLAN.clawbackDays} days`;
  const status = <Badge tone="info">Q2 open</Badge>;

  if (variant === 'empty')
    return (
      <EmpFrame layout={layout} page="incentives" title="My incentives" back>
        {!phone && <PageHeader title="My incentives" />}
        <EmptyState
          title="You aren't on an incentive plan this year."
          description="If you think you should be, ask HR. They can tell you which plans cover your role."
          action={
            <Button icon={MessageSquare} onClick={() => goStory(phone ? STORY.askHrPhone : STORY.askHr)}>
              Ask HR
            </Button>
          }
        />
      </EmpFrame>
    );
  return (
    <EmpFrame layout={layout} page="incentives" title="My incentives" back user={asUser(SALES_REP)}>
      {!phone && <PageHeader title="My sales commission" description={`${SALES_REP.name} · ${planLine}`} status={status} />}
      <div className="yx-pay-stack">
        {phone && (
          <div className="yx-pay-row">
            <span className="yx-pay-muted">{planLine}</span>
            {status}
          </div>
        )}
        {claw && (
          <InlineAlert tone="warning" title="Clawback: Malgudi Stores order cancelled">
            {formatINR(clawback)} commission from the cancelled June order will be taken from your October payslip.
          </InlineAlert>
        )}
        <SectionTitle>Quarter 2 (Jul–Sep 2026)</SectionTitle>
        <DescriptionList items={rows} columns={phone ? 1 : 2} />
        <SectionTitle>Statement by month, April–September 2026</SectionTitle>
        {phone ? (
          <ul className="yx-pay-cards" aria-label="Statement by month">
            {quarters.map((q) => [
              ...q.rows.map((r) => (
                <li key={r.month}>
                  <div className="yx-pay-cards__row">
                    <strong>{r.month}</strong>
                    <span className="yx-pay-muted">Sales {formatINR(r.sales)}</span>
                  </div>
                  <span className="yx-pay-muted">{parts(r)}</span>
                </li>
              )),
              <li key={q.id}>
                <div className="yx-pay-cards__row">
                  <strong>{q.label} total</strong>
                </div>
                <span>{parts({ month: q.id, sales: 0, earned: sum(q.rows, 'earned'), paid: sum(q.rows, 'paid'), due: sum(q.rows, 'due'), held: sum(q.rows, 'held'), clawback: sum(q.rows, 'clawback') })}</span>
              </li>,
            ])}
          </ul>
        ) : (
          <div className="yx-pay-scroll" tabIndex={0} role="region" aria-label="Incentive statement by month">
          <table className="yx-pay-table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" data-num>
                  Net sales
                </th>
                {cols.map(([k, l]) => (
                  <th key={k} scope="col" data-num>
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            {quarters.map((q) => (
              <tbody key={q.id}>
                {q.rows.map((r) => (
                  <tr key={r.month}>
                    <th scope="row">{r.month} 2026</th>
                    <td data-num>{formatINR(r.sales)}</td>
                    {cols.map(([k]) => (
                      <td key={k} data-num>
                        {money(k, r[k])}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row">{q.label} total</th>
                  <td data-num>
                    <strong>{formatINR(q.achieved)}</strong>
                  </td>
                  {cols.map(([k]) => (
                    <td key={k} data-num>
                      <strong>{money(k, sum(q.rows, k))}</strong>
                    </td>
                  ))}
                </tr>
              </tbody>
            ))}
            <tfoot>
              <tr>
                <th scope="row">Total, April–September</th>
                <td data-num>{formatINR(sum(allRows, 'sales'))}</td>
                {cols.map(([k]) => (
                  <td key={k} data-num>
                    {money(k, sum(allRows, k))}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
          </div>
        )}
        <p className="yx-pay-note">
          The plan pays quarterly: {q1.label} was paid on the {q1.paidOn}. Monthly figures share the quarter's commission by each month's net sales. Commission is salary income; tax is deducted through your payslip.
        </p>
      </div>
    </EmpFrame>
  );
}

/* ================================================================== PAY-39 My pay band */

/** PAY-39 · My pay band: own grade range and position in range (only when the company turns visibility on). The app passes `live`. */
export function PayBandScreen(p: { layout?: Layout; variant?: 'default' | 'above' | 'off'; state?: ViewState; live?: LivePayBand }) {
  return p.live ? <LivePayBand live={p.live} /> : <SamplePayBand {...p} />;
}

function SamplePayBand({ layout = 'desktop', variant = 'default', state = 'ready' }: { layout?: Layout; variant?: 'default' | 'above' | 'off'; state?: ViewState }) {
  // Divya's CTC is the same on every screen (₹1,50,000 a month). The above-band story uses a lower band instead.
  const ctc = MY_MONTHLY_CTC * 12;
  const [min, mid, max] = variant === 'above' ? [12_00_000, 14_40_000, 16_80_000] : [15_00_000, 19_50_000, 24_00_000];
  const compa = Math.round((ctc / mid) * 100);
  const gap = ctc - mid;
  const phone = layout === 'phone';
  const role = `Grade L4 · ${ME.role}`;
  return (
    <EmpFrame layout={layout} page="band" title="My pay band" back>
      {/* Non-breaking spaces keep the date on one line at phone width. */}
      {!phone && <PageHeader title="My pay band" description={variant === 'off' ? role : `${role} · Band effective 1 Apr 2026`} />}
      {variant === 'off' ? (
        <EmptyState
          title="Your company doesn't share pay bands."
          description="Ask HR if you want to know how your pay compares."
          action={
            <Button icon={MessageSquare} onClick={() => goStory(phone ? STORY.askHrPhone : STORY.askHr)}>
              Ask HR
            </Button>
          }
        />
      ) : (
        <StateBlock state={state} rows={3} errorTitle="We couldn't load your pay band.">
        <div className="yx-pay-stack">
          <section className="yx-pay-panel" aria-label="Your position in the band">
            <SectionTitle>Where your pay sits</SectionTitle>
            <RangeMarker label="Your annual CTC in the L4 band" min={min} max={max} mid={mid} value={ctc} />
            <FactRow
              items={[
                { label: 'Your annual CTC', value: formatINR(ctc) },
                { label: 'Compared with midpoint', value: `${compa}% (${formatINR(Math.abs(gap))} ${gap < 0 ? 'below' : 'above'})` },
                { label: 'Band', value: `${formatINR(min)} – ${formatINR(max)}` },
              ]}
            />
            {variant === 'above' ? (
              <InlineAlert tone="info">Your pay is above the band maximum. Future increases may be smaller or paid as one-time amounts; your manager can explain.</InlineAlert>
            ) : (
              <p className="yx-pay-muted">Midpoint is the market rate for a fully proficient person in this grade. Being below it is normal while you grow in the role.</p>
            )}
          </section>
          <p className="yx-pay-note">You see only your own band. Other people's pay is never shown.</p>
        </div>
        </StateBlock>
      )}
    </EmpFrame>
  );
}


/* ================================================================== Live (the app passes `live`; stories show the sample above) */

/** "2026-09" → "September 2026". */
export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** An exact API amount as a number for the Kit's display parts (no money is added up from it). */
const num = (v: string | null | undefined) => (v ? Number(paise(v)) / 100 : 0);
const PAYMENT_TEXT: Record<string, string> = { pending: 'Not paid yet', sent: 'Sent to the bank', held: 'On hold', cash: 'Paid by cash or cheque', paid: 'Paid', failed: 'Payment failed', returned: 'Payment came back' };

/* ------------------------------------------------------------------ PAY-21 + PAY-40 live: Me › Payslips */

export interface LivePayslips {
  state: LoadState;
  onRetry?: () => void;
  /** Published payslips, newest first. */
  payslips: MyPayslip[] | null;
  onOpen: (id: string) => Promise<PayslipDetail>;
  onPdf: (id: string, month: string) => Promise<unknown>;
  /** PAY-21 Document: the payslip PDF for the in-page preview (the same signed-in file as the download). */
  onPdfFile?: (id: string) => Promise<Blob>;
  onQuery: (id: string, text: string, lineCode?: string) => Promise<unknown>;
  /** The person's own payslip queries (GET payroll/queries, `mine`). */
  queries?: PayslipQueryView[] | null;
  /** Founder answer 16: withdraw one's own query (PATCH payroll/queries/:id, status closed, no reply needed). */
  onWithdraw?: (q: PayslipQueryView) => Promise<unknown>;
  /** T2-B 65: one zip of the tax year's payslips ("2026-27"). */
  onDownloadYear?: (taxYear: string) => Promise<unknown>;
}

const QUERY_STATE: Record<PayslipQueryView['status'], { label: string; tone: BadgeTone }> = {
  open: { label: 'Waiting for payroll', tone: 'warning' },
  answered: { label: 'Answered', tone: 'info' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export interface PayDiffRow {
  code: string;
  name: string;
  kind: PayslipLine['kind'];
  before: string;
  after: string;
  /** Effect on net pay (earnings and reimbursements add, deductions take away). */
  netEffect: string;
  explanation: string;
}

/** Line by line, what moved between two payslips, worked out only from their own lines (exact, in paise). Employer lines and notes are left out. */
export function payDiff(prev: PayslipLine[], cur: PayslipLine[]): PayDiffRow[] {
  const sum = (ls: PayslipLine[]) => {
    const m = new Map<string, { name: string; kind: PayslipLine['kind']; amount: bigint; explanation: string }>();
    for (const l of ls.filter((x) => x.kind === 'earning' || x.kind === 'deduction' || x.kind === 'reimbursement')) {
      const o = m.get(l.code) ?? { name: l.name, kind: l.kind, amount: 0n, explanation: '' };
      o.amount += paise(l.amount);
      o.explanation = l.explanation;
      m.set(l.code, o);
    }
    return m;
  };
  const a = sum(prev);
  const b = sum(cur);
  return [...new Set([...a.keys(), ...b.keys()])]
    .map((code) => {
      const x = (b.get(code) ?? a.get(code))!;
      const before = a.get(code)?.amount ?? 0n;
      const after = b.get(code)?.amount ?? 0n;
      const effect = x.kind === 'deduction' ? before - after : after - before;
      const size = effect < 0n ? -effect : effect;
      return { row: { code, name: x.name, kind: x.kind, before: fromPaise(before), after: fromPaise(after), netEffect: fromPaise(effect), explanation: b.get(code) ? x.explanation : 'Not on this payslip.' }, size };
    })
    .filter((r) => r.size > 0n)
    .sort((x, y) => (y.size > x.size ? 1 : y.size < x.size ? -1 : 0))
    .map((r) => r.row);
}

const lineId = (l: PayslipLine, i: number) => `${l.code}-${i}`;
const toExplained = (lines: PayslipLine[]): ExplainedLine[] =>
  lines.flatMap((l, i) =>
    l.kind === 'earning' || l.kind === 'deduction' || l.kind === 'employer'
      ? [
          {
            id: lineId(l, i),
            label: l.name,
            amount: num(l.amount),
            kind: l.kind,
            formula: l.explanation || undefined,
            inputs: l.quantity && l.rate ? `${l.quantity} × ${rupees(l.rate)}` : undefined,
            rule: l.rule ? `${l.rule.statute} ${l.rule.jurisdiction} ${l.rule.version}${l.rule.verify || l.verify ? ' (to verify)' : ''}` : undefined,
            ...(l.separate ? { separate: true } : {}),
          },
        ]
      : [],
  );

function LivePayslipViewer({ live }: { live: LivePayslips }) {
  const { toast } = useToast();
  const slips = live.payslips ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const slip = slips.find((s) => s.id === openId) ?? slips[0] ?? null;
  // Keka ideas: the tax years with payslips, newest first; the month list shows the open payslip's year.
  const years = [...new Set(slips.map((x) => taxYearOf(x.month)))].sort().reverse();
  const year = slip ? taxYearOf(slip.month) : (years[0] ?? '');
  const inYear = slips.filter((x) => taxYearOf(x.month) === year).sort((x, y) => y.month.localeCompare(x.month) || (x.runType === 'offcycle' ? 1 : -1));
  const [details, setDetails] = useState<Record<string, PayslipDetail>>({});
  const [why, setWhy] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<PayslipQueryView | null>(null);
  const { busy, error, run } = useRun();
  const load = async (id: string) => {
    if (details[id]) return details[id];
    const got = await live.onOpen(id);
    setDetails((m) => ({ ...m, [id]: got }));
    return got;
  };
  useEffect(() => {
    if (slip && !details[slip.id]) void run('load', () => load(slip.id));
  }, [slip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = slip ? details[slip.id] : undefined;
  // The month before, only between regular payslips (an off-cycle payslip has no "last month").
  const prev = slip?.runType === 'regular' ? slips.filter((x) => x.runType === 'regular' && x.month < slip.month).sort((x, y) => y.month.localeCompare(x.month))[0] : undefined;
  const prevD = prev ? details[prev.id] : undefined;
  const period = slip ? `${monthName(slip.month)}${slip.runType === 'offcycle' ? ' (off-cycle)' : ''}` : '';
  const netChange = slip && prev ? paise(slip.net) - paise(prev.net) : null;
  // Year to date: the tax year (April–March) of this payslip, up to and including it.
  const fyStart = slip ? `${Number(slip.month.slice(5)) >= 4 ? slip.month.slice(0, 4) : Number(slip.month.slice(0, 4)) - 1}-04` : '';
  const ytd = slip ? slips.filter((x) => x.month >= fyStart && x.month <= slip.month) : [];
  const reimbursements = d?.lines.filter((l) => l.kind === 'reimbursement') ?? [];
  const diffs: PayDiff[] = d && prevD ? payDiff(prevD.lines, d.lines).map((r) => ({ id: r.code, line: r.name, change: num(r.netEffect), cause: r.explanation.trim() || null })) : [];
  const held = d?.held || slip?.paymentStatus === 'held';
  const openWhy = () => {
    if (!prev) return;
    void run('why', async () => {
      await load(prev.id);
      setWhy(true);
    });
  };
  // PAY-21 Document: the design's "Payslip PDF" drawer shows the PDF in the page (PDF.js); its footer downloads it.
  const [pdfOpen, setPdfOpen] = useState(false);
  const pdf = useFileUrl(pdfOpen && slip ? slip.id : null, slip && live.onPdfFile ? () => live.onPdfFile!(slip.id) : undefined, 'payslip.pdf');
  const downloadPdf = () => slip && void run('pdf', () => live.onPdf(slip.id, slip.month)).then((ok) => ok && toast({ title: 'Payslip downloaded', description: `Your payslip for ${period} is in your downloads.`, tone: 'success' }));
  const actions = slip && (
    <>
      {prev && (
        <Button variant="primary" icon={HelpCircle} loading={busy === 'why'} onClick={openWhy}>
          Why is my pay different?
        </Button>
      )}
      <Button icon={MessageSquare} onClick={() => setQuery('')}>
        Raise a query
      </Button>
      <Button icon={Download} loading={busy === 'pdf'} onClick={() => (live.onPdfFile ? setPdfOpen(true) : downloadPdf())}>
        Download PDF
      </Button>
    </>
  );
  return (
    <MyPayFrame page="payslips">
      <PageHeader title={slip ? `Payslip for ${period}` : 'My payslips'} description="Your published payslips. Open a line to see how it was worked out." actions={live.state === 'ready' ? actions : undefined} />
      <PayPageState state={live.state} onRetry={live.onRetry} what="your payslips">
        {!slip ? (
          <EmptyState title="No payslips yet." description="Payroll publishes payslips after the run is approved and paid. You get a notification in the app." />
        ) : (
          <div className="yx-pay-months">
          <PayslipMonths
            years={years}
            year={year}
            onYear={(y) => setOpenId(slips.filter((x) => taxYearOf(x.month) === y).sort((x, z) => z.month.localeCompare(x.month))[0]?.id ?? null)}
            months={inYear.map((x) => ({ id: x.id, label: monthName(x.month), net: num(x.net), ...(x.runType === 'offcycle' ? { note: 'Off-cycle' } : {}) }))}
            selectedId={slip.id}
            onSelect={setOpenId}
            {...(live.onDownloadYear
              ? {
                  downloading: busy === 'year',
                  onDownloadYear: () =>
                    void run('year', () => live.onDownloadYear!(year)).then((ok) => ok && toast({ title: 'Payslips downloaded', description: `Your ${year} payslips are in your downloads as one zip file.`, tone: 'success' })),
                }
              : {})}
          />
          <div className="yx-pay-stack">
            {error && (
              <InlineAlert tone="danger" title="That did not work">
                {error}
              </InlineAlert>
            )}
            {held && (
              <InlineAlert tone="warning" title="Your net pay is on hold">
                Tax and PF are still deducted as usual. Payroll tells you when your pay is released.
              </InlineAlert>
            )}
            <MoneySummary
              period={period}
              net={num(slip.net)}
              gross={num(slip.gross)}
              deductions={num(slip.deductions)}
              employerCost={d ? num(d.employerCost) : undefined}
              payDate={new Date()}
              payLabel={PAYMENT_TEXT[slip.paymentStatus] ?? slip.paymentStatus}
              status={<Badge tone={slip.paymentStatus === 'paid' ? 'success' : held || slip.paymentStatus === 'failed' || slip.paymentStatus === 'returned' ? 'warning' : 'neutral'}>{held ? 'On hold' : PAYMENT_TEXT[slip.paymentStatus] ?? slip.paymentStatus}</Badge>}
              change={prev && netChange != null ? (netChange === 0n ? `Same as ${monthName(prev.month)}` : `${rupees(fromPaise(netChange < 0n ? -netChange : netChange))} ${netChange < 0n ? 'less' : 'more'} than ${monthName(prev.month)}`) : undefined}
            />
            {slip && (live.queries ?? []).some((q) => q.mine && q.payslipId === slip.id) && (
              <section className="yx-pay-panel" aria-label="Your queries on this payslip">
                <SectionTitle>Your queries on this payslip</SectionTitle>
                <ul className="yx-pay-cards">
                  {(live.queries ?? [])
                    .filter((q) => q.mine && q.payslipId === slip.id)
                    .map((q) => (
                      <li key={q.id}>
                        <div className="yx-pay-cards__row">
                          <strong>{(q.lineCode && d?.lines.find((l) => l.code === q.lineCode)?.name) || 'Whole payslip'}</strong>
                          <Badge tone={QUERY_STATE[q.status].tone}>{QUERY_STATE[q.status].label}</Badge>
                        </div>
                        <span className="yx-pay-muted">{q.text}</span>
                        {q.replies?.filter((r) => r.side === 'payroll').slice(-1).map((r) => (
                          <span key={r.at} className="yx-pay-note">
                            Payroll ({r.byName}): {r.text}
                          </span>
                        ))}
                        {q.status !== 'closed' && live.onWithdraw && (
                          <div className="yx-pay-row">
                            <Button size="sm" onClick={() => setWithdraw(q)}>
                              Withdraw query
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              </section>
            )}
            {d?.days && d.days.list.length > 0 && (
              <section className="yx-pay-panel" aria-label="Days">
                <SectionTitle>Days in {monthName(slip.month).split(' ')[0]}</SectionTitle>
                <DaysStrip days={d.days.list} periodLabel={monthName(slip.month)} />
                {d.days.paidDays != null && d.days.calendarDays != null && (
                  <p className="yx-pay-muted">
                    {daysText(d.days.paidDays)} paid days of {d.days.calendarDays}
                    {d.days.lopDays && Number(d.days.lopDays) > 0 ? ` · ${daysText(d.days.lopDays)} unpaid` : ''}
                  </p>
                )}
              </section>
            )}
            <div className="yx-pay-split">
              <section className="yx-pay-panel" aria-label="Why this number">
                <SectionTitle>How your pay was worked out</SectionTitle>
                {!d ? (
                  <Skeleton height={200} />
                ) : (
                  <div className="yx-pay-stack">
                    <WhyThisNumber lines={toExplained(d.lines)} onQuery={(l) => setQuery(d.lines.find((x, i) => lineId(x, i) === l.id)?.code ?? '')} />
                    <section aria-label="Reimbursements">
                      <SectionTitle>Reimbursements</SectionTitle>
                      {reimbursements.length ? (
                        <DescriptionList items={reimbursements.map((l) => ({ label: l.name, value: rupees(l.amount) }))} />
                      ) : (
                        <p className="yx-pay-note">None this month. Approved expense claims paid with salary show here; they are part of net pay, not of gross earnings.</p>
                      )}
                    </section>
                  </div>
                )}
              </section>
              <div className="yx-pay-stack">
                <Card title="Year to date">
                  <DescriptionList
                    items={[
                      { label: 'Gross earnings', value: rupees(sumMoney(ytd.map((x) => x.gross))) },
                      { label: 'Deductions', value: rupees(sumMoney(ytd.map((x) => x.deductions))) },
                      { label: 'Net pay', value: rupees(sumMoney(ytd.map((x) => x.net))) },
                    ]}
                  />
                  <p className="yx-pay-note">
                    {monthName(fyStart)} to {monthName(slip.month)}, {ytd.length} {ytd.length === 1 ? 'payslip' : 'payslips'}.
                  </p>
                </Card>
              </div>
            </div>
          </div>
          </div>
        )}
      </PayPageState>
      {slip && prev && (
        <Drawer open={why} onOpenChange={setWhy} title="Why is my pay different?" subtitle={`${monthName(slip.month)} compared with ${monthName(prev.month)}`} size="lg" footer={<Button onClick={() => setWhy(false)}>Close</Button>}>
          <PayDiffPanel
            diffs={diffs}
            previous={num(prev.net)}
            current={num(slip.net)}
            labels={{ previous: monthName(prev.month), current: monthName(slip.month) }}
            onQuery={(line) => {
              setWhy(false);
              setQuery(d?.lines.find((l) => l.name === line)?.code ?? prevD?.lines.find((l) => l.name === line)?.code ?? '');
            }}
          />
        </Drawer>
      )}
      {slip && live.onPdfFile && (
        <Drawer
          open={pdfOpen}
          onOpenChange={setPdfOpen}
          title="Payslip PDF"
          subtitle={`Your ${period} payslip, as issued`}
          size="full"
          footer={
            <Button variant="primary" icon={Download} loading={busy === 'pdf'} onClick={downloadPdf}>
              Download PDF
            </Button>
          }
        >
          <div className="yx-pay-preview" tabIndex={0} role="region" aria-label="Payslip preview">
            {pdf?.url ? (
              <PdfPages url={pdf.url} label={`Payslip for ${period}`} />
            ) : pdf?.failed ? (
              <EmptyState title="We couldn't show the preview" description="Download the PDF to read it." />
            ) : (
              <Skeleton height="var(--yx-space-16)" />
            )}
          </div>
        </Drawer>
      )}
      {slip && query != null && <QueryDrawer slip={slip} period={period} lines={d?.lines ?? []} lineCode={query} onClose={() => setQuery(null)} onSend={live.onQuery} />}
      <ConfirmDialog
        open={!!withdraw}
        onOpenChange={(o) => !o && setWithdraw(null)}
        title="Withdraw this query?"
        consequence="Payroll stops working on it and it closes. You can raise a new one any time."
        confirmLabel="Withdraw query"
        onConfirm={async () => {
          if (!withdraw || !live.onWithdraw) return;
          await live.onWithdraw(withdraw);
          setWithdraw(null);
          toast({ title: 'Query withdrawn', description: 'It is closed. Raise a new one any time.', tone: 'success' });
        }}
      />
    </MyPayFrame>
  );
}

/** "26.00" → "26", "0.50" → "0.5". */
const daysText = (x: string) => String(Number(x));

function QueryDrawer({ slip, period, lines, lineCode, onClose, onSend }: { slip: MyPayslip; period: string; lines: PayslipLine[]; lineCode: string; onClose: () => void; onSend: LivePayslips['onQuery'] }) {
  const [about, setAbout] = useState<string | null>(lineCode || 'whole');
  const [text, setText] = useState('');
  const seen = new Set<string>();
  const options = [
    { value: 'whole', label: 'Whole payslip' },
    ...lines.filter((l) => l.kind !== 'employer' && l.kind !== 'info' && !seen.has(l.code) && seen.add(l.code)).map((l) => ({ value: l.code, label: l.name })),
  ];
  return (
    <PayFormDrawer
      title="Raise a query on this payslip"
      subtitle={`${period}. Your question goes to payroll; the reply stays in the app.`}
      confirm="Send query"
      done="Query sent to payroll. You get the reply in the app."
      errors={text.trim().length < 5 ? [{ fieldId: 'q-text', message: 'Write your question (at least 5 letters).' }] : []}
      onClose={onClose}
      onSave={() => onSend(slip.id, text.trim(), about && about !== 'whole' ? about : undefined)}
    >
      {(errorOf) => (
        <>
          <FormField id="q-about" label="About">
            <Select value={about} onChange={setAbout} options={options} />
          </FormField>
          <FormField id="q-text" label="Your question" required helper="Say what you expected, for example the leave you applied for." error={errorOf('q-text')}>
            <TextArea rows={4} value={text} onChange={setText} maxLength={1000} />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

/* ------------------------------------------------------------------ PAY-22 + PAY-41 live: Me › Tax, Me › Tax declarations */

/** A tax window as the employee sees it: open or not, its dates, and whether HR opened or locked it early. */
export interface TaxWindow {
  key: 'declarations' | 'proofs';
  open: boolean;
  from: string;
  to: string;
  by: 'dates' | 'hr_open' | 'hr_lock';
}

const WINDOW_TITLE: Record<TaxWindow['key'], string> = { declarations: 'Declarations', proofs: 'Proofs of investment' };
/** E1: one card per window with an OPEN tag (expenses-pay B7, Keka's window cards). */
export function TaxWindowCards({ windows }: { windows: TaxWindow[] }) {
  return (
    <div className="yx-pay-windows" role="list" aria-label="Tax windows">
      {windows.map((w) => (
        <Card key={w.key} role="listitem" title={WINDOW_TITLE[w.key]} actions={<Badge tone={w.open ? 'success' : 'neutral'}>{w.open ? 'OPEN' : 'Closed'}</Badge>}>
          <p className="yx-pay-note">
            {dateText(w.from)} to {dateText(w.to)}
            {w.by === 'hr_open' ? ' · opened early by HR' : w.by === 'hr_lock' ? ' · locked by HR' : ''}
          </p>
        </Card>
      ))}
    </div>
  );
}

/** E2 (batch H part 2): HR declares for an employee without a login (GET / POST tax/employees/:id/declarations). */
export interface LiveTaxOnBehalf {
  state: LoadState;
  onRetry?: () => void;
  onSearch: (q: string) => Promise<PersonHit[]>;
  person: PersonHit | null;
  onPerson: (p: PersonHit) => void;
  /** The chosen person's declarations, with whether the window is open now. */
  declarations: (MyDeclarations & { canDeclare: boolean; windows?: TaxWindow[] }) | null;
  onDeclare: (line: DeclarationInput) => Promise<unknown>;
}

export function TaxOnBehalfScreen({ live }: { live: LiveTaxOnBehalf }) {
  const d = live.declarations;
  const [editing, setEditing] = useState<DeclarationLine | 'new' | null>(null);
  const verified = (l: DeclarationLine) => ['approved', 'partly'].includes(l.proofStatus);
  return (
    <PayFrame page="tax">
      <PageHeader title="Declare for an employee" description="For people without a login: their tax declarations, entered by HR with the same checks and window as their own. Each change is recorded as made on their behalf. Your own declarations are made in Me › Tax." />
      <div className="yx-pay-stack">
        <FindPerson id="tb-person" label="Employee" value={live.person} onChange={live.onPerson} onSearch={live.onSearch} />
        {live.person && live.state === 'loading' && <Skeleton height={200} />}
        {live.person && live.state === 'error' && (
          <InlineAlert tone="danger" title="Their declarations could not be loaded" actions={live.onRetry && <Button size="sm" onClick={live.onRetry}>Try again</Button>}>
            You may not handle tax for this person, or they have no current employment in your entities.
          </InlineAlert>
        )}
        {live.person && d && (
          <>
            {d.windows && d.windows.length > 0 && <TaxWindowCards windows={d.windows} />}
            {!d.lines.length ? (
              <EmptyState compact title="Nothing declared yet." description={`Declare rent, investments and insurance for ${live.person.name}.`} />
            ) : (
              <PlainTable
                label={`Declarations of ${live.person.name}`}
                rows={d.lines}
                getRowId={(l) => l.id}
                columns={[
                  { key: 'item', header: 'Item and section', cell: (l) => <strong>{subjectText(l.subjectKey, l.section)}</strong> },
                  { key: 'amount', header: 'Declared', num: true, cell: (l) => `${rupees(l.amount)}${l.subjectKey === 'hra' ? ' a month' : ''}` },
                  { key: 'proof', header: 'Proof', cell: (l) => proofBadge(l.proofStatus) },
                  {
                    key: 'act',
                    header: <span className="yx-visually-hidden">Actions</span>,
                    cell: (l) =>
                      d.canDeclare && !verified(l) && (
                        <Button size="sm" onClick={() => setEditing(l)} aria-label={`Change ${subjectText(l.subjectKey, l.section)}`}>
                          Change
                        </Button>
                      ),
                  },
                ]}
              />
            )}
            {d.canDeclare && d.subjects.some((x) => !d.lines.some((l) => l.subjectKey === x.key)) && (
              <div className="yx-pay-row">
                <Button icon={Plus} onClick={() => setEditing('new')}>
                  Add declaration
                </Button>
                <span className="yx-pay-note">{d.form}.</span>
              </div>
            )}
            {editing && <DeclareDrawer line={editing === 'new' ? null : editing} subjects={d.subjects.filter((x) => editing !== 'new' || !d.lines.some((l) => l.subjectKey === x.key))} taxYear={d.taxYear} onClose={() => setEditing(null)} onSave={live.onDeclare} />}
          </>
        )}
      </div>
    </PayFrame>
  );
}

/** GET tax/me/workspace. */
export interface MyTaxWorkspace {
  id?: string;
  taxYear: string;
  regime: 'new' | 'old';
  regimeOverridden?: boolean;
  residentialStatus?: 'resident' | 'non_resident';
  panStatus: string;
  otherIncome?: { kind: 'interest' | 'rent' | 'other'; amount: string }[] | null;
  dates?: { regimeCutoff: string; proofWindowOpens?: string; proofCutoff?: string };
  canChooseRegime?: boolean;
  canDeclare?: boolean;
  canSendProofs?: boolean;
  /** E1 (batch H part 2): the declaration and proof windows, by the company dates or as HR opened or locked them. */
  windows?: TaxWindow[];
  /** Founder answer 3: the latest "ask HR to change my regime" request (Approvals). */
  regimeRequest?: { id: string; from: 'new' | 'old'; to: 'new' | 'old'; reason: string; status: 'pending' | 'approved' | 'rejected'; requestedAt: string; decidedAt: string | null } | null;
  /** PAY-22 NoPan: the latest PAN link confirmation sent to payroll (waiting, or the last decision). */
  panLinkRequest?: { id: string; taxYear: string; file: { name: string; size: number; type: string; at: string } | null; status: 'pending' | 'approved' | 'rejected'; comment: string | null; submittedAt: string; verifiedAt: string | null } | null;
  /** Founder answer 2: the latest residential-status request (payroll approves it with the TRC). */
  residencyRequest?: {
    id: string;
    from: 'resident' | 'non_resident';
    residentialStatus: 'resident' | 'non_resident';
    trcValidTo: string | null;
    dtaaCountry: string | null;
    file: { name: string; size: number; at: string } | null;
    status: 'pending' | 'approved' | 'rejected';
    comment: string | null;
    submittedAt: string;
  } | null;
}

/** POST tax/me/residency (multipart with the TRC): the change payroll approves. */
export interface ResidencyInput {
  residentialStatus: 'resident' | 'non_resident';
  trcValidTo?: string;
  dtaaCountry?: string;
  form10fFiled?: boolean;
}

/** POST tax/me/regime-compare: both regimes on the latest payslip's figures, with the same function as the TDS. */
export interface RegimeComparison {
  taxYear: string;
  current: 'new' | 'old';
  lower: 'new' | 'old';
  regimes: { regime: 'new' | 'old'; taxable: string; annualTax: string; monthTds: string }[];
  /** PAY-41: the rent and home loan interest this comparison used (declared, or the what-if) and the rule's interest limit. */
  whatIf?: { rentMonthly: string; metro: boolean; homeLoanInterest: string; homeLoanCap: string | null };
}

/** PAY-41 what-if sent with the comparison: worked out by the tax engine, never saved. */
export interface RegimeWhatIf {
  rentMonthly?: string;
  homeLoanInterest?: string;
}

/** GET tax/me/tax-sheet: the projection behind the latest payslip's TDS (null before the first payslip of the year). */
export interface MyTaxSheet {
  taxYear: string;
  month?: string;
  message?: string;
  sheet: {
    regime: 'new' | 'old';
    income: { salary: string; previousEmployers: string; perquisites: string; other: string; total: string };
    exemptions: { standardDeduction: string; hra: string; professionalTax: string; previousEmployers: string };
    deductions: { key: string; claimed: string; allowed: string }[];
    taxable: string;
    tax: { slab: string; rebate: string; surcharge: string; total: string; noPanApplied: boolean };
    alreadyDeducted: string;
    remainingPeriods: number;
    monthTds: string;
    notes: string[];
  } | null;
  /** PAY-22: the 12 months of the tax year, April first: deducted by the approved payslips, then projected. */
  months?: { month: string; tds: string; kind: 'deducted' | 'projected' }[];
}

/** GET tax/me/form12b (founder decision 6): previous employer income, checked by payroll before it counts. */
export interface MyForm12b {
  taxYear: string;
  open: boolean;
  closesOn: string;
  submission: null | {
    id: string;
    employerName: string | null;
    employerTan: string;
    gross: string;
    exemptions: string;
    tds: string;
    status: 'pending' | 'approved' | 'rejected';
    comment: string | null;
    file: { name: string; size: number; at: string };
    submittedAt: string;
    verifiedAt: string | null;
  };
}

export interface Form12bInput {
  employerName?: string;
  employerTan: string;
  gross: string;
  exemptions?: string;
  tds: string;
}

export type TaxTab = 'overview' | 'compare' | 'declarations' | 'proofs' | 'previous' | 'residential';

export interface LiveTax {
  state: LoadState;
  onRetry?: () => void;
  /** The tab the page opens on (Me › Tax: overview; Me › Tax declarations: declarations). */
  tab?: TaxTab;
  workspace: MyTaxWorkspace | null;
  sheet: MyTaxSheet | null;
  declarations: MyDeclarations | null;
  certificates: MyCertificate[] | null;
  form12b: MyForm12b | null;
  onCompare: (whatIf?: RegimeWhatIf) => Promise<RegimeComparison>;
  onPatch: (x: { regime?: 'new' | 'old'; otherIncome?: { kind: 'interest' | 'rent' | 'other'; amount: string }[] }) => Promise<unknown>;
  /** Founder answer 3: after the cut-off, POST tax/me/regime-request (goes to Approvals). */
  onRegimeRequest: (x: { regime: 'new' | 'old'; reason: string }) => Promise<unknown>;
  /** Founder answer 2: POST tax/me/residency with the TRC (non-resident). */
  onResidency: (x: ResidencyInput, file: File | null) => Promise<unknown>;
  /** PAY-22 NoPan: send the portal's PAN-Aadhaar link confirmation to payroll. */
  onPanLink?: (file: File) => Promise<unknown>;
  onDeclare: (line: DeclarationInput) => Promise<unknown>;
  onProof: (lineId: string, file: File) => Promise<unknown>;
  onPartA: (c: MyCertificate) => Promise<unknown>;
  onForm12b: (x: Form12bInput, file: File) => Promise<unknown>;
}

const SUBJECT: Record<string, string> = {
  hra: 'Rent paid (HRA)',
  sec80c: 'Investments and payments (80C)',
  sec80ccd1b: 'Own NPS contribution (80CCD(1B))',
  sec80ccd2: "Employer's NPS contribution (80CCD(2))",
  sec80d_self: 'Health insurance, self and family (80D)',
  sec80d_self_senior: 'Health insurance, self and family, senior citizen (80D)',
  sec80d_parents: 'Health insurance, parents (80D)',
  sec80d_parents_senior: 'Health insurance, senior citizen parents (80D)',
  sec80e: 'Education loan interest (80E)',
  sec24b: 'Home loan interest (24(b))',
};
/** H15: the Form No. 124 choices for how the employee is related to the landlord. */
export const LANDLORD_RELATION: Record<LandlordRelationship, string> = { not_related: 'Not related', parent: 'Parent', spouse: 'Husband or wife', child: 'Son or daughter', sibling: 'Brother or sister', other_relative: 'Other relative' };
const LANDLORD_RELATION_OPTIONS = (Object.keys(LANDLORD_RELATION) as LandlordRelationship[]).map((value) => ({ value, label: LANDLORD_RELATION[value] }));
/**
 * A declaration subject's label. With the section of the workspace's law from the API (H14), the plain name and that
 * section, e.g. "Investments and payments · s.123, Sch XV (old 80C)"; without one (or not yet confirmed), the name with
 * the old section.
 */
export const subjectText = (key: string, section?: string | null) => {
  const label = SUBJECT[key];
  if (!section || section === 'verify number') return label ?? key;
  return `${label ? label.slice(0, label.lastIndexOf(' (')) : key} · ${section}`;
};
const PROOF_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  none: { label: 'No proof yet', tone: 'neutral' },
  pending: { label: 'Proof being checked', tone: 'warning' },
  approved: { label: 'Accepted', tone: 'success' },
  partly: { label: 'Partly accepted', tone: 'info' },
  rejected: { label: 'Not accepted', tone: 'danger' },
};
const proofBadge = (s: string) => <Badge tone={PROOF_STATE[s]?.tone ?? 'neutral'}>{PROOF_STATE[s]?.label ?? s}</Badge>;
const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TAN_RE = /^[A-Z]{4}\d{5}[A-Z]$/;
const todayIso = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const regimeText = (r: 'new' | 'old') => (r === 'new' ? 'New regime' : 'Old regime');

/** The design's "Tax deducted by month" chart on the API's month list (exact amounts, shown in rupees). */
function TaxByMonthChart({ months }: { months: NonNullable<MyTaxSheet['months']> }) {
  const done = months.filter((m) => m.kind === 'deducted');
  const ahead = months.filter((m) => m.kind === 'projected');
  const short = (m: string) => MONTHS[(Number(m.slice(5, 7)) + 8) % 12]!;
  const span = (l: typeof months) => (l.length ? `${short(l[0]!.month)}–${short(l[l.length - 1]!.month)}` : '');
  const description = [done.length ? `Actual ${span(done)}` : '', ahead.length ? `${span(ahead)} at the current projection` : ''].filter(Boolean).join('; ');
  return <BarChart title="Tax deducted by month" description={`${description}.`} categories={months.map((m) => short(m.month))} series={[{ name: 'TDS', values: months.map((m) => num(m.tds)) }]} money xLabel="Month" height={180} horizontalBelow={600} />;
}

function LiveTaxWorkspace({ live }: { live: LiveTax }) {
  const { toast } = useToast();
  const w = live.workspace;
  const decl = live.declarations;
  const s = live.sheet?.sheet ?? null;
  const [tab, setTab] = useState<TaxTab>(live.tab ?? 'overview');
  const { busy, error, run } = useRun();
  const cutOff = w?.dates?.regimeCutoff;
  const locked = w ? !w.canChooseRegime : false;
  const facts = w
    ? [
        { label: 'Regime', value: `${regimeText(w.regime)}${w.regimeOverridden ? ' (set by payroll)' : ''}` },
        ...(s
          ? [
              { label: 'Projected tax', value: rupees(s.tax.total) },
              { label: 'Deducted so far', value: rupees(s.alreadyDeducted) },
              { label: `Monthly TDS (${s.remainingPeriods} ${s.remainingPeriods === 1 ? 'month' : 'months'} left)`, value: rupees(s.monthTds) },
            ]
          : []),
        { label: 'Residential status', value: `${w.residentialStatus === 'non_resident' ? 'Non-resident' : 'Resident'}${w.residencyRequest?.status === 'pending' ? ' (change with payroll)' : ''}` },
      ]
    : undefined;
  const status = w && cutOff ? locked ? <Badge tone="neutral">Regime locked on {dateText(cutOff)}</Badge> : <Badge tone="info">You can change your regime until {dateText(cutOff)}</Badge> : undefined;
  const certButtons = (live.certificates ?? []).map((c) => (
    <Button
      key={c.id}
      icon={Download}
      loading={busy === `a-${c.id}`}
      onClick={() => void run(`a-${c.id}`, () => live.onPartA(c)).then((ok) => ok && toast({ title: 'Part A downloaded', tone: 'success' }))}
      aria-label={`Download Part A of ${c.form === 'form130' ? 'Form 130' : 'Form 16'} for ${c.taxYear}`}
    >
      {c.form === 'form130' ? 'Form 130' : 'Form 16'} Part A, {c.taxYear}
    </Button>
  ));
  return (
    <MyPayFrame page="tax">
      <ObjectHeader
        name={`Tax workspace${w ? ` · ${w.taxYear}` : ''}`}
        icon={FileText}
        secondary="Your regime, declarations, proofs and how your monthly tax is worked out."
        status={live.state === 'ready' ? status : undefined}
        facts={live.state === 'ready' ? facts : undefined}
        actions={live.state === 'ready' && certButtons.length ? <>{certButtons}</> : undefined}
      />
      <PayPageState state={live.state} onRetry={live.onRetry} what="your tax workspace">
        {w && (
          <div className="yx-pay-stack">
            {error && (
              <InlineAlert tone="danger" title="That did not work">
                {error}
              </InlineAlert>
            )}
            {w.panStatus === 'inoperative' && <PanLink w={w} onSend={live.onPanLink} />}
            <Tabs value={tab} onValueChange={(v) => setTab(v as TaxTab)}>
              <TabsList aria-label="Tax workspace">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="compare">Compare regimes</TabsTrigger>
                <TabsTrigger value="declarations" count={decl?.lines.length}>
                  Declarations
                </TabsTrigger>
                <TabsTrigger value="proofs">Proofs</TabsTrigger>
                <TabsTrigger value="previous">Previous employer</TabsTrigger>
                <TabsTrigger value="residential">Residential status</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                {!s ? (
                  <InlineAlert tone="info" title="No tax sheet yet">
                    {live.sheet?.message ?? 'Your tax sheet appears with your first payslip of the tax year.'}
                  </InlineAlert>
                ) : (
                  <div className="yx-pay-stack">
                  <section className="yx-pay-panel" aria-label="How your monthly tax is worked out">
                    <SectionTitle>How your monthly tax is worked out</SectionTitle>
                    <ol className="yx-pay-muted">
                      <li>
                        Projected income for the year: {rupees(s.income.total)} = salary {rupees(s.income.salary)}
                        {paise(s.income.previousEmployers) ? ` + previous employer ${rupees(s.income.previousEmployers)}` : ''}
                        {paise(s.income.perquisites) ? ` + perquisites ${rupees(s.income.perquisites)}` : ''}
                        {paise(s.income.other) ? ` + other income ${rupees(s.income.other)}` : ''}.
                      </li>
                      <li>
                        {regimeText(s.regime)}: standard deduction {rupees(s.exemptions.standardDeduction)}
                        {paise(s.exemptions.hra) ? `, HRA exemption ${rupees(s.exemptions.hra)}` : ''}
                        {paise(s.exemptions.professionalTax) ? `, professional tax ${rupees(s.exemptions.professionalTax)}` : ''}
                        {s.deductions.length ? `, deductions allowed ${rupees(sumMoney(s.deductions.map((x) => x.allowed)))}` : ''}; taxable {rupees(s.taxable)}.
                      </li>
                      <li>
                        Tax on slabs {rupees(s.tax.slab)}
                        {paise(s.tax.rebate) ? ` − rebate ${rupees(s.tax.rebate)}` : ''}
                        {paise(s.tax.surcharge) ? ` + surcharge ${rupees(s.tax.surcharge)}` : ''}, with cess: {rupees(s.tax.total)} for the year{s.tax.noPanApplied ? ' (higher rate: PAN inoperative)' : ''}.
                      </li>
                      <li>
                        Deducted so far {rupees(s.alreadyDeducted)}; the rest is spread over the {s.remainingPeriods} {s.remainingPeriods === 1 ? 'month' : 'months'} left: <strong>{rupees(s.monthTds)}</strong> a month.
                      </li>
                    </ol>
                    {s.notes.length > 0 && (
                      <ul className="yx-pay-note">
                        {s.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                    <p className="yx-pay-note">The tax shown here and the tax on your payslip come from the same calculation{live.sheet?.month ? `, the payslip for ${monthName(live.sheet.month)}` : ''}.</p>
                  </section>
                  {live.sheet?.months?.length === 12 && <TaxByMonthChart months={live.sheet.months} />}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="compare">
                <RegimeCompareScreen live={{ current: w.regime, resident: w.residentialStatus !== 'non_resident', cutOff, locked, onCompare: live.onCompare, onOpenDeclarations: () => setTab('declarations') }} />
              </TabsContent>
              <TabsContent value="declarations">
                <TaxDeclarations live={live} w={w} />
              </TabsContent>
              <TabsContent value="proofs">
                <TaxProofs live={live} w={w} />
              </TabsContent>
              <TabsContent value="previous">
                <PreviousEmployer live={live} w={w} />
              </TabsContent>
              <TabsContent value="residential">
                <Residential w={w} onSend={live.onResidency} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </PayPageState>
    </MyPayFrame>
  );
}

export interface LiveRegimeCompare {
  current: 'new' | 'old';
  resident: boolean;
  cutOff?: string;
  locked: boolean;
  onCompare: (whatIf?: RegimeWhatIf) => Promise<RegimeComparison>;
  onOpenDeclarations: () => void;
}

/** PAY-41 inside the workspace: both regimes from the API (the same function as the monthly TDS). Never chooses for the person. */
function LiveRegimeCompare({ live }: { live: LiveRegimeCompare }) {
  const [cmp, setCmp] = useState<RegimeComparison | null>(null);
  // PAY-41 what-if: starts at the declared rent and interest; each change is worked out again by the API (not saved).
  const [x, setX] = useState<{ rent: number; homeLoan: number } | null>(null);
  const [limits, setLimits] = useState<{ rent: number; homeLoan: number; declaredRent: number; declaredHomeLoan: number } | null>(null);
  const { busy, error, run } = useRun();
  const first = async () => {
    const r = await live.onCompare();
    setCmp(r);
    if (r.whatIf) {
      const rent = num(r.whatIf.rentMonthly);
      const homeLoan = num(r.whatIf.homeLoanInterest);
      setX({ rent, homeLoan });
      // The rent range is the screen's; the interest range is the rule's limit when it has one.
      setLimits({ rent: Math.max(80_000, Math.ceil((rent * 1.5) / 1000) * 1000), homeLoan: r.whatIf.homeLoanCap ? num(r.whatIf.homeLoanCap) : Math.max(1_000_000, homeLoan * 2), declaredRent: rent, declaredHomeLoan: homeLoan });
    }
  };
  useEffect(() => {
    if (!x || !cmp?.whatIf || (num(cmp.whatIf.rentMonthly) === x.rent && num(cmp.whatIf.homeLoanInterest) === x.homeLoan)) return;
    const t = setTimeout(() => void run('what-if', async () => setCmp(await live.onCompare({ rentMonthly: String(x.rent), homeLoanInterest: String(x.homeLoan) }))), 400);
    return () => clearTimeout(t);
    // Only a change of the what-if figures asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x]);
  const of = (r: 'new' | 'old') => cmp?.regimes.find((x) => x.regime === r);
  const diff = cmp && of('new') && of('old') ? paise(of('new')!.annualTax) - paise(of('old')!.annualTax) : null;
  return (
    <section className="yx-pay-panel" aria-label="Compare tax regimes">
      <SectionTitle actions={<Badge tone="info">Estimate, not tax advice</Badge>}>Compare tax regimes</SectionTitle>
      <p className="yx-pay-muted">Worked out on your latest payslip with the same rules as your monthly tax. This tool never chooses a regime for you.</p>
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {!cmp ? (
        <div className="yx-pay-row">
          <Button variant="primary" loading={busy === 'cmp'} onClick={() => void run('cmp', first)}>
            Compare the two regimes
          </Button>
        </div>
      ) : (
        <>
          <CompareBars
            label="Tax for the year under each regime"
            items={(['new', 'old'] as const).map((r) => ({ label: regimeText(r), value: num(of(r)?.annualTax), note: live.current === r ? '(your choice)' : undefined, emphasis: live.current === r }))}
          />
          <p aria-live="polite">{diff === 0n ? 'Both regimes give the same tax.' : diff != null ? `Tax is ${rupees(fromPaise(diff < 0n ? -diff : diff))} lower under the ${diff < 0n ? 'new' : 'old'} regime with ${limits && cmp.whatIf && (limits.declaredRent !== num(cmp.whatIf.rentMonthly) || limits.declaredHomeLoan !== num(cmp.whatIf.homeLoanInterest)) ? 'these what-if' : 'your'} figures.` : ''}</p>
          <div className="yx-pay-grid">
          {x && limits && (
            <div data-span="6" className="yx-pay-stack" aria-busy={busy === 'what-if'}>
              <Slider valueText={formatINR} label="Monthly rent" value={x.rent} max={limits.rent} step={1_000} onChange={(n) => setX({ ...x, rent: n })} hint="Old regime only: the HRA exemption is worked out from it for each month." />
              <Slider valueText={formatINR} label="Home-loan interest for the year" value={x.homeLoan} max={limits.homeLoan} step={10_000} onChange={(n) => setX({ ...x, homeLoan: n })} hint={cmp.whatIf?.homeLoanCap ? `Up to ${formatINR(num(cmp.whatIf.homeLoanCap))} counts (old regime only).` : 'Old regime only.'} />
              <p className="yx-pay-note">What-if figures are not saved. To make them count, declare them in Declarations.</p>
            </div>
          )}
          <div data-span={x && limits ? '6' : '12'}>
          <PlainTable
            label="Regimes compared"
            rows={cmp.regimes}
            getRowId={(r) => r.regime}
            columns={[
              {
                key: 'regime',
                header: 'Regime',
                rowHeader: true,
                cell: (r) => (
                  <>
                    {regimeText(r.regime)} {cmp.lower === r.regime && <Badge tone="success">Lower tax</Badge>}
                  </>
                ),
              },
              { key: 'taxable', header: 'Taxable income', num: true, cell: (r) => rupees(r.taxable) },
              { key: 'annual', header: 'Tax for the year', num: true, cell: (r) => rupees(r.annualTax) },
              { key: 'month', header: 'Tax this month', num: true, cell: (r) => rupees(r.monthTds) },
            ]}
          />
          </div>
          </div>
        </>
      )}
      <div className="yx-pay-row">
        <Button onClick={live.onOpenDeclarations}>Open Declarations</Button>
        {live.cutOff && <span className="yx-pay-muted">{live.locked ? `Your regime was locked on ${dateText(live.cutOff)}. Only payroll can change it now, with a reason.` : `You choose your regime in Declarations. You can change it until ${dateText(live.cutOff)}.`}</span>}
      </div>
      {!live.resident && <InlineAlert tone="info">As a non-resident this year, the rebate doesn't apply in either regime.</InlineAlert>}
      <p className="yx-pay-note">Only you can see this comparison. Your manager never sees it, and payroll sees only the regime you choose and your declarations.</p>
    </section>
  );
}

function TaxDeclarations({ live, w }: { live: LiveTax; w: MyTaxWorkspace }) {
  const { toast } = useToast();
  const d = live.declarations;
  const [regime, setRegime] = useState<'new' | 'old'>(w.regime);
  const [editing, setEditing] = useState<DeclarationLine | 'new' | null>(null);
  const [regimeError, setRegimeError] = useState<string | undefined>();
  const [askHr, setAskHr] = useState(false);
  const { busy, error, run } = useRun();
  useEffect(() => setRegime(w.regime), [w.regime]);
  const verified = (l: DeclarationLine) => ['approved', 'partly'].includes(l.proofStatus);
  const open = w.canDeclare ?? (d ? todayIso() <= d.proofCutoff : false);
  const saveRegime = () => {
    if (regime === w.regime) {
      setRegimeError(`${regimeText(w.regime)} is already your regime. Choose the other one to change it.`);
      document.getElementById('tx-regime')?.querySelector<HTMLElement>('[role="radio"]')?.focus();
      return;
    }
    setRegimeError(undefined);
    void run('regime', () => live.onPatch({ regime })).then((ok) => ok && toast({ title: `${regimeText(regime)} saved`, description: 'Your next payslip uses it.', tone: 'success' }));
  };
  return (
    <div className="yx-pay-stack">
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      <section className="yx-pay-panel" aria-label="Regime">
        <SectionTitle>Your regime for {w.taxYear}</SectionTitle>
        {w.canChooseRegime ? (
          <>
            <FormField id="tx-regime" label="Regime" error={regimeError} helper="New regime: lower slab rates, most deductions not allowed. Old regime: higher rates, with 80C, 80D, HRA and home-loan interest.">
              <Segment
                label="Regime"
                value={regime}
                onChange={(v) => {
                  setRegime(v);
                  setRegimeError(undefined);
                }}
                options={[
                  { value: 'new', label: 'New regime (default)' },
                  { value: 'old', label: 'Old regime' },
                ]}
              />
            </FormField>
            <div className="yx-pay-row">
              <Button variant="primary" loading={busy === 'regime'} onClick={saveRegime}>
                Save my regime
              </Button>
              {w.dates?.regimeCutoff && <span className="yx-pay-note">You can change it until {dateText(w.dates.regimeCutoff)}.</span>}
            </div>
          </>
        ) : w.regimeRequest?.status === 'pending' ? (
          <InlineAlert tone="info" title="Waiting for HR">
            You asked to switch to the {w.regimeRequest.to} regime on {dateText(w.regimeRequest.requestedAt.slice(0, 10))}. HR reviews it in Approvals; you get a notification in the app.
          </InlineAlert>
        ) : (
          <InlineAlert
            tone="info"
            title={`${regimeText(w.regime)}, locked${w.dates?.regimeCutoff ? ` on ${dateText(w.dates.regimeCutoff)}` : ''}`}
            actions={
              <Button size="sm" onClick={() => setAskHr(true)}>
                Ask HR to change regime
              </Button>
            }
          >
            The company cut-off has passed. Only HR can change your regime now, with a reason.
            {w.regimeRequest?.status === 'rejected' ? ' HR did not approve your last request.' : ''}
          </InlineAlert>
        )}
        {askHr && <AskHrRegime w={w} onClose={() => setAskHr(false)} onSend={live.onRegimeRequest} />}
        {w.regime === 'new' && <p className="yx-pay-note">In the new regime, the declarations below don't reduce your tax. Keep them if you might switch.</p>}
      </section>
      {w.windows && w.windows.length > 0 && <TaxWindowCards windows={w.windows} />}
      {d && !open && (
        <InlineAlert tone="info" title="Declarations are closed">
          {w.windows?.find((x) => x.key === 'declarations')?.by === 'hr_lock' ? 'HR locked them.' : `They closed on ${dateText(d.proofCutoff)}.`} Anything else is claimed in your own tax return.
        </InlineAlert>
      )}
      {d && !d.lines.length && <EmptyState compact title="Nothing declared yet." description="Declare rent, investments and insurance to lower the tax taken from your pay." />}
      {d && d.lines.length > 0 && (
        <PlainTable
          label="Declarations"
          rows={d.lines}
          getRowId={(l) => l.id}
          columns={[
            {
              key: 'item',
              header: 'Item and section',
              cell: (l) => (
                <>
                  <strong>{subjectText(l.subjectKey, l.section)}</strong>
                  {l.subjectKey === 'hra' && l.rentFrom && l.rentTo && (
                    <>
                      <br />
                      <span className="yx-pay-muted">
                        {monthName(l.rentFrom)} to {monthName(l.rentTo)} · {l.metro ? 'metro city' : 'other city'}
                      </span>
                    </>
                  )}
                </>
              ),
            },
            { key: 'amount', header: 'Declared', num: true, cell: (l) => `${rupees(l.amount)}${l.subjectKey === 'hra' ? ' a month' : ''}` },
            { key: 'proof', header: 'Proof', cell: (l) => proofBadge(l.proofStatus) },
            {
              key: 'act',
              header: <span className="yx-visually-hidden">Actions</span>,
              cell: (l) =>
                open && !verified(l) && (
                  <Button size="sm" onClick={() => setEditing(l)} aria-label={`Change ${subjectText(l.subjectKey, l.section)}`}>
                    Change
                  </Button>
                ),
            },
          ]}
        />
      )}
      {d && open && (
        <div className="yx-pay-row">
          {d.subjects.some((x) => !d.lines.some((l) => l.subjectKey === x.key)) && (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Add declaration
            </Button>
          )}
          <span className="yx-pay-note">
            {d.form}. Proofs are sent from {dateText(d.proofWindowOpens)} to {dateText(d.proofCutoff)}.
          </span>
        </div>
      )}
      {editing && d && <DeclareDrawer line={editing === 'new' ? null : editing} subjects={d.subjects.filter((x) => editing !== 'new' || !d.lines.some((l) => l.subjectKey === x.key))} taxYear={d.taxYear} onClose={() => setEditing(null)} onSave={live.onDeclare} />}
    </div>
  );
}

function DeclareDrawer({ line, subjects, taxYear, onClose, onSave }: { line: DeclarationLine | null; subjects: MyDeclarations['subjects']; taxYear: string; onClose: () => void; onSave: (x: DeclarationInput) => Promise<unknown> }) {
  const [key, setKey] = useState<string | null>(line?.subjectKey ?? null);
  const [amount, setAmount] = useState(line?.amount ?? '');
  const [from, setFrom] = useState(line?.rentFrom ?? '');
  const [to, setTo] = useState(line?.rentTo ?? '');
  const [metro, setMetro] = useState<'yes' | 'no'>(line?.metro ? 'yes' : 'no');
  const [landlord, setLandlord] = useState(line?.landlordName ?? '');
  const [pan, setPan] = useState('');
  const [relation, setRelation] = useState<LandlordRelationship | null>(line?.landlordRelationship ?? null);
  const y = Number(taxYear.slice(0, 4));
  const hra = key === 'hra';
  const errors: FormErrorItem[] = [
    ...(!key ? [{ fieldId: 'dc-what', message: 'Choose what you are declaring.' }] : []),
    ...(!MONEY_RE.test(amount.trim()) ? [{ fieldId: 'dc-amount', message: hra ? 'Give the rent for one month in rupees.' : 'Give the amount for the year in rupees.' }] : []),
    ...(hra && (!MONTH_RE.test(from) || from < `${y}-04` || from > `${y + 1}-03`) ? [{ fieldId: 'dc-from', message: `A month from April ${y} to March ${y + 1}.` }] : []),
    ...(hra && (!MONTH_RE.test(to) || to < from || to > `${y + 1}-03`) ? [{ fieldId: 'dc-to', message: 'A month after the first, up to March.' }] : []),
    ...(hra && pan.trim() && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan.trim().toUpperCase()) ? [{ fieldId: 'dc-pan', message: "The landlord's PAN is 10 letters and digits, like ABCDE1234F." }] : []),
  ];
  return (
    <PayFormDrawer
      title={line ? `Change ${subjectText(line.subjectKey, line.section)}` : 'Add declaration'}
      subtitle="Enter 0 to remove a line."
      confirm="Save declaration"
      done="Declaration saved. Your next payslip uses it."
      errors={errors}
      onClose={onClose}
      onSave={() =>
        onSave({
          subjectKey: key!,
          amount: amount.trim(),
          ...(hra ? { rentFrom: from, rentTo: to, metro: metro === 'yes', ...(landlord.trim() ? { landlordName: landlord.trim() } : {}), ...(pan.trim() ? { landlordPan: pan.trim().toUpperCase() } : {}), ...(relation ? { landlordRelationship: relation } : {}) } : {}),
        })
      }
    >
      {(errorOf) => (
        <>
          {!line && (
            <FormField id="dc-what" label="What" required error={errorOf('dc-what')}>
              <Select value={key} onChange={setKey} placeholder="Choose" options={subjects.map((x) => ({ value: x.key, label: subjectText(x.key, x.section) }))} />
            </FormField>
          )}
          {/* The API takes rent as a monthly amount and works out the year from the months. */}
          <FormField id="dc-amount" label={hra ? 'Rent a month' : 'Amount for the year'} required error={errorOf('dc-amount')}>
            <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" maxLength={13} />
          </FormField>
          {hra && (
            <>
              <FieldRow>
                <FormField id="dc-from" label="Rent paid from" required error={errorOf('dc-from')}>
                  <TextField type="month" value={from} onChange={setFrom} />
                </FormField>
                <FormField id="dc-to" label="Rent paid to" required error={errorOf('dc-to')}>
                  <TextField type="month" value={to} onChange={setTo} />
                </FormField>
              </FieldRow>
              <FormField id="dc-metro" label="City">
                <Segment
                  label="City"
                  value={metro}
                  onChange={setMetro}
                  options={[
                    { value: 'yes', label: 'Delhi, Mumbai, Kolkata or Chennai' },
                    { value: 'no', label: 'Elsewhere' },
                  ]}
                />
              </FormField>
              <FormField id="dc-landlord" label="Landlord's name" optional>
                <TextField value={landlord} onChange={setLandlord} maxLength={200} />
              </FormField>
              <FormField id="dc-pan" label="Landlord's PAN" optional helper="Needed when the rent is more than ₹1,00,000 a year." error={errorOf('dc-pan')}>
                <TextField value={pan} onChange={setPan} maxLength={10} autoCapitalize="characters" />
              </FormField>
              <FormField id="dc-relation" label="How you are related to the landlord" optional helper="Needed with the PAN when the rent is more than ₹1,00,000 a year.">
                <Select value={relation} onChange={(v) => setRelation((v as LandlordRelationship | null) ?? null)} placeholder="Choose" options={LANDLORD_RELATION_OPTIONS} />
              </FormField>
            </>
          )}
        </>
      )}
    </PayFormDrawer>
  );
}

function TaxProofs({ live, w }: { live: LiveTax; w: MyTaxWorkspace }) {
  const d = live.declarations;
  if (!d) return null;
  const today = todayIso();
  const windowOpen = w.canSendProofs ?? (today >= d.proofWindowOpens && today <= d.proofCutoff);
  const rejected = d.lines.filter((l) => l.proofStatus === 'rejected').length;
  const partly = d.lines.filter((l) => l.proofStatus === 'partly').length;
  return (
    <div className="yx-pay-stack">
      {w.regime === 'new' ? (
        <InlineAlert tone="info" title="No proofs needed in the new regime">
          These declarations don't reduce your tax in the new regime, so payroll doesn't ask for proofs.
        </InlineAlert>
      ) : today < d.proofWindowOpens ? (
        <InlineAlert tone="info" title={`Proofs open on ${dateText(d.proofWindowOpens)}`}>
          Send them from then until {dateText(d.proofCutoff)}. Until payroll checks a proof, what you declared is used.
        </InlineAlert>
      ) : (
        <InlineAlert tone={rejected + partly ? 'warning' : 'info'} title={rejected + partly ? `${rejected} not accepted, ${partly} partly accepted` : `Proof window: ${dateText(d.proofWindowOpens)} to ${dateText(d.proofCutoff)}`}>
          {windowOpen ? `Send a proof for each line by ${dateText(d.proofCutoff)}. After that day, only what payroll accepted counts and the extra tax is spread over the months left.` : `The proof window closed on ${dateText(d.proofCutoff)}.`}
        </InlineAlert>
      )}
      {!d.lines.length ? (
        <EmptyState compact title="Nothing declared yet." description="Add a declaration first; its proof goes here." />
      ) : (
        <ul className="yx-pay-cards" aria-label="Proofs">
          {d.lines.map((l) => {
            const canSend = w.regime === 'old' && windowOpen && !['approved', 'partly'].includes(l.proofStatus);
            return (
              <li key={l.id}>
                <div className="yx-pay-cards__row">
                  <strong>{subjectText(l.subjectKey, l.section)}</strong>
                  {w.regime === 'old' && proofBadge(l.proofStatus)}
                </div>
                <span className="yx-pay-muted">
                  {l.approvedAmount && l.proofStatus === 'partly' ? `Accepted ${rupees(l.approvedAmount)} of ${rupees(l.amount)}` : `Declared ${rupees(l.amount)}${l.subjectKey === 'hra' ? ' a month' : ''}`}
                  {l.proofs.length ? ` · ${l.proofs.length} ${l.proofs.length === 1 ? 'file' : 'files'} sent` : ''}
                </span>
                {l.comment && <span className="yx-pay-note">Payroll: {l.comment}</span>}
                {canSend && (
                  <FormField id={`pf-${l.id}`} label={`Proof for ${subjectText(l.subjectKey, l.section)}`} hideLabel>
                    <FileUpload accept={['.pdf', '.jpg', '.jpeg', '.png']} upload={(f) => live.onProof(l.id, f).then(() => undefined)} />
                  </FormField>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const F12B_STATE: Record<'pending' | 'approved' | 'rejected', { label: string; tone: BadgeTone }> = {
  pending: { label: 'Payroll is checking it', tone: 'warning' },
  approved: { label: 'Checked: counted in your tax', tone: 'success' },
  rejected: { label: 'Not accepted', tone: 'danger' },
};

function PreviousEmployer({ live, w }: { live: LiveTax; w: MyTaxWorkspace }) {
  const { toast } = useToast();
  const f = live.form12b;
  const sub = f?.submission ?? null;
  const editable = !!f?.open && sub?.status !== 'approved';
  const [name, setName] = useState(sub?.employerName ?? '');
  const [tan, setTan] = useState(sub?.employerTan ?? '');
  const [gross, setGross] = useState(sub?.gross ?? '');
  const [exempt, setExempt] = useState(sub && sub.exemptions !== '0.00' ? sub.exemptions : '');
  const [tds, setTds] = useState(sub?.tds ?? '');
  const [file, setFile] = useState<File | null>(null);
  const { busy, error, run } = useRun();
  const T = tan.trim().toUpperCase();
  const errors: FormErrorItem[] = [
    ...(!TAN_RE.test(T) ? [{ fieldId: 'pe-tan', message: "Enter the previous employer's TAN: 4 letters, 5 digits and a letter, like BLRA12345B." }] : []),
    ...(!MONEY_RE.test(gross.trim()) ? [{ fieldId: 'pe-gross', message: 'Enter the gross salary in rupees, like 450000.' }] : []),
    ...(exempt.trim() && !MONEY_RE.test(exempt.trim()) ? [{ fieldId: 'pe-exempt', message: 'Enter the exemptions in rupees, or leave it empty.' }] : []),
    ...(!MONEY_RE.test(tds.trim())
      ? [{ fieldId: 'pe-tds', message: 'Enter the tax deducted in rupees (0 if none).' }]
      : MONEY_RE.test(gross.trim()) && paise(tds.trim()) > paise(gross.trim())
        ? [{ fieldId: 'pe-tds', message: 'The tax deducted cannot be more than the gross salary.' }]
        : []),
    ...(!file ? [{ fieldId: 'pe-file', message: 'Attach your Form 12B as a PDF.' }] : []),
  ];
  const early = useTooEarly(errors);
  const send = () => {
    if (early.stop()) return;
    void run('send', () => live.onForm12b({ ...(name.trim() ? { employerName: name.trim() } : {}), employerTan: T, gross: gross.trim(), ...(exempt.trim() ? { exemptions: exempt.trim() } : {}), tds: tds.trim() }, file!)).then((ok) => {
      if (!ok) return;
      early.reset();
      toast({ title: 'Form 12B sent to payroll', description: 'It counts in your tax once payroll checks it.', tone: 'success' });
    });
  };
  return (
    <div className="yx-pay-stack">
      <p className="yx-pay-muted">If you worked for another employer earlier in {w.taxYear}, enter the figures from their Form 12B. Payroll checks the form; once it is accepted, your monthly tax counts that salary and the tax already taken.</p>
      {sub && (
        <InlineAlert tone={F12B_STATE[sub.status].tone === 'danger' ? 'danger' : sub.status === 'approved' ? 'success' : 'info'} title={F12B_STATE[sub.status].label}>
          {sub.employerName ?? sub.employerTan}: salary {rupees(sub.gross)}, tax deducted {rupees(sub.tds)}. Sent {dateText(sub.submittedAt.slice(0, 10))}.
          {sub.comment ? ` Payroll: ${sub.comment}` : ''}
          {sub.status === 'approved' ? ' To change it, ask payroll.' : sub.status === 'rejected' ? ' Fix it and send it again.' : ''}
        </InlineAlert>
      )}
      {f && !f.open && <InlineAlert tone="info">Previous employer income could be sent until {dateText(f.closesOn)}.</InlineAlert>}
      {error && (
        <InlineAlert tone="danger" title="Not sent">
          {error}
        </InlineAlert>
      )}
      {editable && (
        <>
          <FieldRow>
            <FormField id="pe-name" label="Previous employer" optional>
              <TextField value={name} onChange={setName} maxLength={200} />
            </FormField>
            <FormField id="pe-tan" label="Their TAN" required error={early.errorOf('pe-tan')}>
              <TextField value={tan} onChange={setTan} maxLength={10} autoCapitalize="characters" />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField id="pe-gross" label="Salary from previous employer" required error={early.errorOf('pe-gross')}>
              <TextField value={gross} onChange={setGross} prefix="₹" inputMode="decimal" maxLength={13} />
            </FormField>
            <FormField id="pe-exempt" label="Exemptions they allowed" optional error={early.errorOf('pe-exempt')}>
              <TextField value={exempt} onChange={setExempt} prefix="₹" inputMode="decimal" maxLength={13} />
            </FormField>
            <FormField id="pe-tds" label="Tax deducted by previous employer" required error={early.errorOf('pe-tds')}>
              <TextField value={tds} onChange={setTds} prefix="₹" inputMode="decimal" maxLength={13} />
            </FormField>
          </FieldRow>
          <FormField id="pe-file" label="Form 12B from previous employer" required helper="A PDF signed by the previous employer." error={early.errorOf('pe-file')}>
            <FileUpload
              id="pe-file"
              accept={['.pdf']}
              multiple={false}
              upload={async (x) => setFile(x)}
              onItemsChange={(items) => !items.length && setFile(null)}
            />
          </FormField>
          <div className="yx-pay-row">
            <Button variant="primary" loading={busy === 'send'} onClick={send}>
              {sub ? 'Send again' : 'Send to payroll'}
            </Button>
            <span className="yx-pay-note">You can send it until {f ? dateText(f.closesOn) : 'the proof cut-off'}.</span>
          </div>
        </>
      )}
      <OtherIncome w={w} onPatch={live.onPatch} />
    </div>
  );
}

function OtherIncome({ w, onPatch }: { w: MyTaxWorkspace; onPatch: LiveTax['onPatch'] }) {
  const { toast } = useToast();
  const amountOf = (k: 'interest' | 'rent' | 'other') => w.otherIncome?.find((o) => o.kind === k)?.amount ?? '';
  const [v, setV] = useState({ interest: amountOf('interest'), rent: amountOf('rent'), other: amountOf('other') });
  const { busy, error, run } = useRun();
  const errors: FormErrorItem[] = (['interest', 'rent', 'other'] as const).filter((k) => v[k].trim() && !MONEY_RE.test(v[k].trim())).map((k) => ({ fieldId: `oi-${k}`, message: 'Enter rupees, like 18000, or leave it empty.' }));
  const early = useTooEarly(errors);
  const save = () => {
    if (early.stop()) return;
    const otherIncome = (['interest', 'rent', 'other'] as const).filter((k) => v[k].trim() && paise(v[k].trim()) > 0n).map((k) => ({ kind: k, amount: v[k].trim() }));
    void run('oi', () => onPatch({ otherIncome })).then((ok) => ok && toast({ title: 'Other income saved', description: 'Your next payslip includes it in the projection.', tone: 'success' }));
  };
  const label = { interest: 'Interest', rent: 'Rent you receive', other: 'Other income' } as const;
  return (
    <section className="yx-pay-panel" aria-label="Other income">
      <SectionTitle>Other income for the year</SectionTitle>
      {error && (
        <InlineAlert tone="danger" title="Not saved">
          {error}
        </InlineAlert>
      )}
      <FieldRow>
        {(['interest', 'rent', 'other'] as const).map((k) => (
          <FormField key={k} id={`oi-${k}`} label={label[k]} optional error={early.errorOf(`oi-${k}`)}>
            <TextField value={v[k]} onChange={(x) => setV({ ...v, [k]: x })} prefix="₹" inputMode="decimal" maxLength={13} />
          </FormField>
        ))}
      </FieldRow>
      <div className="yx-pay-row">
        <Button loading={busy === 'oi'} onClick={save}>
          Save other income
        </Button>
      </div>
    </section>
  );
}

/** PAY-22 "Ask HR to change your regime" (founder answer 3): the other regime, with a reason; it goes to Approvals. */
function AskHrRegime({ w, onClose, onSend }: { w: MyTaxWorkspace; onClose: () => void; onSend: LiveTax['onRegimeRequest'] }) {
  const to = w.regime === 'new' ? 'old' : 'new';
  const [reason, setReason] = useState('');
  return (
    <PayFormDrawer
      title="Ask HR to change your regime"
      subtitle={`From ${w.regime} to ${to} regime for ${w.taxYear}`}
      confirm="Send request"
      done="Request sent to HR. You get a notification when they decide."
      errors={reason.trim().length < 10 ? [{ fieldId: 'rr-why', message: 'Give a reason HR can check (at least 10 letters).' }] : []}
      onClose={onClose}
      onSave={() => onSend({ regime: to, reason: reason.trim() })}
    >
      {(errorOf) => (
        <FormField id="rr-why" label="Reason" required helper="For example, a home loan taken after the cut-off. HR reviews it; the change is recorded." error={errorOf('rr-why')}>
          <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      )}
    </PayFormDrawer>
  );
}

const RES_TEXT = { resident: 'Resident', non_resident: 'Non-resident' } as const;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** PAY-22 residential status (founder answer 2): a change waits for payroll with the TRC and Form 10F; pending shows here. */
/** PAY-22 NoPan: the design's warning, "How to link PAN" and the sheet that sends the portal's confirmation to payroll. */
function PanLink({ w, onSend }: { w: MyTaxWorkspace; onSend?: LiveTax['onPanLink'] }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const req = w.panLinkRequest ?? null;
  if (req?.status === 'pending')
    return (
      <InlineAlert tone="warning" title="PAN link proof sent to payroll">
        Payroll checks it. Until then tax stays at the higher rate.
      </InlineAlert>
    );
  return (
    <>
      <InlineAlert
        tone="warning"
        title="Your PAN is inoperative"
        actions={
          onSend ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              How to link PAN
            </Button>
          ) : undefined
        }
      >
        {req?.status === 'rejected' ? `Payroll did not accept your last confirmation${req.comment ? `: ${req.comment}` : ''}. Send it again. ` : ''}
        Tax is taken at the higher of 20% or your slab rate until your PAN is linked with Aadhaar. Link it on the income-tax e-filing portal, then send the confirmation to payroll.
      </InlineAlert>
      {open && onSend && (
        <PayFormDrawer
          title="Link your PAN with Aadhaar"
          subtitle="Normal-rate tax resumes once payroll sees your PAN working."
          confirm="Send to payroll"
          done="PAN link proof sent to payroll. Payroll checks it."
          errors={file ? [] : [{ fieldId: 'pan-proof', message: 'Attach the link confirmation from the portal.' }]}
          onClose={() => {
            setOpen(false);
            setFile(null);
          }}
          onSave={() => onSend(file!)}
        >
          {(errorOf) => (
            <>
              <ol className="yx-pay-muted">
                <li>On the income-tax e-filing portal, choose Link Aadhaar and enter your PAN and Aadhaar.</li>
                <li>Pay the late-linking fee if the portal asks for it, then submit.</li>
                <li>Download the confirmation once the portal shows your PAN as operative.</li>
              </ol>
              <FormField id="pan-proof" label="Link confirmation from the portal" required helper="A PDF, PNG or JPEG, up to 5 MB." error={errorOf('pan-proof')}>
                <FileUpload id="pan-proof" accept={['.pdf', '.jpg', '.jpeg', '.png']} multiple={false} upload={async (x) => setFile(x)} onItemsChange={(items) => !items.length && setFile(null)} />
              </FormField>
            </>
          )}
        </PayFormDrawer>
      )}
    </>
  );
}

function Residential({ w, onSend }: { w: MyTaxWorkspace; onSend: LiveTax['onResidency'] }) {
  const { toast } = useToast();
  const saved = w.residentialStatus ?? 'resident';
  const req = w.residencyRequest ?? null;
  const [res, setRes] = useState<'resident' | 'non_resident'>(saved);
  const [trc, setTrc] = useState<File | null>(null);
  const [trcTo, setTrcTo] = useState('');
  const [country, setCountry] = useState('');
  const [form10f, setForm10f] = useState(false);
  const { busy, error, run } = useRun();
  const nr = res === 'non_resident';
  const changed = res !== saved;
  const errors: FormErrorItem[] = [
    ...(!changed && !nr ? [{ fieldId: 'rs-status', message: 'Resident is already your status. Choose non-resident to change it.' }] : []),
    ...(nr && !trc ? [{ fieldId: 'rs-trc', message: 'Attach your tax residency certificate (TRC) as a PDF.' }] : []),
    ...(nr && !DAY_RE.test(trcTo) ? [{ fieldId: 'rs-trc-to', message: 'Enter the last day your certificate is valid.' }] : nr && trcTo < todayIso() ? [{ fieldId: 'rs-trc-to', message: 'This certificate has ended. Send one that is still valid.' }] : []),
    ...(nr && country.trim() && !/^[A-Za-z]{2}$/.test(country.trim()) ? [{ fieldId: 'rs-country', message: 'Enter the 2-letter country code, like SG, or leave it empty.' }] : []),
    ...(nr && !form10f ? [{ fieldId: 'rs-10f', message: 'File Form 10F on the income-tax portal first, then tick this.' }] : []),
  ];
  const early = useTooEarly(errors);
  const send = () => {
    if (early.stop()) {
      // The joined Segment takes focus on its first choice (the field's own id is its group).
      if (errors[0]?.fieldId === 'rs-status') document.getElementById('rs-status')?.querySelector<HTMLElement>('[role="radio"]')?.focus();
      return;
    }
    void run('res', () => onSend({ residentialStatus: res, ...(nr ? { trcValidTo: trcTo, form10fFiled: true, ...(country.trim() ? { dtaaCountry: country.trim().toUpperCase() } : {}) } : {}) }, nr ? trc : null)).then((ok) => {
      if (!ok) return;
      early.reset();
      toast({ title: 'Sent for HR review', description: 'Your TDS changes from the payslip after payroll approves it.', tone: 'success' });
    });
  };
  if (req?.status === 'pending')
    return (
      <div className="yx-pay-stack">
        <InlineAlert tone="info" title="Waiting for HR review">
          You asked to be {RES_TEXT[req.residentialStatus].toLowerCase()} on {dateText(req.submittedAt.slice(0, 10))}
          {req.file ? `, with ${req.file.name}` : ''}. Payroll checks it. Your TDS changes from the payslip after they approve.
        </InlineAlert>
        <p className="yx-pay-muted">Until then your tax uses: {RES_TEXT[saved]}.</p>
      </div>
    );
  return (
    <div className="yx-pay-stack">
      {req?.status === 'rejected' && (
        <InlineAlert tone="danger" title="Your last request was not approved">
          {req.comment ? `Payroll: ${req.comment}` : 'Payroll did not approve it.'} Fix it and send it again.
        </InlineAlert>
      )}
      {saved === 'non_resident' && (
        <InlineAlert tone="info" title="Non-resident, approved by HR">
          Your tax is worked out without the rebate. To get a lower treaty rate, add your tax residency certificate and file Form 10F.
        </InlineAlert>
      )}
      {error && (
        <InlineAlert tone="danger" title="Not sent">
          {error}
        </InlineAlert>
      )}
      <FormField id="rs-status" label="Residential status this tax year" error={early.errorOf('rs-status')} helper="Resident: in India 182 days or more in the tax year, or another residence test applies. Non-resident: no rebate; a treaty rate only with a valid tax residency certificate and Form 10F.">
        <Segment
          label="Residential status this tax year"
          value={res}
          onChange={(x) => setRes(x)}
          options={[
            { value: 'resident', label: 'Resident' },
            { value: 'non_resident', label: 'Non-resident' },
          ]}
        />
      </FormField>
      {nr && (
        <>
          <FormField id="rs-trc" label={changed ? 'Tax residency certificate (TRC)' : 'Add TRC for treaty rate'} required helper="A PDF, valid for the tax year." error={early.errorOf('rs-trc')}>
            <FileUpload id="rs-trc" accept={['.pdf']} multiple={false} upload={async (x) => setTrc(x)} onItemsChange={(items) => !items.length && setTrc(null)} />
          </FormField>
          <FieldRow>
            <FormField id="rs-trc-to" label="Certificate valid until" required error={early.errorOf('rs-trc-to')}>
              <TextField type="date" value={trcTo} onChange={setTrcTo} />
            </FormField>
            <FormField id="rs-country" label="Treaty country" optional helper="Only if you claim a treaty rate, like SG." error={early.errorOf('rs-country')}>
              <TextField value={country} onChange={setCountry} maxLength={2} autoCapitalize="characters" />
            </FormField>
          </FieldRow>
          <FormField id="rs-10f" label="Form 10F" required error={early.errorOf('rs-10f')}>
            <Checkbox checked={form10f} onChange={setForm10f} label="I have filed Form 10F on the income-tax portal" />
          </FormField>
        </>
      )}
      <div className="yx-pay-row">
        <Button variant="primary" loading={busy === 'res'} onClick={send}>
          {changed ? 'Send for HR review' : 'Send TRC to HR'}
        </Button>
        <span className="yx-pay-note">Payroll approves it; nothing changes until then.</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ PAY-18 live: Me › Loans and advances */

/** GET payroll/loans/rules (founder decision 8): the company's loan rules for the signed-in person. */
export interface LoanRules {
  eligible: boolean;
  /** Why not, in plain words (on probation, or no pay set up yet). */
  reason: string | null;
  probationEndsOn: string | null;
  monthlyGross: string | null;
  /** null: the company sets no limit. */
  maxGrossMonths: number | null;
  limit: string | null;
  outstanding: string;
  available: string | null;
  /** Founder answer 1: the company's yearly rate per loan type ('0' = interest-free); the employee never types it. */
  interestRate?: { advance: string; loan: string };
}

export interface LiveLoanRequest {
  state: LoadState;
  onRetry?: () => void;
  /** The person's own loans (GET payroll/loans, `mine`). */
  loans: LoanView[] | null;
  rules: LoanRules | null;
  onRequest: (x: LoanRequestInput) => Promise<unknown>;
}

export const LOAN_TYPE_TEXT: Record<string, string> = { advance: 'Salary advance', loan: 'Personal loan', expense: 'Expense advance recovery' };
export const LOAN_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  requested: { label: 'Waiting for approval', tone: 'warning' },
  active: { label: 'Being repaid', tone: 'info' },
  paused: { label: 'Paused', tone: 'warning' },
  closed: { label: 'Closed', tone: 'success' },
  rejected: { label: 'Turned down', tone: 'neutral' },
};
/** "Interest-free" or "8.5% a year". */
export const rateText = (rate: string | undefined) => (!rate || Number(rate) === 0 ? 'Interest-free' : `${Number(rate)}% a year`);

/** The instalment the API will set: interest-free = the principal over the months, rounded up to the rupee (exact); with interest, an estimate. */
export function previewEmi(principal: string, ratePct: string, months: number): { emi: string; exact: boolean } {
  if (!MONEY_RE.test(principal) || months < 1) return { emi: '0.00', exact: true };
  const p = paise(principal);
  if (!ratePct || Number(ratePct) === 0) {
    const per = BigInt(months) * 100n;
    return { emi: fromPaise(((p + per - 1n) / per) * 100n), exact: true };
  }
  const r = Number(ratePct) / 1200;
  const f = (1 + r) ** months;
  return { emi: `${Math.ceil((Number(p) / 100) * r * f / (f - 1))}.00`, exact: false };
}

/** "2026-11" for the month after today (IST). */
const nextMonthIso = () => {
  const t = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
};

const ROUTE_STATE: Record<LoanApproval['steps'][number]['state'], ApprovalStep['status']> = { approved: 'done', open: 'current', waiting: 'pending', rejected: 'rejected', skipped: 'skipped', sent_back: 'pending' };

/** PAY-18 Submitted: the engine's steps as the design's approval timeline (sent, then each approval step). */
export function loanSteps(a: LoanApproval): ApprovalStep[] {
  return [
    { id: 'sent', label: 'Submitted', status: 'done', approver: 'You', at: new Date(a.submittedAt) },
    ...a.steps.map((s, i) => ({ id: String(i), label: s.name, status: ROUTE_STATE[s.state], approver: s.by ?? (s.waitingFor.join(', ') || undefined), at: s.at ? new Date(s.at) : undefined })),
  ];
}

function LiveLoanRequest({ live }: { live: LiveLoanRequest }) {
  const { toast } = useToast();
  const rules = live.rules;
  const mine = (live.loans ?? []).filter((l) => l.mine);
  const [type, setType] = useState<'advance' | 'loan'>('advance');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('');
  const [first, setFirst] = useState(nextMonthIso());
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const n = Number(count);
  // Founder answer 1: the company's rate for the type, shown and used for the preview; never typed or sent.
  const rate = rules?.interestRate?.[type] ?? '0';
  const over = rules?.available != null && MONEY_RE.test(amount.trim()) && paise(amount.trim()) > paise(rules.available);
  const limitText = rules?.limit != null && rules.maxGrossMonths != null ? `${rules.maxGrossMonths} ${rules.maxGrossMonths === 1 ? "month's" : "months'"} gross pay` : null;
  const errors: FormErrorItem[] = [
    ...(!MONEY_RE.test(amount.trim()) || paise(amount.trim()) <= 0n ? [{ fieldId: 'lr-amount', message: 'Enter the amount in rupees.' }] : over ? [{ fieldId: 'lr-amount', message: `Enter ${rupees(rules!.available)} or less. That is the most you can ask for now.` }] : []),
    ...(!Number.isInteger(n) || n < 1 || n > 120 ? [{ fieldId: 'lr-count', message: 'Enter 1 to 120 instalments.' }] : []),
    ...(!MONTH_RE.test(first) ? [{ fieldId: 'lr-first', message: 'Choose the month of the first instalment.' }] : []),
    ...(reason.trim().length < 5 ? [{ fieldId: 'lr-why', message: 'Give a reason (at least 5 letters).' }] : []),
  ];
  const early = useTooEarly(errors);
  const emi = Number.isInteger(n) && n >= 1 ? previewEmi(amount.trim(), rate, n) : null;
  const send = () => {
    if (early.stop()) return;
    void run('send', () =>
      live.onRequest({ loanType: type, principal: amount.trim(), instalments: n, firstMonth: first, reason: reason.trim() }),
    ).then((ok) => {
      if (!ok) return;
      early.reset();
      setAmount('');
      setCount('');
      setReason('');
      toast({ title: 'Request sent', description: "It goes to payroll's approver. You get a notification at each step.", tone: 'success' });
    });
  };
  return (
    <MyPayFrame page="loans">
      <PageHeader title="Loans and advances" description="Recovered from your salary each month. If you leave, the balance is recovered in your final settlement." />
      <PayPageState state={live.state} onRetry={live.onRetry} what="your loans">
        <div className="yx-pay-stack">
          {rules && !rules.eligible ? (
            <EmptyState title={rules.reason ?? "You can't ask for a loan or advance right now."} description={rules.probationEndsOn ? `Your probation ends on ${dateText(rules.probationEndsOn)}. The company allows loans and salary advances after probation.` : 'Ask HR if you think this is wrong.'} />
          ) : (
            <div className="yx-pay-split">
              <section className="yx-pay-stack" aria-label="Ask for a loan or advance">
                {error && (
                  <InlineAlert tone="danger" title="Not sent">
                    {error}
                  </InlineAlert>
                )}
                <FormField id="lr-type" label="Type" required>
                  <Segment
                    label="Type"
                    value={type}
                    onChange={setType}
                    options={[
                      { value: 'advance', label: 'Salary advance' },
                      { value: 'loan', label: 'Personal loan' },
                    ]}
                  />
                </FormField>
                <FieldRow>
                  <FormField id="lr-amount" label="Amount" required error={early.errorOf('lr-amount')} helper={rules?.available != null ? `Up to ${rupees(rules.available)}` : undefined}>
                    <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" maxLength={13} />
                  </FormField>
                  <FormField id="lr-count" label="Number of instalments" required error={early.errorOf('lr-count')}>
                    <TextField value={count} onChange={setCount} inputMode="numeric" maxLength={3} />
                  </FormField>
                </FieldRow>
                <FormField id="lr-first" label="First instalment in" required error={early.errorOf('lr-first')}>
                  <TextField type="month" value={first} onChange={setFirst} />
                </FormField>
                <FormField id="lr-why" label="Reason" required error={early.errorOf('lr-why')}>
                  <TextArea rows={2} value={reason} onChange={setReason} maxLength={300} />
                </FormField>
                <div className="yx-pay-row">
                  <Button variant="primary" loading={busy === 'send'} onClick={send}>
                    Send request
                  </Button>
                </div>
              </section>
              <aside className="yx-pay-panel" aria-label="Effect on your pay">
                <SectionTitle>Effect on your pay</SectionTitle>
                <FactRow
                  items={[
                    { label: emi?.exact === false ? 'Instalment (about)' : 'Instalment', value: emi && paise(emi.emi) > 0n ? rupees(emi.emi) : '—' },
                    { label: 'Interest', value: rateText(rate) },
                    { label: 'First instalment', value: MONTH_RE.test(first) ? `${monthName(first)} payslip` : '—' },
                  ]}
                />
                {rules && (
                  <DescriptionList
                    items={[
                      ...(rules.limit != null ? [{ label: `Company limit (${limitText})`, value: rupees(rules.limit) }] : [{ label: 'Company limit', value: 'No limit set' }]),
                      { label: 'Still to repay on your loans', value: rupees(rules.outstanding) },
                      ...(rules.available != null ? [{ label: 'Most you can ask for now', value: rupees(rules.available) }] : []),
                    ]}
                  />
                )}
                {over && (
                  <InlineAlert tone="warning" title="Over the limit">
                    The company allows at most {limitText ?? 'its limit'}, less what you still have to repay.
                  </InlineAlert>
                )}
                <p className="yx-pay-note">Payroll's approver decides. The company sets the interest for each loan type. The instalment is set when it is approved; with interest, the amount shown is an estimate.</p>
              </aside>
            </div>
          )}
          {mine
            .filter((l) => l.status === 'requested' && l.approval)
            .map((l) => (
              <section key={l.id} className="yx-pay-stack" aria-label={`${LOAN_TYPE_TEXT[l.loanType] ?? l.loanType} request`}>
                <div className="yx-pay-row">
                  <strong>
                    {LOAN_TYPE_TEXT[l.loanType] ?? l.loanType} request, {rupees(l.principal)}
                  </strong>
                  <Badge tone="info">Waiting for approval</Badge>
                </div>
                <ApprovalTimeline steps={loanSteps(l.approval!)} />
              </section>
            ))}
          <section aria-label="Your loans and advances">
            <SectionTitle>Your loans and advances</SectionTitle>
            {!mine.length ? (
              <p className="yx-pay-note">None yet.</p>
            ) : (
              <PlainTable
                label="My loans and advances"
                rows={mine}
                getRowId={(l) => l.id}
                columns={[
                  { key: 'type', header: 'Type', rowHeader: true, cell: (l) => LOAN_TYPE_TEXT[l.loanType] ?? l.loanType },
                  { key: 'amount', header: 'Amount', num: true, cell: (l) => rupees(l.principal) },
                  { key: 'emi', header: 'Instalment', num: true, cell: (l) => rupees(l.emi) },
                  { key: 'left', header: 'Left to repay', num: true, cell: (l) => rupees(l.outstanding) },
                  { key: 'from', header: 'From', cell: (l) => monthName(l.firstMonth) },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (l) => (
                      <>
                        <Badge tone={LOAN_STATE[l.status]?.tone ?? 'neutral'}>{LOAN_STATE[l.status]?.label ?? l.status}</Badge>
                        {l.pausedUntil && <span className="yx-pay-note"> until {monthName(l.pausedUntil)}</span>}
                      </>
                    ),
                  },
                ]}
              />
            )}
          </section>
        </div>
      </PayPageState>
    </MyPayFrame>
  );
}

/* ------------------------------------------------------------------ PAY-26 live: Me › Get paid early (desktop) */

export interface LiveEwaRequest {
  state: LoadState;
  onRetry?: () => void;
  data: MyEwa | null;
  /** Asks for the amount; the person has accepted the fee and the recovery. */
  onDraw: (amount: string) => Promise<unknown>;
}

const DRAW_STATE: Record<EwaDrawView['status'], { label: string; tone: BadgeTone }> = {
  requested: { label: 'Being paid', tone: 'info' },
  paid: { label: 'Paid to your account', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function LiveEwaRequest({ live }: { live: LiveEwaRequest }) {
  const { toast } = useToast();
  const d = live.data;
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [amount, setAmount] = useState('');
  const [agree, setAgree] = useState(false);
  const { busy, error, run } = useRun();
  const policy = d?.policy ?? null;
  const quote = d?.quote ?? null;
  const fee = policy && policy.feePayer === 'employee' ? policy.fee : '0.00';
  const a = amount.trim();
  const errors: FormErrorItem[] =
    policy && quote
      ? [
          ...(!MONEY_RE.test(a)
            ? [{ fieldId: 'ew-amount', message: `Enter an amount from ${rupees(policy.minAmount)} to ${rupees(quote.available)}.` }]
            : paise(a) < paise(policy.minAmount)
              ? [{ fieldId: 'ew-amount', message: `The least you can take is ${rupees(policy.minAmount)}.` }]
              : paise(a) > paise(quote.available)
                ? [{ fieldId: 'ew-amount', message: `Enter ${rupees(quote.available)} or less.` }]
                : []),
        ]
      : [];
  const early = useTooEarly(errors);
  const agreeEarly = useTooEarly(agree ? [] : [{ fieldId: 'ew-agree', message: 'Tick the box to accept the fee and the recovery.' }]);
  const recovered = MONEY_RE.test(a) ? fromPaise(paise(a) + paise(fee)) : '0.00';
  const ask = () => {
    if (agreeEarly.stop()) return;
    void run('draw', () => live.onDraw(a)).then((ok) => {
      if (!ok) return;
      toast({ title: `${rupees(a)} asked for`, description: 'It is paid to your salary account and taken back from this month’s payslip.', tone: 'success' });
      setStep('form');
      setAmount('');
      setAgree(false);
      agreeEarly.reset();
    });
  };
  return (
    <MyPayFrame page="ewa">
      <PageHeader title="Get paid early" description="Take part of the salary you have already earned this month, before payday. It is taken back in full from this month's payslip." />
      <PayPageState state={live.state} onRetry={live.onRetry} what="earned wage access">
        {d && (
          <div className="yx-pay-stack">
            {error && (
              <InlineAlert tone="danger" title="Not sent">
                {error}
              </InlineAlert>
            )}
            {!d.open || !policy || !quote ? (
              <InlineAlert tone="info" title="Not available right now">
                {d.reasons.length ? d.reasons.join(' ') : 'Your company has not turned this on for your pay group.'}
              </InlineAlert>
            ) : (
              <>
                <section className="yx-pay-panel" aria-label="Available">
                  <p className="yx-pay-muted">You can take up to</p>
                  <p className="yx-pay-money__figure">{rupees(quote.available)}</p>
                  <p className="yx-pay-note">
                    Earned so far {rupees(quote.earned)}: expected net {rupees(quote.expectedNet)} ÷ {quote.monthDays} days × {quote.payableDays} days worked, less what you took already ({rupees(quote.drawn)}) and dues ({rupees(quote.deductionsDue)}).
                  </p>
                </section>
                {step === 'form' ? (
                  <>
                    <FormField id="ew-amount" label="Amount" required helper={`${rupees(policy.minAmount)} to ${rupees(quote.available)}`} error={early.errorOf('ew-amount')}>
                      <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" maxLength={13} />
                    </FormField>
                    <div className="yx-pay-row">
                      <Button variant="primary" onClick={() => !early.stop() && setStep('confirm')}>
                        Continue
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <section className="yx-pay-disclosure" aria-label="Fee and recovery">
                      <p>
                        <strong>You get {rupees(a)}</strong> in your salary account.
                      </p>
                      <p>
                        <strong>Fee {rupees(fee)}</strong>
                        {policy.feePayer === 'employee' ? ', paid by you.' : '. The company pays the fee.'}
                      </p>
                      <p>
                        <strong>Recovery:</strong> {rupees(recovered)} is taken from this month's payslip. If you leave, it is recovered in your final settlement.
                      </p>
                    </section>
                    <FormField id="ew-agree" label="Fee and recovery" error={agreeEarly.errorOf('ew-agree')} hideLabel>
                      <Checkbox checked={agree} onChange={setAgree} label={`I understand ${rupees(recovered)} is taken from this month's pay`} />
                    </FormField>
                    <div className="yx-pay-row">
                      <Button onClick={() => setStep('form')}>Back</Button>
                      <Button variant="primary" loading={busy === 'draw'} onClick={ask}>
                        Get {rupees(a)}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
            <section aria-label="Your draws">
              <SectionTitle>Your draws</SectionTitle>
              {!d.draws.length ? (
                <p className="yx-pay-note">None yet.</p>
              ) : (
                <PlainTable
                  label="My draws"
                  rows={d.draws}
                  getRowId={(x) => x.id}
                  columns={[
                    { key: 'asked', header: 'Asked on', rowHeader: true, cell: (x) => dateText(x.createdAt.slice(0, 10)) },
                    { key: 'amount', header: 'Amount', num: true, cell: (x) => rupees(x.amount) },
                    { key: 'fee', header: 'Fee', num: true, cell: (x) => (x.feePayer === 'employee' ? rupees(x.fee) : 'Paid by the company') },
                    {
                      key: 'status',
                      header: 'Status',
                      cell: (x) => (
                        <>
                          <Badge tone={DRAW_STATE[x.status].tone}>{DRAW_STATE[x.status].label}</Badge>
                          {x.failureReason && <span className="yx-pay-note"> {x.failureReason}</span>}
                        </>
                      ),
                    },
                  ]}
                />
              )}
            </section>
          </div>
        )}
      </PayPageState>
    </MyPayFrame>
  );
}

/* ------------------------------------------------------------------ PAY-33 live: Me › My incentives */

export interface LiveIncentives {
  state: LoadState;
  onRetry?: () => void;
  data: MyIncentives | null;
}

type IncentiveRow = MyIncentives['results'][number];
const QUARTER_MONTHS: Record<string, string> = { Q1: 'Apr–Jun', Q2: 'Jul–Sep', Q3: 'Oct–Dec', Q4: 'Jan–Mar' };
/** PAY-33: what of a result is held (until released), in payroll, and still being checked. */
const heldOf = (r: IncentiveRow) => (r.heldReleased ? '0.00' : (r.held ?? '0.00'));
const inPayrollOf = (r: IncentiveRow) => (r.sentToPayroll ? fromPaise(paise(r.amount) - paise(heldOf(r))) : '0.00');
const checkedOf = (r: IncentiveRow) => (r.sentToPayroll ? '0.00' : fromPaise(paise(r.amount) - paise(heldOf(r))));
const tierText = (t: IncentiveRow['tier']) => (!t ? '—' : t.to === null ? `${t.from}% of quota and above` : `${t.from}–${t.to}% of quota`);

function LiveIncentiveStatement({ live }: { live: LiveIncentives }) {
  const d = live.data;
  const results = [...(d?.results ?? [])].sort((x, y) => y.month.localeCompare(x.month));
  const claw = d?.clawbacks ?? [];
  const earned = sumMoney(results.map((r) => r.amount));
  const inPayroll = sumMoney(results.map(inPayrollOf));
  const clawed = sumMoney(claw.map((c) => c.amount));
  // PAY-33 Default: the latest quarter, as the design's summary; the statement by month with each quarter's total.
  const qKey = (r: IncentiveRow) => (r.quarter && r.taxYear ? `${r.taxYear} ${r.quarter}` : r.month);
  const latest = results[0];
  const inQuarter = latest ? results.filter((r) => qKey(r) === qKey(latest)) : [];
  const quota = sumMoney(inQuarter.map((r) => r.quota));
  const actual = sumMoney(inQuarter.map((r) => r.actual));
  const groups = [...new Set(results.map(qKey))].map((k) => results.filter((r) => qKey(r) === k));
  const tableRows = groups.flatMap((g) => [
    ...g.map((r) => ({ id: r.id, label: monthName(r.month), plan: r.plan ?? '—', achieved: `${r.actual}${r.workings?.attainment ? ` (${r.workings.attainment}%)` : ''}`, tier: tierText(r.tier), earned: r.amount, inPayroll: inPayrollOf(r), held: heldOf(r), checked: checkedOf(r), total: false })),
    ...(g[0]?.quarter
      ? [{ id: `t-${qKey(g[0])}`, label: `${g[0].quarter} ${g[0].taxYear} total`, plan: '', achieved: '', tier: '', earned: sumMoney(g.map((r) => r.amount)), inPayroll: sumMoney(g.map(inPayrollOf)), held: sumMoney(g.map(heldOf)), checked: sumMoney(g.map(checkedOf)), total: true }]
      : []),
  ]);
  const cell = (v: string, total: boolean) => {
    const text = paise(v) ? rupees(v) : '—';
    return total ? <strong>{text}</strong> : text;
  };
  return (
    <MyPayFrame page="incentives" show={{ incentives: true }}>
      <PageHeader title="My incentives" description="Your incentive and commission results, what went to payroll, and any clawbacks." />
      <PayPageState state={live.state} onRetry={live.onRetry} what="your incentives">
        {d && !results.length && !claw.length ? (
          <EmptyState title="No incentive results yet." description="If you are on an incentive plan, your results show here once payroll records them. If you think you should be on one, ask HR." />
        ) : (
          d && (
            <div className="yx-pay-stack">
              {claw.length > 0 && (
                <InlineAlert tone="warning" title={`Clawback: ${rupees(clawed)}`}>
                  {claw.map((c) => `${monthName(c.month)}: ${rupees(c.amount)} (${c.reason})`).join(' · ')}. It is taken from your payslip.
                </InlineAlert>
              )}
              {latest && (
                <>
                  <SectionTitle actions={latest.quarter ? <Badge tone="info">{latest.payoutFrequency === 'quarterly' ? `${latest.quarter} pays quarterly` : `${latest.quarter}`}</Badge> : undefined}>
                    {latest.quarter ? `Quarter ${latest.quarter.slice(1)} (${QUARTER_MONTHS[latest.quarter]}, ${latest.taxYear})` : monthName(latest.month)}
                  </SectionTitle>
                  <DescriptionList
                    columns={2}
                    items={[
                      { label: 'Quota', value: quota },
                      { label: 'Achieved', value: `${actual}${paise(quota) ? ` · ${(Number(actual) / Number(quota) * 100).toFixed(2)}%` : ''}` },
                      { label: 'Tier reached', value: tierText(latest.tier) },
                      { label: 'Earned this quarter', value: rupees(sumMoney(inQuarter.map((r) => r.amount))) },
                      { label: 'Held (waiting for payment from customer)', value: rupees(sumMoney(inQuarter.map(heldOf))) },
                      { label: 'Sent to payroll', value: rupees(sumMoney(inQuarter.map(inPayrollOf))) },
                      { label: 'Being checked', value: rupees(sumMoney(inQuarter.map(checkedOf))) },
                      ...(claw.length ? [{ label: 'Recovered (clawback)', value: `−${rupees(clawed)}` }] : []),
                    ]}
                  />
                </>
              )}
              <SectionTitle>Statement by month</SectionTitle>
              <PlainTable
                label="My incentive results"
                rows={tableRows}
                getRowId={(r) => r.id}
                columns={[
                  { key: 'month', header: 'Month', rowHeader: true, cell: (r) => (r.total ? <strong>{r.label}</strong> : r.label) },
                  { key: 'plan', header: 'Plan', cell: (r) => r.plan },
                  { key: 'actual', header: 'Achieved', num: true, cell: (r) => r.achieved },
                  { key: 'tier', header: 'Tier', cell: (r) => r.tier },
                  { key: 'earned', header: 'Earned', num: true, cell: (r) => cell(r.earned, r.total) },
                  { key: 'paid', header: 'In payroll', num: true, cell: (r) => cell(r.inPayroll, r.total) },
                  { key: 'held', header: 'Held', num: true, cell: (r) => cell(r.held, r.total) },
                  { key: 'checked', header: 'Being checked', num: true, cell: (r) => cell(r.checked, r.total) },
                ]}
                footer={[{ id: 'all', label: 'Total', cells: { earned: rupees(earned), paid: rupees(inPayroll), held: rupees(sumMoney(results.map(heldOf))), checked: rupees(sumMoney(results.map(checkedOf))) } }]}
              />
              {results.some((r) => paise(heldOf(r)) > 0n) && (
                <p className="yx-pay-note">
                  Held: {results.filter((r) => paise(heldOf(r)) > 0n).map((r) => `${monthName(r.month)}, ${rupees(heldOf(r))}${r.heldReason ? ` (${r.heldReason})` : ''}`).join('; ')}. Payroll pays it once the customer has paid.
                </p>
              )}
              <p className="yx-pay-note">Quarters follow the financial year (April to March). Incentives are salary income; tax is deducted through your payslip.</p>
            </div>
          )
        )}
      </PayPageState>
    </MyPayFrame>
  );
}

/* ------------------------------------------------------------------ PAY-39 live: Performance › My pay band */

/** GET performance/me/pay-band: the range of the person's grade and where they sit (never their own figure). */
export interface MyPayBand {
  visible: boolean;
  currency?: string;
  range?: { min: number; mid: number; max: number } | null;
  position?: 'below' | 'within' | 'above';
  quartile?: 1 | 2 | 3 | 4 | null;
  /** PAY-39: the person's own annual CTC (only ever their own), for the marker on the band. */
  ctc?: number;
}

export interface LivePayBand {
  state: LoadState;
  onRetry?: () => void;
  band: MyPayBand | null;
}

function LivePayBand({ live }: { live: LivePayBand }) {
  const b = live.band;
  const where = !b?.position ? '' : b.position === 'within' ? `You are within the range${b.quartile ? `, in quarter ${b.quartile} of 4` : ''}.` : b.position === 'below' ? 'You are below the range.' : 'You are above the range.';
  return (
    <MyPayFrame page="band">
      <PageHeader title="My pay band" description="Your grade's range and where your pay sits in it. Only you see this." />
      <PayPageState state={live.state} onRetry={live.onRetry} what="your pay band">
        {b && !b.visible ? (
          <EmptyState title="Your company doesn't share pay bands." description="Ask HR if you want to know how your pay compares." />
        ) : b && !b.range ? (
          <EmptyState title="No range is set for your grade yet." description="HR sets the ranges. Ask HR if you have a question about your pay." />
        ) : (
          b?.range && (
            <div className="yx-pay-stack">
              <section className="yx-pay-panel" aria-label="Your position in the band">
                <SectionTitle>Where your pay sits</SectionTitle>
                {b.ctc != null && <RangeMarker label="Your annual CTC in your band" min={b.range.min} max={b.range.max} mid={b.range.mid} value={b.ctc} />}
                <FactRow
                  items={[
                    ...(b.ctc != null
                      ? [
                          { label: 'Your annual CTC', value: formatINR(b.ctc) },
                          { label: 'Compared with midpoint', value: `${Math.round((b.ctc / b.range.mid) * 100)}% (${formatINR(Math.abs(b.ctc - b.range.mid))} ${b.ctc < b.range.mid ? 'below' : 'above'})` },
                        ]
                      : []),
                    { label: 'Band', value: `${formatINR(b.range.min)} – ${formatINR(b.range.max)}` },
                    { label: 'Midpoint', value: formatINR(b.range.mid) },
                    { label: 'Where you sit', value: b.position === 'within' ? `Within${b.quartile ? `, quarter ${b.quartile} of 4` : ''}` : b.position === 'below' ? 'Below the range' : 'Above the range' },
                  ]}
                />
                <p>{where}</p>
                {b.position === 'above' ? (
                  <InlineAlert tone="info">Your pay is above the band maximum. Future increases may be smaller or paid as one-time amounts; your manager can explain.</InlineAlert>
                ) : (
                  <p className="yx-pay-muted">Midpoint is the market rate for a fully proficient person in this grade. Being below it is normal while you grow in the role.</p>
                )}
              </section>
              <p className="yx-pay-note">You see only your own band. Other people's pay is never shown.</p>
            </div>
          )
        )}
      </PayPageState>
    </MyPayFrame>
  );
}

/* ================================================================== PAY-54 · My pay documents (founder decision 12) */

const DOC_STATE: Record<PayDocument['status'], { label: string; tone: BadgeTone }> = {
  issued: { label: 'Issued', tone: 'success' },
  superseded: { label: 'Superseded', tone: 'neutral' },
  awaiting_signature: { label: 'Waiting for the company signature', tone: 'warning' },
};

export interface LiveMyPayDocuments {
  state: LoadState;
  onRetry?: () => void;
  data: PayDocument[] | null;
  onDownload: (doc: PayDocument) => Promise<unknown>;
  verifyUrl: (code: string) => string;
}

const SAMPLE_DOCS: PayDocument[] = [
  { id: 'd3', kind: 'payslip', kindLabel: 'Payslip', title: 'Payslip, September 2026', referenceNo: 'KFPL/PS/2026-27/000412', status: 'issued', signature: 'none', issuedAt: '2026-09-30T12:00:00Z', verifyCode: 'K7P2-QX9M', sha256: 'a'.repeat(64), month: '2026-09', supersedesId: 'd2', supersededById: null, purged: false },
  { id: 'd2', kind: 'payslip', kindLabel: 'Payslip', title: 'Payslip, September 2026', referenceNo: 'KFPL/PS/2026-27/000398', status: 'superseded', signature: 'none', issuedAt: '2026-09-29T12:00:00Z', verifyCode: 'M4D8-RT2C', sha256: 'b'.repeat(64), month: '2026-09', supersedesId: null, supersededById: 'd3', purged: false },
  { id: 'd1', kind: 'revision_letter', kindLabel: 'Pay revision letter', title: 'Pay revision letter, April 2026', referenceNo: 'KFPL/RL/2026-27/000021', status: 'issued', signature: 'signed', issuedAt: '2026-04-02T10:00:00Z', verifyCode: 'H3N6-WB5Z', sha256: 'c'.repeat(64), month: null, supersedesId: null, supersededById: null, purged: false },
];

/** PAY-54 · Me › Pay documents: one's own payslips and letters as issued, with their verify codes. One implementation: the app passes `live`; stories get sample documents. */
export function MyPayDocumentsScreen({ live, state = 'ready', variant }: { live?: LiveMyPayDocuments; state?: LoadState; /** Story only. */ variant?: 'purged' | 'download-failed' | 'empty' }) {
  const v: LiveMyPayDocuments = live ?? {
    state,
    onRetry: () => undefined,
    data: state !== 'ready' ? null : variant === 'empty' ? [] : variant === 'purged' ? [{ ...SAMPLE_DOCS[2]!, purged: true }, SAMPLE_DOCS[0]!] : SAMPLE_DOCS,
    onDownload: variant === 'download-failed' ? () => Promise.reject(new Error('Your session ended after 30 minutes. Sign in again to download.')) : () => Promise.resolve(),
    verifyUrl: (c) => `https://kaverifoods.yukthix.test/verify/${c}`,
  };
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const docs = v.data ?? [];
  return (
    <MyPayFrame page="documents">
      <PageHeader title="My pay documents" description="Your payslips and letters as issued. Anyone you give one to can check it with its code." />
      <PayPageState state={v.state} onRetry={v.onRetry} what="your pay documents">
        <div className="yx-pay-stack">
          {error && (
            <InlineAlert tone="danger" title="Not downloaded">
              {error}
            </InlineAlert>
          )}
          {!docs.length ? (
            <EmptyState title="No pay documents yet." description="Your payslips and letters show here once payroll issues them." />
          ) : (
            <PlainTable
              label="Pay documents"
              rows={docs}
              getRowId={(x) => x.id}
              columns={[
                { key: 'doc', header: 'Document', rowHeader: true, cell: (x) => x.title },
                { key: 'ref', header: 'Reference', cell: (x) => <span className="yx-pay-note">{x.referenceNo}</span> },
                { key: 'issued', header: 'Issued', cell: (x) => dateText(x.issuedAt.slice(0, 10)) },
                { key: 'status', header: 'Status', cell: (x) => <Badge tone={DOC_STATE[x.status].tone}>{DOC_STATE[x.status].label}</Badge> },
                {
                  key: 'check',
                  header: 'Check it',
                  cell: (x) => (
                    <span className="yx-pay-note">
                      {x.verifyCode && (
                        <Link href={v.verifyUrl(x.verifyCode)} target="_blank" rel="noreferrer">
                          {x.verifyCode}
                        </Link>
                      )}
                    </span>
                  ),
                },
                {
                  key: 'act',
                  header: <span className="yx-visually-hidden">Actions</span>,
                  cell: (x) =>
                    x.purged ? (
                      <span className="yx-pay-note">Deleted after its retention period</span>
                    ) : (
                      <Button size="sm" icon={Download} loading={busy === x.id} onClick={() => void run(x.id, () => v.onDownload(x)).then((ok) => ok && toast({ title: 'Document downloaded', description: x.title, tone: 'success' }))} aria-label={`Download ${x.title}, ${x.referenceNo}`}>
                        Download PDF
                      </Button>
                    ),
                },
              ]}
            />
          )}
          <p className="yx-pay-note">An issued document never changes. A correction issues a new one and the old one shows as superseded.</p>
        </div>
      </PayPageState>
    </MyPayFrame>
  );
}

export interface NomineeInput {
  employeeId: string;
  name: string;
  email: string;
  validUntil: string;
}

/** PAY-54 · Add a nominee (HR, Payroll › Pay documents): they sign in to the pay portal with a code sent by email and can only read the person's pay documents. */
export function NomineeDrawer({ onSearch, onClose, onSave }: { onSearch: (q: string) => Promise<PersonHit[]>; onClose: () => void; onSave: (x: NomineeInput) => Promise<unknown> }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [until, setUntil] = useState('');
  const today = todayIso();
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'nm-who', message: 'Choose whose documents.' }] : []),
    ...(name.trim().length < 2 ? [{ fieldId: 'nm-name', message: "Give the nominee's name." }] : []),
    ...(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? [{ fieldId: 'nm-email', message: 'Give an email address like name@example.com.' }] : []),
    ...(!/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= today ? [{ fieldId: 'nm-until', message: 'Choose a day after today.' }] : []),
  ];
  return (
    <PayFormDrawer
      title="Add a nominee"
      subtitle="They sign in to the pay portal with a code sent to this email, and can only read."
      confirm="Add nominee"
      done="Nominee added. They can sign in to the pay portal with a code sent to their email."
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ employeeId: who!.id, name: name.trim(), email: email.trim(), validUntil: until })}
    >
      {(errorOf) => (
        <>
          <FindPerson id="nm-who" label="Whose documents" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('nm-who')} />
          <FormField id="nm-name" label="Nominee's name" required error={errorOf('nm-name')}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="nm-email" label="Nominee's email" required error={errorOf('nm-email')}>
            <TextField type="email" value={email} onChange={setEmail} maxLength={200} />
          </FormField>
          <FormField id="nm-until" label="Access until" required error={errorOf('nm-until')}>
            <TextField type="date" value={until} onChange={setUntil} />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}
