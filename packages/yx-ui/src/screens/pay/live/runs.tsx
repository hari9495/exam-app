import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { PlainTable } from '../../../components/plain-table';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { IrreversibleSheet, RunStageTrack, type RunStage } from '../pay-kit';
import { monthText } from './periods';
import type { Confirmation, LoadState } from './types';
import { periodsOf } from './types-5j';
import type { BankFileMade, BankFileRow, OffcycleKind, PayGroupRef, PayRun, PayslipDetail, PayslipLine, RunCheck, RunPayslip, RunPerson, RunProgressData, RunReadiness, RunStatus, RunVariance } from './types-5j';

// Payroll runs, wired (M03 §9, §15; PAY-10.01 for PAY-01 … PAY-11): the runs of each month, and one run from its checks to
// the published payslips: readiness and waivers, calculation progress, payslips with "why this number", pay changes to
// confirm, sending for approval, the approver's decision with the typed phrase, the bank file (made by one person,
// released by another) and publishing. Every action is checked again by the API (keys, entities, maker ≠ checker, step-up).

/** "₹1,23,456.00" from the API's decimal string. */
export const rupees = (v: string | null | undefined) => {
  if (v == null) return '';
  const [i, f = '00'] = v.split('.');
  const neg = i.startsWith('-');
  const n = neg ? i.slice(1) : i;
  const head = n.slice(0, -3);
  return `${neg ? '−' : ''}₹${head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},` : ''}${n.slice(-3)}.${f.padEnd(2, '0').slice(0, 2)}`;
};

const STATUS: Record<RunStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  calculating: { label: 'Calculating', tone: 'info' },
  calculated: { label: 'Calculated', tone: 'info' },
  in_review: { label: 'In review', tone: 'warning' },
  submitted: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved and locked', tone: 'success' },
  reopened: { label: 'Reopened', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  void: { label: 'Void', tone: 'neutral' },
};
export const RunStatusBadge = ({ status }: { status: RunStatus }) => <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
const KIND: Record<OffcycleKind, string> = { bonus: 'Bonus', arrears: 'Arrears', correction: 'Correction', payment: 'Payment', fnf: 'Full and final' };
export const runName = (r: Pick<PayRun, 'runType' | 'offcycleKind' | 'month' | 'reference'> & { range?: PayRun['range'] }) => `${r.runType === 'regular' ? 'Payroll' : `Off-cycle · ${KIND[r.offcycleKind ?? 'payment']}`} · ${r.range ? `${dateText(r.range.from)} to ${dateText(r.range.to)}` : monthText(r.month)}${r.reference ? ` · ${r.reference}` : ''}`;
const stageOf = (s: RunStatus, published: boolean): RunStage =>
  published ? 'Published' : s === 'paid' ? 'Paid' : s === 'approved' ? 'Approved and locked' : s === 'submitted' || s === 'in_review' ? 'In review' : s === 'calculated' ? 'Calculated' : 'Draft';

// ------------------------------------------------------------------------------------------ one run (PAY-02 … PAY-11)

/** Every line of a payslip with its explanation and the rule it cites (YX-PAY-12). */
export function PayslipLines({ lines }: { lines: PayslipLine[] }) {
  const groups: [PayslipLine['kind'], string][] = [
    ['earning', 'Earnings'],
    ['deduction', 'Deductions'],
    ['reimbursement', 'Reimbursements'],
    ['employer', 'Paid by the company (not in net pay)'],
    ['info', 'Notes'],
  ];
  return (
    <div className="yx-tim-stack">
      {groups.map(([k, title]) => {
        const ls = lines.filter((l) => l.kind === k);
        if (!ls.length) return null;
        return (
          <section key={k} aria-label={title}>
            <h3 className="yx-pay-section-title">{title}</h3>
            <PlainTable
              label={title}
              hideHeader
              rows={ls.map((l, i) => ({ l, id: `${l.code}-${i}` }))}
              getRowId={(r) => r.id}
              columns={[
                { key: 'name', header: 'Line', rowHeader: true, cell: ({ l }) => l.name },
                {
                  key: 'why',
                  header: 'How it is worked out',
                  cell: ({ l }) => (
                    <span className="yx-tim-note">
                      {l.explanation}
                      {l.rule ? ` (${l.rule.statute} ${l.rule.jurisdiction} ${l.rule.version}${l.verify ? ', verify' : ''})` : ''}
                    </span>
                  ),
                },
                { key: 'amount', header: 'Amount', cell: ({ l }) => rupees(l.amount) },
              ]}
            />
          </section>
        );
      })}
    </div>
  );
}

/** A short reason (or note) in a drawer; the save errors show only after trying to save. */
export function ReasonDrawer({ title, subtitle, label, confirm, optional, onClose, onSave }: { title: string; subtitle?: string; label: string; confirm: string; optional?: boolean; onClose: () => void; onSave: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const { busy, error, run } = useRun();
  const errors = !optional && text.trim().length < 5 ? [{ fieldId: 'rd-text', message: `${label}: at least 5 letters.` }] : [];
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('save', async () => {
                await onSave(text.trim());
                onClose();
              });
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="This didn't go through">
            {error}
          </InlineAlert>
        )}
        <FormField id="rd-text" label={label} required={!optional} optional={optional} error={save.errorOf('rd-text')}>
          <TextArea value={text} onChange={setText} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}
