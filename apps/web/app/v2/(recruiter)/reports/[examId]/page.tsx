'use client';

// v2 exam report — re-skin of app/(panel)/reports/[examId] on v2 primitives. Summary tiles +
// Candidates/Accuracy tabs. All hooks, filters, export formats (csv/xlsx/pdf), compare and the
// exam switcher are verbatim (format only). Candidate rows link to the v2 candidate report; the
// exam switcher, Compare and back-nav all stay within /v2. Reuses QuestionAccuracyPanel +
// IntegrityBadge as-is.
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ListFilter, Check } from 'lucide-react';
import { useExam, useExams } from '../../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport, useReleaseExamResults } from '../../../../../lib/hooks/usePanelReports';
import { RESULT_STATUS_LABEL, RESULT_STATUS_TONE } from '../../../../../lib/candidate-status';
import { ExamResultRow } from '../../../../../lib/types';
import { IntegrityBadge, useToast } from '../../../../../components/ui';
import { QuestionAccuracyPanel } from '../../../../../components/QuestionAccuracyPanel';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Cb, Tabs, Combobox, Dropdown, DropdownItem } from '../../../../../components/ui-v2';
import { STATUS, VIZ, rateColor } from '../../../../../components/ui-v2/viz';

const TONE_COLOR: Record<string, string> = { success: STATUS.ok, danger: STATUS.bad, warning: STATUS.warn, info: VIZ.azure, purple: VIZ.violet, neutral: 'var(--muted)' };
const PASS_FAIL_COLOR: Record<string, string> = { pass: STATUS.ok, fail: STATUS.bad };

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };

// Demoted summary metric for the quiet strip (Workfox rule 4/8): label + tabular number, no rainbow
// icon stat tiles. `color` carries meaning where it does (pass/avg rate via rateColor); the two
// counts stay neutral ink.
function QuietStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '14px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>{label}</div>
      <div className="v2-mono" style={{ fontSize: 24, fontWeight: 600, color: color ?? 'var(--ink)', marginTop: 6 }}>{value}</div>
    </div>
  );
}

const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'All statuses' }, ...Object.entries(RESULT_STATUS_LABEL).map(([value, label]) => ({ value, label }))];
const INTEGRITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All integrity levels' }, { value: 'clear', label: 'Clear' },
  { value: 'review', label: 'Review recommended' }, { value: 'high_concern', label: 'High concern' },
];

