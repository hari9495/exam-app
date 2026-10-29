// The Compliance designs (ops/compliance.tsx) with the live app's data: CMP-01 statutory hub (CMP-04 challan sheet over
// it, CMP-05 return wizard in its "TDS returns" tab), CMP-03 registers, CMP-06 Form 16, CMP-08 rules and updates and
// CMP-13 consultant TDS. Everything the old live copies did is kept: entity and month, make / upload / file each return
// (typed phrase and second step), the challan deposit, TDS returns (reconcile, file, .fvu, filed), registers (make,
// freeze, sign, inspection pack), Part A and certificates, and marking law updates reviewed. The API checks every call
// (keys, entity scope, maker is not checker, step-up).
import { useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { useToast, PageBanner } from '../../components/notify';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Stepper } from '../../components/stepper';
import { DataTable } from '../../components/table';
import { useRun } from '../org/org-kit';
import { LivePage, dateText } from '../time/live/kit';
import { FileButton, FormDrawer, IrreversibleSheet } from '../pay/pay-kit';
import { EntityPicker, statuteText } from '../pay/live/setup';
import { monthText } from '../pay/live/periods';
import { rupees } from '../pay/live/runs';
import type { Confirmation, LoadState } from '../pay/live/types';
import type { RuleSetView, SetupEntity } from '../pay/live/types-5b';
import type { FilingRow, HubCard, StatutoryHub, TdsReturnRow } from '../pay/live/types-5j';
import type { AdvisoryView, CertificateRow, PartAImport, RegisterRow } from '../pay/live/types-ops';
import type { ConsultantSection, NonSalaryReturn } from '../pay/live/types-5h';
import { Actions, CardGrid, CheckList, DueMonth, type CheckRow, type DueItem } from './ops-kit';
import { StatuteCard, TdsChallanScreen, TdsReturnWizardScreen } from './compliance';
import type { FilingStep, StatuteItem } from './compliance-data';

const D = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The 12 months up to this one, plus the chosen month if it is older: "2026-09". */
export function monthChoices(chosen: string, now = new Date()): { value: string; label: string }[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) out.push(`${new Date(now.getFullYear(), now.getMonth() - i, 1).getFullYear()}-${pad(new Date(now.getFullYear(), now.getMonth() - i, 1).getMonth() + 1)}`);
  if (/^\d{4}-\d{2}$/.test(chosen) && !out.includes(chosen)) out.push(chosen);
  return out.map((value) => ({ value, label: monthText(value) }));
}
/** Tax year of a month: "2026-09" is 2026-27. */
export const taxYearOf = (month: string) => {
  const y = Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 4 ? 1 : 0);
  return `${y}-${pad((y + 1) % 100)}`;
};
const lastTaxYears = (now = new Date()) => {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [y, y - 1, y - 2].map((s) => `${s}-${pad((s + 1) % 100)}`);
};
function RefusedLine({ error }: { error: string | null }) {
  return error ? (
    <InlineAlert tone="danger" title="This didn't go through">
      {error}
    </InlineAlert>
  ) : null;
}

/* =========================================================================================
 * CMP-01 · Statutory hub (cards, due-date calendar, TDS returns)
 * ======================================================================================= */

export interface LiveStatutoryHub {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  month: string;
  onMonth: (m: string) => void;
  hub: StatutoryHub | null;
  filings: FilingRow[] | null;
  returns: TdsReturnRow[] | null;
  can: { generate: boolean; markFiled: boolean; challan?: boolean };
  /** The month's TDS challan, once prepared. */
  challan?: { id: string; status: string; tds: string; interest: string } | null;
  onPrepareChallan?: () => Promise<unknown>;
  onDeposit?: (id: string, d: { challanNo: string; bsrCode: string; depositDate: string }) => Promise<unknown>;
  onGenerate: (card: HubCard, reason?: string) => Promise<unknown>;
  onUploaded: (filingId: string, reference: string) => Promise<unknown>;
  onFiled: (filingId: string, confirmation: Confirmation) => Promise<unknown>;
  onDownload: (fileId: string, name: string) => Promise<unknown>;
  onCreateReturn: (taxYear: string, quarter: number) => Promise<unknown>;
  onReconcile: (id: string) => Promise<unknown>;
  onReturnFile: (id: string) => Promise<unknown>;
  onUploadFvu: (id: string, file: File) => Promise<unknown>;
  onReturnFiled: (id: string, tokenNo: string, confirmation: Confirmation) => Promise<unknown>;
}

const SHORT: Record<string, StatuteItem['statute']> = { 'IN.PF': 'PF', 'IN.ESI': 'ESI', 'IN.PT': 'PT', 'IN.LWF': 'LWF' };
const STEP: Record<string, FilingStep> = { not_generated: 'due', generated: 'generated', superseded: 'generated', uploaded: 'uploaded', filed: 'filed' };
/** A hub card as the design's statute card. The due date falls back to the 15th of the next month when the rules have none. */
export function hubItem(c: HubCard, f: FilingRow | null, month: string, entity: string): StatuteItem {
  const fallback = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 15);
  return {
    id: `${c.statute}${c.state ?? ''}`,
    statute: SHORT[c.statute] ?? 'PF',
    title: c.label,
    period: monthText(month),
    entity,
    due: c.dueOn ? D(c.dueOn) : fallback,
    amount: Number(c.amount),
    employees: f?.rows,
    mode: 'self',
    step: STEP[c.status] ?? 'due',
    reference: f?.reference ? `Portal reference ${f.reference}` : undefined,
    estimatedPenalty: c.late && c.penaltyEstimate ? Number(c.penaltyEstimate) : undefined,
    penaltyRule: c.late && c.penaltyEstimate ? 'the published interest rule' : undefined,
  };
}

