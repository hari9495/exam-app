'use client';

// v2 ExamResultsPanel — re-skin of components/ExamResultsPanel.tsx on v2 primitives. All filtering,
// selection, export, advance and average-comparison logic is verbatim (format only). Uses the v2
// CandidateReportPanel for the inline drill-in; still reuses the number-filter helpers,
// IntegrityBadge, QuestionAccuracyPanel and AdvanceToNextRoundModal as-is.
import { useState } from 'react';
import { ListFilter, Check } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  IntegrityBadge, useToast, NumberFilterHeader, matchesNumberFilter, NO_NUMBER_FILTER, type NumberFilterValue,
} from '../../../../components/ui';
import { useResultsList, useResultsExport, useQuestionAccuracy } from '../../../../lib/hooks/usePanelReports';
import { RESULT_STATUS_LABEL, RESULT_STATUS_TONE } from '../../../../lib/candidate-status';
import { AdvanceToNextRoundModal } from '../../../../components/AdvanceToNextRoundModal';
import { QuestionAccuracyPanel } from '../../../../components/QuestionAccuracyPanel';
import { CandidateReportPanel } from '../reports/CandidateReportPanel';
import { ExamResultRow } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Cb, Tabs, Dropdown, DropdownItem } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';

// Map the shared StatusTone strings onto v2 viz colors.
const TONE_COLOR: Record<string, string> = { success: STATUS.ok, danger: STATUS.bad, warning: STATUS.warn, info: VIZ.azure, purple: VIZ.violet, neutral: 'var(--muted)' };
const PASS_FAIL_COLOR: Record<string, string> = { pass: STATUS.ok, fail: STATUS.bad };
const FACE_ENROLMENT_COLOR: Record<string, string> = { enrolled: STATUS.ok, not_verified: STATUS.warn };
const FACE_ENROLMENT_LABEL: Record<string, string> = { enrolled: 'Verified', not_verified: 'Not verified' };
const NEXT_ROUND_EMAIL: Record<string, { label: string; c: string }> = {
  sent: { label: 'Sent', c: STATUS.ok }, pending: { label: 'In queue', c: STATUS.warn }, failed: { label: 'Failed', c: STATUS.bad }, none: { label: 'No email', c: 'var(--muted)' },
};

const ATTENDED_STATUSES = ['in_progress', 'paused', 'blocked', 'pending_manual_grade', 'submitted', 'auto_submitted', 'force_submitted'];
const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'All statuses' }, ...ATTENDED_STATUSES.map((value) => ({ value, label: RESULT_STATUS_LABEL[value] }))];
const RESULT_FILTER_OPTIONS = [{ value: 'all', label: 'All results' }, { value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'pending', label: 'Pending grade' }];
const INTEGRITY_FILTER_OPTIONS = [{ value: 'all', label: 'All integrity levels' }, { value: 'clear', label: 'Clear' }, { value: 'review', label: 'Review recommended' }, { value: 'high_concern', label: 'High concern' }];

// v2 categorical header filter (shared shape with the exams/candidates status filters).
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

function NextRoundCell({ nextRound }: { nextRound: ExamResultRow['nextRound'] }) {
  if (!nextRound) return <span style={dt.muted}>—</span>;
  const email = NEXT_ROUND_EMAIL[nextRound.emailStatus] ?? { label: nextRound.emailStatus, c: 'var(--muted)' };
  return (
    <span style={{ display: 'inline-flex', minWidth: 0, alignItems: 'center', gap: 6 }} title={`Advanced to ${nextRound.examTitle}`}>
      <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{nextRound.examTitle}</span>
      <Pill c={email.c} label={email.label} />
    </span>
  );
}

const sortHead = (label: string) => ({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (d?: boolean) => void } }) =>
  <SortHead label={label} sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />;

