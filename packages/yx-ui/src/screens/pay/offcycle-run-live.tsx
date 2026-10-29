// PAY-11 · Off-cycle run, live: the designed off-cycle screen (offcycle.tsx) with the API's data.
// "new": the design's "Run type" step (bonus, arrears only, correction, payment; a full and final run starts from the
// settlement) and the pay group and month, then POST /payroll/runs with offcycleKind (payroll.offcycle.prepare, checked
// by legal entity on the server). "run": an off-cycle run on /yx/payroll/runs/[id] with the design's header and its
// settlement lines (F&F: the 2-working-day deadline, lines, held retrenchment lines, nominee shares); calculate, approve,
// bank file and publish are the run workspace's own steps (run-workspace-live.tsx), so they work as for a monthly run.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { TextField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { useToast, ToastProvider } from '../../components/notify';
import { Select } from '../../components/select';
import { PageHeader } from '../../components/shell';
import { Stepper } from '../../components/stepper';
import { formatDate, formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { FactRow, StateBlock } from './pay-kit';
import { LiveRunWorkspace, type LiveRunWorkspaceData } from './run-workspace-live';
import type { LoadState } from './live/types';
import type { FnfSettlementView, OffcycleKind, PayGroupRef } from './live/types-5j';

type NewKind = Exclude<OffcycleKind, 'fnf'>;

export type LiveOffCycleRun =
  | {
      mode: 'new';
      state: LoadState;
      onRetry?: () => void;
      groups: PayGroupRef[];
      /** The month chosen in the top bar, "2026-10". */
      month: string;
      /** Full and final settlements (PPL-22): a full and final run starts there. */
      fnfHref: string;
      onCreate: (payGroupId: string, month: string, kind: NewKind) => Promise<{ id: string }>;
      onOpen: (id: string) => void;
      onCancel: () => void;
    }
  | {
      mode: 'run';
      /** The run workspace's data and actions: calculate, approve, bank file, publish work as for a monthly run. */
      workspace: LiveRunWorkspaceData;
      /** The full and final settlement this run pays (null for other kinds, or without payroll.fnf.manage). */
      settlement: FnfSettlementView | null;
      /** The leaver's name (F&F). */
      person: string | null;
      fnfHref: string;
    };

const KIND_TEXT: Record<OffcycleKind, string> = { fnf: 'Full and final', bonus: 'Bonus', arrears: 'Arrears only', correction: 'Correction', payment: 'Payment' };
const EXIT_TEXT: Record<string, string> = { death: 'Death in service', retrenchment: 'Retrenchment', resignation: 'Resignation', termination: 'Termination', retirement: 'Retirement', end_of_contract: 'End of contract', vrs: 'Voluntary retirement', absconding: 'Absconding', probation_termination: 'Probation not confirmed' };
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const monthLong = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const inr = (v: string | null) => (v == null ? '—' : formatINR(Number(v)));

export function LiveOffCycleRunScreen({ live }: { live: LiveOffCycleRun }) {
  return live.mode === 'new' ? (
    <ToastProvider>
      <NewOffCycleRun live={live} />
    </ToastProvider>
  ) : (
    <OffCycleRunRecord live={live} />
  );
}

/** "Choose run type": the design's first step, then the pay group and month; the run's lines are added in the run. */
function NewOffCycleRun({ live }: { live: Extract<LiveOffCycleRun, { mode: 'new' }> }) {
  const [type, setType] = useState<OffcycleKind>('bonus');
  const [group, setGroup] = useState<string | null>(live.groups[0]?.id ?? null);
  const [month, setMonth] = useState(live.month);
  const [step, setStep] = useState('type');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const errors = [...(!group ? [{ fieldId: 'oc-group', message: 'Choose a pay group.' }] : []), ...(!/^\d{4}-\d{2}$/.test(month) ? [{ fieldId: 'oc-month', message: 'Choose the month.' }] : [])];
  const save = useTooEarly(errors);
  const create = () => {
    if (type === 'fnf') return setStep('type');
    if (save.stop()) return;
    void run('create', async () => {
      const r = await live.onCreate(group!, month, type);
      toast({ title: 'Off-cycle run created', tone: 'success' });
      live.onOpen(r.id);
    });
  };
  return (
    <div className="yx-auth__page yx-pay-stack">
      <PageHeader title="Off-cycle run" description="Uses the same engine and approval as monthly runs." actions={<Button size="sm" onClick={live.onCancel}>All runs</Button>} />
      <StateBlock state={live.state === 'error' ? 'error' : live.state === 'loading' ? 'loading' : 'ready'} rows={6} errorTitle="We couldn't load the pay groups." onRetry={live.onRetry}>
        {live.state === 'no-access' ? (
          <InlineAlert tone="info" title="You can't start an off-cycle run">
            Ask your payroll admin for the right to prepare off-cycle runs.
          </InlineAlert>
        ) : (
          <Stepper
            title="Off-cycle run"
            current={step}
            onCurrentChange={setStep}
            // A full and final run is never started here: say where it starts and stay on the step.
            onContinue={(id) => (id === 'type' && type === 'fnf' ? false : undefined)}
            finishLabel="Create run"
            finishing={busy === 'create'}
            onFinish={create}
            steps={[
              {
                id: 'type',
                title: 'Run type',
                content: (
                  <div className="yx-pay-stack">
                    <RadioGroup
                      aria-label="Off-cycle run type"
                      value={type}
                      onChange={(v) => setType(v as OffcycleKind)}
                      options={[
                        { value: 'fnf', label: 'Full and final settlement', description: 'Created automatically on the approved last working day; 2-working-day deadline.' },
                        { value: 'bonus', label: 'Bonus', description: 'One-time bonus outside the monthly run.' },
                        { value: 'arrears', label: 'Arrears only', description: 'Revisions or settlements paid before the next monthly run.' },
                        { value: 'correction', label: 'Correction', description: 'Pay a missed amount; past payslips are never changed.' },
                        { value: 'payment', label: 'Payment', description: 'Pay an amount owed outside the monthly run.' },
                      ]}
                    />
                    {type === 'fnf' && (
                      <InlineAlert tone="info" title="A full and final run starts from the settlement" actions={<Button size="sm" asChild><a href={live.fnfHref}>Open full and final</a></Button>}>
                        It is made when the last working day is approved. Open the settlement to check its lines and send its run for approval.
                      </InlineAlert>
                    )}
                  </div>
                ),
                summary: <p>{KIND_TEXT[type]}</p>,
              },
              {
                id: 'lines',
                title: 'Pay group and month',
                description: 'Lines are added in the run',
                content: (
                  <div className="yx-pay-stack">
                    {error && (
                      <InlineAlert tone="danger" title="Not created">
                        {error}
                      </InlineAlert>
                    )}
                    <FormField id="oc-group" label="Pay group" required error={save.errorOf('oc-group')}>
                      <Select value={group} onChange={setGroup} options={live.groups.map((x) => ({ value: x.id, label: x.name }))} placeholder="Choose a pay group" />
                    </FormField>
                    <FormField id="oc-month" label="Month" required error={save.errorOf('oc-month')} helper="The month the run pays.">
                      <TextField type="month" value={month} onChange={setMonth} />
                    </FormField>
                    <InlineAlert tone="info" title="An off-cycle run pays only what you add to it">
                      It never changes the month's regular payslip and can run after the month is locked. Finance approves it with the typed phrase, and it has its own bank file and payslips.
                    </InlineAlert>
                  </div>
                ),
              },
            ]}
          />
        )}
      </StateBlock>
    </div>
  );
}

/** An off-cycle run: the design's header and settlement lines, with the run workspace's steps under them. */
function OffCycleRunRecord({ live }: { live: Extract<LiveOffCycleRun, { mode: 'run' }> }) {
  const r = live.workspace.run;
  const s = live.settlement;
  const fnf = r?.offcycleKind === 'fnf';
  const blocked = !!s && s.items.some((i) => i.heldTag === 'permission needed');
  const open = !!s && s.status === 'open' && !['approved', 'paid'].includes(r?.status ?? '');
  const heading = r
    ? fnf
      ? {
          name: `Full and final: ${live.person ?? 'leaver'}`,
          secondary: `Off-cycle run · ${r.reference ?? ''}${s ? ` · ${EXIT_TEXT[s.exitType] ?? s.exitType}` : ''}`,
          status: s && open ? <Badge tone={blocked || s.overdue ? 'danger' : 'warning'}>{blocked ? 'Permission needed' : s.overdue ? 'Overdue' : `Due ${formatDate(day(s.deadline))}`}</Badge> : undefined,
        }
      : { name: `Off-cycle run · ${KIND_TEXT[r.offcycleKind ?? 'payment']} · ${monthLong(r.month)}`, secondary: `${r.entityName ?? ''} · Uses the same engine and approval as monthly runs.` }
    : undefined;
  const lead = !r ? null : !fnf ? (
    <InlineAlert tone="info" title="An off-cycle run pays only what you add to it">
      Add the lines in Inputs, then calculate. It never changes the month's regular payslip; past payslips are never changed.
    </InlineAlert>
  ) : !s ? (
    <InlineAlert tone="info" title="Full and final run" actions={<Button size="sm" asChild><a href={live.fnfHref}>Open full and final</a></Button>}>
      The settlement's lines, deadline and payees are on the full and final page.
    </InlineAlert>
  ) : (
    <SettlementLines s={s} blocked={blocked} open={open} fnfHref={live.fnfHref} person={live.person} />
  );
  return <LiveRunWorkspace live={{ ...live.workspace, heading, lead }} />;
}

/** PAY-11 "Settlement lines": deadline, facts, the explained lines and, on a death in service, who is paid what. */
function SettlementLines({ s, blocked, open, fnfHref, person }: { s: FnfSettlementView; blocked: boolean; open: boolean; fnfHref: string; person: string | null }) {
  const lines = [
    ...(s.salary ?? []).map((l) => ({ key: `s-${l.code}`, label: l.name, type: l.group === 'earning' ? 'Earning' : 'Deduction', amount: l.amount, why: l.how, held: null as string | null })),
    ...s.items.map((i) => ({ key: i.id, label: i.title, type: i.kind === 'employer' ? 'Company cost' : i.kind === 'deduction' ? 'Deduction' : 'Earning', amount: i.amount, why: i.how, held: i.held })),
  ];
  return (
    <div className="yx-pay-stack">
      {open && (
        <InlineAlert
          tone={blocked || s.overdue ? 'danger' : 'warning'}
          title={blocked ? "Can't pay retrenchment compensation yet: government permission needed" : s.overdue ? `Overdue: the deadline was ${formatDate(day(s.deadline))}` : `Pay by ${formatDate(day(s.deadline))} (2 working days after last working day)`}
          actions={<Button size="sm" asChild><a href={fnfHref}>Open full and final</a></Button>}
        >
          {blocked
            ? 'The establishment needs the government permission for retrenchment. Record it as granted in People › Exits; the held lines are then paid in a second off-cycle run. Undisputed wages can still be paid within the deadline in this run.'
            : `Last working day ${formatDate(day(s.lwd))}${s.workingDaysLeft >= 0 ? `, ${s.workingDaysLeft} working ${s.workingDaysLeft === 1 ? 'day' : 'days'} left` : ''}. If something blocks full settlement, pay the undisputed wages by the deadline and the rest in a second off-cycle run with the reason.`}
        </InlineAlert>
      )}
      <FactRow
        items={[
          { label: 'Employee', value: `${s.exitType === 'death' ? 'Late ' : ''}${person ?? '—'}` },
          { label: 'Exit type', value: EXIT_TEXT[s.exitType] ?? s.exitType },
          { label: 'Last working day', value: formatDate(day(s.lwd)) },
        ]}
      />
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Settlement lines, scrolls sideways on small screens">
        <table className="yx-pay-table">
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Type</th>
              <th scope="col" data-num>
                Amount
              </th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <th scope="row">
                  {l.label} {l.held && <Badge tone="warning">Held</Badge>}
                </th>
                <td>{l.type}</td>
                <td data-num>{l.type === 'Deduction' ? `−${inr(l.amount)}` : inr(l.amount)}</td>
                <td>{l.held ?? l.why}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Net payable
              </th>
              <td data-num>{s.totals.net == null ? 'After calculation' : inr(s.totals.net)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {s.exitType === 'death' && (
        <>
          {s.payees.length ? (
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Paid to nominees by share, scrolls sideways on small screens">
              <table className="yx-pay-table">
                <caption>Paid to nominees by share (verified bank accounts)</caption>
                <thead>
                  <tr>
                    <th scope="col">Nominee</th>
                    <th scope="col">Relationship</th>
                    <th scope="col" data-num>
                      Share
                    </th>
                    <th scope="col" data-num>
                      Amount
                    </th>
                    <th scope="col">Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {s.payees.map((p) => (
                    <tr key={p.name}>
                      <th scope="row">{p.name}</th>
                      <td>{p.relation}</td>
                      <td data-num>{Number(p.sharePercent)}%</td>
                      <td data-num>{p.amount == null ? 'After calculation' : inr(p.amount)}</td>
                      <td>{p.accountLast4 ? `•••• ${p.accountLast4}` : <Badge tone="warning">No account yet</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <InlineAlert tone="warning" title="No nominees recorded yet">
              Record who is paid and their shares in the death in service case in People before this run is approved.
            </InlineAlert>
          )}
          <p className="yx-pay-note">Gratuity 5-year condition waived on death. {s.taxNote ?? ''}</p>
        </>
      )}
    </div>
  );
}
