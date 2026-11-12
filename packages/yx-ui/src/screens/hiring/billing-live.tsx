// Projects P-6 live: PRJ-05 billing workbench and PRJ-06 timesheet correction (founder answers 1414 to 1416).
// One invoice engine: drafts are the staffing desk's invoices; issued invoices open in Staffing desk › Invoices.
import { useState, type ReactNode } from 'react';
import { FileText, Pencil } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { ConfirmDialog } from '../../components/overlay';
import { useToast } from '../../components/notify';
import { FieldRow, FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Stepper } from '../../components/stepper';
import { DataTable, type TableColumn } from '../../components/table';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { correctionEffect, marginPct } from './projects-logic';
import { EInvoiceBanner, ProjectsFrame, SummaryTiles } from './hiring-kit';
import { ProjectsOffState } from './projects';

const d = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const DESCRIPTION = 'Unbilled work (WIP) by client and project. Create draft invoices, review, approve and issue on the shared invoice engine.';

/* ================================================================== PRJ-05 live */

export interface LiveWipRow {
  id: string;
  client: string;
  clientState: string;
  project: string;
  projectId: string;
  source: 'Timesheet hours' | 'Milestone' | 'Retainer' | 'Expense rebill';
  detail: string;
  hours: number | null;
  /** Rupees. */
  amount: string;
  held: string | null;
  /** Answer 1734: the timesheet notes of the hours. */
  notes?: string[];
}

export interface LiveBillingDraft {
  id: string;
  client: string;
  createdAt: string;
  lines: { description: string; amount: string }[];
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
  amApprovedBy: string | null;
  amApprovedAt: string | null;
  version: number;
}

export interface LiveBillingData {
  month: string;
  /** An account manager approving drafts (1415): drafts only. */
  approver: boolean;
  amApproval: boolean;
  series: { id: string; label: string }[];
  wip: LiveWipRow[];
  drafts: LiveBillingDraft[];
}

export interface LiveBilling {
  state: 'ready' | 'loading' | 'error' | 'no-access' | 'off';
  onRetry?: () => void;
  data: LiveBillingData | null;
  /** Months to choose from (YYYY-MM, newest first). */
  months: string[];
  onMonth: (month: string) => void;
  today: Date;
  onDraft: (seriesId: string, itemIds: string[]) => Promise<{ ids: string[] }>;
  onDelete: (draft: LiveBillingDraft) => Promise<void>;
  onApprove: (draft: LiveBillingDraft) => Promise<void>;
  onIssue: (draft: LiveBillingDraft) => Promise<{ number: string }>;
  /** Issued invoices live in Staffing desk › Invoices (one invoice list, 1414). */
  onOpenInvoices: () => void;
  /** PRJ-06: correct invoiced time. */
  onCorrect?: () => void;
  /** Stories. */
  defaultStep?: 'wip' | 'drafts' | 'approve';
  defaultIssued?: Issued[];
}

type Issued = { client: string; number: string; total: string; igst: boolean };
const taxText = (x: LiveBillingDraft) => (Number(x.igst) > 0 ? `IGST ${formatINR(Number(x.igst))}` : `CGST ${formatINR(Number(x.cgst))} + SGST ${formatINR(Number(x.sgst))}`);