export function LiveStatutoryHubScreen({ live: p }: { live: LiveStatutoryHub }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [again, setAgain] = useState<HubCard | null>(null);
  const [uploading, setUploading] = useState<FilingRow | null>(null);
  const [filing, setFiling] = useState<FilingRow | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [tab, setTab] = useState('cards');
  const entity = p.entities.find((e) => e.id === p.entityId)?.name ?? '';
  const today = p.hub ? D(p.hub.today) : new Date();
  const fileOf = (c: HubCard) => p.filings?.find((f) => f.id === c.filingId) ?? null;
  const items = p.hub && p.filings ? p.hub.cards.map((c) => ({ card: c, file: fileOf(c), item: hubItem(c, fileOf(c), p.month, entity) })) : [];
  const tds = p.hub?.tds;
  const tdsItem: StatuteItem | null =
    tds && p.hub
      ? {
          id: 'tds',
          statute: 'TDS challan',
          title: 'TDS challan, salary',
          period: monthText(p.month),
          entity,
          due: tds.dueOn ? D(tds.dueOn) : new Date(Number(p.month.slice(0, 4)), Number(p.month.slice(5, 7)), 7),
          amount: Number(tds.amount),
          mode: 'self',
          step: tds.challanStatus === 'deposited' ? 'filed' : tds.challanStatus === 'prepared' ? 'generated' : 'due',
        }
      : null;
  const all = [...items.map((x) => x.item), ...(tdsItem ? [tdsItem] : [])];
  const overdue = all.filter((i) => !i.step.startsWith('filed') && i.due < today);
  const dueMonth = new Date(Number(p.month.slice(0, 4)), Number(p.month.slice(5, 7)), 1);
  const due: DueItem[] = all.filter((i) => i.due.getMonth() === dueMonth.getMonth() && i.due.getFullYear() === dueMonth.getFullYear()).map((i) => ({ date: i.due, label: i.title, tone: i.step.startsWith('filed') ? 'success' : i.due < today ? 'danger' : 'warning' }));
  const phrase = (f: FilingRow) => `FILED ${f.statute.slice(3)} ${p.month}`;
  const go = (key: string, fn: () => Promise<unknown>, done: string) => void run(key, async () => (await fn(), toast({ tone: 'success', title: done })));

  const cardActions = ({ card: c, file: f }: (typeof items)[number]): ReactNode => (
    <>
      {c.status === 'not_generated' && Number(c.amount) === 0 && <span className="yx-ops-muted">Nothing due</span>}
      {c.status === 'not_generated' && Number(c.amount) > 0 && p.can.generate && (
        <Button size="sm" variant="primary" loading={busy === `g-${c.label}`} onClick={() => go(`g-${c.label}`, () => p.onGenerate(c), `${c.label} file made.`)}>
          Generate file
        </Button>
      )}
      {c.status === 'generated' && p.can.generate && (
        <Button size="sm" onClick={() => setAgain(c)}>
          Make again
        </Button>
      )}
      {f?.fileId && (
        <Button size="sm" icon={Download} aria-label={`Download the ${c.label} file`} loading={busy === `d-${f.id}`} onClick={() => void run(`d-${f.id}`, () => p.onDownload(f.fileId!, `${c.label}-${p.month}`))}>
          {c.status === 'filed' ? 'Filed file' : 'Download'}
        </Button>
      )}
      {f && c.status === 'generated' && p.can.markFiled && (
        <Button size="sm" onClick={() => setUploading(f)}>
          Mark uploaded
        </Button>
      )}
      {f && c.status === 'uploaded' && p.can.markFiled && (
        <Button size="sm" variant="primary" onClick={() => setFiling(f)}>
          Mark filed
        </Button>
      )}
      {c.verifyDueDate && <span className="yx-ops-muted">Check the due date: the rule is marked verify.</span>}
    </>
  );

  return (
    <LivePage
      title="Statutory hub"
      description="One card per statute for the month, with its due date. Filing locks the month."
      state={p.state}
      onRetry={p.onRetry}
      what="statutory filings"
      grantedBy="your compliance owner"
      actions={
        <div className="yx-ops-row">
          <Select aria-label="Legal entity" size="sm" value={p.entityId} onChange={p.onEntity} placeholder="Choose a legal entity" options={p.entities.map((e) => ({ value: e.id, label: e.name }))} />
          <Select aria-label="Month" size="sm" value={p.month} onChange={(m) => m && p.onMonth(m)} options={monthChoices(p.month)} />
        </div>
      }
    >
      {!p.entityId ? (
        <EmptyState title="Choose a legal entity." description="Filings are made for each legal entity and month." />
      ) : !p.hub || !p.filings ? (
        <div role="status" aria-busy="true" aria-label="Loading statutory filings">
          <CardGrid>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={220} />
            ))}
          </CardGrid>
        </div>
      ) : (
        <>
          <RefusedLine error={error} />
          {overdue.length > 0 && (
            <PageBanner tone="danger">
              {overdue.length} {overdue.length === 1 ? 'item is' : 'items are'} overdue. Estimated interest is shown on each card.
            </PageBanner>
          )}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Hub views">
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="calendar">Due-date calendar</TabsTrigger>
              <TabsTrigger value="returns">TDS returns</TabsTrigger>
            </TabsList>
            <TabsContent value="cards">
              {!all.length ? (
                <EmptyState title="Nothing to file for this month." description="Cards appear here after the month's payroll is approved." />
              ) : (
                <CardGrid min="lg">
                  {items.map((x) => (
                    <div key={x.item.id} className="yx-ops-stack">
                      <StatuteCard item={x.item} today={today} actions={cardActions(x)} />
                    </div>
                  ))}
                  {tdsItem && tds && (
                    <div className="yx-ops-stack">
                      <StatuteCard
                        item={tdsItem}
                        today={today}
                        actions={
                          <>
                            {p.can.challan && p.onPrepareChallan && tds.challanStatus === 'not_prepared' && Number(tds.amount) > 0 && (
                              <Button size="sm" variant="primary" loading={busy === 'challan'} onClick={() => go('challan', p.onPrepareChallan!, 'Challan prepared. Record the deposit once it is paid.')}>
                                Prepare challan
                              </Button>
                            )}
                            {p.can.challan && p.challan && p.challan.status !== 'deposited' && (
                              <Button size="sm" onClick={() => setDepositing(true)}>
                                Open challan sheet
                              </Button>
                            )}
                            {tds.challanStatus === 'deposited' && <Badge tone="success">Deposited</Badge>}
                          </>
                        }
                      />
                    </div>
                  )}
                </CardGrid>
              )}
            </TabsContent>
            <TabsContent value="calendar">
              <Card title={monthText(isoDay(dueMonth).slice(0, 7))}>
                <DueMonth month={dueMonth} items={due} today={today} label={`Statutory due dates, ${monthText(isoDay(dueMonth).slice(0, 7))}`} />
              </Card>
            </TabsContent>
            <TabsContent value="returns">
              <TdsReturnWizardScreen
                quarter=""
                months={[]}
                live={{
                  kind: 'salary',
                  taxYear: taxYearOf(p.month),
                  returns: p.returns,
                  can: { generate: p.can.generate, markFiled: p.can.markFiled },
                  onStart: p.onCreateReturn,
                  onReconcile: (r) => p.onReconcile(r.id),
                  onMakeFile: (r) => p.onReturnFile(r.id),
                  onDownload: (r) => p.onDownload(r.fileId!, `${r.formCode}-${r.taxYear}-q${r.quarter}.txt`),
                  onUploadFvu: (r, file) => p.onUploadFvu(r.id, file),
                  onFiled: (r, token, c) => p.onReturnFiled(r.id, token, c),
                }}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
      {again && (
        <ReasonForm
          title={`Make the ${again.label} file again?`}
          subtitle="The earlier file is kept and marked replaced."
          confirm="Make file"
          onClose={() => setAgain(null)}
          onSave={async (reason) => (await p.onGenerate(again, reason), toast({ tone: 'success', title: `${again.label} file made again.` }))}
        />
      )}
      {uploading && <ReferenceForm onClose={() => setUploading(null)} onSave={async (ref) => (await p.onUploaded(uploading.id, ref), toast({ tone: 'success', title: 'Marked uploaded.' }))} />}
      {depositing && p.challan && p.onDeposit && (
        <TdsChallanScreen
          challan={{ section: '192 salary', tan: '', deductionMonth: monthText(p.month), tds: Number(p.challan.tds), surcharge: 0, cess: 0, deductedOn: today, dueOn: tdsItem?.due ?? today }}
          today={today}
          items={[]}
          live={{ challan: p.challan, month: p.month, dueOn: tds?.dueOn ?? null, onClose: () => setDepositing(false), onSave: (d) => p.onDeposit!(p.challan!.id, d) }}
        />
      )}
      {filing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setFiling(null)}
          title={`Mark ${filing.statute.slice(3)} for ${monthText(p.month)} as filed`}
          impact={[
            { label: 'Statute', value: statuteText(filing.statute) },
            { label: 'Portal reference', value: filing.reference ?? '' },
          ]}
          cannotUndo="The month locks as filed: its attendance and pay never change again."
          correction="Anything found later goes in a supplementary filing."
          phrase={phrase(filing)}
          maker="preparer"
          checker="you"
          confirmLabel="Mark filed"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('filed', async () => {
              await p.onFiled(filing.id, { phrase: phrase(filing), impact: [{ label: 'Statute', value: filing.statute }] });
              setFiling(null);
              toast({ tone: 'success', title: `${statuteText(filing.statute)} for ${monthText(p.month)} is filed.` });
            })
          }
        />
      )}
    </LivePage>
  );
}