// v2 categorical header filter — shared shape with the exams/candidates/results status filters.
function CatFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Dropdown align="start" menuWidth={190} trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: value !== 'all' ? 'var(--org-primary)' : 'var(--muted)' }}>{label} <ListFilter size={12} style={{ opacity: 0.75 }} /></span>}>
      {(close) => options.map((o) => (
        <DropdownItem key={o.value} onClick={() => { close(); onChange(o.value); }}>
          <span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{value === o.value && <Check size={15} />}</span>{o.label}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

export default function V2ExamReportPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const { data: exam } = useExam(examId);
  const { data: examsResponse } = useExams(undefined, { pageSize: 100 });
  const examOptions = (examsResponse?.data ?? []).map((item) => ({ value: item.id, label: item.title }));
  if (exam && !examOptions.some((option) => option.value === exam.id)) {
    examOptions.unshift({ value: exam.id, label: exam.title });
  }
  const { data: summary, isLoading: summaryLoading } = useResultsSummary(examId);
  const { data: accuracyRows } = useQuestionAccuracy(examId);
  const { data: results, isLoading: resultsLoading } = useResultsList(examId);
  const exportMutation = useResultsExport(examId);
  const releaseExam = useReleaseExamResults(examId);
  const { toast } = useToast();
  const [subTab, setSubTab] = useState('candidates');
  const [notifyOnRelease, setNotifyOnRelease] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [integrityFilter, setIntegrityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const visibleResults = (results ?? []).filter(
    (row) =>
      (integrityFilter === 'all' || row.integrityLevel === integrityFilter) &&
      (statusFilter === 'all' || row.status === statusFilter) &&
      (!query || row.candidateName.toLowerCase().includes(query)),
  );
  const filtersActive = integrityFilter !== 'all' || statusFilter !== 'all' || query !== '';

  function toggleSelected(invitationId: string) {
    setSelectedIds((current) => (current.includes(invitationId) ? current.filter((id) => id !== invitationId) : [...current, invitationId]));
  }

  function handleReleaseAll() {
    if (!window.confirm(`Release results to all candidates for this exam${notifyOnRelease ? ', and email them their outcome' : ''}?`)) return;
    releaseExam.mutate(notifyOnRelease, {
      onSuccess: (r) => toast(r.released > 0 ? `Released ${r.released} result${r.released === 1 ? '' : 's'}.` : 'All results were already released.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to release results.', 'error'),
    });
  }

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    try {
      const { blob, filename } = await exportMutation.mutateAsync({ format, invitationIds: selectedIds });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename ?? `exam-${examId}-results.${format}`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to export results.', 'error');
    }
  }

  const sortHead = (label: string) => ({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (d?: boolean) => void } }) =>
    <SortHead label={label} sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />;

  const columns: ColumnDef<typeof DT_FEATURES, ExamResultRow>[] = [
    { id: 'select', enableSorting: false, enableHiding: false, header: () => null, cell: ({ row }) => <Cb checked={selectedIds.includes(row.original.invitationId)} onChange={() => toggleSelected(row.original.invitationId)} /> },
    { id: 'name', accessorFn: (r) => r.candidateName.toLowerCase(), header: sortHead('Candidate'), cell: ({ row }) => <Link href={`/v2/reports/${examId}/candidates/${row.original.candidateId}?attemptId=${row.original.attemptId ?? ''}`} style={{ fontWeight: 500, color: 'var(--org-primary)', textDecoration: 'none' }}>{row.original.candidateName}</Link> },
    { id: 'status', enableSorting: false, header: () => <CatFilter label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />, cell: ({ row }) => <Pill c={TONE_COLOR[RESULT_STATUS_TONE[row.original.status] ?? 'neutral'] ?? 'var(--muted)'} label={RESULT_STATUS_LABEL[row.original.status] ?? row.original.status} /> },
    { id: 'score', accessorFn: (r) => r.percentage ?? -1, header: sortHead('Score'), cell: ({ row }) => <span className="v2-mono">{row.original.percentage !== null ? `${row.original.percentage.toFixed(1)}%` : '—'}</span> },
    { id: 'result', accessorFn: (r) => r.passFail ?? '', header: sortHead('Result'), cell: ({ row }) => row.original.passFail ? <Pill c={PASS_FAIL_COLOR[row.original.passFail] ?? 'var(--muted)'} label={row.original.passFail} /> : <span style={dt.muted}>—</span> },
    { id: 'integrity', enableSorting: false, header: () => <CatFilter label="Integrity" value={integrityFilter} onChange={setIntegrityFilter} options={INTEGRITY_FILTER_OPTIONS} />, cell: ({ row }) => <IntegrityBadge level={row.original.integrityLevel} /> },
  ];

  const subTabs = [
    { value: 'candidates', label: `Candidates${visibleResults.length > 0 ? ` (${visibleResults.length})` : ''}` },
    { value: 'accuracy', label: `Question accuracy${(accuracyRows ?? []).length > 0 ? ` (${(accuracyRows ?? []).length})` : ''}` },
  ];

  return (
    <div className="v2-rise">
      <h1 className="v2-title" style={{ fontSize: 22, margin: '0 0 16px' }}>{exam?.title ?? 'Exam Results'}</h1>

      {summaryLoading ? (
        <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>Loading summary…</p>
      ) : summary ? (
        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }} className="wf-hero-kpis">
          <QuietStat label="Total candidates" value={String(summary.totalCandidates)} />
          <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Settled" value={String(summary.settledCount)} /></div>
          <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Pass rate" value={`${summary.passRate.toFixed(1)}%`} color={rateColor(summary.passRate)} /></div>
          <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Average score" value={`${summary.averagePercentage.toFixed(1)}%`} color={rateColor(summary.averagePercentage)} /></div>
        </div>
      ) : null}

      <Tabs tabs={subTabs} value={subTab} onChange={setSubTab} divider={false} />

      {subTab === 'candidates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 220 }}>
              <label className="v2-label">Exam</label>
              <Combobox width="100%" value={examId} onChange={(nextExamId) => nextExamId !== examId && router.push(`/v2/reports/${nextExamId}`)} options={examOptions} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => handleExport('csv')} disabled={exportMutation.isPending}>Export CSV</button>
              <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => handleExport('xlsx')} disabled={exportMutation.isPending}>Export Excel</button>
              <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => handleExport('pdf')} disabled={exportMutation.isPending}>Export PDF</button>
              <button type="button" className="v2-hoverbtn" style={{ ...dt.primaryBtn, opacity: selectedIds.length < 2 ? 0.5 : 1, cursor: selectedIds.length < 2 ? 'not-allowed' : 'pointer' }} disabled={selectedIds.length < 2}
                onClick={() => router.push(`/v2/reports/${examId}/compare?invitationIds=${selectedIds.join(',')}`)}>Compare selected</button>
            </div>
          </div>
          {summary?.resultsReleaseMode === 'manual' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 13px', borderRadius: 9, border: '1px solid var(--hair)', background: 'var(--surface)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>Results are withheld until released.</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                <Cb checked={notifyOnRelease} onChange={setNotifyOnRelease} /> Email candidates their result
              </label>
              <button type="button" className="v2-hoverbtn" style={{ ...dt.primaryBtn, marginLeft: 'auto', opacity: releaseExam.isPending ? 0.6 : 1 }} disabled={releaseExam.isPending} onClick={handleReleaseAll}>Release all results</button>
            </div>
          )}
          <DataTable columns={columns} data={visibleResults} getRowId={(r) => r.invitationId}
            search={search} onSearchChange={setSearch} searchPlaceholder="Search candidates…"
            isLoading={resultsLoading} emptyMessage={filtersActive ? 'No candidates match your search or filters.' : 'No candidates invited yet.'}
            columnLabels={{ name: 'Candidate', status: 'Status', score: 'Score', result: 'Result', integrity: 'Integrity' }} />
        </div>
      )}
      {subTab === 'accuracy' && <QuestionAccuracyPanel examId={examId} />}
    </div>
  );
}
