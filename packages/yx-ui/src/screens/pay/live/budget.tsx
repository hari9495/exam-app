import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { useToast } from '../../../components/notify';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { formatINR } from '../../../lib/format';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { EntityPicker } from './setup';
import type { LoadState } from './types';
import type { SetupEntity } from './types-5b';

// Payroll › Budget (founder decision 21 Oct 2026): the monthly payroll budget of a legal entity, cost to company, April
// to March, next to the cost on record. The finance Home draws "Payroll cost vs budget" from it. Presentational: the API
// checks the keys (payroll.setup.manage to change), the entity scope and the pay guard, and audits every change.

export interface BudgetMonth {
  month: string;
  /** Rupees as a decimal string; null = no budget for the month. */
  budget: string | null;
  /** Cost to company of the month's regular payroll; null = no calculated run yet. */
  cost: string | null;
  changedBy: string | null;
  changedOn: string | null;
}

export interface PayrollBudget {
  entityId: string;
  taxYear: string;
  canEdit: boolean;
  months: BudgetMonth[];
}

export interface PayrollBudgetScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  taxYears: string[];
  taxYear: string;
  onTaxYear: (y: string) => void;
  budget: PayrollBudget | null;
  onSave: (months: { month: string; amount: string | null }[]) => Promise<unknown>;
}

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m: string) => `${MONTH[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const money = (s: string | null) => (s === null ? '' : formatINR(Number(s)));
/** What people type: digits with Indian commas, optionally paise. Empty clears the month. */
const clean = (s: string) => s.replace(/[,\s₹]/g, '');
const valid = (s: string) => s === '' || /^\d{1,12}(\.\d{1,2})?$/.test(clean(s));

export function PayrollBudgetScreen(p: PayrollBudgetScreenProps) {
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const entity = p.entities.find((e) => e.id === p.entityId)?.name ?? '';
  // Amounts show in Indian format (6,70,000) and may be typed that way.
  useEffect(() => setDraft(Object.fromEntries((p.budget?.months ?? []).map((m) => [m.month, m.budget === null ? '' : formatINR(Number(m.budget)).replace('₹', '')]))), [p.budget]);
  const same = (typed: string, stored: string | null) => (clean(typed) === '' ? stored === null : stored !== null && valid(typed) && Number(clean(typed)) === Number(stored));
  const changes = (p.budget?.months ?? [])
    .filter((m) => !same(draft[m.month] ?? '', m.budget))
    .map((m) => ({ month: m.month, amount: clean(draft[m.month] ?? '') || null }));
  const bad = (p.budget?.months ?? []).filter((m) => !valid(draft[m.month] ?? ''));
  const total = (key: 'budget' | 'cost') => (p.budget?.months ?? []).reduce((t, m) => t + Number(m[key] ?? 0), 0);
  const edit = Boolean(p.budget?.canEdit);
  return (
    <LivePage
      title="Payroll budget"
      description="What each month's payroll may cost the company, April to March. The finance Home compares it with the cost of each month's payroll."
      state={p.state}
      onRetry={p.onRetry}
      what="the payroll budget"
      grantedBy="your payroll admin"
    >
      {error && (
        <InlineAlert tone="danger" title="That didn’t work">
          {error}
        </InlineAlert>
      )}
      <div className="yx-tim-row">
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
        <FormField id="pay-budget-year" label="Financial year">
          <Select value={p.taxYear} onChange={(v) => v && p.onTaxYear(v)} options={p.taxYears.map((y) => ({ value: y, label: `${y.slice(0, 4)}–${y.slice(5)}` }))} />
        </FormField>
      </div>
      {p.budget && (
        <Card
          className="yx-pay-card"
          title={`${entity} · ${p.taxYear.slice(0, 4)}–${p.taxYear.slice(5)}`}
          footer={
            edit ? (
              <Button
                variant="primary"
                loading={busy === 'save'}
                disabled={!changes.length || bad.length > 0}
                onClick={() =>
                  void run('save', async () => {
                    await p.onSave(changes);
                    toast({ title: `Budget saved for ${entity}`, description: `${changes.length} ${changes.length === 1 ? 'month' : 'months'} changed.` });
                  })
                }
              >
                Save budget
              </Button>
            ) : undefined
          }
        >
          {!edit && <p className="yx-tim-muted">You can see the budget. Your payroll admin sets it.</p>}
          <table className="yx-tim-table" aria-label="Payroll budget by month">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Budget (cost to company)</th>
                <th scope="col">Payroll cost</th>
                <th scope="col">Difference</th>
                <th scope="col">Last change</th>
              </tr>
            </thead>
            <tbody>
              {p.budget.months.map((m) => {
                const diff = m.budget !== null && m.cost !== null ? Number(m.cost) - Number(m.budget) : null;
                return (
                  <tr key={m.month}>
                    <th scope="row">{monthName(m.month)}</th>
                    <td>
                      {edit ? (
                        <TextField
                          aria-label={`Budget for ${monthName(m.month)}`}
                          inputMode="decimal"
                          size="sm"
                          prefix="₹"
                          value={draft[m.month] ?? ''}
                          onChange={(v) => setDraft({ ...draft, [m.month]: v })}
                          placeholder="No budget"
                          aria-invalid={!valid(draft[m.month] ?? '') || undefined}
                        />
                      ) : (
                        money(m.budget) || <span className="yx-tim-muted">No budget</span>
                      )}
                    </td>
                    <td>{m.cost === null ? <span className="yx-tim-muted">No payroll yet</span> : money(m.cost)}</td>
                    <td>{diff === null ? '' : diff > 0 ? `${formatINR(diff)} over` : diff < 0 ? `${formatINR(-diff)} under` : 'On budget'}</td>
                    <td className="yx-tim-muted">{m.changedBy && m.changedOn ? `${m.changedBy}, ${dateText(m.changedOn)}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Year</th>
                <td>{money(String(total('budget')))}</td>
                <td>{money(String(total('cost')))}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
          {bad.length > 0 && <p className="yx-tim-muted">Type an amount in rupees, like 2,14,00,000, or leave it empty for no budget.</p>}
        </Card>
      )}
    </LivePage>
  );
}