function ReasonForm({ title, subtitle, confirm, label = 'Why', onClose, onSave }: { title: string; subtitle?: string; confirm: string; label?: string; onClose: () => void; onSave: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const errors = reason.trim().length < 5 ? [{ fieldId: 'cmp-reason', message: 'Say why, in at least 5 characters.' }] : [];
  return (
    <FormDrawer title={title} subtitle={subtitle} confirm={confirm} errors={errors} onClose={onClose} onSave={() => onSave(reason.trim())}>
      {(errorOf) => (
        <FormField id="cmp-reason" label={label} required error={errorOf('cmp-reason')}>
          <TextArea id="cmp-reason" value={reason} onChange={setReason} rows={3} />
        </FormField>
      )}
    </FormDrawer>
  );
}

function ReferenceForm({ onClose, onSave }: { onClose: () => void; onSave: (ref: string) => Promise<unknown> }) {
  const [ref, setRef] = useState('');
  const errors = !/^[A-Za-z0-9/-]{4,60}$/.test(ref.trim()) ? [{ fieldId: 'up-ref', message: 'Enter the portal reference (TRRN or challan number).' }] : [];
  return (
    <FormDrawer title="Uploaded on the portal" confirm="Save" errors={errors} onClose={onClose} onSave={() => onSave(ref.trim())}>
      {(errorOf) => (
        <FormField id="up-ref" label="Portal reference" required error={errorOf('up-ref')}>
          <TextField id="up-ref" value={ref} onChange={setRef} />
        </FormField>
      )}
    </FormDrawer>
  );
}

/* =========================================================================================
 * CMP-04 · TDS challan sheet (opened over the hub)
 * ======================================================================================= */

export interface LiveChallanSheet {
  challan: { id: string; status: string; tds: string; interest: string };
  month: string;
  dueOn: string | null;
  onClose: () => void;
  onSave: (d: { challanNo: string; bsrCode: string; depositDate: string }) => Promise<unknown>;
}

export function LiveChallanSheet({ live }: { live: LiveChallanSheet }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [deposit, setDeposit] = useState<Date | null>(null);
  const [bsr, setBsr] = useState('');
  const [serial, setSerial] = useState('');
  const check = useTooEarly([
    ...(!/^\d{7}$/.test(bsr.trim()) ? [{ fieldId: 'ch-bsr', message: 'The BSR code is 7 digits.' }] : []),
    ...(!/^\d{5}$/.test(serial.trim()) ? [{ fieldId: 'ch-no', message: 'The challan serial number is 5 digits.' }] : []),
    ...(!deposit ? [{ fieldId: 'ch-date', message: 'Choose the deposit date.' }] : []),
  ]);
  const interest = Number(live.challan.interest);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && live.onClose()}
      size="lg"
      title={`TDS challan · ${monthText(live.month)}`}
      subtitle={live.dueOn ? `Salary TDS · due ${dateText(live.dueOn)}` : 'Salary TDS'}
      footer={
        <>
          <Button onClick={live.onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (check.stop()) return;
              void run('save', async () => {
                await live.onSave({ challanNo: serial.trim(), bsrCode: bsr.trim(), depositDate: isoDay(deposit!) });
                toast({ tone: 'success', title: 'Challan deposit recorded.' });
                live.onClose();
              });
            }}
          >
            Save challan
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        <RefusedLine error={error} />
        <InlineAlert tone="info">Worked out from the approved payroll for the month. Deposit on the tax portal, then record the challan here.</InlineAlert>
        <DescriptionList
          items={[
            { label: 'TDS deducted', value: rupees(live.challan.tds) },
            { label: 'Interest for late deposit', value: interest ? `${rupees(live.challan.interest)} · 1.5 % a month or part` : 'None: deposited by the due date' },
            { label: 'Total to deposit', value: <strong>{rupees(String(Number(live.challan.tds) + interest))}</strong> },
          ]}
        />
        <FieldRow>
          <FormField id="ch-date" label="Deposit date" required error={check.errorOf('ch-date')}>
            <DatePicker id="ch-date" value={deposit} onChange={setDeposit} />
          </FormField>
          <FormField id="ch-bsr" label="BSR code" helper="7 digits" required error={check.errorOf('ch-bsr')}>
            <TextField id="ch-bsr" inputMode="numeric" maxLength={7} value={bsr} onChange={setBsr} />
          </FormField>
        </FieldRow>
        <FormField id="ch-no" label="Challan serial number" helper="5 digits" required error={check.errorOf('ch-no')}>
          <TextField id="ch-no" inputMode="numeric" maxLength={5} value={serial} onChange={setSerial} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* =========================================================================================
 * CMP-05 · TDS return wizard (salary Form 138 / 24Q; consultants Form 140 / 26Q)
 * ======================================================================================= */

export type ReturnView = TdsReturnRow | NonSalaryReturn;
export interface LiveTdsReturns {
  kind: 'salary' | 'non-salary';
  /** The tax year a new return starts in (the month's). */
  taxYear: string;
  returns: ReturnView[] | null;
  can: { generate: boolean; markFiled: boolean };
  onStart: (taxYear: string, quarter: number) => Promise<unknown>;
  onReconcile: (r: ReturnView) => Promise<unknown>;
  onMakeFile: (r: ReturnView) => Promise<unknown>;
  onDownload: (r: ReturnView) => Promise<unknown>;
  /** Salary returns: the .fvu the filer's FVU made. */
  onUploadFvu?: (r: ReturnView, file: File) => Promise<unknown>;
  onFiled: (r: ReturnView, tokenNo: string, c: Confirmation) => Promise<unknown>;
}

type ReconLine = NonNullable<NonSalaryReturn['reconciliation']>['lines'][number];
const isSalary = (r: ReturnView): r is TdsReturnRow => 'validation' in r;
const RETURN_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  reconciled: { label: 'Matches the challans', tone: 'info' },
  validated: { label: 'Validated', tone: 'info' },
  filed: { label: 'Filed', tone: 'success' },
};
export const returnName = (r: ReturnView) => `Form ${r.formCode} · Q${r.quarter} ${r.taxYear}${isSalary(r) && r.kind === 'correction' ? ' · correction' : ''}`;
const currentStep = (r: ReturnView) => (r.status === 'draft' ? 'reconcile' : r.status === 'filed' ? 'file' : r.status === 'validated' || r.fileId ? (isSalary(r) && r.status !== 'validated' ? 'validate' : 'file') : 'validate');

