import { useMemo, useState } from 'react';
import { Download, Send, Users } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { PrcFrame } from './proctoring-shared';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/menu';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { useRun } from '../org/org-kit';
import { useSay } from '../ops/ops-kit';
import type { BankLoad } from './bank-live';

// Decision 2398 (answer 2437): the Results tab of a test page, in place of the older /v2 results list and compare page.
// Who took the test, their score, pass or fail and integrity; filter, export, release, and compare 2 to 4 people.

export const RESULT_STATUS: Record<string, { label: string; tone: 'info' | 'danger' | 'warning' | 'neutral' | 'success' }> = {
  invited: { label: 'Invited', tone: 'info' },
  revoked: { label: 'Revoked', tone: 'danger' },
  in_progress: { label: 'In progress', tone: 'warning' },
  paused: { label: 'Paused', tone: 'neutral' },
  blocked: { label: 'Blocked', tone: 'danger' },
  pending_manual_grade: { label: 'Waiting for marking', tone: 'warning' },
  submitted: { label: 'Submitted', tone: 'success' },
  auto_submitted: { label: 'Auto-submitted', tone: 'success' },
  force_submitted: { label: 'Ended by staff', tone: 'danger' },
};
export const INTEGRITY_WORDS: Record<string, string> = {
  clear: 'Clear',
  review: 'Review recommended',
  high_concern: 'High concern',
};

export interface TestResultRow {
  invitationId: string;
  candidateId: string;
  attemptId: string | null;
  candidateName: string;
  status: string;
  percentage: number | null;
  passFail: string | null;
  integrityLevel: string | null;
  submittedAt: string | null;
}
export interface TestResultsSummary {
  totalCandidates: number;
  settledCount: number;
  passRate: number;
  averagePercentage: number;
  resultsReleaseMode: 'immediate' | 'manual';
}
export interface CompareResult {
  invitationId: string;
  candidateName: string;
  percentage: number | null;
  passFail: string | null;
  integrityLevel: string | null;
  sections: { title: string; percentage: number | null }[];
}
export interface LiveTestResults {
  state: BankLoad;
  onRetry: () => void;
  summary: TestResultsSummary | null;
  rows: TestResultRow[];
  onOpen: (row: TestResultRow) => void;
  /** Exports the chosen people (all when none is chosen). */
  onExport: (format: 'csv' | 'xlsx' | 'pdf', invitationIds: string[]) => Promise<void>;
  /** Absent for people who cannot release results. */
  onRelease?: (notify: boolean) => Promise<{ released: number }>;
  onCompare: (invitationIds: string[]) => Promise<CompareResult[]>;
}

const pct = (n: number | null) => (n == null ? 'Not scored' : `${Math.round(n * 10) / 10} %`);
const outcome = (p: string | null) => (p === 'pass' ? 'Passed' : p === 'fail' ? 'Not passed' : 'No result');

