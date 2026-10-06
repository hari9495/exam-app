// Employee pay (desktop Me › My pay and mobile Pay tab): PAY-21 payslip viewer, PAY-40 "Why is my pay different?",
// PAY-22 tax workspace, PAY-41 compare tax regimes, PAY-18 loan / advance request, PAY-26 earned wage access,
// PAY-33 my incentive statement, PAY-39 my pay band.
import { useState, type ReactNode } from 'react';
import { ChevronLeft, Download, FileText, HelpCircle, MessageSquare } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton, Link } from '../../components/button';
import { AiBadge, Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { BottomSheet } from '../../components/overlay';
import { AssistantPanel } from '../../components/notify';
import { PayslipDocument } from '../../components/print';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { BarChart } from '../../components/charts';
import { ApprovalTimeline } from '../../components/timeline';
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
  RangeMarker,
  SectionTitle,
  StateBlock,
  WhyThisNumber,
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
export function PayDiffPanel({ diffs, previous, current, onQuery, chat }: { diffs: PayDiff[]; previous: number; current: number; onQuery: (line: string) => void; chat?: boolean }) {
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
          { label: 'August net', value: formatINR(previous) },
          { label: 'September net', value: formatINR(current) },
          { label: 'Difference', value: <Amount value={total} signed /> },
        ]}
      />
      {diffs.length === 0 ? (
        <InlineAlert tone="success" title="Your pay is the same as last month">
          No line changed between August and September.
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

export type PayslipVariant = 'default' | 'query' | 'query-sent' | 'held' | 'not-published' | 'document' | 'why' | 'why-unexplained' | 'why-chat' | 'why-same';

/** PAY-21 · Payslip viewer: net first, days strip, why-this-number, raise a query. Hosts PAY-40. */
export function PayslipViewerScreen({ layout = 'desktop', variant = 'default', state = 'ready' }: { layout?: Layout; variant?: PayslipVariant; state?: ViewState }) {
  const [query, setQuery] = useState<string | null>(variant === 'query' ? 'Unpaid leave, 1 day' : null);
  const [sent, setSent] = useState(variant === 'query-sent');
  const [why, setWhy] = useState(variant.startsWith('why'));
  const [doc, setDoc] = useState(variant === 'document');
  const [pdfSaved, setPdfSaved] = useState(false);
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
      <div className="yx-pay-row">
        <Button icon={ChevronLeft} onClick={() => setPast(null)}>
          Back to September 2026
        </Button>
      </div>
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
        {sent && (
          <InlineAlert tone="success" title="Query sent to payroll">
            Suresh Pillai will reply here within 2 working days. You'll get a notification in the app.
          </InlineAlert>
        )}
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
        {body}
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
          <Button variant="primary" icon={Download} onClick={() => setPdfSaved(true)}>
            Download PDF
          </Button>
        }
      >
        {pdfSaved && (
          <InlineAlert tone="success" title="Payslip downloaded">
            Saved as {MY_PAYSLIP.employee.code}-payslip-Sep-2026.pdf in your downloads.
          </InlineAlert>
        )}
        <div className="yx-pay-preview" tabIndex={0} role="region" aria-label="Payslip preview">
          <PayslipDocument data={MY_PAYSLIP} />
        </div>
      </Drawer>
    </EmpFrame>
  );
}

/* ================================================================== PAY-41 Compare tax regimes */

