import { useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { PlainTable } from '../../components/plain-table';
import { PageHeader } from '../../components/shell';
import { formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { dateText } from '../time/live/kit';
import { PayPageState } from './consultants';
import { MyPayFrame } from './pay-kit';
import type { CompensationHistoryItem } from './comp-setup-live';
import type { LoadState } from './live/types';
import type { CompensationInForce } from './live/types-5b';

// T2-B 63 (Keka B3): Me › My pay › My salary. The salary in force ("Current"), a later approved one ("Starts on …"),
// then earlier salaries newest first; each opens its split by component. Approved salaries only (answer 2860): pay
// requests still waiting or turned down, and who asked or approved, are not shown here.

export interface LiveMySalary {
  state: LoadState;
  onRetry?: () => void;
  /** Today (yyyy-mm-dd), to mark the salary in force. */
  today: string;
  /** The person's own salary history (PAY-12, self), newest first; null while loading. */
  history: CompensationHistoryItem[] | null;
  /** The salary in force on a day, with its split by component (GET payroll/employees/:id/compensation?asOn=). */
  onBreakdown: (validFrom: string) => Promise<CompensationInForce | null>;
}

type Line = CompensationInForce['lines'][number];
const KIND_ORDER: Record<string, number> = { earning: 0, employer: 1, deduction: 2 };

function Breakdown({ c }: { c: CompensationInForce }) {
  const rows = [...c.lines].sort((a, b) => (KIND_ORDER[a.kind ?? ''] ?? 3) - (KIND_ORDER[b.kind ?? ''] ?? 3));
  return (
    <PlainTable<Line>
      label="Salary split by component"
      columns={[
        { key: 'name', header: 'Component', cell: (l) => l.name ?? l.code ?? '', rowHeader: true },
        { key: 'monthly', header: 'A month', cell: (l) => formatINR(Number(l.monthly)), num: true },
        { key: 'annual', header: 'A year', cell: (l) => formatINR(Number(l.annual)), num: true },
      ]}
      rows={rows}
      getRowId={(l) => l.code ?? l.name ?? l.monthly}
    />
  );
}

export function MySalaryScreen({ live }: { live: LiveMySalary }) {
  const { busy, error, run } = useRun();
  const [open, setOpen] = useState<string | null>(null);
  const [split, setSplit] = useState<Record<string, CompensationInForce | null>>({});
  const salaries = (live.history ?? []).filter((h) => h.kind === 'salary' && h.validFrom);
  const current = salaries.find((h) => h.validFrom! <= live.today && (!h.validTo || h.validTo >= live.today));
  const toggle = (h: CompensationHistoryItem) => {
    if (open === h.changeId) return setOpen(null);
    setOpen(h.changeId);
    if (!(h.changeId in split)) void run(`b-${h.changeId}`, async () => setSplit({ ...split, [h.changeId]: await live.onBreakdown(h.validFrom!) }));
  };
  return (
    <MyPayFrame page="salary">
      <PageHeader title="My salary" description="Your salary now and each change before it. Open one to see how it is split." />
      <PayPageState state={live.state} onRetry={live.onRetry} what="your salary">
        {error && (
          <InlineAlert tone="danger" title="That did not work">
            {error}
          </InlineAlert>
        )}
        {salaries.length === 0 ? (
          <EmptyState title="No salary yet." description="Your salary shows here once HR sets it and it is approved." />
        ) : (
          <ul className="yx-pay-cards" aria-label="Salary changes">
            {salaries.map((h) => {
              const later = h.validFrom! > live.today;
              const pct = h.previousCtc && h.annualCtc && Number(h.previousCtc) > 0 ? Math.round(((Number(h.annualCtc) - Number(h.previousCtc)) / Number(h.previousCtc)) * 1000) / 10 : null;
              const isOpen = open === h.changeId;
              return (
                <li key={h.changeId} aria-current={h === current ? 'true' : undefined}>
                  <div className="yx-pay-cards__row">
                    <strong>{h.annualCtc ? `${formatINR(Number(h.annualCtc))} a year` : 'Salary'}</strong>
                    {h === current ? <Badge tone="success">Current</Badge> : later ? <Badge tone="info">Starts on {dateText(h.validFrom!)}</Badge> : null}
                  </div>
                  <span className="yx-pay-muted">
                    {later ? `From ${dateText(h.validFrom!)}` : h.validTo ? `${dateText(h.validFrom!)} to ${dateText(h.validTo)}` : `Since ${dateText(h.validFrom!)}`}
                    {pct != null ? ` · ${pct >= 0 ? '+' : ''}${pct}% on the salary before` : ''}
                    {h.reason ? ` · ${h.reason}` : ''}
                  </span>
                  <div className="yx-pay-row">
                    <Button size="sm" aria-expanded={isOpen} loading={busy === `b-${h.changeId}`} onClick={() => toggle(h)}>
                      {isOpen ? 'Hide the split' : 'Show the split'}
                    </Button>
                  </div>
                  {isOpen &&
                    (busy === `b-${h.changeId}` ? (
                      <Skeleton height={96} />
                    ) : split[h.changeId] ? (
                      <Breakdown c={split[h.changeId]!} />
                    ) : h.changeId in split ? (
                      <p className="yx-pay-muted">No split is kept for this salary.</p>
                    ) : null)}
                </li>
              );
            })}
          </ul>
        )}
      </PayPageState>
    </MyPayFrame>
  );
}