export function LiveTdsReturns({ live }: { live: LiveTdsReturns }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const years = [...new Set([live.taxYear, ...lastTaxYears()])];
  const [taxYear, setTaxYear] = useState<string | null>(live.taxYear);
  const [quarter, setQuarter] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const r = live.returns?.find((x) => x.id === openId) ?? null;
  const tokenCheck = useTooEarly(!/^[A-Za-z0-9]{6,30}$/.test(token.trim()) ? [{ fieldId: 'rt-token', message: 'Enter the token number the portal gave (6 to 30 letters or digits).' }] : []);
  const startCheck = useTooEarly(taxYear ? [] : [{ fieldId: 'rt-year', message: 'Choose the tax year.' }]);
  const go = (key: string, fn: () => Promise<unknown>, done: string) => void run(key, async () => (await fn(), toast({ tone: 'success', title: done })));
  const phrase = (x: ReturnView) => `FILED ${x.formCode} Q${x.quarter} ${x.taxYear}`;
  const readyToFile = (x: ReturnView) => (isSalary(x) ? x.status === 'validated' : !!x.fileId && x.status !== 'filed');
  const tryFile = () => {
    setWhy(null);
    if (!r) return;
    if (r.status === 'filed') return setWhy('This return is already filed.');
    if (!live.can.markFiled) return setWhy('Only someone who may mark returns filed can do this.');
    if (!readyToFile(r)) return setWhy(isSalary(r) ? 'Upload the .fvu file the FVU made first: the return must be validated.' : 'Make the return file first.');
    if (tokenCheck.stop()) return;
    setConfirming(true);
  };

  if (!live.returns) return <Skeleton height={200} />;
  const salary = live.kind === 'salary';
  const steps = r
    ? [
        {
          id: 'completeness',
          title: 'Data completeness',
          description: 'Deductee rows',
          content: (
            <CheckList
              label="Deductee rows"
              items={[r.rows ? { id: 'rows', status: 'pass', label: `${r.rows} deductee rows`, detail: `${rupees(r.tds)} TDS in the quarter` } : { id: 'rows', status: 'fail', label: 'No deductee rows', detail: salary ? 'Approve the quarter’s payroll first; rows come from approved payslips.' : 'Approve and pay the quarter’s consultant invoices first.' }] as CheckRow[]}
            />
          ),
          summary: `${r.rows} deductee rows`,
        },
        {
          id: 'reconcile',
          title: 'Challan reconciliation',
          description: 'Deposit against deduction',
          status: reconcileError(r) ? ('error' as const) : undefined,
          statusNote: reconcileError(r) ?? undefined,
          content: (
            <div className="yx-ops-stack">
              {r.status === 'draft' && !r.reconciliation ? (
                <InlineAlert tone="info">Not checked yet. Reconcile to compare what was deducted with what was deposited.</InlineAlert>
              ) : reconcileError(r) ? (
                <InlineAlert tone="danger">{reconcileError(r)}. Pay the difference with interest, or correct the challan, then reconcile again.</InlineAlert>
              ) : (
                <InlineAlert tone="success">Every challan matches its deductions.</InlineAlert>
              )}
              {!isSalary(r) && r.reconciliation && r.reconciliation.lines.length > 0 && (
                <DataTable
                  label="Challan reconciliation"
                  columns={[
                    { key: 'm', header: 'Month', value: (l: ReconLine) => monthText(l.month) },
                    { key: 's', header: 'Section', value: (l) => l.section },
                    { key: 'd', header: 'Deducted', type: 'money', value: (l) => Number(l.deducted) },
                    { key: 'p', header: 'Deposited', type: 'money', value: (l) => Number(l.deposited) },
                    { key: 'x', header: 'Difference', type: 'status', value: (l) => (Number(l.difference) === 0 ? 'Matches' : rupees(l.difference)), statusTone: (v) => (v === 'Matches' ? 'success' : 'danger') },
                  ]}
                  rows={r.reconciliation.lines}
                  getRowId={(l) => `${l.month}${l.section}`}
                />
              )}
              {live.can.generate && r.status !== 'filed' && (
                <Actions>
                  <Button size="sm" loading={busy === `rc-${r.id}`} onClick={() => go(`rc-${r.id}`, () => live.onReconcile(r), 'Challans checked.')}>
                    {r.reconciliation ? 'Reconcile again' : 'Reconcile'}
                  </Button>
                </Actions>
              )}
            </div>
          ),
          summary: r.reconciliation ? (reconcileError(r) ? 'Difference to fix' : 'Matches') : 'Not checked',
        },
        {
          id: 'validate',
          title: salary ? 'Validate (FVU)' : 'Return file',
          content: (
            <div className="yx-ops-stack">
              {isSalary(r) && r.validation && (
                <CheckList
                  label="FVU validation"
                  items={[
                    r.validation.ok
                      ? { id: 'v', status: 'pass', label: r.validation.validator === 'fake' ? 'Checked by the development stand-in, not the FVU' : 'File validation utility passed', detail: r.validation.version ? `FVU ${r.validation.version}` : undefined }
                      : { id: 'v', status: 'fail', label: 'Not validated yet', detail: r.validation.errors[0] },
                  ]}
                />
              )}
              <p className="yx-ops-muted">{salary ? 'Make the return file, run the FVU on your computer, and upload the .fvu file it makes.' : 'Make the return file and upload it on the portal.'}</p>
              <Actions>
                {live.can.generate && r.status !== 'draft' && r.status !== 'filed' && (salary || !r.fileId) && (
                  <Button size="sm" variant="primary" loading={busy === `f-${r.id}`} onClick={() => go(`f-${r.id}`, () => live.onMakeFile(r), 'Return file made.')}>
                    Make return file
                  </Button>
                )}
                {r.fileId && (
                  <Button size="sm" icon={Download} loading={busy === `d-${r.id}`} onClick={() => void run(`d-${r.id}`, () => live.onDownload(r))}>
                    Download return file
                  </Button>
                )}
                {salary && r.fileId && r.status !== 'filed' && live.can.generate && live.onUploadFvu && (
                  <FileButton label="Upload .fvu" accept=".fvu" ariaLabel={`Upload the .fvu for Form ${r.formCode} Q${r.quarter}`} loading={busy === `u-${r.id}`} onFile={(file) => go(`u-${r.id}`, () => live.onUploadFvu!(r, file), '.fvu file uploaded.')} />
                )}
              </Actions>
            </div>
          ),
          summary: r.fileId ? 'File made' : 'No file yet',
        },
        {
          id: 'file',
          title: 'File and acknowledgement',
          content:
            r.status === 'filed' ? (
              <InlineAlert tone="success" title="Filed and locked">
                Token {r.tokenNo}. Corrections now go through a correction return.
              </InlineAlert>
            ) : (
              <div className="yx-ops-stack">
                <FormField id="rt-token" label="Token number from the portal" required error={tokenCheck.errorOf('rt-token')}>
                  <TextField id="rt-token" value={token} onChange={setToken} maxLength={30} />
                </FormField>
                {why && <InlineAlert tone="warning">{why}</InlineAlert>}
                <Actions>
                  <Button variant="primary" onClick={tryFile}>
                    Mark return filed
                  </Button>
                </Actions>
              </div>
            ),
          summary: r.status === 'filed' ? 'Filed' : 'Not filed',
        },
      ]
    : [];

  return (
    <div className="yx-ops-stack">
      <RefusedLine error={error} />
      {live.can.generate && (
        <Card title="Start a quarterly return">
          <FieldRow>
            <FormField id="rt-year" label="Tax year" required error={startCheck.errorOf('rt-year')}>
              <Select id="rt-year" value={taxYear} onChange={setTaxYear} options={years.map((y) => ({ value: y, label: y }))} />
            </FormField>
            <FormField label="Quarter">
              <Segment label="Quarter" value={quarter} onChange={setQuarter} options={[1, 2, 3, 4].map((q) => ({ value: q, label: `Q${q}` }))} />
            </FormField>
          </FieldRow>
          <Actions>
            <Button loading={busy === 'new'} onClick={() => !startCheck.stop() && go('new', () => live.onStart(taxYear!, quarter), `Return for Q${quarter} ${taxYear} started.`)}>
              Start return
            </Button>
          </Actions>
        </Card>
      )}
      <DataTable
        label={salary ? 'TDS returns' : 'Consultant TDS returns'}
        columns={[
          { key: 'n', header: 'Return', value: (x: ReturnView) => returnName(x), width: 260 },
          { key: 'r', header: 'Deductee rows', type: 'number', value: (x) => x.rows },
          { key: 't', header: 'TDS', type: 'money', value: (x) => Number(x.tds) },
          { key: 's', header: 'Status', type: 'status', value: (x) => (x.status === 'filed' ? `Filed · ${x.tokenNo ?? ''}` : (RETURN_STATUS[x.status]?.label ?? x.status)), statusTone: (v) => (String(v).startsWith('Filed') ? 'success' : v === 'Draft' ? 'neutral' : 'info') },
        ]}
        rows={live.returns}
        getRowId={(x) => x.id}
        onRowClick={(x) => (setOpenId(x.id), setToken(''), setWhy(null))}
        activeRowId={openId}
        rowButtons={(x) => (
          <Button size="sm" aria-label={`Open ${returnName(x)}`} onClick={() => (setOpenId(x.id), setToken(''), setWhy(null))}>
            Open
          </Button>
        )}
        empty={<EmptyState compact title="No TDS returns yet." description={live.can.generate ? 'Start the quarter’s return above.' : 'Returns appear here once payroll starts one.'} />}
      />
      {r && (
        <section aria-label={returnName(r)} className="yx-ops-stack">
          <div className="yx-ops-row">
            <strong>{returnName(r)}</strong>
            <Badge tone={RETURN_STATUS[r.status]?.tone ?? 'neutral'}>{RETURN_STATUS[r.status]?.label ?? r.status}</Badge>
          </div>
          <Stepper key={r.id} title={returnName(r)} steps={steps} defaultCurrent={currentStep(r)} finishLabel="Mark return filed" onFinish={tryFile} anyOrder />
        </section>
      )}
      {confirming && r && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setConfirming(false)}
          title={`Mark Form ${r.formCode} Q${r.quarter} ${r.taxYear} as filed`}
          impact={[
            { label: 'TDS', value: rupees(r.tds) },
            { label: 'Deductee rows', value: String(r.rows) },
            { label: 'Token number', value: token.trim() },
          ]}
          cannotUndo="The return is filed and locked; changes go in a correction return."
          correction="A correction return revises the certificates it changes."
          phrase={phrase(r)}
          maker="preparer"
          checker="you"
          confirmLabel="Mark filed"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('rfiled', async () => {
              await live.onFiled(r, token.trim(), { phrase: phrase(r), impact: [{ label: 'TDS', value: rupees(r.tds) }] });
              setConfirming(false);
              tokenCheck.reset();
              toast({ tone: 'success', title: `Form ${r.formCode} Q${r.quarter} ${r.taxYear} is filed.` });
            })
          }
        />
      )}
    </div>
  );
}

