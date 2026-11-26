import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { CurrencyField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DataTable, type TableColumn } from '../../components/table';
import { Dialog } from '../../components/overlay';
import { Card } from '../../components/shell';
import { useToast } from '../../components/notify';
import { formatMoney } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { DeskPage } from './desk-kit';
import type { ItBudgets, LoadState } from './types';

// GLPI 7 (answer 2719): each department's yearly IT budget (financial year from April), what IT desks spent on it
// (logged time at the team's rate, fixed and material cost lines) and what is left. Holders of desk.budget.manage only.

export interface ItBudgetsScreenProps {
  state: LoadState;
  data: ItBudgets | null;
  /** The financial year shown (April's year). */
  year: number;
  /** This financial year, for the year switch (last, this, next). */
  thisYear: number;
  onYear: (year: number) => void;
  onRetry?: () => void;
  onSet: (departmentId: string, year: number, amount: string) => Promise<void>;
}

type Row = ItBudgets['rows'][number];
const inr = (x: string | null) => (x === null ? '—' : formatMoney(Number(x)));
const fyText = (y: number) => `${y}–${String(y + 1).slice(2)}`;

export function ItBudgetsScreen(p: ItBudgetsScreenProps) {
  const [editing, setEditing] = useState<{ departmentId: string | null; amount: number | null } | null>(null);
  const columns: TableColumn<Row>[] = [
    { key: 'department', header: 'Department', value: (r) => r.department },
    { key: 'budget', header: 'Budget', type: 'money', value: (r) => (r.budget === null ? null : Number(r.budget)), render: (r) => inr(r.budget) },
    { key: 'time', header: 'Time', type: 'money', value: (r) => Number(r.time), render: (r) => inr(r.time) },
    { key: 'lines', header: 'Fixed and material', type: 'money', value: (r) => Number(r.lines), render: (r) => inr(r.lines) },
    { key: 'spent', header: 'Spent', type: 'money', value: (r) => Number(r.spent), render: (r) => inr(r.spent) },
    { key: 'left', header: 'Left', type: 'money', value: (r) => (r.left === null ? null : Number(r.left)), render: (r) => (r.left !== null && Number(r.left) < 0 ? <Badge tone="danger">{`Over by ${inr(String(-Number(r.left)))}`}</Badge> : inr(r.left)) },
  ];
  return (
    <DeskPage
      title="IT budgets"
      description="Each department's yearly IT budget and what IT desks spent on it: time at the team's hourly rate, plus fixed and material costs on tickets."
      state={p.state}
      onRetry={p.onRetry}
      what="IT budgets"
      grantedBy="your company admin"
      actions={
        <Button variant="primary" onClick={() => setEditing({ departmentId: null, amount: null })}>
          Set a budget
        </Button>
      }
    >
      {p.data && (
        <div className="yx-ops-stack">
          <Segment
            label="Financial year"
            options={[p.thisYear - 1, p.thisYear, p.thisYear + 1].map((y) => ({ value: String(y), label: fyText(y) }))}
            value={String(p.year)}
            onChange={(v) => p.onYear(Number(v))}
          />
          <DataTable
            label={`IT budgets ${fyText(p.data.year)}`}
            columns={columns}
            rows={p.data.rows}
            getRowId={(r) => r.departmentId}
            rowNoun={['department', 'departments']}
            empty={<EmptyState compact title="No IT budgets or costs this year." description="Set a department's budget, or add costs on IT tickets." />}
            rowButtons={(r) => (
              <Button size="sm" onClick={() => setEditing({ departmentId: r.departmentId, amount: r.budget === null ? null : Number(r.budget) })}>
                {r.budget === null ? 'Set budget' : 'Change'}
              </Button>
            )}
          />
          {p.data.noDepartment && (
            <Card title="Not charged to a department">
              <p>
                {inr(p.data.noDepartment.spent)} spent for requesters with no department (time {inr(p.data.noDepartment.time)}, fixed and material {inr(p.data.noDepartment.lines)}).
              </p>
            </Card>
          )}
          {editing && <BudgetDialog year={p.data.year} departments={p.data.departments} start={editing} onClose={() => setEditing(null)} onSet={p.onSet} />}
        </div>
      )}
    </DeskPage>
  );
}

function BudgetDialog({ year, departments, start, onClose, onSet }: { year: number; departments: ItBudgets['departments']; start: { departmentId: string | null; amount: number | null }; onClose: () => void; onSet: ItBudgetsScreenProps['onSet'] }) {
  const [dept, setDept] = useState<string | null>(start.departmentId);
  const [amount, setAmount] = useState<number | null>(start.amount);
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const early = useTooEarly([
    ...(!dept ? [{ fieldId: 'itb-dept', message: 'Choose a department.' }] : []),
    ...(amount === null || amount < 0 ? [{ fieldId: 'itb-amount', message: 'Enter the budget in rupees (0 or more).' }] : []),
  ]);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`IT budget for ${fyText(year)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={async () => {
              if (early.stop()) return;
              if (await run('save', () => onSet(dept!, year, String(amount)))) {
                toast({ tone: 'success', title: 'Budget saved.' });
                onClose();
              }
            }}
          >
            Save budget
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <FormField id="itb-dept" label="Department" required error={early.errorOf('itb-dept')}>
          <Select value={dept} onChange={setDept} options={departments} placeholder="Choose a department" disabled={start.departmentId !== null} />
        </FormField>
        <FormField id="itb-amount" label="Budget for the year" required error={early.errorOf('itb-amount')}>
          <CurrencyField value={amount} onChange={setAmount} />
        </FormField>
      </div>
    </Dialog>
  );
}
