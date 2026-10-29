// PAY-24 · Statutory bonus, live: the designed BonusComputationScreen (allocable surplus → compute → approve and pay) with
// the API's data. The API checks every action again (keys, legal entity, maker ≠ checker, versions); this screen shows
// what it says. Money arrives as decimal strings and is only formatted here.
import { useEffect, useState } from 'react';
import { Button, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { DescriptionList } from '../../components/shell';
import { Stepper } from '../../components/stepper';
import { DataTable, type TableColumn } from '../../components/table';
import { formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { LivePage, dateText } from '../time/live/kit';
import { FactRow, SectionTitle, StateBlock } from './pay-kit';
import { EntityPicker } from './live/setup';
import { ReasonDrawer } from './live/runs';
import type { LoadState } from './live/types';
import type { SetupEntity } from './live/types-5b';

export interface BonusYear {
  start: string;
  end: string;
  label: string;
  dueOn: string;
  ended: boolean;
}
export interface BonusRules {
  yearStartMonth: number;
  eligibilityWage: string;
  calculationCeiling: string;
  minRate: string;
  maxRate: string;
  minWorkingDays: number;
  minAmount: string;
  allocablePercent: string;
  carryYears: number;
  dueMonths: number;
}
export interface BonusRow {
  employmentId: string;
  employeeId: string;
  employeeCode: string;
  name: string;
  wageTotal: string;
  workingDays: string;
  minimumWage: string;
  ceiling: string;
  eligibleMonths: number;
  eligible: boolean;
  reason: string | null;
  bonusSalary: string;
  bonus: string;
  pujaPaid: string;
  misconductLoss: string;
  disqualified: boolean;
  adjustReason: string | null;
  deductions: string;
  payable: string;
}
export interface BonusComputation {
  id: string;
  year: { start: string; end: string; label: string; dueOn: string };
  status: 'draft' | 'submitted' | 'approved' | 'sent';
  version: number;
  overdue: boolean;
  rules: BonusRules;
  availableSurplus: string | null;
  allocableSurplus: string | null;
  openingSetOn: string;
  openingSetOff: string;
  firstYear: boolean;
  setOnIn: string;
  setOffIn: string;
  setOnUsed: string;
  setOffSettled: string;
  setOnMade: string;
  setOffMade: string;
  supportedRate: string;
  chosenRate: string | null;
  rate: string;
  totals: { people: number; eligible: number; salary: string; bonus: string; deductions: string; payable: string };
  createdBy: { id: string; name: string | null };
  submitted: { by: string | null; at: string } | null;
  approved: { by: string | null; at: string } | null;
  sent: { by: string | null; at: string; runId: string; runStatus: string | null; runMonth: string | null } | null;
  returnedReason: string | null;
  madeByMe: boolean;
  rows: BonusRow[];
}
export interface BonusOverview {
  years: BonusYear[];
  year: BonusYear;
  rules: BonusRules;
  can: { manage: boolean; approve: boolean };
  computation: BonusComputation | null;
}
export interface BonusChange {
  availableSurplus?: string | null;
  openingSetOn?: string;
  openingSetOff?: string;
  rate?: string | null;
}
export interface BonusRowChange {
  pujaPaid: string;
  misconductLoss: string;
  disqualified: boolean;
  reason?: string;
}

export interface LiveBonus {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  onYear: (start: string) => void;
  data: BonusOverview | null;
  onCompute: (yearStart: string) => Promise<unknown>;
  onChange: (x: BonusChange) => Promise<unknown>;
  onRow: (employmentId: string, x: BonusRowChange) => Promise<unknown>;
  onSubmit: () => Promise<unknown>;
  onApprove: () => Promise<unknown>;
  onReturn: (reason: string) => Promise<unknown>;
  onSend: () => Promise<unknown>;
  /** Downloads Form C, the bonus register (approved or sent; GET payroll/bonus/:id/form-c, audited). */
  onFormC: () => Promise<unknown>;
  /** Where the off-cycle run opens. */
  runHref: (runId: string) => string;
  /** Stories only: open on a step, show the pressed-too-early errors, or show a refusal the server sent. */
  story?: { step?: string; tooEarly?: boolean; refused?: string };
}

const money = (x: string | null | undefined) => (x == null || x === '' ? '—' : formatINR(Number(x)));
const pct = (x: string) => `${Number(x)}%`;
const num = (x: string | null) => (x == null || x === '' ? null : Number(x));
/** An amount typed in a currency field, as the API's decimal string (whole rupees or paise). */
const amount = (n: number | null) => (n == null ? null : n.toFixed(2));
const STATUS: Record<BonusComputation['status'], { text: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
  draft: { text: 'Draft', tone: 'neutral' },
  submitted: { text: 'Waiting for approval', tone: 'info' },
  approved: { text: 'Approved', tone: 'success' },
  sent: { text: 'Sent to off-cycle run', tone: 'success' },
};

export function LiveBonusScreen({ live }: { live: LiveBonus }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const d = live.data;
  const c = d?.computation ?? null;
  const [step, setStep] = useState(live.story?.step ?? 'compute');
  const [surplus, setSurplus] = useState<number | null>(num(c?.availableSurplus ?? null));
  const [openOn, setOpenOn] = useState<number | null>(num(c?.openingSetOn ?? null));
  const [openOff, setOpenOff] = useState<number | null>(num(c?.openingSetOff ?? null));
  const [rate, setRate] = useState<number | null>(num(c?.rate ?? null));
  const [editing, setEditing] = useState<BonusRow | null>(null);
  const [returning, setReturning] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The form follows the saved computation (another year, a save, someone else's change after a reload).
  useEffect(() => {
    setSurplus(num(c?.availableSurplus ?? null));
    setOpenOn(num(c?.openingSetOn ?? null));
    setOpenOff(num(c?.openingSetOff ?? null));
    setRate(num(c?.rate ?? null));
  }, [c?.id, c?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const surplusCheck = useTooEarly(surplus == null ? [{ fieldId: 'bn-surplus', message: 'Enter the available surplus from the accounts (it may be 0).' }] : []);
  const rateCheck = useTooEarly(rate == null ? [{ fieldId: 'bn-rate', message: `Enter a bonus rate between ${pct(c?.supportedRate ?? '8.33')} and ${pct(c?.rules.maxRate ?? '20')}.` }] : []);
  useEffect(() => {
    if (live.story?.tooEarly) {
      setStep('surplus');
      setTimeout(() => surplusCheck.stop());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const can = d?.can ?? { manage: false, approve: false };
  const draft = c?.status === 'draft' && can.manage;
  const entity = live.entities.find((e) => e.id === live.entityId)?.name;
  const year = c?.year ?? d?.year;
  const refusal = error ?? live.story?.refused ?? null;

  const saveSurplus = () =>
    run('surplus', async () => {
      if (surplusCheck.stop()) return;
      await live.onChange({ availableSurplus: amount(surplus), ...(c?.firstYear ? { openingSetOn: amount(openOn) ?? '0', openingSetOff: amount(openOff) ?? '0' } : {}) });
      surplusCheck.reset();
      toast({ tone: 'success', title: 'Surplus saved. The rate and the bonus are worked out again.' });
    });
  const applyRate = () =>
    run('rate', async () => {
      if (rateCheck.stop()) return;
      await live.onChange({ rate: rate!.toFixed(2) });
      toast({ tone: 'success', title: `Bonus worked out at ${rate}%.` });
    });

  const finish = () => {
    setNote(null);
    if (!c) return;
    if (c.status === 'draft') {
      if (!can.manage) return setNote('Only payroll sends the bonus for approval.');
      if (c.availableSurplus === null) {
        setStep('surplus');
        // The field is on the surplus step: show its error and focus it once that step is open.
        if (surplus == null) setTimeout(() => surplusCheck.stop());
        else setNote('Save the surplus first, then send the bonus for approval.');
        return;
      }
      return void run('submit', async () => {
        await live.onSubmit();
        toast({ tone: 'success', title: `Bonus for ${c.year.label} sent for approval.` });
      });
    }
    if (c.status === 'submitted') {
      if (!can.approve) return setNote('Waiting for the payroll approver.');
      if (c.madeByMe) return setNote('You worked on this bonus, so someone else approves it.');
      return void run('approve', async () => {
        await live.onApprove();
        toast({ tone: 'success', title: `Bonus for ${c.year.label} approved.` });
      });
    }
    if (c.status === 'approved') {
      if (!can.manage) return setNote('Payroll sends the approved bonus to an off-cycle run.');
      return setSending(true);
    }
    setNote('This bonus is already in an off-cycle run.');
  };
  const finishLabel = !c || c.status === 'draft' ? 'Send for approval' : c.status === 'submitted' ? 'Approve bonus' : c.status === 'approved' ? 'Send to off-cycle run' : 'Sent';

  const cols: TableColumn<BonusRow>[] = [
    { key: 'n', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.employeeCode }), width: 220 },
    { key: 'w', header: 'Bonus wage in the year', type: 'money', value: (r) => Number(r.wageTotal), width: 150 },
    { key: 'd', header: 'Days', type: 'number', value: (r) => Number(r.workingDays), width: 80 },
    { key: 'e', header: 'Eligible', value: (r) => (r.eligible ? 'Yes' : `No: ${r.reason ?? ''}`), width: 220 },
    { key: 'b', header: 'Bonus base', type: 'money', value: (r) => Number(r.bonusSalary), width: 120 },
    { key: 'a', header: 'Bonus', type: 'money', value: (r) => Number(r.bonus), total: 'sum', width: 110 },
    { key: 'x', header: 'Deductions', type: 'money', value: (r) => Number(r.deductions), total: 'sum', width: 110 },
    { key: 'p', header: 'To pay', type: 'money', value: (r) => Number(r.payable), total: 'sum', width: 110 },
  ];

  const steps = !c
    ? []
    : [
        {
          id: 'surplus',
          title: 'Allocable surplus',
          description: 'Set-on and set-off',
          status: c.availableSurplus === null ? undefined : ('done' as const),
          content: (
            <div className="yx-pay-stack">
              {draft && (
                <section className="yx-pay-panel" aria-label="Surplus from the accounts">
                  <SectionTitle>Surplus from the accounts</SectionTitle>
                  <FieldRow>
                    <FormField id="bn-surplus" label={`Available surplus ${c.year.label}`} required helper={`${c.rules.allocablePercent}% of it is allocable to bonus.`} error={surplusCheck.errorOf('bn-surplus')}>
                      <CurrencyField id="bn-surplus" allowPaise value={surplus} onChange={setSurplus} min={0} />
                    </FormField>
                    {c.firstYear && (
                      <>
                        <FormField id="bn-open-on" label="Set-on brought in" optional helper="From the years before YukthiX.">
                          <CurrencyField id="bn-open-on" allowPaise value={openOn} onChange={setOpenOn} min={0} />
                        </FormField>
                        <FormField id="bn-open-off" label="Set-off brought in" optional helper="From the years before YukthiX.">
                          <CurrencyField id="bn-open-off" allowPaise value={openOff} onChange={setOpenOff} min={0} />
                        </FormField>
                      </>
                    )}
                  </FieldRow>
                  <div className="yx-pay-row">
                    <Button variant="primary" loading={busy === 'surplus'} onClick={() => void saveSurplus()}>
                      Save surplus
                    </Button>
                  </div>
                </section>
              )}
              <DescriptionList
                columns={2}
                items={[
                  { label: `Available surplus ${c.year.label}`, value: money(c.availableSurplus) },
                  { label: `Allocable surplus (${c.rules.allocablePercent}%)`, value: money(c.allocableSurplus) },
                  { label: 'Set-on brought in', value: Number(c.setOnIn) ? money(c.setOnIn) : '—' },
                  { label: 'Set-off brought in', value: Number(c.setOffIn) ? money(c.setOffIn) : '—' },
                  { label: 'Set-on used this year', value: Number(c.setOnUsed) ? money(c.setOnUsed) : '—' },
                  { label: 'Set-off settled this year', value: Number(c.setOffSettled) ? money(c.setOffSettled) : '—' },
                  { label: 'Set-on carried forward', value: Number(c.setOnMade) ? money(c.setOnMade) : '—' },
                  { label: 'Set-off carried forward', value: Number(c.setOffMade) ? money(c.setOffMade) : '—' },
                ]}
              />
              <p className="yx-pay-note">
                The surplus supports a bonus of {pct(c.supportedRate)}. Set-on and set-off are carried for {c.rules.carryYears} years and used oldest first.
              </p>
            </div>
          ),
        },
        {
          id: 'compute',
          title: 'Compute',
          description: `Rate ${pct(c.rate)}`,
          content: (
            <div className="yx-pay-stack">
              <FieldRow>
                <FormField id="bn-rate" label="Bonus rate" required helper={`Between ${pct(c.supportedRate)} (what the surplus supports) and ${pct(c.rules.maxRate)}.`} error={rateCheck.errorOf('bn-rate')}>
                  <NumberField id="bn-rate" value={rate} onChange={setRate} min={Number(c.rules.minRate)} max={Number(c.rules.maxRate)} decimals suffix="%" readOnly={!draft} />
                </FormField>
                <FormField label="Calculation ceiling">
                  <TextField value={`Higher of ${money(c.rules.calculationCeiling)} and the minimum wage at each place of work`} readOnly />
                </FormField>
              </FieldRow>
              {draft && (
                <div className="yx-pay-row">
                  <Button loading={busy === 'rate'} onClick={() => void applyRate()}>
                    Work out at this rate
                  </Button>
                </div>
              )}
              <FactRow
                items={[
                  { label: 'Eligible', value: `${c.totals.eligible} of ${c.totals.people}` },
                  { label: 'Total bonus', value: money(c.totals.bonus) },
                  { label: 'Deductions', value: money(c.totals.deductions) },
                  { label: 'To pay', value: money(c.totals.payable) },
                ]}
              />
              <DataTable
                label="Bonus by employee"
                columns={cols}
                rows={c.rows}
                getRowId={(r) => r.employmentId}
                pageSize={25}
                rowNoun={['employee', 'employees']}
                rowButtons={
                  draft
                    ? (r) => (
                        <Button size="sm" onClick={() => setEditing(r)} aria-label={`Deductions for ${r.name}`}>
                          Deductions
                        </Button>
                      )
                    : undefined
                }
                empty={<EmptyState compact title="No one was employed in this legal entity during the year" description="Bonus is worked out from the approved payslips of the year." />}
              />
              <p className="yx-pay-note">
                Eligibility: a monthly salary rate (the full month, not what a part month earned) up to {money(c.rules.eligibilityWage)} and at least {c.rules.minWorkingDays} working days in the year. Each month is counted up to the higher of {money(c.rules.calculationCeiling)} and the minimum wage; people who worked part of the year get bonus for the months worked (at least {money(c.rules.minAmount)} a year, cut down for part of the year).
              </p>
            </div>
          ),
        },
        {
          id: 'approve',
          title: 'Approve and pay',
          description: 'Off-cycle bonus run',
          status: c.status === 'sent' ? ('done' as const) : undefined,
          content: (
            <div className="yx-pay-stack">
              {c.returnedReason && c.status === 'draft' && (
                <InlineAlert tone="warning" title="Sent back by the approver">
                  {c.returnedReason}
                </InlineAlert>
              )}
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Status', value: <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].text}</Badge> },
                  { label: 'Worked out by', value: c.createdBy.name ?? '—' },
                  { label: 'Sent for approval', value: c.submitted ? `${c.submitted.by ?? '—'} · ${dateText(c.submitted.at.slice(0, 10))}` : '—' },
                  { label: 'Approved', value: c.approved ? `${c.approved.by ?? '—'} · ${dateText(c.approved.at.slice(0, 10))}` : '—' },
                  { label: 'Pay by', value: dateText(c.year.dueOn) },
                  { label: 'Off-cycle run', value: c.sent ? <Link href={live.runHref(c.sent.runId)}>Bonus run{c.sent.runMonth ? ` · ${c.sent.runMonth}` : ''}</Link> : '—' },
                ]}
              />
              {c.status === 'submitted' && can.approve && !c.madeByMe && (
                <div className="yx-pay-row">
                  <Button onClick={() => setReturning(true)}>Send back</Button>
                </div>
              )}
              {(c.status === 'approved' || c.status === 'sent') && (
                <div className="yx-pay-row">
                  <Button
                    loading={busy === 'formc'}
                    onClick={() =>
                      void run('formc', async () => {
                        await live.onFormC();
                        toast({ tone: 'success', title: `Form C for ${c.year.label} downloaded.` });
                      })
                    }
                  >
                    Download Form C (bonus register)
                  </Button>
                </div>
              )}
              <p className="yx-pay-muted">Sending it creates one-time bonus pay for each person in an off-cycle bonus run, with its own approval and bank file.</p>
            </div>
          ),
        },
      ];

  return (
    <LivePage
      title={year ? `Statutory bonus · ${year.label}` : 'Statutory bonus'}
      description={year ? `${entity ? `${entity} · ` : ''}accounting year ${dateText(year.start)} to ${dateText(year.end)}` : 'Payment of Bonus Act: eligible employees, the rate from the surplus, approval and payment.'}
      actions={c ? c.status === 'sent' ? <Badge tone="success">Sent to off-cycle run</Badge> : <Badge tone={c.overdue ? 'danger' : 'warning'}>{c.overdue ? `Overdue since ${dateText(c.year.dueOn)}` : `Due by ${dateText(c.year.dueOn)}`}</Badge> : undefined}
      state={live.state}
      onRetry={live.onRetry}
      what="the statutory bonus"
      grantedBy="your payroll admin"
    >
      <FieldRow>
        <EntityPicker entities={live.entities} value={live.entityId} onChange={live.onEntity} />
        {d && (
          <FormField label="Accounting year">
            <Segment label="Accounting year" value={d.year.start} onChange={live.onYear} options={[...d.years].reverse().map((y) => ({ value: y.start, label: y.label }))} />
          </FormField>
        )}
      </FieldRow>
      {refusal && (
        <InlineAlert tone="danger" title="That did not go through">
          {refusal}
        </InlineAlert>
      )}
      {note && (
        <InlineAlert tone="warning" title="Nothing changed">
          {note}
        </InlineAlert>
      )}
      {!live.entityId ? (
        <EmptyState title="No legal entity chosen" description="Bonus is worked out per legal entity. Choose one above." />
      ) : !d ? (
        <StateBlock state="loading">{null}</StateBlock>
      ) : !c ? (
        <EmptyState
          title={`No bonus worked out for ${d.year.label}`}
          description={
            d.year.ended
              ? `Work it out from the approved payslips of ${dateText(d.year.start)} to ${dateText(d.year.end)}. Pay it by ${dateText(d.year.dueOn)}.`
              : `This accounting year ends on ${dateText(d.year.end)}. Work out its bonus after that day.`
          }
          action={
            can.manage ? (
              <Button
                variant="primary"
                loading={busy === 'compute'}
                onClick={() =>
                  void run('compute', async () => {
                    await live.onCompute(d.year.start);
                    toast({ tone: 'success', title: `Bonus for ${d.year.label} worked out. Enter the surplus next.` });
                  })
                }
              >
                Work out bonus
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Stepper title="Bonus computation" current={step} onCurrentChange={setStep} anyOrder finishLabel={finishLabel} finishing={busy === 'submit' || busy === 'approve'} onFinish={finish} steps={steps} />
      )}
      {editing && c && <RowDrawer row={editing} onClose={() => setEditing(null)} onSave={(x) => live.onRow(editing.employmentId, x)} />}
      {returning && c && (
        <ReasonDrawer
          title="Send the bonus back"
          subtitle={`${c.year.label} · ${money(c.totals.payable)} to pay`}
          label="What needs to change"
          confirm="Send back"
          onClose={() => setReturning(false)}
          onSave={async (reason) => {
            await live.onReturn(reason);
            toast({ tone: 'success', title: 'Bonus sent back to payroll.' });
          }}
        />
      )}
      {c && (
        <ConfirmDialog
          open={sending}
          onOpenChange={setSending}
          title={`Send ${money(c.totals.payable)} bonus to an off-cycle run?`}
          consequence={`${c.rows.filter((r) => Number(r.payable) > 0).length} people get one-time bonus pay for ${c.year.label} at ${pct(c.rate)}. The run is approved and paid like any off-cycle run.`}
          confirmLabel="Send to off-cycle run"
          onConfirm={async () => {
            await live.onSend();
            toast({ tone: 'success', title: `Bonus for ${c.year.label} sent to an off-cycle run.` });
          }}
        />
      )}
    </LivePage>
  );
}

/** One person's deductions (s.17 puja or customary bonus, s.18 misconduct loss) or a s.9 dismissal, with the reason. */
function RowDrawer({ row, onClose, onSave }: { row: BonusRow; onClose: () => void; onSave: (x: BonusRowChange) => Promise<unknown> }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [puja, setPuja] = useState<number | null>(Number(row.pujaPaid));
  const [loss, setLoss] = useState<number | null>(Number(row.misconductLoss));
  const [dismissed, setDismissed] = useState<'no' | 'yes'>(row.disqualified ? 'yes' : 'no');
  const [reason, setReason] = useState(row.adjustReason ?? '');
  const any = (puja ?? 0) > 0 || (loss ?? 0) > 0 || dismissed === 'yes';
  const check = useTooEarly(any && reason.trim().length < 5 ? [{ fieldId: 'bn-reason', message: 'Give the reason (at least 5 characters).' }] : []);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${row.name} · deductions`}
      subtitle={`${row.employeeCode} · bonus ${money(row.bonus)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (check.stop()) return;
              void run('save', async () => {
                await onSave({ pujaPaid: amount(puja) ?? '0.00', misconductLoss: amount(loss) ?? '0.00', disqualified: dismissed === 'yes', ...(any ? { reason: reason.trim() } : {}) });
                toast({ tone: 'success', title: `Deductions saved for ${row.name}.` });
                onClose();
              });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        {error && (
          <InlineAlert tone="danger" title="That did not go through">
            {error}
          </InlineAlert>
        )}
        <FormField id="bn-puja" label="Puja or customary bonus already paid" helper="Deducted from the bonus (section 17).">
          <CurrencyField id="bn-puja" allowPaise value={puja} onChange={setPuja} min={0} />
        </FormField>
        <FormField id="bn-loss" label="Loss caused by misconduct" helper="Deducted from the bonus (section 18).">
          <CurrencyField id="bn-loss" allowPaise value={loss} onChange={setLoss} min={0} />
        </FormField>
        <FormField label="Dismissed for fraud, violence or theft?" helper="Gets no bonus (section 9).">
          <Segment
            label="Dismissed for fraud, violence or theft?"
            value={dismissed}
            onChange={setDismissed}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
          />
        </FormField>
        <FormField id="bn-reason" label="Reason" required={any} optional={!any} error={check.errorOf('bn-reason')}>
          <TextArea id="bn-reason" value={reason} onChange={setReason} rows={3} maxLength={300} />
        </FormField>
      </div>
    </Drawer>
  );
}