export function TestResultsPanel({ live }: { live: LiveTestResults }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [releasing, setReleasing] = useState(false);
  const [notify, setNotify] = useState(false);
  const [compared, setCompared] = useState<CompareResult[] | null>(null);
  const { busy, run, error, clearError } = useRun();
  const { done, say } = useSay();
  const fields: FilterFieldDef[] = useMemo(
    () => [
      {
        key: 'statusLabel',
        label: 'Status',
        type: 'multi',
        options: Object.values(RESULT_STATUS).map((s) => ({
          value: s.label,
          label: s.label,
        })),
      },
      {
        key: 'outcome',
        label: 'Result',
        type: 'multi',
        options: ['Passed', 'Not passed', 'No result'].map((v) => ({
          value: v,
          label: v,
        })),
      },
      {
        key: 'integrity',
        label: 'Integrity',
        type: 'multi',
        options: Object.values(INTEGRITY_WORDS).map((v) => ({
          value: v,
          label: v,
        })),
      },
    ],
    [],
  );
  const view = useMemo(
    () =>
      live.rows.map((r) => ({
        ...r,
        statusLabel: RESULT_STATUS[r.status]?.label ?? r.status,
        outcome: outcome(r.passFail),
        integrity: r.integrityLevel ? (INTEGRITY_WORDS[r.integrityLevel] ?? r.integrityLevel) : 'Not checked',
      })),
    [live.rows],
  );
  const rows = view.filter(
    (r) =>
      (!q || r.candidateName.toLowerCase().includes(q.toLowerCase())) &&
      filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f)),
  );
  if (live.state === 'error') return <ErrorState title="We couldn't load the results." onRetry={live.onRetry} />;

  type Row = (typeof view)[number];
  const cols: TableColumn<Row>[] = [
    {
      key: 'candidateName',
      header: 'Candidate',
      type: 'person',
      value: (r) => r.candidateName,
      person: (r) => ({ name: r.candidateName }),
      width: 240,
    },
    {
      key: 'statusLabel',
      header: 'Status',
      type: 'status',
      value: (r) => r.statusLabel,
      statusTone: (_v, r) => RESULT_STATUS[r.status]?.tone ?? 'neutral',
      width: 170,
    },
    {
      key: 'percentage',
      header: 'Score',
      type: 'number',
      value: (r) => r.percentage ?? -1,
      render: (r) => pct(r.percentage),
      width: 110,
    },
    {
      key: 'outcome',
      header: 'Result',
      type: 'status',
      value: (r) => r.outcome,
      statusTone: (v) => (v === 'Passed' ? 'success' : v === 'Not passed' ? 'danger' : 'neutral'),
      width: 130,
    },
    {
      key: 'integrity',
      header: 'Integrity',
      type: 'status',
      value: (r) => r.integrity,
      statusTone: (v) => (v === 'High concern' ? 'danger' : v === 'Review recommended' ? 'warning' : v === 'Clear' ? 'success' : 'neutral'),
      width: 180,
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      type: 'date',
      value: (r) => (r.submittedAt ? new Date(r.submittedAt) : null),
      width: 130,
    },
  ];
  const exportAs = (format: 'csv' | 'xlsx' | 'pdf') =>
    void run(`export-${format}`, () => live.onExport(format, sel)).then(
      (ok) => ok && done(sel.length ? `Exported ${sel.length} ${sel.length === 1 ? 'person' : 'people'}` : 'Exported everyone'),
    );
  const compare = (ids: string[]) =>
    say(
      (ids.length < 2 || ids.length > 4) && 'Choose 2 to 4 people to compare.',
      () => void run('compare', async () => setCompared(await live.onCompare(ids))),
    );
  const s = live.summary;
  const sections = compared ? [...new Set(compared.flatMap((c) => c.sections.map((x) => x.title)))] : [];

  return (
    <div className="yx-prc-stack">
      {error && (
        <InlineAlert
          tone="danger"
          title="That did not work"
          actions={
            <Button size="sm" onClick={clearError}>
              Dismiss
            </Button>
          }
        >
          {error}
        </InlineAlert>
      )}
      {s && (
        <Card>
          <DescriptionList
            columns={2}
            items={[
              {
                label: 'Candidates',
                value: `${s.totalCandidates} (${s.settledCount} finished)`,
              },
              {
                label: 'Pass rate',
                value: `${Math.round(s.passRate * 10) / 10} %`,
              },
              {
                label: 'Average score',
                value: `${Math.round(s.averagePercentage * 10) / 10} %`,
              },
              {
                label: 'Results reach candidates',
                value: s.resultsReleaseMode === 'immediate' ? 'As soon as they are marked' : 'When you release them',
              },
            ]}
          />
        </Card>
      )}
      <FilterBar fields={fields} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search name">
        <Menu>
          <MenuTrigger asChild>
            <Button icon={Download} loading={busy?.startsWith('export')}>
              Export
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => exportAs('csv')}>CSV</MenuItem>
            <MenuItem onSelect={() => exportAs('xlsx')}>Excel</MenuItem>
            <MenuItem onSelect={() => exportAs('pdf')}>PDF</MenuItem>
          </MenuContent>
        </Menu>
        {live.onRelease && s?.resultsReleaseMode === 'manual' && (
          <Button
            icon={Send}
            onClick={() => {
              clearError();
              setReleasing(true);
            }}
          >
            Release results
          </Button>
        )}
      </FilterBar>
      <DataTable
        label="Results"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.invitationId}
        state={live.state === 'loading' ? 'loading' : 'ready'}
        filtered={filters.length > 0 || !!q}
        onClearFilters={() => {
          setFilters([]);
          setQ('');
        }}
        empty={<EmptyState title="No one has taken this test yet." description="Results appear here as candidates finish." />}
        selectable
        selectedIds={sel}
        onSelectedChange={setSel}
        bulkActions={(ids) => (
          <Button size="sm" icon={Users} loading={busy === 'compare'} onClick={() => compare(ids)}>
            Compare {ids.length}
          </Button>
        )}
        onRowClick={live.onOpen}
        pageSize={10}
      />
      <ConfirmDialog
        open={releasing}
        onOpenChange={setReleasing}
        title="Release results to every candidate?"
        consequence="Each candidate who has finished sees their result. This cannot be taken back; it is recorded in the audit log."
        confirmLabel="Release"
        onConfirm={async () => {
          // ConfirmDialog keeps itself open and shows the reason when this throws.
          const { released } = await live.onRelease!(notify);
          done(released ? `Released ${released} ${released === 1 ? 'result' : 'results'}` : 'All results were already released');
        }}
      >
        <Checkbox checked={notify} onChange={setNotify} label="Also email each candidate their outcome" />
      </ConfirmDialog>
      <Dialog open={compared !== null} onOpenChange={(o) => !o && setCompared(null)} title="Compare candidates" size="md">
        {compared && (
          <DataTable
            label="Comparison"
            columns={[
              {
                key: 'metric',
                header: 'Measure',
                value: (r: { metric: string; values: string[] }) => r.metric,
                width: 180,
              },
              ...compared.map((c, i) => ({
                key: c.invitationId,
                header: c.candidateName,
                value: (r: { metric: string; values: string[] }) => r.values[i] ?? '',
                width: 160,
              })),
            ]}
            rows={[
              {
                metric: 'Score',
                values: compared.map((c) => pct(c.percentage)),
              },
              {
                metric: 'Result',
                values: compared.map((c) => outcome(c.passFail)),
              },
              {
                metric: 'Integrity',
                values: compared.map((c) => (c.integrityLevel ? (INTEGRITY_WORDS[c.integrityLevel] ?? c.integrityLevel) : 'Not checked')),
              },
              ...sections.map((t) => ({
                metric: t,
                values: compared.map((c) => pct(c.sections.find((x) => x.title === t)?.percentage ?? null)),
              })),
            ]}
            getRowId={(r) => r.metric}
          />
        )}
      </Dialog>
    </div>
  );
}

/** Answer 2437: the same results for people who read results but do not build tests (interviewers, hiring managers). */
export interface LiveResultsPage {
  /** The tests the viewer may read results of. */
  tests: { id: string; title: string }[];
  testId: string | null;
  onPickTest: (id: string) => void;
  /** Null until a test is picked. */
  results: LiveTestResults | null;
}

export function TestResultsScreen({ live }: { live: LiveResultsPage }) {
  return (
    <PrcFrame page="Results & reports">
      <PageHeader
        title="Test results"
        description="Pick a test to see who took it and how they did."
        actions={
          <FormField id="results-test" label="Test" hideLabel>
            <Select
              id="results-test"
              options={live.tests.map((t) => ({ value: t.id, label: t.title }))}
              value={live.testId}
              onChange={(v) => v && live.onPickTest(v)}
              placeholder="Choose a test"
            />
          </FormField>
        }
      />
      {live.results ? (
        <TestResultsPanel live={live.results} />
      ) : (
        <EmptyState
          title={live.tests.length ? 'Choose a test.' : 'No tests to show yet.'}
          description={live.tests.length ? 'Its results appear here.' : 'Tests appear here once candidates of your jobs take them.'}
        />
      )}
    </PrcFrame>
  );
}