function reconcileError(r: ReturnView): string | null {
  if (!r.reconciliation) return null;
  if (isSalary(r)) {
    const d = Number(r.reconciliation.difference ?? 0);
    return d ? `Deposits differ from deductions by ${rupees(String(Math.abs(d)))}` : null;
  }
  return r.reconciliation.ok ? null : 'Deposits differ from deductions';
}

/* =========================================================================================
 * CMP-03 · Statutory registers
 * ======================================================================================= */

export interface LiveRegisters {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  month: string;
  onMonth: (m: string) => void;
  registers: RegisterRow[] | null;
  can: { generate: boolean; sign: boolean; download: boolean };
  onGenerate: (reason?: string) => Promise<unknown>;
  onDownload: (r: RegisterRow) => Promise<unknown>;
  onFreeze: (r: RegisterRow) => Promise<unknown>;
  onSign: (r: RegisterRow, file: File) => Promise<unknown>;
  onPack: () => Promise<unknown>;
}

const REGISTER: Record<string, { label: string; tone: BadgeTone }> = {
  generated: { label: 'Made', tone: 'info' },
  frozen: { label: 'Frozen', tone: 'warning' },
  signed: { label: 'Signed', tone: 'success' },
  superseded: { label: 'Replaced', tone: 'neutral' },
};
export const registerName = (key: string) => key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function LiveRegistersScreen({ live: p }: { live: LiveRegisters }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [remaking, setRemaking] = useState(false);
  const [freezing, setFreezing] = useState<RegisterRow | null>(null);
  const latest = (p.registers ?? []).filter((r, i, all) => all.findIndex((x) => x.registerType === r.registerType && x.locationId === r.locationId) === i);
  const go = (key: string, fn: () => Promise<unknown>, done: string) => void run(key, async () => (await fn(), toast({ tone: 'success', title: done })));
  return (
    <LivePage
      title="Statutory registers"
      description="Made from approved payroll: the values stored on each payslip, never today's settings. A frozen register never changes; a fix is a new version."
      state={p.state}
      onRetry={p.onRetry}
      what="registers"
      grantedBy="your compliance owner"
      actions={
        p.entityId && p.registers ? (
          <div className="yx-ops-row">
            {p.can.sign && latest.some((r) => r.status !== 'generated') && (
              <Button icon={Download} loading={busy === 'pack'} onClick={() => go('pack', p.onPack, 'Inspection pack downloaded.')}>
                Inspection pack
              </Button>
            )}
            {p.can.generate && (
              <Button variant="primary" loading={busy === 'make'} onClick={() => (latest.length ? setRemaking(true) : go('make', () => p.onGenerate(), `Registers made for ${monthText(p.month)}.`))}>
                {latest.length ? 'Make a new version' : 'Make registers'}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <FieldRow>
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="rg-entity" />
        <FormField id="rg-month" label="Month">
          <Select id="rg-month" value={p.month} onChange={(m) => m && p.onMonth(m)} options={monthChoices(p.month)} />
        </FormField>
      </FieldRow>
      <RefusedLine error={error} />
      {!p.entityId ? (
        <EmptyState compact title="Choose a legal entity." description="Registers are kept for each legal entity and month." />
      ) : (
        <DataTable
          label={`Registers for ${monthText(p.month)}`}
          columns={[
            { key: 'n', header: 'Register', value: (r: RegisterRow) => registerName(r.registerType), width: 240 },
            { key: 'v', header: 'Version', type: 'id', value: (r) => `v${r.version}` },
            { key: 'r', header: 'Rows', type: 'number', value: (r) => r.rows },
            { key: 's', header: 'Status', type: 'status', value: (r) => REGISTER[r.status]?.label ?? r.status, statusTone: (v) => Object.values(REGISTER).find((x) => x.label === v)?.tone ?? 'neutral' },
          ]}
          rows={latest}
          getRowId={(r) => r.id}
          state={p.registers ? 'ready' : 'loading'}
          onRetry={p.onRetry}
          empty={<EmptyState title={`No register for ${monthText(p.month)} yet.`} description="Make them once every payroll of the month is approved." />}
          rowButtons={(r) => (
            <>
              {p.can.download && (
                <Button size="sm" icon={Download} loading={busy === `d-${r.id}`} onClick={() => void run(`d-${r.id}`, () => p.onDownload(r))} aria-label={`Download the ${registerName(r.registerType)} register`}>
                  PDF
                </Button>
              )}
              {p.can.sign && r.status === 'generated' && (
                <Button size="sm" onClick={() => setFreezing(r)} aria-label={`Freeze the ${registerName(r.registerType)} register`}>
                  Freeze
                </Button>
              )}
              {p.can.sign && r.status === 'frozen' && (
                <FileButton label="Upload signed PDF" accept=".pdf,application/pdf" ariaLabel={`Upload the signed ${registerName(r.registerType)} register`} loading={busy === `s-${r.id}`} onFile={(f) => go(`s-${r.id}`, () => p.onSign(r, f), `${registerName(r.registerType)} register signed.`)} />
              )}
            </>
          )}
        />
      )}
      {remaking && (
        <ReasonForm
          title="Make a new version?"
          subtitle="The earlier version stays as it is; the new one replaces it for signing."
          confirm="Make new version"
          onClose={() => setRemaking(false)}
          onSave={async (why) => (await p.onGenerate(why), toast({ tone: 'success', title: 'New version made.' }))}
        />
      )}
      <ConfirmDialog
        open={!!freezing}
        onOpenChange={(o) => !o && setFreezing(null)}
        title={freezing ? `Freeze the ${registerName(freezing.registerType)} register?` : ''}
        consequence="A frozen register never changes again. Download it, sign it with the company's token, and upload the signed PDF."
        confirmLabel="Freeze"
        confirmVariant="primary"
        onConfirm={async () => {
          await p.onFreeze(freezing!);
          toast({ tone: 'success', title: `${registerName(freezing!.registerType)} register frozen.` });
        }}
      />
    </LivePage>
  );
}

/* =========================================================================================
 * CMP-06 · Form 16 / Form 130 (Part A, Part B, issue)
 * ======================================================================================= */

export interface LiveForm16 {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  taxYear: string;
  onTaxYear: (y: string) => void;
  certificates: CertificateRow[] | null;
  /** The year's Q4 salary return, when one exists (read with statutory.filing.view). */
  q4Return?: TdsReturnRow | null;
  nameOf: (employeeId: string) => string;
  can: { importZip: boolean; issueAll: boolean };
  onImportZip: (file: File) => Promise<PartAImport>;
  onPartA: (c: CertificateRow, file: File) => Promise<unknown>;
  onIssue: (c: CertificateRow, confirmation: Confirmation) => Promise<unknown>;
  onIssueAll: (confirmation: Confirmation) => Promise<{ issued: number; failed: { id: string; reason: string }[] }>;
}

const formText = (f: string) => (f === 'form130' ? 'Form 130' : 'Form 16');

export function LiveForm16Screen({ live: p }: { live: LiveForm16 }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [imported, setImported] = useState<PartAImport | null>(null);
  const [issuing, setIssuing] = useState<CertificateRow | 'all' | null>(null);
  const [issuedAll, setIssuedAll] = useState<{ issued: number; failed: { id: string; reason: string }[] } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const certs = p.certificates ?? [];
  const ready = certs.filter((c) => c.partA && !c.issued);
  const form = certs[0]?.form ?? (Number(p.taxYear.slice(0, 4)) >= 2026 ? 'form130' : 'form16');
  const phrase = `ISSUE ${form.toUpperCase()} ${p.taxYear}`;
  const issued = certs.filter((c) => c.issued).length;
  const years = [...new Set([p.taxYear, ...lastTaxYears()])].sort().reverse();
  const publish = () => {
    setWhy(null);
    if (!p.can.issueAll) return setWhy('Only someone who signs for the company issues certificates.');
    if (!ready.length) return setWhy(certs.length ? 'No certificate is ready: attach Part A first.' : 'Import Part A first.');
    setIssuing('all');
  };
  return (
    <LivePage
      title={`${formText(form)} · tax year ${p.taxYear}`}
      description="Year-end certificates for everyone who had TDS, including people who left. Part A comes from TRACES; Part B is worked out from the year's payroll."
      state={p.state}
      onRetry={p.onRetry}
      what="tax certificates"
      grantedBy="your payroll admin"
    >
      <FieldRow>
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="tc-entity" />
        <FormField label="Tax year">
          <Segment label="Tax year" value={p.taxYear} onChange={p.onTaxYear} options={years.map((y) => ({ value: y, label: y }))} />
        </FormField>
      </FieldRow>
      <RefusedLine error={error} />
      {!p.entityId ? (
        <EmptyState compact title="Choose a legal entity." description="Certificates are issued by each legal entity (its TAN)." />
      ) : !p.certificates ? (
        <Skeleton height={240} />
      ) : (
        <Stepper
          key={`${p.entityId}${p.taxYear}`}
          title={`${formText(form)} ${p.taxYear}`}
          anyOrder
          defaultCurrent={certs.length ? (ready.length ? 'publish' : 'partA') : 'partA'}
          finishLabel={`Issue ${ready.length} ready`}
          onFinish={publish}
          steps={[
            {
              id: 'q4',
              title: 'Link the Q4 return',
              content:
                p.q4Return?.status === 'filed' ? (
                  <InlineAlert tone="success">Linked: Form {p.q4Return.formCode} Q4 {p.taxYear}, filed, token {p.q4Return.tokenNo}.</InlineAlert>
                ) : (
                  <InlineAlert tone="warning">The Q4 return for {p.taxYear} is not marked filed here yet. Part A comes from TRACES after it is filed.</InlineAlert>
                ),
            },
            {
              id: 'partA',
              title: 'Import Part A',
              content: (
                <div className="yx-ops-stack">
                  {p.can.importZip && (
                    <Actions>
                      <FileButton
                        label="Upload Part A ZIP from TRACES"
                        accept=".zip,application/zip"
                        ariaLabel="Upload the Part A ZIP downloaded from TRACES"
                        loading={busy === 'zip'}
                        onFile={(f) =>
                          void run('zip', async () => {
                            const res = await p.onImportZip(f);
                            setImported(res);
                            toast({ tone: res.unmatched.length ? 'warning' : 'success', title: `${res.matched} of ${res.files} Part A files matched.` });
                          })
                        }
                      />
                    </Actions>
                  )}
                  {imported && imported.unmatched.length > 0 && (
                    <InlineAlert tone="warning" title={`${imported.unmatched.length} files matched no one`}>
                      Each file is matched by the PAN in its name: {imported.unmatched.slice(0, 20).join(', ')}.
                    </InlineAlert>
                  )}
                  <DataTable
                    label="Certificate status"
                    columns={[
                      { key: 'n', header: 'Employee', type: 'person', value: (c: CertificateRow) => p.nameOf(c.employeeId), person: (c) => ({ name: p.nameOf(c.employeeId), secondary: formText(c.form) }) },
                      { key: 'a', header: 'Part A (TRACES)', type: 'status', value: (c) => (c.partA ? 'Imported' : 'Missing'), statusTone: (v) => (v === 'Imported' ? 'success' : 'danger') },
                      { key: 'p', header: 'Issued', type: 'status', value: (c) => (c.issued ? 'In the app' : 'Not yet'), statusTone: (v) => (v === 'In the app' ? 'success' : 'neutral') },
                    ]}
                    rows={certs}
                    getRowId={(c) => c.id}
                    empty={<EmptyState compact title="No certificates yet." description="Upload the Part A ZIP from TRACES; each file is matched to the person by PAN." />}
                    rowButtons={(c) =>
                      c.issued ? null : (
                        <>
                          {p.can.importZip && <FileButton label={c.partA ? 'Replace Part A' : 'Attach Part A'} accept=".pdf,application/pdf" ariaLabel={`Attach Part A for ${p.nameOf(c.employeeId)}`} loading={busy === `a-${c.id}`} onFile={(f) => void run(`a-${c.id}`, async () => (await p.onPartA(c, f), toast({ tone: 'success', title: `Part A attached for ${p.nameOf(c.employeeId)}.` })))} />}
                          {c.partA && p.can.issueAll && (
                            <Button size="sm" onClick={() => setIssuing(c)} aria-label={`Issue the certificate of ${p.nameOf(c.employeeId)}`}>
                              Issue
                            </Button>
                          )}
                        </>
                      )
                    }
                  />
                </div>
              ),
            },
            { id: 'partB', title: 'Part B', content: <InlineAlert tone="info">Part B is worked out from the year&apos;s payroll (salary, exemptions, deductions and tax) when each certificate is issued.</InlineAlert> },
            {
              id: 'publish',
              title: 'Issue certificates',
              content: (
                <div className="yx-ops-stack">
                  <p className="yx-ops-p">Employees and alumni get their certificate in My pay documents. The notification says only that a document is ready.</p>
                  <Meter label="Issued" value={issued} max={Math.max(certs.length, 1)} />
                  {issuedAll && (
                    <InlineAlert tone={issuedAll.failed.length ? 'warning' : 'success'} title={`${issuedAll.issued} issued`}>
                      {issuedAll.failed.length > 0 && `${issuedAll.failed.length} could not be issued: ${issuedAll.failed[0].reason}`}
                    </InlineAlert>
                  )}
                  {why && <InlineAlert tone="warning">{why}</InlineAlert>}
                </div>
              ),
            },
          ]}
        />
      )}
      {issuing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setIssuing(null)}
          title={issuing === 'all' ? `Issue ${ready.length} certificates for ${p.taxYear}` : `Issue ${p.nameOf(issuing.employeeId)}'s certificate`}
          impact={[
            { label: 'Form', value: formText(form) },
            { label: 'Tax year', value: p.taxYear },
            { label: 'People', value: issuing === 'all' ? String(ready.length) : '1' },
          ]}
          cannotUndo="An issued certificate is published to the employee and never changes."
          correction="A correction return issues a revised certificate that supersedes it."
          phrase={phrase}
          maker="preparer"
          checker="you"
          confirmLabel="Issue"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('issue', async () => {
              const confirmation = { phrase, impact: [{ label: 'Tax year', value: p.taxYear }] };
              if (issuing === 'all') {
                const res = await p.onIssueAll(confirmation);
                setIssuedAll(res);
                toast({ tone: res.failed.length ? 'warning' : 'success', title: `${res.issued} certificates issued.` });
              } else {
                await p.onIssue(issuing, confirmation);
                toast({ tone: 'success', title: `Certificate issued to ${p.nameOf(issuing.employeeId)}.` });
              }
              setIssuing(null);
            })
          }
        />
      )}
    </LivePage>
  );
}

/* =========================================================================================
 * CMP-08 · Statutory rules and labour-law updates
 * ======================================================================================= */

export interface LiveRules {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  /** null: still loading, or the viewer may not see it (`can`). */
  rules: RuleSetView[] | null;
  advisories: AdvisoryView[] | null;
  can: { rules: boolean; updates: boolean };
  onReview: (a: AdvisoryView, note: string) => Promise<unknown>;
  /** The live app's today ("2026-10-29"). */
  today: string;
}

const ruleStatus = (r: RuleSetView, today: string) => (r.validFrom > today ? 'Upcoming' : r.validTo && r.validTo < today ? 'Ended' : 'In force');
const where = (j: string) => (j === 'IN' ? 'All India' : j);
const safeLink = (l: string | null) => (l && /^https:\/\//i.test(l) ? l : null);

export function LiveRulesScreen({ live: p, tab }: { live: LiveRules; tab: 'rules' | 'updates' }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState(p.can.rules ? tab : 'updates');
  const [open, setOpen] = useState<string | null>(null);
  const [review, setReview] = useState<AdvisoryView | null>(null);
  const [note, setNote] = useState('');
  const noteCheck = useTooEarly(note.trim().length < 5 ? [{ fieldId: 'rv-note', message: 'Say what you did, in at least 5 characters.' }] : []);
  const rules = p.rules ?? [];
  const rule = rules.find((r) => r.id === open);
  const toReview = (p.advisories ?? []).filter((a) => !a.reviewed);
  const first = toReview[0];
  return (
    <LivePage title="Rules & updates" description="Read only. Rates and due dates come from published, dated rules with their sources. Companies choose only legal options." state={p.state} onRetry={p.onRetry} what="statutory rules" grantedBy="your payroll admin">
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="rl-entity" />
      {first && p.can.updates && (
        <PageBanner tone="warning" action={<Button size="sm" onClick={() => setCurrent('updates')}>Read update</Button>}>
          {first.title}. Effective {dateText(first.effectiveFrom)}.
        </PageBanner>
      )}
      <Tabs value={current} onValueChange={(v) => setCurrent(v as 'rules' | 'updates')}>
        <TabsList aria-label="Rules sections">
          {p.can.rules && <TabsTrigger value="rules">Rules</TabsTrigger>}
          {p.can.updates && (
            <TabsTrigger value="updates" count={toReview.length}>
              Labour-law updates
            </TabsTrigger>
          )}
        </TabsList>
        {p.can.rules && (
          <TabsContent value="rules">
            <DataTable
              label="Statutory rule sets"
              columns={[
                { key: 's', header: 'Statute', value: (r: RuleSetView) => statuteText(r.statute) },
                { key: 'j', header: 'Jurisdiction', value: (r) => where(r.jurisdiction), groupable: true },
                { key: 'v', header: 'Version', type: 'id', value: (r) => r.version },
                { key: 'f', header: 'Valid from', type: 'date', value: (r) => D(r.validFrom) },
                { key: 'st', header: 'Status', type: 'status', value: (r) => ruleStatus(r, p.today), statusTone: (v) => (v === 'In force' ? 'success' : v === 'Upcoming' ? 'info' : 'neutral') },
                { key: 'c', header: 'Check', type: 'status', value: (r) => (r.verify ? 'Verify' : 'Confirmed'), statusTone: (v) => (v === 'Verify' ? 'warning' : 'success') },
              ]}
              rows={rules}
              getRowId={(r) => r.id}
              state={p.rules ? 'ready' : 'loading'}
              onRetry={p.onRetry}
              onRowClick={(r) => setOpen(r.id)}
              activeRowId={open}
              rowButtons={(r) => (
                <Button size="sm" aria-label={`Source and values of ${statuteText(r.statute)} ${r.version}`} onClick={() => setOpen(r.id)}>
                  Source and values
                </Button>
              )}
              empty={<EmptyState compact title="No rules published yet." description="YukthiX publishes each rule after a second review." />}
            />
          </TabsContent>
        )}
        {p.can.updates && (
          <TabsContent value="updates">
            {!p.entityId ? (
              <EmptyState compact title="Choose a legal entity." description="Updates follow the states the entity has people in." />
            ) : !p.advisories ? (
              <Skeleton height={200} />
            ) : !p.advisories.length ? (
              <EmptyState compact title="No updates." description="Nothing new applies to this legal entity." />
            ) : (
              <ul className="yx-ops-stack yx-ops-plain">
                {p.advisories.map((a) => (
                  <li key={`${a.code}-${a.version}`} className="yx-ops-card">
                    <div className="yx-ops-card__head">
                      <h3 className="yx-ops-card__title">{a.title}</h3>
                      <span className="yx-ops-row">
                        {a.reviewed ? <Badge tone="success">Reviewed</Badge> : <Badge tone="warning">To review</Badge>}
                        {a.verify && <Badge tone="info">Check the source</Badge>}
                      </span>
                    </div>
                    <span className="yx-ops-card__sub">
                      {where(a.jurisdiction)} · effective {dateText(a.effectiveFrom)}
                    </span>
                    <p className="yx-ops-p">{a.summary}</p>
                    <p className="yx-ops-p">
                      <strong>What to do:</strong> {a.action}
                    </p>
                    {a.reviewed && (
                      <p className="yx-ops-muted">
                        Reviewed {dateText(a.reviewed.at)}: {a.reviewed.note}
                      </p>
                    )}
                    <Actions>
                      {safeLink(a.link) && (
                        <Button size="sm" asChild>
                          <a href={safeLink(a.link)!} target="_blank" rel="noopener noreferrer">
                            Source
                          </a>
                        </Button>
                      )}
                      {!a.reviewed && (
                        <Button size="sm" aria-label={`Mark "${a.title}" reviewed`} onClick={() => (setReview(a), setNote(''), noteCheck.reset())}>
                          Mark reviewed
                        </Button>
                      )}
                    </Actions>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        )}
      </Tabs>
      <Drawer open={!!rule} onOpenChange={(o) => !o && setOpen(null)} size="lg" title={rule ? `${statuteText(rule.statute)} · ${where(rule.jurisdiction)}` : ''} subtitle={rule ? `Version ${rule.version}` : ''}>
        {rule && (
          <div className="yx-ops-stack">
            {rule.verify && <InlineAlert tone="warning">Marked verify: figures from it are flagged until the compliance owner and the partner CA confirm it.</InlineAlert>}
            <DescriptionList
              items={[
                { label: 'Valid from', value: dateText(rule.validFrom) },
                { label: 'Valid to', value: rule.validTo ? dateText(rule.validTo) : 'Still in force' },
                { label: 'Status', value: ruleStatus(rule, p.today) },
                { label: 'Source', value: rule.source },
                ...(rule.lawVersion ? [{ label: 'Law version', value: rule.lawVersion }] : []),
              ]}
            />
            <Card title="Values">
              <pre className="yx-pay-json">{JSON.stringify(rule.values, null, 2)}</pre>
            </Card>
            <Card title="Version history">
              <ul className="yx-ops-list">
                {rules
                  .filter((r) => r.statute === rule.statute && r.jurisdiction === rule.jurisdiction)
                  .map((r) => (
                    <li key={r.id} className="yx-ops-list__item">
                      <span>
                        {r.version} · from {dateText(r.validFrom)}
                      </span>
                      <Badge tone={ruleStatus(r, p.today) === 'In force' ? 'success' : 'info'}>{ruleStatus(r, p.today)}</Badge>
                    </li>
                  ))}
              </ul>
            </Card>
          </div>
        )}
      </Drawer>
      <Dialog
        open={!!review}
        onOpenChange={(o) => !o && setReview(null)}
        title="Mark this update as reviewed?"
        description={review?.title}
        footer={<ReviewFooter onCancel={() => setReview(null)} onConfirm={async () => {
          if (noteCheck.stop()) return false;
          await p.onReview(review!, note.trim());
          toast({ tone: 'success', title: 'Marked reviewed.' });
          setReview(null);
          return true;
        }} />}
      >
        <FormField id="rv-note" label="What you did" helper="Saved with your name in the audit log" required error={noteCheck.errorOf('rv-note')}>
          <TextArea id="rv-note" rows={3} value={note} onChange={setNote} />
        </FormField>
      </Dialog>
    </LivePage>
  );
}

function ReviewFooter({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => Promise<boolean> }) {
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      <RefusedLine error={error} />
      <div className="yx-ops-row">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" loading={busy === 'rv'} onClick={() => void run('rv', onConfirm)}>
          Mark reviewed
        </Button>
      </div>
    </div>
  );
}

/* =========================================================================================
 * CMP-13 · Consultant TDS (challans per section, Form 140 / 26Q, Form 131 / 16A certificates)
 * ======================================================================================= */

export const SECTION_TEXT: Record<ConsultantSection, string> = { '194C': 'Contract work (194C)', '194J_A': 'Technical services (194J(a))', '194J_B': 'Professional fees (194J(b))' };
export type SectionChallan = { section: ConsultantSection; tds: string; status: string };
export type CertificateImport = { formCode: string; matched: { name: string }[]; unmatched: string[] };

export interface LiveConsultantTds {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  returns: NonSalaryReturn[] | null;
  can: { view: boolean; challans: boolean; file: boolean; certificates: boolean };
  onPrepareChallans: (month: string) => Promise<SectionChallan[]>;
  onDraft: (taxYear: string, quarter: number) => Promise<unknown>;
  onReconcile: (r: NonSalaryReturn) => Promise<unknown>;
  onMakeFile: (r: NonSalaryReturn) => Promise<unknown>;
  onDownload: (r: NonSalaryReturn) => Promise<unknown>;
  onFiled: (r: NonSalaryReturn, tokenNo: string, c: Confirmation) => Promise<unknown>;
  onImport: (taxYear: string, quarter: number, file: File) => Promise<CertificateImport>;
}

/** The page body (the design's stories and the live page render the same body). */
export function ConsultantTdsBody({ live: p, tab: start }: { live: LiveConsultantTds; tab?: 'challans' | 'returns' | 'certificates' }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [tab, setTab] = useState(start ?? (p.can.view ? 'returns' : p.can.challans ? 'challans' : 'certificates'));
  const [month, setMonth] = useState<string | null>(null);
  const [challans, setChallans] = useState<SectionChallan[] | null>(null);
  const [year, setYear] = useState<string | null>(lastTaxYears()[0]);
  const [quarter, setQuarter] = useState(1);
  const [imported, setImported] = useState<CertificateImport | null>(null);
  const monthCheck = useTooEarly(month ? [] : [{ fieldId: 'ct-month', message: 'Choose the month.' }]);
  const yearCheck = useTooEarly(year ? [] : [{ fieldId: 'ct-cyear', message: 'Choose the tax year.' }]);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  if (!p.entityId)
    return (
      <>
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="ct-entity" />
        <EmptyState compact title="Choose a legal entity." description="Consultant TDS is deposited and filed for each legal entity (its TAN)." />
      </>
    );
  return (
    <>
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="ct-entity" />
      <RefusedLine error={error} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList aria-label="Consultant TDS">
          {p.can.challans && <TabsTrigger value="challans">Challans</TabsTrigger>}
          {p.can.view && <TabsTrigger value="returns">Quarterly returns</TabsTrigger>}
          {p.can.certificates && <TabsTrigger value="certificates">Certificates</TabsTrigger>}
        </TabsList>
        {p.can.challans && (
          <TabsContent value="challans">
            <div className="yx-ops-stack">
              <p className="yx-ops-muted">One challan per section from the TDS deducted from consultants in a month. Record each deposit on the Statutory hub.</p>
              <FieldRow>
                <FormField id="ct-month" label="Month" required error={monthCheck.errorOf('ct-month')}>
                  <Select id="ct-month" value={month} onChange={setMonth} placeholder="Choose a month" options={monthChoices(thisMonth)} />
                </FormField>
              </FieldRow>
              <Actions>
                <Button
                  variant="primary"
                  loading={busy === 'challans'}
                  onClick={() => {
                    if (monthCheck.stop()) return;
                    void run('challans', async () => {
                      const res = await p.onPrepareChallans(month!);
                      setChallans(res);
                      toast({ tone: 'success', title: res.length ? `${res.length} challans prepared for ${monthText(month!)}.` : `No consultant TDS in ${monthText(month!)}.` });
                    });
                  }}
                >
                  Prepare challans
                </Button>
              </Actions>
              {challans && (
                <DataTable
                  label="Challans by section"
                  columns={[
                    { key: 's', header: 'Section', value: (c: SectionChallan) => SECTION_TEXT[c.section], width: 260 },
                    { key: 't', header: 'TDS', type: 'money', value: (c) => Number(c.tds), total: 'sum' },
                    { key: 'st', header: 'Status', type: 'status', value: (c) => (c.status === 'deposited' ? 'Deposited' : 'To deposit'), statusTone: (v) => (v === 'Deposited' ? 'success' : 'warning') },
                  ]}
                  rows={challans}
                  getRowId={(c) => c.section}
                  empty={<EmptyState compact title={`No TDS was deducted from consultants in ${monthText(month ?? thisMonth)}.`} />}
                />
              )}
            </div>
          </TabsContent>
        )}
        {p.can.view && (
          <TabsContent value="returns">
            <TdsReturnWizardScreen
              form="Form 140"
              quarter=""
              months={[]}
              live={{
                kind: 'non-salary',
                taxYear: lastTaxYears()[0],
                returns: p.returns,
                can: { generate: p.can.file, markFiled: p.can.file },
                onStart: p.onDraft,
                onReconcile: (r) => p.onReconcile(r as NonSalaryReturn),
                onMakeFile: (r) => p.onMakeFile(r as NonSalaryReturn),
                onDownload: (r) => p.onDownload(r as NonSalaryReturn),
                onFiled: (r, t, c) => p.onFiled(r as NonSalaryReturn, t, c),
              }}
            />
          </TabsContent>
        )}
        {p.can.certificates && (
          <TabsContent value="certificates">
            <div className="yx-ops-stack">
              <p className="yx-ops-muted">Upload the ZIP of the quarter&apos;s certificates from TRACES (Form 131; Form 16A before April 2026). Each is matched to a consultant by the PAN in its file name and shown on their page.</p>
              <FieldRow>
                <FormField id="ct-cyear" label="Tax year" required error={yearCheck.errorOf('ct-cyear')}>
                  <Select id="ct-cyear" value={year} onChange={setYear} options={lastTaxYears().map((y) => ({ value: y, label: y }))} />
                </FormField>
                <FormField label="Quarter">
                  <Segment label="Certificate quarter" value={quarter} onChange={setQuarter} options={[1, 2, 3, 4].map((q) => ({ value: q, label: `Q${q}` }))} />
                </FormField>
              </FieldRow>
              <Actions>
                <FileButton
                  label="Upload ZIP"
                  accept=".zip,application/zip"
                  ariaLabel="Upload the TRACES ZIP"
                  loading={busy === 'zip'}
                  onFile={(f) =>
                    !yearCheck.stop() &&
                    void run('zip', async () => {
                      const res = await p.onImport(year!, quarter, f);
                      setImported(res);
                      toast({ tone: res.unmatched.length ? 'warning' : 'success', title: `${res.matched.length} Form ${res.formCode} certificates issued.` });
                    })
                  }
                />
              </Actions>
              {imported && (
                <InlineAlert tone={imported.unmatched.length ? 'warning' : 'success'} title={`${imported.matched.length} Form ${imported.formCode} certificates issued`}>
                  {imported.unmatched.length ? `Not matched to anyone: ${imported.unmatched.join(', ')}.` : 'Every file matched a consultant.'}
                </InlineAlert>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

export function LiveConsultantTdsScreen({ live, tab }: { live: LiveConsultantTds; tab?: 'challans' | 'returns' | 'certificates' }) {
  return (
    <LivePage
      title="Consultant TDS"
      description="TDS deducted from consultants: the month's challans per section, the quarterly return (Form 140; 26Q until March 2026) and the certificates from TRACES."
      state={live.state}
      onRetry={live.onRetry}
      what="consultant TDS returns"
      grantedBy="your payroll admin"
    >
      <ConsultantTdsBody live={live} tab={tab} />
    </LivePage>
  );
}