export function LiveBillingView({ live }: { live: LiveBilling }) {
  const data = live.data;
  const { toast } = useToast();
  const [step, setStep] = useState<string>(live.defaultStep ?? 'wip');
  const [selected, setSelected] = useState<string[] | null>(null);
  const [series, setSeries] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<LiveBillingDraft | null>(null);
  const [issued, setIssued] = useState<Issued[] | null>(live.defaultIssued ?? null);
  const run = async (fn: () => Promise<void>, fail: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ tone: 'error', title: errText(e, fail) });
    } finally {
      setBusy(false);
    }
  };
  const head = (
    <PageHeader
      title="Billing workbench"
      description={DESCRIPTION}
      facts={
        live.months.length && !data?.approver ? (
          <div className="yx-hire-actions">
            <Select aria-label="Month" value={data?.month ?? live.months[0]!} onChange={(m) => m && live.onMonth(m)} options={live.months.map((m) => ({ value: m, label: monthLabel(m) }))} />
          </div>
        ) : undefined
      }
      actions={
        data && !data.approver && live.onCorrect ? (
          <Button icon={Pencil} onClick={live.onCorrect}>
            Correct invoiced time
          </Button>
        ) : undefined
      }
    />
  );
  if (!data)
    return (
      <ProjectsFrame active="Billing workbench">
        {head}
        {live.state === 'error' ? <ErrorState title="We couldn't load the billing workbench." onRetry={live.onRetry ?? (() => {})} /> : live.state === 'off' ? <ProjectsOffState /> : live.state === 'no-access' ? <NoAccessState what="project billing" grantedBy="your System Admin" /> : <Skeleton height={320} />}
      </ProjectsFrame>
    );

  if (issued)
    return (
      <ProjectsFrame active="Billing workbench">
        <PageHeader
          title="Billing workbench"
          status={<Badge tone="success">Issued</Badge>}
          description="Invoices issued on the shared invoice engine and shown in the client portal."
          actions={
            <>
              <Button onClick={() => setIssued(null)}>Back to the workbench</Button>
              <Button variant="primary" icon={FileText} onClick={live.onOpenInvoices}>
                Open invoices
              </Button>
            </>
          }
        />
        <SummaryTiles label="Issued" tiles={issued.map((x) => ({ label: `${x.client} · ${x.number}`, value: formatINR(Number(x.total)), sub: x.igst ? 'IGST' : 'CGST + SGST' }))} />
        <EInvoiceBanner invoiceDate={live.today} today={live.today} invoiceNo="each invoice" />
      </ProjectsFrame>
    );

  const steps = (x: LiveBillingDraft): ApprovalStep[] => [
    ...(data.amApproval ? [{ id: 'am', label: 'Account manager', status: x.amApprovedAt ? ('done' as const) : ('current' as const), approver: x.amApprovedBy ?? undefined, at: x.amApprovedAt ? new Date(x.amApprovedAt) : undefined }] : []),
    { id: 'fin', label: 'Finance', status: !data.amApproval || x.amApprovedAt ? ('current' as const) : ('pending' as const) },
  ];
  const draftCard = (x: LiveBillingDraft, actions: ReactNode, timeline = false) => (
    <Card key={x.id} title={x.client} actions={actions}>
      <ul className="yx-hire-plainlist">
        {x.lines.map((l, i) => (
          <li key={i}>
            {l.description}: {formatINR(Number(l.amount))}
          </li>
        ))}
      </ul>
      <Text size="sm">
        Taxable {formatINR(Number(x.taxable))} + {taxText(x)} = <strong>{formatINR(Number(x.total))}</strong>
      </Text>
      {timeline && <ApprovalTimeline steps={steps(x)} now={live.today} />}
    </Card>
  );

  // Answer 1415: the account manager approves the drafts (no unbilled work, no amounts beyond the drafts).
  if (data.approver)
    return (
      <ProjectsFrame active="Billing workbench">
        {head}
        {!data.amApproval ? (
          <EmptyState title="Finance issues project invoices alone." description="Your company does not ask the account manager to approve them. A System Admin changes it in Settings › Projects & timesheets." />
        ) : data.drafts.length === 0 ? (
          <EmptyState title="No project invoices to approve." description="Draft project invoices appear here when finance creates them." />
        ) : (
          <>
          <InlineAlert tone="info">Your company asks the account manager to approve project invoices before finance issues them.</InlineAlert>
          <div className="yx-hire-stack">
            {data.drafts.map((x) =>
              draftCard(
                x,
                x.amApprovedAt ? (
                  <Badge tone="success">Approved</Badge>
                ) : (
                  <Button variant="primary" loading={busy} onClick={() => void run(async () => { await live.onApprove(x); toast({ tone: 'success', title: `${x.client}: invoice approved` }); }, 'We could not approve the invoice.')}>
                    Approve
                  </Button>
                ),
                true,
              ),
            )}
          </div>
          </>
        )}
      </ProjectsFrame>
    );

  const billable = data.wip.filter((r) => !r.held);
  const sel = selected ?? billable.map((r) => r.id);
  const chosen = data.wip.filter((r) => sel.includes(r.id) && !r.held);
  const clients = Array.from(new Set(chosen.map((r) => r.client)));
  const seriesId = series ?? data.series[0]?.id ?? null;
  const ready = data.drafts.filter((x) => !data.amApproval || x.amApprovedAt);
  const cols: TableColumn<LiveWipRow>[] = [
    { key: 'client', header: 'Client', value: (r) => r.client, groupable: true },
    { key: 'project', header: 'Project', type: 'id', value: (r) => r.project },
    { key: 'source', header: 'Source', value: (r) => r.source },
    { key: 'detail', header: 'Detail', value: (r) => r.detail, render: (r) => (r.notes?.length ? <span className="yx-hire-clip2"><span>{r.detail}</span><Text as="span" size="sm" tone="secondary">{r.notes.join(' · ')}</Text></span> : r.detail) },
    { key: 'hours', header: 'Hours', type: 'number', value: (r) => r.hours, total: 'sum' },
    { key: 'amount', header: 'Amount', type: 'money', value: (r) => Number(r.amount), total: 'sum' },
    { key: 'held', header: 'Status', type: 'status', value: (r) => (r.held ? `Held: ${r.held}` : 'Ready'), statusTone: (v) => (v === 'Ready' ? 'success' : 'warning') },
  ];
  const createDrafts = () => {
    if (!seriesId) return toast({ tone: 'error', title: 'Open an invoice series first (Settings › Staffing desk).' });
    if (!chosen.length) return toast({ tone: 'error', title: 'Choose the work to bill.' });
    void run(async () => {
      const r = await live.onDraft(seriesId, chosen.map((x) => x.id));
      setSelected(null);
      toast({ tone: 'success', title: `${r.ids.length} draft invoice${r.ids.length === 1 ? '' : 's'} created` });
      setStep('drafts');
    }, 'We could not create the drafts.');
  };
  const issueAll = () => {
    if (!ready.length) return toast({ tone: 'error', title: data.drafts.length ? 'The account manager approves the drafts first.' : 'There are no drafts to issue.' });
    void run(async () => {
      const out: Issued[] = [];
      for (const x of ready) {
        const r = await live.onIssue(x);
        out.push({ client: x.client, number: r.number, total: x.total, igst: Number(x.igst) > 0 });
      }
      toast({ tone: 'success', title: `${out.length} invoice${out.length === 1 ? '' : 's'} issued` });
      setIssued(out);
      setStep('wip');
    }, 'We could not issue every invoice.');
  };

  return (
    <ProjectsFrame active="Billing workbench">
      {head}
      <Stepper
        title={`Billing run, ${monthLabel(data.month)}`}
        current={step}
        onCurrentChange={setStep}
        finishLabel={`Issue ${ready.length} invoice${ready.length === 1 ? '' : 's'}`}
        finishing={busy}
        onFinish={issueAll}
        steps={[
          {
            id: 'wip',
            title: 'Unbilled work',
            description: `${formatINR(billable.reduce((s, r) => s + Number(r.amount), 0))} ready`,
            content:
              data.wip.length === 0 ? (
                <EmptyState title="Nothing to bill." description="Approved billable hours, completed milestones and retainers appear here." />
              ) : (
                <div className="yx-hire-stack">
                  {data.wip.some((r) => r.held) && <InlineAlert tone="info">Held items stay in WIP until the client approves the hours or accepts the milestone in the portal, or the project has its bill rate, fee and client.</InlineAlert>}
                  {data.series.length === 0 && <InlineAlert tone="warning">Open an invoice series in Settings › Staffing desk to number project invoices.</InlineAlert>}
                  <DataTable label="Unbilled work" columns={cols} rows={data.wip} getRowId={(r) => r.id} selectable selectedIds={sel} onSelectedChange={setSelected} defaultGroupBy="client" />
                  <div className="yx-hire-actions">
                    {data.series.length > 0 && <Select aria-label="Invoice series" value={seriesId} onChange={setSeries} options={data.series.map((s) => ({ value: s.id, label: s.label }))} />}
                    <Button variant="primary" loading={busy} onClick={createDrafts}>
                      Create draft invoices
                    </Button>
                  </div>
                </div>
              ),
            summary: <Text>{chosen.length} items selected across {clients.length} clients</Text>,
          },
          {
            id: 'drafts',
            title: 'Draft invoices',
            description: `${data.drafts.length} drafts`,
            content:
              data.drafts.length === 0 ? (
                <EmptyState title="No draft invoices." description="Choose unbilled work and create draft invoices; one invoice per client." />
              ) : (
                <div className="yx-hire-stack">
                  {data.drafts.map((x) =>
                    draftCard(
                      x,
                      <>
                        <Badge>Draft</Badge>
                        <Button size="sm" onClick={() => setDeleting(x)}>
                          Delete draft
                        </Button>
                      </>,
                    ),
                  )}
                </div>
              ),
            summary: <Text>{data.drafts.map((x) => `${x.client} ${formatINR(Number(x.total))}`).join(' · ')}</Text>,
          },
          {
            id: 'approve',
            title: 'Approve and issue',
            content: (
              <div className="yx-hire-stack">
                {data.drafts.length === 0 ? (
                  <EmptyState title="No draft invoices to issue." description="Create draft invoices from the unbilled work first." />
                ) : (
                  data.drafts.map((x) => draftCard(x, <Badge tone={!data.amApproval || x.amApprovedAt ? 'success' : 'warning'}>{!data.amApproval || x.amApprovedAt ? 'Ready to issue' : 'Waiting for the account manager'}</Badge>, true))
                )}
                <EInvoiceBanner invoiceDate={live.today} today={live.today} invoiceNo="each invoice" />
                <Text size="sm" tone="secondary">
                  Issued invoices are never edited. They go to the client&rsquo;s billing contacts and the client portal, and to accounting with the project dimension.
                </Text>
              </div>
            ),
          },
        ]}
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete the draft for ${deleting.client}?`}
          consequence="Its work goes back to unbilled. No number was used."
          confirmLabel="Delete draft"
          destructive
          onConfirm={async () => {
            try {
              await live.onDelete(deleting);
              toast({ tone: 'success', title: 'Draft deleted' });
            } catch (e) {
              toast({ tone: 'error', title: errText(e, 'We could not delete the draft.') });
            }
            setDeleting(null);
          }}
        />
      )}
    </ProjectsFrame>
  );
}

/* ================================================================== PRJ-06 live */

export interface LiveCorrectionLine {
  lineId: string;
  person: string;
  week: string;
  hours: number;
  invoice: { id: string; number: string | null; status: 'draft' | 'issued' } | null;
  corrected: boolean;
}

export interface LiveCorrectionFacts {
  lineId: string;
  person: string;
  project: string;
  projectId: string;
  week: string;
  hours: number;
  /** Rupees per hour. */
  rate: string;
  gstPct: number;
  invoice: { id: string; number: string | null; date: string | null; status: 'draft' | 'issued' } | null;
  locked: boolean;
  /** Pay recovery setting (1416): next payroll, or none. */
  recovery: boolean;
  month: string;
  monthRevenue: string;
  monthCost: string | null;
  corrections: { at: string; from: number; to: number; reason: string; document: string | null }[];
}

export interface LiveCorrection {
  state: 'ready' | 'loading' | 'error' | 'no-access' | 'off';
  onRetry?: () => void;
  /** Choosing the line: a time-and-material project, a month, its approved lines. */
  pick: {
    projects: { id: string; label: string }[];
    projectId: string | null;
    onProject: (id: string) => void;
    months: string[];
    month: string;
    onMonth: (m: string) => void;
    lines: LiveCorrectionLine[] | null;
    onPick: (lineId: string) => void;
  };
  /** The chosen line's facts (null until a line is chosen). */
  facts: LiveCorrectionFacts | null;
  onCorrect: (hours: number, reason: string) => Promise<{ adjustment: boolean; document: { kind: string; number: string | null } | null; recoveryHours: number }>;
  onBack: () => void;
  defaultHours?: number;
  defaultReason?: string;
  defaultStep?: 'correct' | 'review';
}

function CorrectionPicker({ live }: { live: LiveCorrection }) {
  const p = live.pick;
  const cols: TableColumn<LiveCorrectionLine>[] = [
    { key: 'person', header: 'Person', value: (r) => r.person },
    { key: 'week', header: 'Week of', value: (r) => r.week, render: (r) => formatDate(d(r.week)) },
    { key: 'hours', header: 'Hours', type: 'number', value: (r) => r.hours, total: 'sum' },
    { key: 'invoice', header: 'Invoice', value: (r) => (r.invoice ? `${r.invoice.number ?? 'Draft'}` : 'Not invoiced') },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.corrected ? 'Corrected' : r.invoice?.status === 'issued' ? 'Invoiced' : r.invoice ? 'On a draft' : 'Approved'), statusTone: (v) => (v === 'Invoiced' ? 'success' : v === 'Corrected' ? 'info' : v === 'On a draft' ? 'warning' : 'neutral') },
  ];
  return (
    <ProjectsFrame active="Billing workbench">
      <PageHeader
        title="Correct invoiced time"
        description="Choose a time-and-material project and month, then the approved line to correct. Fewer billed hours make a credit note, more make a supplementary invoice; a locked month gets an adjustment."
        actions={<Button onClick={live.onBack}>Back to the workbench</Button>}
      />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the lines." onRetry={live.onRetry ?? (() => {})} />
      ) : live.state === 'off' ? (
        <ProjectsOffState />
      ) : live.state === 'no-access' ? (
        <NoAccessState what="project billing" grantedBy="your System Admin" />
      ) : (
        <>
          <FieldRow>
            <FormField label="Project">
              <Select value={p.projectId} onChange={(v) => v && p.onProject(v)} options={p.projects.map((x) => ({ value: x.id, label: x.label }))} placeholder="Choose a project" searchable />
            </FormField>
            <FormField label="Month">
              <Select value={p.month} onChange={(v) => v && p.onMonth(v)} options={p.months.map((m) => ({ value: m, label: monthLabel(m) }))} />
            </FormField>
          </FieldRow>
          {!p.projectId ? (
            <EmptyState title="Choose a project." description={p.projects.length ? 'Its approved timesheet lines for the month appear here.' : 'No time-and-material projects yet.'} />
          ) : p.lines == null ? (
            <Skeleton height={240} />
          ) : (
            <DataTable label="Approved lines" columns={cols} rows={p.lines} getRowId={(r) => r.lineId} onRowClick={(r) => p.onPick(r.lineId)} empty={<EmptyState title="No approved time this month." description="Approved timesheet lines of the project appear here, by the week's Monday." />} />
          )}
        </>
      )}
    </ProjectsFrame>
  );
}

export function LiveCorrectionView({ live }: { live: LiveCorrection }) {
  return live.facts ? <CorrectionForm key={live.facts.lineId} live={live} f={live.facts} /> : <CorrectionPicker live={live} />;
}

function CorrectionForm({ live, f }: { live: LiveCorrection; f: LiveCorrectionFacts }) {
  const { toast } = useToast();
  const [hours, setHours] = useState<number | null>(live.defaultHours ?? f.hours);
  const [reason, setReason] = useState(live.defaultReason ?? '');
  const [step, setStep] = useState<string>(live.defaultStep ?? 'correct');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const rate = Number(f.rate);
  const billed = f.invoice?.status === 'issued';
  const eff = correctionEffect({ invoicedHours: f.hours, correctedHours: hours ?? f.hours, rate, gstPct: f.gstPct, costRate: 0, recoveryPolicy: 'none' });
  const kind = billed ? eff.kind : 'none';
  const doc = kind === 'credit-note' ? 'credit note' : kind === 'supplementary' ? 'supplementary invoice' : 'no document';
  const recoveryHours = f.recovery && eff.hours < 0 ? -eff.hours : 0;
  const revenue = Number(f.monthRevenue);
  const cost = f.monthCost == null ? null : Number(f.monthCost);
  const newRevenue = revenue + (kind === 'none' ? 0 : eff.revenueChange);
  const reasonError = tried && reason.trim().length < 3 ? 'Enter why the hours change.' : null;
  const sameError = tried && (hours == null || hours === f.hours) ? 'Enter the correct hours.' : null;
  const month = monthLabel(f.month);
  const finish = async () => {
    setTried(true);
    if (hours == null || hours === f.hours || reason.trim().length < 3) {
      setStep('correct');
      return;
    }
    setBusy(true);
    try {
      const r = await live.onCorrect(hours, reason.trim());
      toast({ tone: 'success', title: r.document ? (r.document.kind === 'credit_note' ? `Credit note ${r.document.number} raised` : 'Supplementary draft invoice created') : r.adjustment ? 'Adjustment recorded' : 'Hours corrected' });
      live.onBack();
    } catch (e) {
      toast({ tone: 'error', title: errText(e, 'We could not save the correction.') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <ProjectsFrame active="Billing workbench">
      <PageHeader
        title="Correct invoiced time"
        description={`${f.person} · ${f.project} · Week of ${formatDate(d(f.week))} · ${f.invoice ? (billed ? `invoiced on ${f.invoice.number}${f.invoice.date ? ` (${formatDate(d(f.invoice.date))})` : ''}` : 'on a draft invoice') : 'not invoiced yet'}`}
        actions={<Button onClick={live.onBack}>Back</Button>}
      />
      {f.locked && (
        <InlineAlert tone="info" title={`${month} is locked`}>
          The approved line can&rsquo;t change. The correction is an adjustment in the current month that points to the original line; the project&rsquo;s cost moves to that month.
        </InlineAlert>
      )}
      {f.invoice?.status === 'draft' && <InlineAlert tone="warning">These hours are on a draft invoice. Delete the draft in the billing workbench, or issue it, before correcting them.</InlineAlert>}
      <Stepper
        title="Timesheet correction"
        current={step}
        onCurrentChange={setStep}
        finishLabel={kind === 'none' ? 'Save correction' : `Create ${doc}`}
        finishing={busy}
        onFinish={() => void finish()}
        steps={[
          {
            id: 'correct',
            title: 'Correct hours',
            content: (
              <div className="yx-hire-sheet">
                <div className="yx-hire-sheet__form">
                  <FieldRow>
                    <FormField label={billed ? 'Invoiced hours' : 'Approved hours'}>
                      <TextField value={String(f.hours)} readOnly />
                    </FormField>
                    <FormField label="Correct hours" required error={sameError}>
                      <NumberField value={hours} onChange={setHours} min={0} max={168} decimals />
                    </FormField>
                  </FieldRow>
                  <FormField label="Reason" required helper={billed ? 'Shown to the employee and on the document' : 'Shown to the employee'} error={reasonError}>
                    <TextArea value={reason} onChange={setReason} rows={2} />
                  </FormField>
                </div>
                <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="Effect">
                  <Text weight="semibold">What happens</Text>
                  <Text size="sm">{eff.hours === 0 ? 'No change to hours.' : billed ? `${eff.hours > 0 ? '+' : ''}${eff.hours} h × ${formatINR(rate)} = ${eff.hours < 0 ? '−' : ''}${formatINR(eff.net)} + GST ${formatINR(eff.gst)}` : `The line changes to ${hours} h; it is billed at the new hours.`}</Text>
                  {kind !== 'none' && (
                    <Badge tone={kind === 'credit-note' ? 'warning' : 'info'}>
                      {kind === 'credit-note' ? 'Credit note' : 'Supplementary invoice'} {formatINR(eff.total)} linked to {f.invoice!.number}
                    </Badge>
                  )}
                  <Text size="sm">{recoveryHours ? `Pay for ${recoveryHours} h is recovered in the next payroll (company policy).` : 'No pay recovery (company policy: none).'}</Text>
                  {cost != null && kind !== 'none' && (
                    <Text size="sm">
                      {month} margin restated: {marginPct(revenue, cost) ?? 0}% → {marginPct(newRevenue, cost) ?? 0}%
                    </Text>
                  )}
                </aside>
              </div>
            ),
            summary: (
              <Text>
                {eff.hours} h · {doc} {kind !== 'none' ? formatINR(eff.total) : ''}
              </Text>
            ),
          },
          {
            id: 'review',
            title: 'Review documents',
            content: (
              <DescriptionList
                items={[
                  { label: f.locked ? 'Adjustment' : 'Line', value: f.locked ? `${eff.hours} h in the current month, referencing the week of ${formatDate(d(f.week))}` : `${f.hours} h → ${hours ?? f.hours} h for the week of ${formatDate(d(f.week))}` },
                  { label: 'Document', value: kind === 'none' ? 'None' : `${doc[0]!.toUpperCase()}${doc.slice(1)} for ${formatINR(eff.total)} against ${f.invoice!.number}` },
                  { label: 'Pay recovery', value: recoveryHours ? `${recoveryHours} h in the next payroll` : 'None' },
                  { label: 'Audit', value: 'Recorded with before and after values; the employee is told' },
                  ...(f.corrections.length ? [{ label: 'Earlier corrections', value: f.corrections.map((x) => `${x.from} h → ${x.to} h (${x.reason})`).join('; ') }] : []),
                ]}
              />
            ),
          },
        ]}
      />
    </ProjectsFrame>
  );
}
