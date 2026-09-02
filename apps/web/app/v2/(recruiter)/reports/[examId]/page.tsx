'use client';

// v2 exam report — re-skin of app/(panel)/reports/[examId] on v2 primitives. Summary tiles +
// Candidates/Accuracy tabs. All hooks, filters, export formats (csv/xlsx/pdf), compare and the
// exam switcher are verbatim (format only). Candidate rows link to the v2 candidate report; the
// exam switcher and back-nav stay within /v2. Compare still points at the old route (v2 compare is
// a later slice). Reuses QuestionAccuracyPanel + IntegrityBadge as-is.
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Users, CheckCircle2, Target, BarChart3, ListFilter, Check } from 'lucide-react';
import { useExam, useExams } from '../../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport } from '../../../../../lib/hooks/usePanelReports';
import { RESULT_STATUS_LABEL, RESULT_STATUS_TONE } from '../../../../../lib/candidate-status';
import { ExamResultRow } from '../../../../../lib/types';
import { IntegrityBadge, useToast } from '../../../../../components/ui';
import { QuestionAccuracyPanel } from '../../../../../components/QuestionAccuracyPanel';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Cb, Tabs, Combobox, IconStatCard, Dropdown, DropdownItem } from '../../../../../components/ui-v2';
import { STATUS, VIZ, rateColor } from '../../../../../components/ui-v2/viz';

const TONE_COLOR: Record<string, string> = { success: STATUS.ok, danger: STATUS.bad, warning: STATUS.warn, info: VIZ.azure, purple: VIZ.violet, neutral: 'var(--muted)' };
const PASS_FAIL_COLOR: Record<string, string> = { pass: STATUS.ok, fail: STATUS.bad };

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
  const { toast } = useToast();
  const [subTab, setSubTab] = useState('candidates');
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
    <div>
      <h1 className="v2-title" style={{ fontSize: 22, margin: '0 0 16px' }}>{exam?.title ?? 'Exam Results'}</h1>

      {summaryLoading ? (
        <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>Loading summary…</p>
      ) : summary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
          <IconStatCard title="Total candidates" value={summary.totalCandidates} icon={<Users size={20} />} accent={VIZ.azure} />
          <IconStatCard title="Settled" value={summary.settledCount} icon={<CheckCircle2 size={20} />} accent={VIZ.teal} />
          <IconStatCard title="Pass rate" value={`${summary.passRate.toFixed(1)}%`} icon={<Target size={20} />} accent={rateColor(summary.passRate)} />
          <IconStatCard title="Average score" value={`${summary.averagePercentage.toFixed(1)}%`} icon={<BarChart3 size={20} />} accent={rateColor(summary.averagePercentage)} />
        </div>
      ) : null}

      <Tabs tabs={subTabs} value={subTab} onChange={setSubTab} />

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
                onClick={() => router.push(`/reports/${examId}/compare?invitationIds=${selectedIds.join(',')}`)}>Compare selected</button>
            </div>
          </div>
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
