import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../../components/button';
import { DatePicker } from '../../../components/date';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import type { ExpenseReport, LoadState, ReportKind } from './types';

// Expenses batch E5, wired (M05-BUILD-DESIGN §13.5, §15 F13; EXP-09): finance's expense reports, each exportable as
// CSV. The GST input report keeps the GSTR-2B column order so finance can reconcile outside YukthiX.

export const REPORT_TABS: { value: ReportKind; label: string; about: string }[] = [
  { value: 'summary', label: 'Spend', about: 'Approved spend by category, for claims decided in the period.' },
  { value: 'unpaid', label: 'Unpaid', about: 'Approved claims not paid yet.' },
  { value: 'advance-ageing', label: 'Advance ageing', about: 'Advances with money still to settle, by how long they have been open.' },
  { value: 'over-limit', label: 'Over limit', about: 'Approved bills that went over a limit, with the reason given.' },
  { value: 'gst-input', label: 'GST input', about: 'Bills with GST details and whether the company can claim the credit, in the GSTR-2B column order.' },
  { value: 'approver-patterns', label: 'Approver patterns', about: 'An approver who approved 3 or more flagged or over-limit claims of the same person in 90 days. For a second look, never a block.' },
];
const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);

export interface ExpenseReportsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  kind: ReportKind;
  report: ExpenseReport | null;
  from: string;
  to: string;
  onKind: (kind: ReportKind) => void;
  onRange: (from: string, to: string) => void;
  onExport: () => Promise<unknown>;
}

export function ExpenseReportsScreen(p: ExpenseReportsScreenProps) {
  const { busy, error, run } = useRun();
  const [from, setFrom] = useState<Date | null>(fromKey(p.from));
  const [to, setTo] = useState<Date | null>(fromKey(p.to));
  const tab = REPORT_TABS.find((t) => t.value === p.kind)!;
  const columns: TableColumn<Record<string, string | number | null>>[] = (p.report?.columns ?? []).map((c) => ({ key: c.key, header: c.label, value: (r) => r[c.key] ?? '', width: 160 }));
  const badRange = !from || !to || dayKey(from) > dayKey(to);
  return (
    <LivePage
      title="Expense reports"
      description={tab.about}
      state={p.state}
      onRetry={p.onRetry}
      what="expense reports"
      grantedBy="your System Admin"
      actions={
        <Button icon={Download} loading={busy === 'csv'} disabled={!p.report} onClick={() => void run('csv', p.onExport)}>
          Export CSV
        </Button>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Tabs value={p.kind} onValueChange={(v) => p.onKind(v as ReportKind)}>
        <TabsList aria-label="Expense reports">
          {REPORT_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* The panel the active tab controls (its aria-controls must point at one). */}
        <TabsContent value={p.kind}>
      {p.kind !== 'advance-ageing' && p.kind !== 'unpaid' && (
        <div className="yx-lif-row">
          <FormField id="rp-from" label="From">
            <DatePicker value={from} onChange={setFrom} aria-label="Report from" />
          </FormField>
          <FormField id="rp-to" label="To">
            <DatePicker value={to} onChange={setTo} min={from ?? undefined} aria-label="Report to" />
          </FormField>
          <Button disabled={badRange} onClick={() => p.onRange(dayKey(from!), dayKey(to!))}>
            Show
          </Button>
        </div>
      )}
      {p.report && (
        <>
          <Text as="p" tone="secondary" size="sm">
            {`${p.report.rows.length} ${p.report.rows.length === 1 ? 'row' : 'rows'}`}
          </Text>
          <DataTable label={tab.label} columns={columns} rows={p.report.rows} getRowId={(r) => String(p.report!.rows.indexOf(r))} rowNoun={['row', 'rows']} empty={<EmptyState compact title="Nothing to show for this period." />} />
        </>
      )}
        </TabsContent>
      </Tabs>
    </LivePage>
  );
}
