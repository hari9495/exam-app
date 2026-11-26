import { Button } from '../../components/button';
import { EmptyState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DataTable } from '../../components/table';
import { useRun } from '../org/org-kit';
import { LivePage } from '../time/live/kit';
import type { Choice, LoadState, PerfReport } from '../performance/live/types';

// Performance reports (batch PM6, M06-BUILD-DESIGN §13; re-wired as a designed screen in batch T2-C, as answer 2579 did
// for the feedback tasks): people in the viewer's scope; groups smaller than the company's minimum are hidden.

export type ReportKind = 'completion' | 'distribution' | 'calibration-changes' | 'goal-alignment' | 'pip-status';
const REPORTS: { value: ReportKind; label: string }[] = [
  { value: 'completion', label: 'Completion' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'calibration-changes', label: 'Calibration changes' },
  { value: 'goal-alignment', label: 'Goal alignment' },
  { value: 'pip-status', label: 'Improvement plans' },
];

export interface PerformanceReportsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  cycles: Choice[];
  cycleId: string | null;
  onCycle: (id: string) => void;
  kind: ReportKind;
  onKind: (k: ReportKind) => void;
  report: PerfReport | null;
  onDownload?: () => Promise<unknown>;
}

export function PerformanceReportsScreen(p: PerformanceReportsScreenProps) {
  const { busy, run } = useRun();
  return (
    <LivePage title="Performance reports" description="People in your scope. Groups smaller than the company's minimum are not shown, so no one is singled out." state={p.state} onRetry={p.onRetry} what="performance reports">
      <div className="yx-lif-row">
        <FormField id="pr-cycle" label="Cycle">
          <Select aria-label="Cycle" value={p.cycleId} onChange={(x) => x && p.onCycle(x)} options={p.cycles} />
        </FormField>
        <FormField id="pr-kind" label="Report">
          <Select aria-label="Report" value={p.kind} onChange={(x) => x && p.onKind(x as ReportKind)} options={REPORTS} />
        </FormField>
        {p.report && p.onDownload && (
          <Button loading={busy === 'csv'} onClick={() => void run('csv', p.onDownload!)}>
            Download CSV
          </Button>
        )}
      </div>
      {!p.report ? (
        <EmptyState compact title="Choose a cycle." />
      ) : (
        <DataTable
          label={REPORTS.find((r) => r.value === p.kind)!.label}
          columns={p.report.header.map((h, i) => ({ key: String(i), header: h, value: (row: unknown[]) => (row[i] === null ? 'Hidden (small group)' : String(row[i] ?? '')), width: i === 0 ? 220 : 140, hideable: i !== 0 }))}
          rows={p.report.rows}
          getRowId={(row) => p.report!.rows.indexOf(row).toString()}
          rowNoun={['row', 'rows']}
          empty={<EmptyState compact title="Nothing to show for this cycle." />}
        />
      )}
    </LivePage>
  );
}