function WhatIf({ label, value, max, step, onChange, hint, disabled }: { label: string; value: number; max: number; step: number; onChange: (n: number) => void; hint?: string; disabled?: boolean }) {
  const id = `wi-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="yx-pay-slider">
      <div className="yx-pay-slider__head">
        <label htmlFor={id}>{label}</label>
        <strong>{formatINR(value)}</strong>
      </div>
      <input id={id} type="range" min={0} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={formatINR(value)} />
      {hint && <p className="yx-pay-note">{hint}</p>}
    </div>
  );
}

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
          <WhatIf
            label="Extra 80C-equivalent investment"
            value={invest}
            max={room80c}
            step={5_000}
            disabled={!room80c}
            onChange={(n) => setX({ ...x, invest: n })}
            hint={room80c ? `You can add up to ${formatINR(room80c)} more.` : `You have used the full ${formatINR(DEDUCTION_CAPS.sec80c)} limit; extra investment won't lower tax.`}
          />
          <WhatIf
            label="Monthly rent"
            value={x.rent}
            max={80_000}
            step={1_000}
            onChange={(n) => setX({ ...x, rent: n })}
            hint={`HRA exemption for the year: ${formatINR(hra)} (old regime only). It is the lowest of three limits; here that is ${hraLimit}.`}
          />
          <WhatIf label="Home-loan interest for the year" value={x.homeLoan} max={DEDUCTION_CAPS.homeLoanInterest} step={10_000} onChange={(n) => setX({ ...x, homeLoan: n })} />
          <WhatIf
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
          <table className="yx-pay-table" aria-label="Tax working, new vs old">
            <thead>
              <tr>
                <th scope="col">Working</th>
                <th scope="col" data-num>
                  New
                </th>
                <th scope="col" data-num>
                  Old
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Income', 'gross'],
                  ['Standard deduction', 'standardDeduction'],
                  ['Deductions and exemptions', 'deductions'],
                  ['Taxable income', 'taxable'],
                  ['Tax on slabs', 'slabTax'],
                  ['Rebate', 'rebate'],
                  ['Health and education cess', 'cess'],
                ] as const
              ).map(([l, k]) => [
                <tr key={k}>
                  <th scope="row">{l}</th>
                  <td data-num>{formatINR(cmp.new[k])}</td>
                  <td data-num>{formatINR(cmp.old[k])}</td>
                </tr>,
                ...(k === 'deductions'
                  ? parts.map(([pl, pv]) => (
                      <tr key={pl}>
                        <td className="yx-pay-muted">of which {pl}</td>
                        <td data-num className="yx-pay-muted">
                          {formatINR(0)}
                        </td>
                        <td data-num className="yx-pay-muted">
                          {formatINR(pv)}
                        </td>
                      </tr>
                    ))
                  : []),
              ])}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Tax for the year</th>
                <td data-num>{formatINR(cmp.new.total)}</td>
                <td data-num>{formatINR(cmp.old.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="yx-pay-note">Only you can see these scenarios. Your manager never sees them, and payroll sees only the regime you choose and your declarations.</p>
    </section>
  );
}