export function ExamResultsPanel({ examId }: { examId: string }) {
  const { data: results, isLoading } = useResultsList(examId);
  const { data: accuracyRows } = useQuestionAccuracy(examId);
  const exportMutation = useResultsExport(examId);
  const { toast } = useToast();
  const [subTab, setSubTab] = useState('candidates');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [percentageFilter, setPercentageFilter] = useState<NumberFilterValue>(NO_NUMBER_FILTER);
  const [resultFilter, setResultFilter] = useState('all');
  const [integrityFilter, setIntegrityFilter] = useState('all');
  // invitationId, not candidateId — a re-invited candidate has multiple rows sharing one candidateId.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [openReport, setOpenReport] = useState<{ candidateId: string; attemptId: string | null } | null>(null);

  const attended = (results ?? []).filter((row) => row.attemptId !== null);
  // Above/Below average compares against the whole attended cohort's mean, not just what's visible.
  const settledPercentages = attended.map((row) => row.percentage).filter((value): value is number => value !== null);
  const averagePercentage = settledPercentages.length > 0 ? settledPercentages.reduce((sum, value) => sum + value, 0) / settledPercentages.length : 0;
  const query = search.trim().toLowerCase();
  const visible = attended.filter((row) => {
    if (query && !row.candidateName.toLowerCase().includes(query)) return false;
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    if (!matchesNumberFilter(row.percentage, percentageFilter, averagePercentage)) return false;
    if (resultFilter !== 'all') { const bucket = row.passFail ?? 'pending'; if (bucket !== resultFilter) return false; }
    if (integrityFilter !== 'all' && row.integrityLevel !== integrityFilter) return false;
    return true;
  });
  const filtersActive = query !== '' || statusFilter !== 'all' || percentageFilter.operator !== null || resultFilter !== 'all' || integrityFilter !== 'all';
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selectedIds.includes(row.invitationId));

  function toggleSelected(invitationId: string) {
    setSelectedIds((current) => (current.includes(invitationId) ? current.filter((id) => id !== invitationId) : [...current, invitationId]));
  }
  function toggleSelectAll() {
    setSelectedIds((current) => {
      const visibleIds = visible.map((row) => row.invitationId);
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return [...new Set([...current, ...visibleIds])];
    });
  }
  // Advancing targets the candidate, not a specific invitation — dedupe to candidateId.
  const selectedCandidateIds = [...new Set(attended.filter((row) => selectedIds.includes(row.invitationId)).map((row) => row.candidateId))];

  async function handleExport(format: 'csv' | 'xlsx') {
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

  const columns: ColumnDef<typeof DT_FEATURES, ExamResultRow>[] = [
    { id: 'select', enableSorting: false, enableHiding: false, header: () => <Cb checked={allVisibleSelected} onChange={toggleSelectAll} />, cell: ({ row }) => <Cb checked={selectedIds.includes(row.original.invitationId)} onChange={() => toggleSelected(row.original.invitationId)} /> },
    { id: 'index', enableSorting: false, enableHiding: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>#</span>, cell: ({ row }) => <span style={dt.muted}>{row.index + 1}</span> },
    { id: 'name', accessorFn: (r) => r.candidateName.toLowerCase(), header: sortHead('Candidate'), cell: ({ row }) => <button type="button" onClick={() => setOpenReport({ candidateId: row.original.candidateId, attemptId: row.original.attemptId })} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 500, color: 'var(--org-primary)', cursor: 'pointer' }}>{row.original.candidateName}</button> },
    { id: 'status', enableSorting: false, header: () => <CatFilter label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />, cell: ({ row }) => <Pill c={TONE_COLOR[RESULT_STATUS_TONE[row.original.status] ?? 'neutral'] ?? 'var(--muted)'} label={RESULT_STATUS_LABEL[row.original.status] ?? row.original.status} /> },
    { id: 'rawScore', accessorFn: (r) => r.score ?? -1, header: sortHead('Score'), cell: ({ row }) => <span className="v2-mono">{row.original.score !== null && row.original.maxScore !== null ? `${row.original.score}/${row.original.maxScore}` : '—'}</span> },
    { id: 'score', enableSorting: false, header: () => <NumberFilterHeader label="Percentage" value={percentageFilter} onChange={setPercentageFilter} unit="%" />, cell: ({ row }) => <span className="v2-mono">{row.original.percentage !== null ? `${row.original.percentage.toFixed(1)}%` : '—'}</span> },
    { id: 'result', enableSorting: false, header: () => <CatFilter label="Result" value={resultFilter} onChange={setResultFilter} options={RESULT_FILTER_OPTIONS} />, cell: ({ row }) => row.original.passFail ? <Pill c={PASS_FAIL_COLOR[row.original.passFail] ?? 'var(--muted)'} label={row.original.passFail} /> : <span style={dt.muted}>—</span> },
    { id: 'integrity', enableSorting: false, header: () => <CatFilter label="Integrity" value={integrityFilter} onChange={setIntegrityFilter} options={INTEGRITY_FILTER_OPTIONS} />, cell: ({ row }) => <IntegrityBadge level={row.original.integrityLevel} /> },
    { id: 'faceEnrolment', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Face</span>, cell: ({ row }) => row.original.faceEnrolmentStatus ? <Pill c={FACE_ENROLMENT_COLOR[row.original.faceEnrolmentStatus] ?? 'var(--muted)'} label={FACE_ENROLMENT_LABEL[row.original.faceEnrolmentStatus] ?? row.original.faceEnrolmentStatus} /> : <span style={dt.muted}>—</span> },
    { id: 'nextRound', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Next round</span>, cell: ({ row }) => <NextRoundCell nextRound={row.original.nextRound} /> },
  ];

  const subTabs = [
    { value: 'candidates', label: `Candidates${visible.length > 0 ? ` (${visible.length})` : ''}` },
    { value: 'accuracy', label: `Question accuracy${(accuracyRows ?? []).length > 0 ? ` (${(accuracyRows ?? []).length})` : ''}` },
  ];

  return (
    <div>
      <Tabs tabs={subTabs} value={subTab} onChange={setSubTab} />
      {subTab === 'candidates' && (openReport ? (
        <CandidateReportPanel examId={examId} candidateId={openReport.candidateId} attemptId={openReport.attemptId}
          backSlot={<button type="button" onClick={() => setOpenReport(null)} style={{ marginBottom: 16, display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 500, color: 'var(--org-primary)', cursor: 'pointer' }}>← Back to results</button>}
          onOpenCandidate={(candidateId, attemptId) => setOpenReport({ candidateId, attemptId })} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={dt.toolBtn} onClick={() => handleExport('csv')} disabled={exportMutation.isPending}>Export CSV</button>
            <button type="button" style={dt.toolBtn} onClick={() => handleExport('xlsx')} disabled={exportMutation.isPending}>Export Excel</button>
            <button type="button" style={{ ...dt.primaryBtn, opacity: selectedIds.length === 0 ? 0.5 : 1, cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer' }} onClick={() => setAdvanceModalOpen(true)} disabled={selectedIds.length === 0}>Advance to next round</button>
          </div>
          <DataTable columns={columns} data={visible} getRowId={(r) => r.invitationId}
            search={search} onSearchChange={setSearch} searchPlaceholder="Search candidates…"
            isLoading={isLoading} emptyMessage={filtersActive ? 'No candidates match your search or filters.' : 'No candidates have attended this exam yet.'}
            columnLabels={{ name: 'Candidate', status: 'Status', rawScore: 'Score', score: 'Percentage', result: 'Result', integrity: 'Integrity', faceEnrolment: 'Face', nextRound: 'Next round' }} />
          {advanceModalOpen && <AdvanceToNextRoundModal examId={examId} candidateIds={selectedCandidateIds} open onClose={() => setAdvanceModalOpen(false)} onAdvanced={() => setSelectedIds([])} />}
        </div>
      ))}
      {subTab === 'accuracy' && <QuestionAccuracyPanel examId={examId} />}
    </div>
  );
}