/** PAY-41 as a standalone screen (desktop panel or phone). */
export function RegimeCompareScreen({ layout = 'desktop', props, state = 'ready' }: { layout?: Layout; props?: RegimeCompareProps; state?: ViewState }) {
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

/** PAY-22 · Tax workspace: regime compare, declarations, proofs, TDS explanation, Form 12B, residential status. */
export function TaxWorkspaceScreen({ layout = 'desktop', tab = 'overview', variant = 'declare', state = 'ready' }: { layout?: Layout; tab?: string; variant?: TaxVariant; state?: ViewState }) {
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
  const [form16, setForm16] = useState(false);
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
  const resBlocked = res === 'nr' && !(trc && form10f);
  const needs12b = !!prevSalary && !form12b;
  const rejected = savedLines.filter((l) => l.proof === 'Rejected').length;
  const partly = savedLines.filter((l) => l.proof === 'Partly approved').length;
  const isNewLine = editing != null && !lines.some((l) => l.id === editing.id);
  const lineIncomplete = editing != null && (!editing.item.trim() || !editing.declared);
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
    <Button icon={Download} onClick={() => setForm16(true)}>
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
      {form16 && (
        <InlineAlert tone="success" title="Form 16 for 2025-26 downloaded">
          Saved as {MY_PAYSLIP.employee.code}-Form16-2025-26.pdf in your downloads. Your Form 130 for 2026-27 comes after this tax year ends.
        </InlineAlert>
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
                    <InlineAlert tone="success" title="Request sent to HR">
                      Lakshmi Venkatesan will review your request to switch to the {regime === 'new' ? 'old' : 'new'} regime. You'll get a notification in the app.
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
              {declSaved && (
                <InlineAlert tone="success" title="Declarations saved">
                  {savedRegime === 'new' ? "Your October payslip uses them. In the new regime they don't change your tax." : `Your October payslip uses them: monthly TDS ${formatINR(monthly)}.`}
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
                <table className="yx-pay-table">
                  <thead>
                    <tr>
                      <th scope="col">Item and section</th>
                      <th scope="col" data-num>
                        Declared
                      </th>
                      <th scope="col" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.item}</strong>
                          <br />
                          <span className="yx-pay-muted">{l.section}</span>
                        </td>
                        <td data-num>{formatINR(l.declared)}</td>
                        <td>
                          <Button size="sm" onClick={() => setEditing(l)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="yx-pay-row">
                <Button onClick={() => setEditing({ id: `new-${Date.now()}`, section: DECL_SECTIONS[0], item: '', declared: 0, proof: 'Not due' })}>Add declaration</Button>
                <Button
                  variant="primary"
                  disabled={!declDirty}
                  onClick={() => {
                    setSavedRegime(regime);
                    setSavedLines(lines);
                    setDeclDirty(false);
                    setDeclSaved(true);
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
              <FormField label="Form 12B from previous employer" required={!!prevSalary} optional={!prevSalary} helper="PDF signed by the previous employer. Needed when you enter a salary above.">
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
                  disabled={!prevDirty || needs12b}
                  onClick={() => {
                    setPrevSaved(true);
                    setPrevDirty(false);
                  }}
                >
                  Save
                </Button>
                {!prevDirty && !prevSaved && <span className="yx-pay-note">Nothing to save yet.</span>}
                {prevDirty && needs12b && <span className="yx-pay-note">Upload Form 12B to save a previous employer's salary.</span>}
              </div>
              {prevSaved && (
                <InlineAlert tone="success" title="Saved">
                  Your October payslip uses the new projection: {formatINR(monthly)} a month.
                </InlineAlert>
              )}
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
                  <FormField label={resChanged ? 'Tax residency certificate (TRC)' : 'Add TRC for treaty rate'} required={resChanged} optional={!resChanged} helper="Valid for the tax year.">
                    <FileUpload upload={async () => {}} accept={['.pdf']} multiple={false} onItemsChange={(items) => setTrc(uploaded(items))} />
                  </FormField>
                  <Checkbox checked={form10f} onChange={setForm10f} label="I have filed Form 10F on the income-tax portal" />
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
                <InlineAlert tone="success" title="Sent for HR review">
                  Lakshmi Venkatesan checks it. Your TDS changes from the payslip after she approves.
                </InlineAlert>
              ) : (
                (resChanged || res === 'nr') && (
                  <div className="yx-pay-row">
                    <Button variant="primary" disabled={resBlocked} onClick={() => setResSent(true)}>
                      {resChanged ? 'Send for HR review' : 'Send TRC to HR'}
                    </Button>
                    {resBlocked && <span className="yx-pay-note">Upload your TRC and tick Form 10F first.</span>}
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
            {lineIncomplete && <span className="yx-pay-note">Enter the item and amount to save.</span>}
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
            <Button variant="primary" disabled={lineIncomplete} onClick={saveLine}>
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
            <FormField label="Item" required>
              <TextField value={editing.item} onChange={(v) => setEditing({ ...editing, item: v })} />
            </FormField>
            <FormField label="Amount for the year" required>
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
            {!hrReason.trim() && <span className="yx-pay-note">Give a reason to send.</span>}
            <Button onClick={() => setAskHr(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!hrReason.trim()}
              onClick={() => {
                setAskHr(false);
                setHrSent(true);
              }}
            >
              Send request
            </Button>
          </>
        }
      >
        <FormField label="Reason" required helper="For example, a home loan taken after the cut-off. Lakshmi Venkatesan reviews it.">
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
            {!panProof && <span className="yx-pay-note">Upload the confirmation to send.</span>}
            <Button onClick={() => setPan(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!panProof}
              onClick={() => {
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
          <FormField label="Link confirmation from the portal" required helper="This also updates your PAN in Me › Documents.">
            <FileUpload upload={async () => {}} accept={['.pdf', '.jpg', '.png']} multiple={false} onItemsChange={(items) => setPanProof(uploaded(items))} />
          </FormField>
        </div>
      </Sheet>
    </EmpFrame>
  );
}

/* ================================================================== PAY-18 Loan / salary-advance request */

export type LoanVariant = 'form' | 'over-limit' | 'not-eligible' | 'submitted';

/** PAY-18 · Loan / salary-advance request (T4) with EMI schedule preview. */
export function LoanRequestScreen({ layout = 'desktop', variant = 'form' }: { layout?: Layout; variant?: LoanVariant }) {
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
  const blocked = over ? `Lower the amount to ${formatINR(limit)} or less to send.` : emisBad ? `Choose 1 to ${maxEmis} EMIs to send.` : noReason ? 'Give a reason to send.' : null;
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
          <InlineAlert tone="success" title="Request sent">
            {formatINR(1_50_000)} over 12 EMIs of {formatINR(emiAmount(1_50_000, 6, 12))}. You'll be notified at each step.
          </InlineAlert>
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
            <FormField label="Amount" required error={over ? `Enter ${formatINR(limit)} or less. That is the limit for your grade.` : undefined}>
              <CurrencyField value={amount} onChange={setAmount} />
            </FormField>
            <FormField label="Number of EMIs" required helper={`1 to ${maxEmis}`} error={emisBad ? `Enter 1 to ${maxEmis} EMIs. That is the limit for a ${type === 'advance' ? 'salary advance' : 'personal loan'}.` : undefined}>
              <NumberField value={emis} onChange={setEmis} min={1} max={maxEmis} />
            </FormField>
          </FieldRow>
          <FormField label="Reason" required error={noReason ? 'Give a reason for the request.' : undefined}>
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
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Repayment schedule, scrolls sideways on small screens">
          <table className="yx-pay-table">
            <caption>Repayment schedule</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" data-num>
                  EMI
                </th>
                <th scope="col" data-num>
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {schedule.slice(0, 6).map((r) => (
                <tr key={r.no}>
                  <th scope="row">{r.month}</th>
                  <td data-num>{formatINR(r.emi)}</td>
                  <td data-num>{formatINR(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {schedule.length > 6 && <p className="yx-pay-note">and {schedule.length - 6} more months</p>}
        </aside>
      </div>
      <div className={phone ? 'yx-pay-phone-actions' : 'yx-pay-row'}>
        <Button onClick={() => goStory(phone ? STORY.payslipPhone : STORY.payslip)}>Cancel</Button>
        <Button variant="primary" disabled={blocked != null} onClick={() => goStory(phone ? STORY.loanSubmittedPhone : STORY.loanSubmitted)}>
          Send request
        </Button>
        {blocked && <span className="yx-pay-note">{blocked}</span>}
      </div>
    </EmpFrame>
  );
}

/* ================================================================== PAY-26 Earned wage access */

export type EwaVariant = 'available' | 'confirm' | 'disbursed' | 'blackout' | 'on-hold' | 'draws-used' | 'off';

/** PAY-26 · Earned wage access request: available amount, partner fee, terms, recovery preview. */
export function EwaRequestScreen({ layout = 'phone', variant = 'available' }: { layout?: Layout; variant?: EwaVariant }) {
  const input: EwaInput =
    variant === 'blackout' ? { ...EWA_INPUT, daysEarned: 27, daysToCutOff: 2 } : variant === 'on-hold' ? { ...EWA_INPUT, onHold: true } : variant === 'draws-used' ? { ...EWA_INPUT, drawsThisPeriod: 3, drawnThisPeriod: 4_000 } : EWA_INPUT;
  const policy = variant === 'off' ? { ...EWA_STARTER, on: false } : EWA_STARTER;
  const r = ewaAvailable(policy, input);
  const [amount, setAmount] = useState<number | null>(variant === 'confirm' || variant === 'disbursed' ? 5_000 : 3_000);
  const [agree, setAgree] = useState(variant === 'confirm');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>(variant === 'confirm' ? 'confirm' : variant === 'disbursed' ? 'done' : 'form');
  const tooMuch = (amount ?? 0) > r.available;
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
          <InlineAlert tone="success" title={`${formatINR(amount ?? 0)} sent to your salary account`}>
            Cauvery Co-operative Bank ••••8834, 29 Sep, 9:44 am. It will be recovered as "Earned wage access" on your September payslip.
          </InlineAlert>
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
              <FormField label="Amount" required helper={`${formatINR(policy.min)} to ${formatINR(r.available)}`} error={tooMuch ? `Enter ${formatINR(r.available)} or less.` : undefined}>
                <CurrencyField value={amount} onChange={setAmount} min={policy.min} max={r.available} />
              </FormField>
              <div className={phone ? 'yx-pay-phone-actions' : 'yx-pay-row'}>
                <Button variant="primary" disabled={tooMuch || !amount} onClick={() => setStep('confirm')}>
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
              <Checkbox checked={agree} onChange={setAgree} label={`I agree to the fee of ${formatINR(policy.fee)} and the recovery from my September salary`} />
              <p className="yx-pay-note">You'll confirm with your fingerprint or PIN.</p>
              <div className={phone ? 'yx-pay-phone-actions' : 'yx-pay-row'}>
                <Button onClick={() => setStep('form')}>Back</Button>
                <Button variant="primary" disabled={!agree} onClick={() => setStep('done')}>
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

/** PAY-33 · My incentive / commission statement: earned, paid, held, clawbacks per period, worked out from the plan. */
export function IncentiveStatementScreen({ layout = 'desktop', variant = 'default' }: { layout?: Layout; variant?: IncentiveVariant }) {
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
        )}
        <p className="yx-pay-note">
          The plan pays quarterly: {q1.label} was paid on the {q1.paidOn}. Monthly figures share the quarter's commission by each month's net sales. Commission is salary income; tax is deducted through your payslip.
        </p>
      </div>
    </EmpFrame>
  );
}

/* ================================================================== PAY-39 My pay band */

/** PAY-39 · My pay band: own grade range and position in range (only when the company turns visibility on). */
export function PayBandScreen({ layout = 'desktop', variant = 'default', state = 'ready' }: { layout?: Layout; variant?: 'default' | 'above' | 'off'; state?: ViewState }) {
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

